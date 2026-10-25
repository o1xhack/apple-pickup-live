import {rangeMetrics} from './model.js';
import {dayKey} from './daily.js';
export const FRESH_WINDOW_MS=900000;
export function liveMetrics(snapshot,stores,indices,now=Date.now()){
 const totals=rangeMetrics(snapshot,null,stores.map(s=>s.id),indices),today=dayKey(now),launchDay=dayKey(snapshot.startedAt);
 let freshStores=0,stockStores=0,stockConfigurations=0,everStockStores=0,checkedToday=0,todayChecks=0,todayHits=0;
 for(const store of stores){const cells=indices.map(i=>snapshot.stores[store.id]?.cells[i]);const fresh=c=>c?.at&&now-c.at<=FRESH_WINDOW_MS;
 if(cells.length&&cells.every(fresh))freshStores++;
 const available=cells.filter(c=>fresh(c)&&c.code==='1').length;stockConfigurations+=available;if(available)stockStores++;
 if(cells.some(c=>c?.hits>0))everStockStores++;
 if(cells.some(c=>c?.at&&dayKey(c.at)===today))checkedToday++;
 for(const cell of cells){if(!cell)continue;
  if(cell.dailyDay===today){todayChecks+=cell.dailyChecks||0;todayHits+=cell.dailyHits||0}
  else if(!cell.dailyDay&&launchDay===today&&cell.at&&dayKey(cell.at)===today){todayChecks+=cell.checks||0;todayHits+=cell.hits||0}
 }
 }
 return {...totals,freshStores,stockStores,stockConfigurations,everStockStores,checkedToday,todayChecks,todayHits,awaitingFreshStores:stores.length-freshStores,stores:stores.length};
}
