import {rangeMetrics} from './model.js';
export const FRESH_WINDOW_MS=300000;
export function liveMetrics(snapshot,stores,indices,now=Date.now()){
 const totals=rangeMetrics(snapshot,null,stores.map(s=>s.id),indices);
 let freshStores=0,stockStores=0,stockConfigurations=0,everStockStores=0;
 for(const store of stores){const cells=indices.map(i=>snapshot.stores[store.id]?.cells[i]);const fresh=c=>c?.at&&now-c.at<=FRESH_WINDOW_MS;
 if(cells.length&&cells.every(fresh))freshStores++;
 const available=cells.filter(c=>fresh(c)&&c.code==='1').length;stockConfigurations+=available;if(available)stockStores++;
 if(cells.some(c=>c?.hits>0))everStockStores++;
 }
 return {...totals,freshStores,stockStores,stockConfigurations,everStockStores,awaitingFreshStores:stores.length-freshStores,stores:stores.length};
}
