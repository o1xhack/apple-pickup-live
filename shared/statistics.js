import {rangeMetrics} from './model.js';
export function storeStatistics(stores,end,start,indices,from,to){
 return stores.map(store=>{const values=rangeMetrics(end,start,[store.id],indices);const last=Math.max(0,...indices.map(i=>end?.stores[store.id]?.cells[i]?.lastHit||0));return {store,...values,lastHit:last>=from&&last<=to?last:0}});
}
export function toggleSort(current,key){return current===key?null:key}
export function sortStatistics(rows,key){if(!key)return [...rows];if(!['hits','lastHit'].includes(key))throw Error('Invalid sort');return rows.map((row,index)=>({row,index})).sort((a,b)=>(b.row[key]||0)-(a.row[key]||0)||a.index-b.index).map(x=>x.row)}
