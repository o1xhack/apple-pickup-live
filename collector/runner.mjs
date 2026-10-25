import {verifiedCyclePlan,activateFiveMinuteTarget,nationalSchedule,nextVerifiedRegion,coverageRound} from '../shared/national-cycle.js';
import {queueValidation,validateRound,nextCollectionDelay} from '../shared/deployment-validation.js';
import {collectLocal} from './apple.mjs';
import {CollectionStorage} from './storage.mjs';
import {requestJSON,publishWithRetry,validateRegionalResponse} from './transport.mjs';
import {chooseRegion} from '../shared/planner.js';
import {compactVerifiedCoverage,learningProposal} from '../shared/coverage-plan.js';
import {readFileSync,mkdirSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {emptySnapshot,applyObservation} from '../shared/model.js';
import {requestBudget,reduceBudget} from '../shared/budget.js';
import {normalizeBudgetPeriod} from '../shared/schedule.js';
import {regionBackoff,recordResult} from '../shared/throttle.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=Object.fromEntries(readFileSync(resolve(root,'.env.local'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
const stores=JSON.parse(readFileSync(resolve(root,'data/us-stores.json'))),products=JSON.parse(readFileSync(resolve(root,'data/products.json')));
const hubs=JSON.parse(readFileSync(resolve(root,'data/polling-hubs.json'))).hubs;
const proposals=JSON.parse(readFileSync(resolve(root,'data/learning-hubs.json'))).hubs;
const INTERVAL_SECONDS=Number(config.COLLECTION_INTERVAL_SECONDS)||300;
const stateDir=resolve(root,'state.local');mkdirSync(stateDir,{recursive:true});
// A single launchd process owns this database. O_EXCL prevents accidental duplicate collectors.
const lock=resolve(stateDir,'collector.lock');let lockFd;
try{lockFd=openSync(lock,'wx');writeFileSync(lockFd,String(process.pid))}catch{try{process.kill(Number(readFileSync(lock,'utf8')),0);console.error('Collector already running');process.exit(1)}catch{unlinkSync(lock);lockFd=openSync(lock,'wx');writeFileSync(lockFd,String(process.pid))}}
process.on('exit',()=>{try{closeSync(lockFd);unlinkSync(lock)}catch{}});
let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
const storage=new CollectionStorage(resolve(stateDir,'collection.sqlite3'));const db=storage.db;
const loaded=storage.load();let data=loaded.snapshot;const coverage=loaded.coverage;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const api=(path,body)=>requestJSON(config.PUBLISH_URL,path,body,{token:config.INGEST_TOKEN});
const persist=()=>storage.save(data,coverage);
async function publish(){data.publishedAt=Date.now();persist();const events=storage.pending();await publishWithRetry(()=>api('/api/ingest',{snapshot:data,events:events.map(e=>JSON.parse(e.payload))}));storage.acknowledge(events,data)}
let budgetDay=new Date().setUTCHours(0,0,0,0),budgetUsed=db.prepare('SELECT count(*) n FROM requests WHERE at>=?').get(budgetDay).n;
async function tick(){
 const began=Date.now();queueValidation(data.health,'national-five-minute-v1',began);let validationErrors=0,firstResult=null;normalizeBudgetPeriod(data.health,INTERVAL_SECONDS);requestBudget(data.health,began);const cyclePlan=verifiedCyclePlan(coverage,stores,data);activateFiveMinuteTarget(data.health,cyclePlan,began);const schedule=nationalSchedule(data.health,cyclePlan,INTERVAL_SECONDS);const maxRequests=schedule.budget;data.health.intervalSeconds=INTERVAL_SECONDS;data.health.spacingSeconds=Math.round(schedule.spacingMs/100)/10;data.health.nextAt=began+schedule.intervalMs;let attempts=0;const checked=new Set();let tried=new Set();let passSeen=new Set(data.health.coveragePassSeen||[]);
 if(data.health.cooldownUntil>began){data.health.nextAt=Math.min(began+schedule.intervalMs,data.health.cooldownUntil);data.health.message='Collection is cooling down after request errors';await publish();return}
 data.health.currentCoverageRound={startedAt:began,deadlineAt:began+schedule.intervalMs,plannedRequests:cyclePlan.regions.length,coveredStores:0,totalStores:stores.length,attempts:0,status:'running'};
 if(cyclePlan.complete&&maxRequests>=cyclePlan.regions.length)passSeen=new Set();
 // Each successful query learns its actual store coverage. Until learned, geometry is a proposal only.
 while(!stopping&&attempts<maxRequests&&Date.now()-began<schedule.intervalMs-1000){
  const dayStart=new Date().setUTCHours(0,0,0,0);
  if(dayStart!==budgetDay){budgetDay=dayStart;budgetUsed=0}
  if(budgetUsed>=52000){data.health.message='Daily collection request budget reached';data.health.cooldownUntil=dayStart+86400000;break}
  const backoff=regionBackoff(data.health);
  const candidates=[...hubs.map(h=>({zip:h.zip,ids:h.expectedStoreIds})),...stores.map(s=>({zip:s.zip,ids:[s.id]}))];
  const verified=compactVerifiedCoverage(coverage);
  const args={stores,coverage,seen:passSeen,checked,backoff,snapshot:data,now:Date.now(),intervalMs:schedule.intervalMs,tried};
  const eligible=new Set(stores.filter(s=>!checked.has(s.id)&&!passSeen.has(s.id)).map(s=>s.id));
  // At most one replacement query per round learns a better hub. It consumes
  // the existing adaptive budget; predictions never certify any store.
  const learning=!cyclePlan.complete&&attempts===0?learningProposal({proposals,coverage,attempted:data.health.learningAttempted||{},backoff,eligible}):null;
  const next=cyclePlan.complete?(nextVerifiedRegion(cyclePlan,{tried,checked,backoff})||chooseRegion({...args,candidates})):learning||chooseRegion({...args,candidates:verified})||chooseRegion({...args,candidates});
  data.health.verifiedRegionCount=verified.length;
  data.health.estimatedCoverageSeconds=Math.ceil(verified.length/maxRequests)*INTERVAL_SECONDS;
  if(learning){data.health.learningAttempted||={};data.health.learningAttempted[next.zip]=Date.now()}
  if(!next)break;tried.add(next.zip);attempts++;budgetUsed++;
  const requestId=crypto.randomUUID(),at=Date.now();let result;
  try{result=validateRegionalResponse(await collectLocal(next.zip,products,stores),products.length)}catch(e){result={status:0,stores:[],error:e.message,serviceStatus:e.status||0}}
  firstResult||={at,httpStatus:result.status,stores:result.stores?.length||0,error:result.error||null};if(result.error||result.status!==200)validationErrors++;
  const events=applyObservation(data,{requestId,at,stores:result.stores||[],httpStatus:result.status,error:result.error,source:'mac-local'});
  if(!result.error&&result.status===200){coverage[next.zip]=result.stores.map(s=>s.id);for(const item of result.stores){checked.add(item.id);passSeen.add(item.id)}}
  const decision=recordResult(data.health,{zip:next.zip,status:result.status,error:result.error,stores:next.learning?[]:[...new Set([next.targetStore,...next.ids])],retryAfterSeconds:result.retryAfterSeconds||0},at);
  data.health.mode='mac-local';data.health.nextAt=began+schedule.intervalMs;
  const blocked=decision.global;if(blocked){data.health.healthySweeps=0;reduceBudget(data.health)}
  if(passSeen.size===stores.length){data.totals.sweeps++;data.health.lastNationwideCoverageAt=at;passSeen=new Set()}
  data.health.currentCoverageRound={...data.health.currentCoverageRound,attempts,coveredStores:checked.size,errors:validationErrors};
  data.health.coveragePassSeen=[...passSeen];data.health.regionsResting=regionBackoff(data.health).zips.size;
  try{storage.record(data,coverage,{id:requestId,at,zip:next.zip,status:result.status,duration:result.durationMs||0,stores:result.stores?.length||0,error:result.error},events)}catch(error){const committed=storage.load();data=committed.snapshot;for(const key of Object.keys(coverage))delete coverage[key];Object.assign(coverage,committed.coverage);throw error}
  if(blocked)break;
  // Publish each result immediately; public searches never trigger Apple.
  // Save a heartbeat before spacing out the next request, without bursting at round start.
  try{await publish()}catch(error){console.error(new Date().toISOString(),error.message)}
  if(checked.size===stores.length)break;
  let spacing=Math.max(0,schedule.spacingMs-(Date.now()-at));while(spacing>0&&!stopping){await sleep(Math.min(spacing,1000));spacing-=1000}
 }
 data.health.lastCoverageRound=coverageRound({startedAt:began,completedAt:Date.now(),stores,checked,attempts,errors:validationErrors,plannedRequests:cyclePlan.regions.length});
 data.health.currentCoverageRound=data.health.lastCoverageRound;
 validateRound(data.health,{attempts,covered:checked.size,errors:validationErrors,firstResult});
 data.health.lastSweepStores=checked.size;if(checked.size===stores.length){data.health.healthySweeps=(data.health.healthySweeps||0)+1;if(data.health.healthySweeps>=3)data.health.blockLevel=0}else data.health.healthySweeps=0;
 await publish();db.prepare('DELETE FROM requests WHERE at<?').run(Date.now()-30*86400000);db.prepare("DELETE FROM checkpoints WHERE ts<? AND strftime('%M',ts/1000,'unixepoch')!='00'").run(Date.now()-14*86400000);console.log(JSON.stringify({at:new Date().toISOString(),attempts,covered:checked.size,errors:data.totals.errors,cooldownUntil:data.health.cooldownUntil||0}));
}
try{
 if(!data){const info=await api('/api/info');data=emptySnapshot(stores,products,info.startedAt);persist()}
 while(!stopping){const start=Date.now();try{await tick()}catch(e){console.error(new Date().toISOString(),e.message)}if(process.argv.includes('--once'))break;let delay=nextCollectionDelay(data.health,INTERVAL_SECONDS*1000,Date.now()-start);while(delay>0&&!stopping){await sleep(Math.min(delay,1000));delay-=1000}}
}finally{persist();storage.close()}
