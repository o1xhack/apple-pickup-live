export const SOURCES=['mac-local','cloudflare'];
export function temporaryMacPlan(plan,health,until,now=Date.now()){
 const remote=health.shards?.sources?.cloudflare,local=health.shards?.sources?.['mac-local'];
 if(!Number.isSafeInteger(until)||until<=now||remote?.servicePauseReason!=='d1-quota'||!local){delete health.temporaryMacCollection;return plan}
 const previous=health.temporaryMacCollection;
 const cap=previous?.until===until?previous.requestBudget:Math.max(1,local.requestBudget);
 health.temporaryMacCollection={until,requestBudget:cap,reason:'user-authorized-d1-maintenance'};
 // Preserve outstanding Apple waits; only the D1 service pause is bypassed.
 local.regionCooldowns||={};
 for(const region of plan.regions.filter(r=>r.source==='cloudflare')){
  const old=remote.regionCooldowns?.[region.zip],wait=Math.max(old?.until||0,remote.serverRetryUntil||0);
  if(wait>now&&wait>(local.regionCooldowns[region.zip]?.until||0))local.regionCooldowns[region.zip]={...old,until:wait,stores:region.ids};
 }
 return {...plan,macRequestBudgetCap:cap,regions:plan.regions.map(r=>({...r,source:'mac-local'})),storeOwners:Object.fromEntries(Object.keys(plan.storeOwners).map(id=>[id,'mac-local']))};
}
export function validateShards(plan,stores){
 const ids=new Set(stores.map(s=>s.id)),zips=new Set();
 if(plan.version!=='fixed-regions-v1'||Object.keys(plan.storeOwners).length!==ids.size)throw Error('Invalid shard catalog');
 for(const r of plan.regions){if(zips.has(r.zip)||!/^\d{5}$/.test(r.zip)||!SOURCES.includes(r.source)||!r.ids.length||r.ids.some(id=>!ids.has(id)))throw Error('Invalid or duplicate shard region');zips.add(r.zip)}
 for(const id of ids){const source=plan.storeOwners[id];if(!SOURCES.includes(source)||!plan.regions.some(r=>r.source===source&&r.ids.includes(id)))throw Error('Uncovered shard store')}
 return plan;
}
export function initializeShards(health,plan,now=Date.now()){
 if(health.shards?.version===plan.version)return health.shards;
 const budget=Math.max(2,Math.min(30,health.requestBudget||4)),until=Math.max(0,health.cooldownUntil||0);
 health.shards={version:plan.version,startedAt:now,sources:Object.fromEntries(SOURCES.map((source,i)=>[source,{requestBudget:i?Math.floor(budget/2):Math.ceil(budget/2),recoverBudgetAt:now+3600000,cooldownUntil:until,serverRetryUntil:health.serverRetryUntil||0,blockLevel:health.blockLevel||0,requests:0,successes:0,errors:0,nextRequestAt:source==='mac-local'?Math.max(health.lastSuccess||0,health.lastErrorAt||0)+Math.ceil(300000/budget):0,regionCooldowns:source==='mac-local'?Object.fromEntries(Object.entries(health.regionCooldowns||{}).filter(([zip])=>plan.regions.some(r=>r.source===source&&r.zip===zip))):{}}]))};return health.shards;
}
export function shardQuota(health,maximum,now=Date.now()){
 if(now>=health.recoverBudgetAt&&health.cooldownUntil<=now){health.requestBudget=Math.min(maximum,health.requestBudget+1);health.recoverBudgetAt=now+3600000}
 return Math.max(1,Math.min(maximum,health.requestBudget));
}
export function shardRows(plan,source,rows){return rows.filter(row=>plan.storeOwners[row.id]===source)}
export function shardCandidates(plan,source,snapshot){
 return plan.regions.filter(r=>r.source===source).map(r=>({...r,ids:r.ids.filter(id=>plan.storeOwners[id]===source)})).filter(r=>r.ids.length).sort((a,b)=>Math.min(...a.ids.map(id=>snapshot.stores[id]?.cells[0]?.at||0))-Math.min(...b.ids.map(id=>snapshot.stores[id]?.cells[0]?.at||0))||a.zip.localeCompare(b.zip));
}
export function summarizeShards(snapshot,plan,now=Date.now()){
 const sh=snapshot.health.shards;
 return Object.fromEntries(SOURCES.map(source=>{
  const h=sh.sources[source],ids=Object.keys(plan.storeOwners).filter(id=>plan.storeOwners[id]===source);
  return [source,{...h,totalStores:ids.length,regions:plan.regions.filter(r=>r.source===source).length,freshStores15m:ids.filter(id=>snapshot.stores[id].cells.every(c=>c.source===source&&c.at&&now-c.at<=900000)).length}];
 }));
}
