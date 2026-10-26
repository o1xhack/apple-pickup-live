import siteInfo from '../data/site-info.json';
import {readPublicHistory,publishPublicHistory} from './public-history.js';
import {readLive,publishLive} from './live-cache.js';
import {isD1QuotaError,nextQuotaReset} from '../shared/service-quota.js';
import stores from '../data/us-stores.json';
import products from '../data/products.json';
import shards from '../data/collection-shards.json';
import {executeCloudflare} from './shard-executor.js';




import {emptySnapshot} from '../shared/model.js';

const json=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
const safeEqual=(a,b)=>{if(!a||!b||a.length!==b.length)return false;let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);return out===0};
const asBytes=value=>value instanceof ArrayBuffer?new Uint8Array(value):Uint8Array.from(value);
async function pack(data){return new Uint8Array(await new Response(new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())}
export async function saveCheckpoint(env,data,events=[],historical=false){
 const ts=Number(data.publishedAt);if(!Number.isSafeInteger(ts)||(historical?(ts<data.startedAt||ts>Date.now()+600000):Math.abs(Date.now()-ts)>600000))throw Error('Invalid publication time');
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
   if(url.pathname==='/api/info')response=json({...siteInfo,products,stores:stores.length},200,{'cache-control':'public, max-age=300'});
   else if(url.pathname==='/api/latest'){
    const live=await readLive(env);response=live?json(live,200,{'cache-control':'public, max-age=15','x-live-source':'kv'}):json({error:'Live snapshot not published yet'},503);
   }else if(url.pathname==='/api/public-history'&&request.method==='GET'){
    const data=await readPublicHistory(env);response=data?.value?new Response(data.value,{headers:{'content-type':'application/gzip','cache-control':'public, max-age=60','x-history-published-at':String(data.metadata?.at||0)}}):json({error:'History publication not ready'},503);
   }else if(['/api/history','/api/checkpoint','/api/series','/api/legacy/statistics'].includes(url.pathname)){
    response=json({code:'client_history',error:'Use published date files and browser filtering',publication:'/api/public-history'},410);
   }else if(url.pathname==='/api/public-history/publish'&&request.method==='POST'){
    if(!env.INGEST_TOKEN||!safeEqual(request.headers.get('authorization'),`Bearer ${env.INGEST_TOKEN}`))return json({error:'Unauthorized'},401);
    response=json(await publishPublicHistory(env,request));
   }else if(url.pathname==='/api/live/publish'&&request.method==='POST'){
    if(!env.INGEST_TOKEN||!safeEqual(request.headers.get('authorization'),`Bearer ${env.INGEST_TOKEN}`))return json({error:'Unauthorized'},401);
    const {snapshot:data}=await request.json();
    if(!data||data.products?.map(p=>p.part).join('|')!==products.map(p=>p.part).join('|')||Object.keys(data.stores||{}).length!==stores.length)return json({error:'Invalid live catalog'},400);
    response=json(await publishLive(env,data));
   }else if(url.pathname==='/api/ingest'&&request.method==='POST'){
    if(!env.INGEST_TOKEN||!safeEqual(request.headers.get('authorization'),`Bearer ${env.INGEST_TOKEN}`))return json({error:'Unauthorized'},401);
    response=json({code:'local_history',error:'Historical database ingestion retired; publish date files'},410);
   }else if(url.pathname==='/api/collector/check'&&request.method==='POST'){
    if(!env.INGEST_TOKEN||!safeEqual(request.headers.get('authorization'),`Bearer ${env.INGEST_TOKEN}`))return json({error:'Unauthorized'},401);
    const result=await executeCloudflare(request,env,shards,products,stores);response=json(result.body,result.httpStatus);
   }else response=json({error:'Not found'},404);
   return apiHeaders(response);
  }catch(error){
   if(isD1QuotaError(error)){
    if(url.pathname==='/api/collector/check'&&request.method==='POST')return apiHeaders(json({skipped:true,reason:'d1-quota',retryAt:nextQuotaReset()}));
    if(url.pathname==='/api/ingest'&&request.method==='POST')return apiHeaders(json({ok:false,historyPersisted:false,reason:'d1-quota',retryAt:nextQuotaReset()}));
    return apiHeaders(json({error:'Saved history is temporarily unavailable',code:'history_unavailable',retryAt:nextQuotaReset()},503));
   }
   return apiHeaders(json({error:String(error.message||'Request failed')},500))
  }
 },
 async scheduled(event,env,ctx){

  ctx.waitUntil(env.DB.prepare('DELETE FROM collector_executions WHERE at<?').bind(Date.now()-86400000).run());

 }
};
