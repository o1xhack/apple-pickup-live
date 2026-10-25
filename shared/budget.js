// Adapt load after a real failure; do not switch IPs or bypass a challenge.
export function requestBudget(health,now=Date.now()){
 let budget=Math.max(4,Math.min(36,health.requestBudget||(health.cooldownUntil?18:36)));
 if(health.recoverBudgetAt&&now>=health.recoverBudgetAt){budget=Math.min(36,budget+1);health.recoverBudgetAt=now+1800000}
 health.requestBudget=budget;return budget;
}
export function reduceBudget(health,now=Date.now()){
 const current=requestBudget(health,now);health.requestBudget=Math.max(4,Math.floor(current/2));health.recoverBudgetAt=now+1800000;return health.requestBudget;
}
