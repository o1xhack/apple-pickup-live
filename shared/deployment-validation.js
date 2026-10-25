// Deployment validation consumes scheduled work; it never bypasses cooldown.
export function queueValidation(health,version,now=Date.now()){
 if(health.deploymentValidation?.version===version)return;
 health.deploymentValidation={version,status:'queued',queuedAt:now,notBefore:Math.max(now,health.cooldownUntil||0)};
}
export function validateRound(health,{attempts,covered,errors,firstResult},now=Date.now()){
 const validation=health.deploymentValidation;if(!validation||validation.status!=='queued'||!attempts)return false;
 Object.assign(validation,{status:errors?'degraded':'passed',completedAt:now,attempts,coveredStores:covered,errors,firstResult});return true;
}
export function nextCollectionDelay(health,intervalMs,elapsed,now=Date.now()){
 const regular=Math.max(1000,intervalMs-elapsed);
 return health.cooldownUntil>now?Math.max(1000,Math.min(regular,health.cooldownUntil-now)):regular;
}
