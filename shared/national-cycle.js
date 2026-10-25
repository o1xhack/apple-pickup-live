import {compactVerifiedCoverage} from './coverage-plan.js';
import {collectionSchedule} from './schedule.js';
export function verifiedCyclePlan(coverage,stores,snapshot){
 const catalog=new Set(stores.map(s=>s.id));const regions=compactVerifiedCoverage(coverage).map(r=>({...r,ids:r.ids.filter(id=>catalog.has(id))})).filter(r=>r.ids.length);
 const covered=new Set(regions.flatMap(r=>r.ids));
 regions.sort((a,b)=>Math.min(...a.ids.map(id=>snapshot?.stores[id]?.cells[0]?.at||0))-Math.min(...b.ids.map(id=>snapshot?.stores[id]?.cells[0]?.at||0))||a.zip.localeCompare(b.zip));
 return {regions,covered:covered.size,total:stores.length,complete:covered.size===stores.length};
}
export function activateFiveMinuteTarget(health,plan,now=Date.now()){
 if(health.nationalTargetVersion==='national-five-minute-v1'||health.cooldownUntil>now||!plan.complete||plan.regions.length>36)return false;
 health.nationalTargetMigration={at:now,previousBudget:health.requestBudget,requiredRequests:plan.regions.length};
 health.requestBudget=plan.regions.length;health.recoverBudgetAt=now+1800000;health.nationalTargetVersion='national-five-minute-v1';return true;
}
export function nationalSchedule(health,plan,seconds=300){
 const schedule=collectionSchedule(health,seconds);
 // Reserve 20 seconds for a slow final response/publication. No concurrency or
 // catch-up burst: every request remains serial and paced across the window.
 if(plan.complete&&plan.regions.length<=schedule.budget)schedule.spacingMs=Math.floor((schedule.intervalMs-20000)/Math.max(1,plan.regions.length));
 return schedule;
}
export function nextVerifiedRegion(plan,{tried,checked,backoff,failedSinceSuccess=new Set()}){
 const eligible=r=>!tried.has(r.zip)&&!backoff.zips.has(r.zip)&&r.ids.some(id=>!checked.has(id)&&!backoff.stores.has(id));
 return plan.regions.find(r=>eligible(r)&&!failedSinceSuccess.has(r.zip))||plan.regions.find(eligible)||null;
}
export function coverageRound({startedAt,completedAt,stores,checked,attempts,errors,plannedRequests}){
 const missing=stores.filter(s=>!checked.has(s.id)).map(s=>s.id);const elapsedMs=completedAt-startedAt;
 return {startedAt,completedAt,elapsedMs,deadlineAt:startedAt+300000,plannedRequests,attempts,coveredStores:stores.length-missing.length,totalStores:stores.length,errors,missingStores:missing,status:!missing.length&&elapsedMs<=300000?'complete':'partial'};
}
