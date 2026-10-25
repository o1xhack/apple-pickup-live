export function collectionSchedule(health,intervalSeconds=300){
 const intervalMs=Math.max(60000,Number(intervalSeconds)*1000||300000);
 const budget=Math.max(4,Math.min(36,Number(health.requestBudget)||36));
 return {intervalMs,budget,spacingMs:Math.ceil(intervalMs/budget)};
}

// Legacy budgets were measured per 60-second round. Preserve their average rate
// when changing cadence; do not inadvertently reduce a throttled budget threefold.
export function normalizeBudgetPeriod(health,intervalSeconds){
 const previous=health.budgetPeriodSeconds||60;
 if(previous!==intervalSeconds&&health.requestBudget)health.requestBudget=Math.max(4,Math.min(36,Math.floor(health.requestBudget*intervalSeconds/previous)));
 health.budgetPeriodSeconds=intervalSeconds;
}
