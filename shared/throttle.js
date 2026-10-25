const delays=[300000,600000,1200000,1800000];
export function regionBackoff(health,now=Date.now()){
 const active=Object.entries(health.regionCooldowns||{}).filter(([,v])=>v.until>now);
 return {zips:new Set(active.map(([zip])=>zip)),stores:new Set(active.flatMap(([,v])=>v.stores||[]))};
}
export function recordResult(health,{zip,status,error,stores=[],retryAfterSeconds=0},at=Date.now()){
 health.regionCooldowns||={};
 if(status===200&&!error){health.consecutiveErrors=0;health.blockedRegions=[];health.lastSuccess=at;health.healthySince||=at;if(at-health.healthySince>=1800000)health.blockLevel=0;delete health.regionCooldowns[zip];health.message='Collecting nationwide observations';return {global:false,regional:false}}
 health.healthySince=0;health.consecutiveErrors=(health.consecutiveErrors||0)+1;health.lastErrorAt=at;health.lastHttpStatus=status;health.message=error||`Apple HTTP ${status}`;
 let regional=false,global=false;
 if(status===541){const previous=health.regionCooldowns[zip];const level=Math.min(4,(previous?.level||0)+1);health.regionCooldowns[zip]={until:at+delays[level-1],level,stores};regional=true;health.blockedRegions=[...new Set([...(health.blockedRegions||[]),zip])].slice(-3);global=health.blockedRegions.length>=2}
 if(status===403||status===429||health.consecutiveErrors>=3||retryAfterSeconds>0)global=true;
 if(global){const level=Math.min(4,(health.blockLevel||0)+1);health.blockLevel=level;health.cooldownUntil=Math.max(at+delays[level-1],at+Number(retryAfterSeconds||0)*1000);health.blockedRegions=[];}
 return {global,regional};
}
export function parseRetryAfter(value,now=Date.now()){if(!value)return 0;const seconds=Number(value);if(Number.isFinite(seconds))return Math.max(0,seconds);const time=Date.parse(value);return Number.isFinite(time)?Math.max(0,Math.ceil((time-now)/1000)):0}
