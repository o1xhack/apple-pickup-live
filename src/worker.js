import stores from '../data/us-stores.json';
import products from '../data/products.json';
import legacyProducts from '../data/legacy-products.json';
import {legacyMetadata,legacyStatistics} from './legacy.js';
const historyProducts=[...products,...legacyProducts.filter(p=>!products.some(x=>x.part===p.part))];
import hubsData from '../data/polling-hubs.json';
import learningHubs from '../data/learning-hubs.json';
import {emptySnapshot,parseApple,applyObservation,viewCell} from '../shared/model.js';
import {parseRetryAfter} from '../shared/throttle.js';
const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
const safeEqual=(a,b)=>{if(!a||!b||a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0};
const asBytes=value=>value instanceof ArrayBuffer?new Uint8Array(value):Uint8Array.from(value);
async function siteStart(env){const row=await env.DB.prepare("SELECT value FROM metadata WHERE key='site_start'").first();return Number(row?.value)||Date.now()}
async function latest(env,at=Date.now()){return env.DB.prepare('SELECT * FROM checkpoints WHERE ts<=? ORDER BY ts DESC LIMIT 1').bind(at).first()}
async function unpack(row){return JSON.parse(await new Response(new Blob([asBytes(row.payload)]).stream().pipeThrough(new DecompressionStream('gzip'))).text())}
async function pack(data){return new Uint8Array(await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())}
export async function saveCheckpoint(env,data,events=[]){
 const ts=Number(data.publishedAt);if(!Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>600000)throw Error('Invalid publication time');
 const payload=await pack(data);if(payload.length>524288)throw Error('Checkpoint is too large');
 const fresh=Object.values(data.stores).filter(store=>store.cells.every(c=>c.at&&Date.now()-c.at<=300000)).length;
 const t=data.totals;
 const sql=[env.DB.prepare('INSERT OR IGNORE INTO checkpoints(ts,payload,checks,positives,requests,errors,fresh_stores,source) VALUES(?,?,?,?,?,?,?,?)').bind(ts,Array.from(payload),t.checks,t.hits,t.requests,t.errors,fresh,data.health.mode)];
 for(const e of events){
  if(!stores.some(s=>s.id===e.store)||!products.some(p=>p.part===e.part)||!['0','1','U','P'].includes(e.code))continue;
  sql.push(env.DB.prepare('INSERT OR IGNORE INTO stock_events(id,ts,store,part,state,kind) VALUES(?,?,?,?,?,?)').bind(e.id,e.at,e.store,e.part,e.code,e.kind));
 }
 for(let i=0;i<sql.length;i+=40)await env.DB.batch(sql.slice(i,i+40));
}
function apiHeaders(response){const h=new Headers(response.headers);h.set('x-content-type-options','nosniff');h.set('referrer-policy','no-referrer');h.set('access-control-allow-origin','*');return new Response(response.body,{status:response.status,headers:h})}
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);try{
   if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
   let response;
   if(url.pathname==='/api/info')response=json({startedAt:await siteStart(env),stores:stores.length,products,version:'0.1.0',legacy:await legacyMetadata(env),freshSeconds:300,source:'Apple pickup observations',coordinateAccuracy:'ZIP estimates, approximate straight-line distance'});
   else if(url.pathname==='/api/legacy/statistics'){try{response=json(await legacyStatistics(env,url,stores,historyProducts))}catch(error){response=json({error:error.message},400)}}
   else if(url.pathname==='/api/latest'||url.pathname==='/api/checkpoint'){
    const at=Number(url.searchParams.get('at')||Date.now());if(!Number.isFinite(at))return json({error:'Invalid time'},400);
    const row=await latest(env,Math.min(at,Date.now()));
    response=row?new Response(new Blob([asBytes(row.payload)]).stream().pipeThrough(new DecompressionStream('gzip')),{headers:{'content-type':'application/json','cache-control':'public, max-age=15','x-observed-checkpoint':String(row.ts)}}):json(emptySnapshot(stores,products,await siteStart(env)));
   }else if(url.pathname==='/api/series'){
    const from=Math.max(0,Number(url.searchParams.get('from')||Date.now()-86400000)),to=Math.min(Date.now(),Number(url.searchParams.get('to')||Date.now()));
    if(!Number.isFinite(from+to)||to<from||to-from>366*86400000)return json({error:'Invalid date range; choose up to 366 days'},400);
    const bucket=Math.max(60000,Math.floor((to-from)/48));
    const rows=await env.DB.prepare('SELECT max(ts) AS ts,checks,positives,requests,errors,fresh_stores FROM checkpoints WHERE ts>=? AND ts<=? GROUP BY CAST(ts/? AS INTEGER) ORDER BY ts').bind(from,to,bucket).all();response=json({points:rows.results});
   }else if(url.pathname==='/api/history'){
    const store=url.searchParams.get('store')||'',part=url.searchParams.get('part')||'';
    if(store&&!stores.some(s=>s.id===store)||part&&!historyProducts.some(p=>p.part===part))return json({error:'Unknown store or configuration'},400);
    const ids=(url.searchParams.get('stores')||'').split(',').filter(Boolean),parts=(url.searchParams.get('parts')||'').split(',').filter(Boolean);
    if(ids.length>269||ids.some(id=>!stores.some(s=>s.id===id))||parts.some(id=>!historyProducts.some(p=>p.part===id)))return json({error:'Invalid filters'},400);
    const from=Math.max(0,Number(url.searchParams.get('from')||Date.now()-7*86400000)),to=Math.min(Date.now(),Number(url.searchParams.get('to')||Date.now()));
    if(!Number.isFinite(from+to)||to<from)return json({error:'Invalid dates'},400);
    const source=url.searchParams.get('source')||'all';if(!['all','national','legacy_ca'].includes(source))return json({error:'Invalid source'},400);
    const result=await env.DB.prepare('SELECT ts,store,part,state,kind,source FROM stock_events WHERE ts>=? AND ts<=? AND (?=\'\' OR store=?) AND (?=\'\' OR part=?) AND (?=0 OR store IN(SELECT value FROM json_each(?))) AND (?=0 OR part IN(SELECT value FROM json_each(?))) AND (?=\'all\' OR source=?) ORDER BY ts DESC LIMIT 200').bind(from,to,store,store,part,part,ids.length,JSON.stringify(ids),parts.length,JSON.stringify(parts),source,source).all();response=json({events:result.results});
   }else if(url.pathname==='/api/ingest'&&request.method==='POST'){
    if(!safeEqual(request.headers.get('authorization'),`Bearer ${env.INGEST_TOKEN||''}`)||!env.INGEST_TOKEN)return json({error:'Unauthorized'},401);
    if(Number(request.headers.get('content-length')||0)>2_000_000)return json({error:'Payload too large'},413);
    const input=await request.json();const data=input.snapshot;
    if(!data||data.version!==1||data.products?.map(p=>p.part).join('|')!==products.map(p=>p.part).join('|')||Object.keys(data.stores||{}).length!==stores.length)return json({error:'Invalid catalog or snapshot'},400);
    await saveCheckpoint(env,data,input.events||[]);response=json({ok:true,ts:data.publishedAt});
   }else if(url.pathname==='/api/collector/check'&&request.method==='POST'){
    if(!env.INGEST_TOKEN||!safeEqual(request.headers.get('authorization'),`Bearer ${env.INGEST_TOKEN}`))return json({error:'Unauthorized'},401);
    const input=await request.json();
    if(!stores.some(s=>s.zip===input.zip)&&!hubsData.hubs.some(h=>h.zip===input.zip)&&!learningHubs.hubs.some(h=>h.zip===input.zip))return json({error:'Unknown collection region'},400);
    const start=Date.now();const apple=await fetch(appleUrl(input.zip),{headers:appleHeaders(),signal:AbortSignal.timeout(20000)});let found=[];let error=null;
    if(apple.ok){try{found=parseApple(await apple.json(),products)}catch(e){error=e.message}}else{await apple.body?.cancel();error=`Apple HTTP ${apple.status}`}
    response=json({status:apple.status,stores:found.filter(x=>stores.some(s=>s.id===x.id)),at:start,durationMs:Date.now()-start,error,retryAfterSeconds:parseRetryAfter(apple.headers.get('retry-after'))});
   }else response=json({error:'Not found'},404);
   return apiHeaders(response);
  }catch(error){return apiHeaders(json({error:String(error.message||'Request failed')},500))}
 },
 async scheduled(event,env,ctx){
  const d=new Date(event.scheduledTime);if(d.getUTCHours()===8&&d.getUTCMinutes()===0)ctx.waitUntil(env.DB.prepare("DELETE FROM checkpoints WHERE ts<? AND strftime('%M',ts/1000,'unixepoch')!='00'").bind(Date.now()-14*86400000).run());
 }
};
export function appleUrl(zip){const url=new URL('https://www.apple.com/shop/retail/pickup-message');url.searchParams.set('pl','true');url.searchParams.set('mts.0','regular');url.searchParams.set('location',zip);products.forEach((p,i)=>url.searchParams.set(`parts.${i}`,p.part));return url.toString()}
export function appleHeaders(){return {'accept':'application/json','referer':'https://www.apple.com/shop/buy-iphone/iphone-duo','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'}}

