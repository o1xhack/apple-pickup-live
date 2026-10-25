const delays=[300000,600000,1200000,1800000];
export function regionBackoff(health,now=Date.now()){
 const active=Object.entries(health.regionCooldowns||{}).filter(([,v])=>v.until>now);
 return {zips:new Set(active.map(([zip])=>zip)),stores:new Set(active.flatMap(([,v])=>v.stores||[]))};
}
export function migrateRegionalPolicy(health,now=Date.now()){
 if(health.regionalPolicyVersion==='all-regions-v1')return false;
 health.regionalPolicyVersion='all-regions-v1';
 // Replace only the old two-541 heuristic where that same round had successes.
 // Known explicit server waits and 403/429 pauses are never removed.
 const round=health.lastCoverageRound;
 if(health.cooldownUntil>now&&health.lastHttpStatus===541&&round?.coveredStores>0&&round.errors>0&&!health.cooldownReason&&!(health.serverRetryUntil>now)){
  health.regionalPolicyMigration={at:now,previousUntil:health.cooldownUntil,reason:'replace-two-region-heuristic',legacyRetryAfterNotRecorded:true,retainedBudget:health.requestBudget};
  health.cooldownUntil=0;health.failedRegionsSinceSuccess=[];health.blockedRegions=[];
  for(const value of Object.values(health.regionCooldowns||{}))if(value.until>=health.lastErrorAt-1800000)value.until=Math.max(value.until,now+300000);
  return true;
 }
 return false;
}
export function recordResult(health,{zip,status,error,stores=[],retryAfterSeconds=0,allRegions=[]},at=Date.now()){
 health.regionCooldowns||={};health.lastRetryAfterSeconds=retryAfterSeconds;
 if(status===200&&!error){health.consecutiveErrors=0;health.failedRegionsSinceSuccess=[];health.blockedRegions=[];health.lastSuccess=at;health.healthySince||=at;if(at-health.healthySince>=1800000)health.blockLevel=0;delete health.regionCooldowns[zip];health.message='Collecting nationwide observations';return {global:false,regional:false}}
 health.healthySince=0;health.consecutiveErrors=(health.consecutiveErrors||0)+1;health.lastErrorAt=at;health.lastHttpStatus=status;health.message=error||`Apple HTTP ${status}`;
 health.failedRegionsSinceSuccess=[...new Set([...(health.failedRegionsSinceSuccess||[]),zip])];
 let regional=false,reason=null;
 if(status===541){const previous=health.regionCooldowns[zip];const level=Math.min(4,(previous?.level||0)+1);health.regionCooldowns[zip]={until:at+delays[level-1],level,stores};regional=true;}
 if(retryAfterSeconds>0){reason='retry-after';health.serverRetryUntil=Math.max(health.serverRetryUntil||0,at+retryAfterSeconds*1000)}
 else if(status===403||status===429)reason='http-'+status;
 else if(allRegions.length&&allRegions.every(region=>health.failedRegionsSinceSuccess.includes(region)))reason='all-regions-failed';
 if(reason){const level=Math.min(4,(health.blockLevel||0)+1);health.blockLevel=level;health.cooldownUntil=Math.max(at+delays[level-1],health.serverRetryUntil||0);health.cooldownReason=reason;health.failedRegionsSinceSuccess=[];return {global:true,regional,reason}}
 return {global:false,regional};
}
export function parseRetryAfter(value,now=Date.now()){if(!value)return 0;const seconds=Number(value);if(Number.isFinite(seconds))return Math.max(0,seconds);const time=Date.parse(value);return Number.isFinite(time)?Math.max(0,Math.ceil((time-now)/1000)):0}
