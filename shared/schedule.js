export function collectionSchedule(health,intervalSeconds=180){
 const intervalMs=Math.max(60000,Number(intervalSeconds)*1000||180000);
 const budget=Math.max(4,Math.min(36,Number(health.requestBudget)||36));
 return {intervalMs,budget,spacingMs:Math.ceil(intervalMs/budget)};
}
