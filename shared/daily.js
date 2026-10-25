export const DAILY_TIME_ZONE='America/Los_Angeles';
const formatter=new Intl.DateTimeFormat('en-US',{timeZone:DAILY_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
export function dayKey(at){const parts=Object.fromEntries(formatter.formatToParts(new Date(at)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`}
// Old snapshots from the launch day have an exact daily baseline: all their
// cumulative observations belong to that day. Never infer multi-day totals.
export function initializeDailyCounters(snapshot){
 const launchDay=dayKey(snapshot.startedAt);for(const store of Object.values(snapshot.stores))for(const cell of store.cells){
  if(!cell.dailyDay&&cell.at&&dayKey(cell.at)===launchDay){cell.dailyDay=launchDay;cell.dailyChecks=cell.checks;cell.dailyHits=cell.hits}
 }
}
export function recordDailyObservation(cell,at,code){
 const day=dayKey(at);if(cell.dailyDay!==day){cell.dailyDay=day;cell.dailyChecks=0;cell.dailyHits=0}
 cell.dailyChecks=(cell.dailyChecks||0)+1;if(code==='1')cell.dailyHits=(cell.dailyHits||0)+1;
}
