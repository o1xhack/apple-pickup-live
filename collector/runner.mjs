import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {emptySnapshot,applyObservation} from '../shared/model.js';
import {requestBudget,reduceBudget} from '../shared/budget.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=Object.fromEntries(readFileSync(resolve(root,'.env.local'),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)]}));
const stores=JSON.parse(readFileSync(resolve(root,'data/us-stores.json'))),products=JSON.parse(readFileSync(resolve(root,'data/products.json')));
const hubs=JSON.parse(readFileSync(resolve(root,'data/polling-hubs.json'))).hubs;
const stateDir=resolve(root,'state.local');mkdirSync(stateDir,{recursive:true});
// A single launchd process owns this database. O_EXCL prevents accidental duplicate collectors.
const lock=resolve(stateDir,'collector.lock');let lockFd;
try{lockFd=openSync(lock,'wx');writeFileSync(lockFd,String(process.pid))}catch{try{process.kill(Number(readFileSync(lock,'utf8')),0);console.error('Collector already running');process.exit(1)}catch{unlinkSync(lock);lockFd=openSync(lock,'wx');writeFileSync(lockFd,String(process.pid))}}
process.on('exit',()=>{try{closeSync(lockFd);unlinkSync(lock)}catch{}});
let stopping=false;process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
const db=new DatabaseSync(resolve(stateDir,'collection.sqlite3'));db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value BLOB);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,at INTEGER,zip TEXT,status INTEGER,duration INTEGER,stores INTEGER,error TEXT);
CREATE INDEX IF NOT EXISTS requests_at ON requests(at);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,ts INTEGER,payload TEXT,sent INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS checkpoints(ts INTEGER PRIMARY KEY,payload BLOB);`);
const get=k=>db.prepare('SELECT value FROM state WHERE key=?').get(k)?.value;
const put=(k,v)=>db.prepare('INSERT INTO state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v);
const saved=get('snapshot');let data=saved?JSON.parse(gunzipSync(saved)):null;
const coverage=JSON.parse(get('coverage')||'{}');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,body){const r=await fetch(config.PUBLISH_URL+path,{method:body?'POST':'GET',headers:{'user-agent':'ApplePickupLiveCollector/0.1','content-type':'application/json',...(body?{authorization:'Bearer '+config.INGEST_TOKEN}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Website HTTP ${r.status}`);return r.json()}
const persist=()=>{put('snapshot',gzipSync(JSON.stringify(data)));put('coverage',JSON.stringify(coverage))};
async function publish(){data.publishedAt=Date.now();persist();const events=db.prepare('SELECT id,payload FROM events WHERE sent=0 ORDER BY ts LIMIT 1000').all();await api('/api/ingest',{snapshot:data,events:events.map(e=>JSON.parse(e.payload))});db.exec('BEGIN');try{for(const e of events)db.prepare('UPDATE events SET sent=1 WHERE id=?').run(e.id);db.prepare('INSERT OR REPLACE INTO checkpoints VALUES(?,?)').run(data.publishedAt,gzipSync(JSON.stringify(data)));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
let budgetDay=new Date().setUTCHours(0,0,0,0),budgetUsed=db.prepare('SELECT count(*) n FROM requests WHERE at>=?').get(budgetDay).n;
async function tick(){
 const began=Date.now();const maxRequests=requestBudget(data.health,began);let attempts=0;const checked=new Set();let tried=new Set();
 if(data.health.cooldownUntil>began){data.health.message='Collection is cooling down after request errors';await publish();return}
 // Each successful query learns its actual store coverage. Until learned, geometry is a proposal only.
 while(!stopping&&attempts<maxRequests&&Date.now()-began<50000){
  const dayStart=new Date().setUTCHours(0,0,0,0);
  if(dayStart!==budgetDay){budgetDay=dayStart;budgetUsed=0}
  if(budgetUsed>=52000){data.health.message='Daily collection request budget reached';data.health.cooldownUntil=dayStart+86400000;break}
  const needed=stores.filter(s=>!checked.has(s.id));if(!needed.length)break;
  const oldest=needed.reduce((a,b)=>(data.stores[a.id].cells[0].at||0)<=(data.stores[b.id].cells[0].at||0)?a:b);
  const candidates=[...hubs.map(h=>({zip:h.zip,ids:coverage[h.zip]||h.expectedStoreIds})),...stores.map(s=>({zip:s.zip,ids:coverage[s.zip]||[s.id]}))].filter(h=>!tried.has(h.zip));
  let next=candidates.filter(h=>h.ids.includes(oldest.id)).sort((a,b)=>b.ids.filter(id=>!checked.has(id)).length-a.ids.filter(id=>!checked.has(id)).length)[0];
  if(!next)next=candidates[0];if(!next)break;tried.add(next.zip);attempts++;budgetUsed++;
  const requestId=crypto.randomUUID(),at=Date.now();let result;
  try{result=await api('/api/collector/check',{zip:next.zip})}catch(e){result={status:0,stores:[],error:e.message}}
  const events=applyObservation(data,{requestId,at,stores:result.stores||[],httpStatus:result.status,error:result.error,source:'cloudflare'});
  if(!result.error&&result.status===200){coverage[next.zip]=result.stores.map(s=>s.id);for(const s of result.stores)checked.add(s.id);data.health.consecutiveErrors=0;data.health.message='Collecting nationwide observations'}else{data.health.consecutiveErrors=(data.health.consecutiveErrors||0)+1;data.health.message=result.error||'Collection request failed'}
  data.health.mode='cloudflare';data.health.nextAt=began+60000;data.health.lastSuccess=result.status===200&&!result.error?at:data.health.lastSuccess;
  const blocked=[403,429,541].includes(result.status)||data.health.consecutiveErrors>=3;
  if(blocked){data.health.healthySweeps=0;reduceBudget(data.health);const level=Math.min(4,(data.health.blockLevel||0)+1);data.health.blockLevel=level;data.health.cooldownUntil=Date.now()+[300000,600000,1200000,1800000][level-1];}
  db.exec('BEGIN');try{db.prepare('INSERT INTO requests VALUES(?,?,?,?,?,?,?)').run(requestId,at,next.zip,result.status,result.durationMs||0,result.stores?.length||0,result.error||null);for(const e of events)db.prepare('INSERT OR IGNORE INTO events(id,ts,payload) VALUES(?,?,?)').run(e.id,e.at,JSON.stringify(e));persist();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
  if(blocked)break;
  await sleep(Math.max(0,1000-(Date.now()-at)));
 }
 data.health.lastSweepStores=checked.size;if(checked.size===stores.length){data.totals.sweeps++;data.health.healthySweeps=(data.health.healthySweeps||0)+1;if(data.health.healthySweeps>=3)data.health.blockLevel=0}else data.health.healthySweeps=0;
 await publish();db.prepare('DELETE FROM requests WHERE at<?').run(Date.now()-30*86400000);db.prepare("DELETE FROM checkpoints WHERE ts<? AND strftime('%M',ts/1000,'unixepoch')!='00'").run(Date.now()-14*86400000);console.log(JSON.stringify({at:new Date().toISOString(),attempts,covered:checked.size,errors:data.totals.errors,cooldownUntil:data.health.cooldownUntil||0}));
}
try{
 if(!data){const info=await api('/api/info');data=emptySnapshot(stores,products,info.startedAt)}
 while(!stopping){const start=Date.now();try{await tick()}catch(e){console.error(new Date().toISOString(),e.message)}if(process.argv.includes('--once'))break;let delay=Math.max(1000,60000-(Date.now()-start));while(delay>0&&!stopping){await sleep(Math.min(delay,1000));delay-=1000}}
}finally{persist();db.close()}
