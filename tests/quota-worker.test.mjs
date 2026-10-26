import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {readFileSync} from 'node:fs';import {emptySnapshot} from '../shared/model.js';
const bundle=await build({entryPoints:[new URL('../src/worker.js',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',write:false});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const stores=JSON.parse(readFileSync(new URL('../data/us-stores.json',import.meta.url))),products=JSON.parse(readFileSync(new URL('../data/products.json',import.meta.url)));
const snapshot=emptySnapshot(stores,products,Date.now()-1000);snapshot.publishedAt=Date.now();
const quota=()=>{throw Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.")};
const env={DB:{prepare:quota,batch:quota},LIVE_CACHE:{get:async()=>snapshot,put:async()=>{}},INGEST_TOKEN:'synthetic-test-token'};
const req=(path,body)=>new Request('https://test'+path,body?{method:'POST',headers:{authorization:'Bearer synthetic-test-token','content-type':'application/json'},body:JSON.stringify(body)}:{});
test('live metadata and stock remain available with every D1 operation blocked',async()=>{
 for(const path of ['/api/info','/api/latest']){const response=await worker.fetch(req(path),env,{});assert.equal(response.status,200);const value=await response.json();assert.equal(path==='/api/info'?value.stores:Object.keys(value.stores).length,269)}
 const latest=await worker.fetch(req('/api/latest'),env,{});assert.equal(latest.headers.get('x-live-source'),'kv');
});
test('quota stops only cloud execution and queues history without pretending it persisted',async()=>{
 const region=JSON.parse(readFileSync(new URL('../data/collection-shards.json',import.meta.url))).regions.find(r=>r.source==='cloudflare');
 const cloud=await worker.fetch(req('/api/collector/check',{zip:region.zip,requestId:crypto.randomUUID(),at:Date.now(),planVersion:'fixed-regions-v1'}),env,{});assert.equal(cloud.status,200);const task=await cloud.json();assert.equal(task.skipped,true);assert.equal(task.reason,'d1-quota');assert.ok(task.retryAt>Date.now());
 const ingest=await worker.fetch(req('/api/ingest',{snapshot,events:[]}),env,{});assert.equal(ingest.status,200);const saved=await ingest.json();assert.equal(saved.historyPersisted,false);assert.ok(saved.retryAt>Date.now());
 const denied=await worker.fetch(new Request('https://test/api/live/publish',{method:'POST',body:'{}'}),env,{});assert.equal(denied.status,401);
});
test('unavailable historical data is explicit, never an empty successful history',async()=>{
 for(const path of ['/api/history','/api/series','/api/legacy/statistics?from=1792193860429&to=1793000000000']){const r=await worker.fetch(req(path),env,{});assert.equal(r.status,503);assert.equal((await r.json()).code,'history_unavailable')}
});
