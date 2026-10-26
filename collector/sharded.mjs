import {SOURCES,initializeShards,shardQuota,shardRows,shardCandidates,summarizeShards} from '../shared/shards.js';
import {regionBackoff,recordResult} from '../shared/throttle.js';
import {applyObservation} from '../shared/model.js';
import {coverageRound} from '../shared/national-cycle.js';
import {validateRegionalResponse} from './transport.mjs';
// The Mac is the sole scheduler and database writer. Cloudflare only executes
// its preassigned regions; neither source ever takes over the other's failures.
export async function collectShardedRound({data,coverage,plan,stores,products,storage,collectMac,collectCloudflare,publish,isStopping=()=>false,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const began=now(),state=initializeShards(data.health,plan,began),used=Object.fromEntries(SOURCES.map(s=>[s,0]));
 const quota=Object.fromEntries(SOURCES.map(source=>[source,shardQuota(state.sources[source],plan.regions.filter(r=>r.source===source).length,began)]));
 const budget=quota['mac-local']+quota.cloudflare,spacing=Math.ceil(300000/budget),nextSourceAt={'mac-local':Math.max(began,state.sources['mac-local'].nextRequestAt||0),cloudflare:Math.max(began+spacing,state.sources.cloudflare.nextRequestAt||0)},tried=new Set(),checked=new Set();let attempts=0,errors=0;
 data.health.mode='fixed-split';data.health.intervalSeconds=300;data.health.nextAt=began+300000;data.health.cooldownUntil=0;
 data.health.currentCoverageRound={startedAt:began,plannedRequests:plan.regions.length,attempts:0,coveredStores:0,totalStores:stores.length,status:'running'};
 while(!isStopping()&&now()-began<299000){
  const options=SOURCES.filter(source=>used[source]<quota[source]&&state.sources[source].cooldownUntil<=now());
  let selected=null,future=Infinity;
  for(const source of options.sort((a,b)=>used[a]/quota[a]-used[b]/quota[b])){
   const health=state.sources[source],backoff=regionBackoff(health,now()),candidates=shardCandidates(plan,source,data).filter(r=>!tried.has(r.zip)&&!backoff.zips.has(r.zip));
   const next=candidates.find(r=>!(health.failedRegionsSinceSuccess||[]).includes(r.zip))||candidates[0];
   if(next){if(nextSourceAt[source]>now()){future=Math.min(future,nextSourceAt[source]);continue}selected={source,health,next};break}
  }
  if(!selected){if(future<began+299000){await sleep(Math.min(1000,Math.max(1,future-now())));continue}break}
  const {source,health,next}=selected,at=now(),requestId=crypto.randomUUID();tried.add(next.zip);used[source]++;nextSourceAt[source]=at+Math.ceil(300000/quota[source]);health.nextRequestAt=nextSourceAt[source];
  let result;
  try{result=await(source==='mac-local'?collectMac(next.zip):collectCloudflare({zip:next.zip,requestId,planVersion:plan.version,at}));
   if(result.skipped){health.cooldownUntil=Math.max(health.cooldownUntil||0,result.retryAt||at+60000);health.servicePauseReason=result.reason||'execution-lease';health.servicePauseUntil=result.retryAt||at+60000;continue}
   result=validateRegionalResponse(result,products.length);
  }catch(error){result={status:0,stores:[],error:error.message,serviceStatus:error.status||0}}
  // Drop incidental neighboring stores owned by the other shard before counting.
  const rows=shardRows(plan,source,result.stores||[]).filter(row=>!checked.has(row.id));attempts++;health.requests++;const success=result.status===200&&!result.error;
  if(success){delete health.servicePauseReason;delete health.servicePauseUntil;health.successes++;health.lastSuccess=at;for(const row of rows)checked.add(row.id)}else{health.errors++;errors++}
  const events=applyObservation(data,{requestId,at,stores:rows,httpStatus:result.status,error:result.error,source});
  const decision=recordResult(health,{zip:next.zip,status:result.status,error:result.error,retryAfterSeconds:result.retryAfterSeconds||0,allRegions:plan.regions.filter(r=>r.source===source).map(r=>r.zip)},at);
  if(decision.global){health.requestBudget=Math.max(1,Math.floor(health.requestBudget/2));health.recoverBudgetAt=at+3600000}
  data.health.sourceSummary=summarizeShards(data,plan,now());data.health.requestBudget=state.sources['mac-local'].requestBudget+state.sources.cloudflare.requestBudget;
  data.health.message='Collecting fixed regional assignments';data.health.regionsResting=SOURCES.reduce((n,s)=>n+regionBackoff(state.sources[s],now()).zips.size,0);
  data.health.currentCoverageRound={...data.health.currentCoverageRound,attempts,coveredStores:checked.size,errors};
  storage.record(data,coverage,{id:requestId,at,zip:next.zip,status:result.status,duration:result.durationMs||0,stores:rows.length,error:result.error,source,roundStartedAt:began,retryAfterSeconds:result.retryAfterSeconds??null,cooldownReason:decision.reason||null},events);
  try{await publish()}catch(error){console.error(new Date(now()).toISOString(),'Snapshot publication failed')}
  let delay=Math.max(0,spacing-(now()-at));while(delay>0&&!isStopping()){const step=Math.min(delay,1000);await sleep(step);delay-=step}
 }
 data.health.lastCoverageRound=coverageRound({startedAt:began,completedAt:now(),stores,checked,attempts,errors,plannedRequests:plan.regions.length});data.health.currentCoverageRound=data.health.lastCoverageRound;
 data.health.sourceSummary=summarizeShards(data,plan,now());data.health.lastSweepStores=checked.size;if(checked.size===stores.length)data.totals.sweeps++;
 await publish();
 return {attempts,errors,covered:checked.size,quota,used};
}
