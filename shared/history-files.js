import {emptySnapshot} from './model.js';
export const CELL_FIELDS=['code','at','checks','hits','unknown','pending','lastHit','intervals','firstHit'];
export const utcDay=at=>new Date(at).toISOString().slice(0,10);
export function encodeCells(cells){return cells.map(c=>CELL_FIELDS.map(k=>c?.[k]??(k==='code'?'U':0)))}
export function decodeCells(cells){return cells.map(values=>Object.fromEntries(CELL_FIELDS.map((k,i)=>[k,values[i]??(k==='code'?'U':0)])))}
export function reconstructCheckpoint(day,at,stores,products,startedAt){
 const result=emptySnapshot(stores,products,startedAt);let last=startedAt;
 for(const [id,cells] of Object.entries(day?.baseline||{}))if(result.stores[id])result.stores[id].cells=decodeCells(cells);
 for(const [ts,id,cells] of day?.records||[]){if(ts>at)break;if(result.stores[id]){result.stores[id].cells=decodeCells(cells);last=Math.max(last,ts)}}
 result.publishedAt=Math.min(at,Math.max(last,day?.baselineAt||startedAt));return result;
}
export function legacyRange(archive,from,to){
 const rows=new Map();
 for(const b of archive.buckets){const [bucket,store,part,checks,hits,unknown,pending,lastHit,samples]=b;if(bucket>to||bucket+3599999<from)continue;
  const row=rows.get(store+'|'+part)||{store,part,checks:0,hits:0,unknown:0,pending:0,lastHit:0};
  if(from<=bucket&&to>=bucket+3599999){row.checks+=checks;row.hits+=hits;row.unknown+=unknown;row.pending+=pending;row.lastHit=Math.max(row.lastHit,lastHit)}
  else for(const [offset,code] of samples){const at=bucket+offset;if(at<from||at>to)continue;row.checks++;if(code==='1'){row.hits++;row.lastHit=Math.max(row.lastHit,at)}if(code==='U')row.unknown++;if(code==='P')row.pending++}
  if(row.checks)rows.set(store+'|'+part,row);
 }
 return {source:'legacy_ca',rows:[...rows.values()],series:[]};
}
export function historyEvents(events,{from=0,to=Date.now(),stores=[],parts=[],result='all',source='all'}={}){
 const ids=new Set(stores),skus=new Set(parts);return [...new Map(events.map(e=>[e.id,e])).values()].filter(e=>e.ts>=from&&e.ts<=to&&(!ids.size||ids.has(e.store))&&(!skus.size||skus.has(e.part))&&(source==='all'||e.source===source)&&(result!=='in_stock'||e.state==='1')).sort((a,b)=>b.ts-a.ts||a.id.localeCompare(b.id)).slice(0,200);
}
export function activitySeries(days,from,to){
 const bucket=Math.max(60000,Math.floor((to-from)/48)),points=new Map();for(const day of days)for(const p of day.points||[]){if(p.ts<from||p.ts>to)continue;const k=Math.floor(p.ts/bucket);if(!points.has(k)||points.get(k).ts<p.ts)points.set(k,p)}return {points:[...points.values()].sort((a,b)=>a.ts-b.ts)};
}
