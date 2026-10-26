import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {SOURCES,validateShards,initializeShards,shardRows,summarizeShards,temporaryMacPlan} from '../shared/shards.js';
import {collectShardedRound} from '../collector/sharded.mjs';import {emptySnapshot} from '../shared/model.js';import {executeCloudflare} from '../src/shard-executor.js';
const plan={version:'fixed-regions-v1',regions:[{zip:'10001',source:'mac-local',ids:['A']},{zip:'10002',source:'mac-local',ids:['B']},{zip:'20001',source:'cloudflare',ids:['C']},{zip:'20002',source:'cloudflare',ids:['D']}],storeOwners:{A:'mac-local',B:'mac-local',C:'cloudflare',D:'cloudflare'}};
const stores=['A','B','C','D'].map(id=>({id})),products=[{part:'p1'}];
function harness({failMac=false,until=0,failRecord=false}={}){
 let time=1000000;const data=emptySnapshot(stores,products,1);data.health.requestBudget=4;data.health.cooldownUntil=until;
 const calls=[],records=[];const request=source=>async input=>{const zip=typeof input==='string'?input:input.zip;calls.push({source,zip,at:time});if(failMac&&source==='mac-local')return {status:541,stores:[],error:'Apple HTTP 541'};return {status:200,stores:stores.map(s=>({id:s.id,codes:'1'}))}};
 return {data,calls,records,run:()=>collectShardedRound({data,coverage:{},plan,stores,products,storage:{record:(...a)=>{if(failRecord)throw Error('disk full');records.push(a[2])}},collectMac:request('mac-local'),collectCloudflare:request('cloudflare'),publish:async()=>{},now:()=>time,sleep:async ms=>{time+=ms}})};
}
test('production assignments cover every store with fixed disjoint owners and unique query ZIPs',()=>{
 const p=JSON.parse(readFileSync(new URL('../data/collection-shards.json',import.meta.url))),catalog=JSON.parse(readFileSync(new URL('../data/us-stores.json',import.meta.url)));
 validateShards(p,catalog);assert.equal(p.regions.length,30);for(const s of SOURCES)assert.equal(p.regions.filter(r=>r.source===s).length,15);
 assert.equal(new Set(p.regions.map(r=>r.zip)).size,30);assert.equal(Object.keys(p.storeOwners).length,269);
 const all=catalog.map(s=>({id:s.id}));assert.equal(shardRows(p,'mac-local',all).length+shardRows(p,'cloudflare',all).length,269);
 assert.throws(()=>validateShards({...p,regions:[...p.regions,p.regions[0]]},catalog));
});
test('migration splits existing budget without increasing it and preserves server/global wait',()=>{
 const h={requestBudget:5,cooldownUntil:2000000,serverRetryUntil:1900000};let s=initializeShards(h,plan,1000000);assert.equal(s.sources['mac-local'].requestBudget+s.sources.cloudflare.requestBudget,5);assert.equal(s.sources.cloudflare.cooldownUntil,2000000);assert.equal(s.sources.cloudflare.serverRetryUntil,1900000);
 s.sources.cloudflare.requestBudget=1;initializeShards(h,plan,2000001);assert.equal(s.sources.cloudflare.requestBudget,1);
});
test('sources execute only their own ZIPs, count no overlapping neighbors, and keep full per-source spacing',async()=>{
 const h=harness();const r=await h.run();assert.equal(r.attempts,4);assert.equal(r.covered,4);assert.equal(h.data.totals.checks,4);
 for(const call of h.calls)assert.equal(plan.regions.find(r=>r.zip===call.zip).source,call.source);
 for(const source of SOURCES){const a=h.calls.filter(c=>c.source===source);assert.equal(a.length,2);assert.ok(a[1].at-a[0].at>=150000)}
 assert.equal(h.data.health.shards.sources.cloudflare.successes,2);
});
test('one source failure does not move its regions or reset the other source cooldown/budget',async()=>{
 const h=harness({failMac:true});await h.run();assert.equal(h.calls.filter(c=>c.source==='cloudflare').length,2);assert.equal(h.data.health.shards.sources['mac-local'].requestBudget,1);assert.equal(h.data.health.shards.sources.cloudflare.requestBudget,2);assert.ok(h.data.health.shards.sources['mac-local'].cooldownUntil>1000000);assert.equal(h.data.totals.checks,2);
});
test('deployment retains active cooldown without Apple probes; storage failure stops the round',async()=>{
 const h=harness({until:2000000});await h.run();assert.equal(h.calls.length,0);const failed=harness({failRecord:true});await assert.rejects(failed.run(),/disk full/);assert.equal(failed.calls.length,1);
});
function database(){const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0004_fixed_shards.sql',import.meta.url),'utf8'));return {DB:{prepare:sql=>({bind:(...args)=>({first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})})})},db}}
test('remote execution rejects local regions, replays cached IDs and rejects rapid duplicate tasks without Apple calls',async()=>{
 const {DB,db}=database();let time=1000000,calls=0;const task={planVersion:plan.version,zip:'20001',requestId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',at:time};
 const run=input=>executeCloudflare(new Request('https://example.com',{method:'POST',body:JSON.stringify(input)}),{DB},plan,products,stores,{now:()=>time,collect:async()=>{calls++;return {status:200,stores:[{id:'C',codes:'1'}]}}});
 assert.equal((await run({...task,zip:'10001'})).httpStatus,400);assert.equal(calls,0);
 assert.equal((await run(task)).body.status,200);assert.equal((await run(task)).body.status,200);assert.equal(calls,1);
 assert.equal((await run({...task,requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'})).body.skipped,true);assert.equal(calls,1);
 time+=20001;assert.equal((await run({...task,at:time,requestId:'cccccccc-cccc-cccc-cccc-cccccccccccc'})).body.skipped,true);assert.equal(calls,1);db.close();
});
test('remote 541 is preserved without retry; concurrent same-ID tasks acquire at most one execution',async()=>{
 const {DB,db}=database();let calls=0;const at=2000000,input={planVersion:plan.version,zip:'20002',requestId:'dddddddd-dddd-dddd-dddd-dddddddddddd',at};
 const run=()=>executeCloudflare(new Request('https://example.com',{method:'POST',body:JSON.stringify(input)}),{DB},plan,products,stores,{now:()=>at,collect:async()=>{calls++;return {status:541,stores:[],error:'Apple HTTP 541',retryAfterSeconds:300}}});
 const results=await Promise.all([run(),run()]);assert.equal(calls,1);assert.ok(results.some(r=>r.body.status===541&&r.body.retryAfterSeconds===300));assert.equal((await run()).body.status,541);assert.equal(calls,1);db.close();
});
test('restart retains per-source pacing and cannot recover budget during active cooldown',async()=>{
 const h=harness();const state=initializeShards(h.data.health,plan,1000000);state.sources['mac-local'].nextRequestAt=1200000;state.sources.cloudflare.nextRequestAt=1250000;
 await h.run();assert.ok(h.calls.filter(r=>r.source==='mac-local').every(r=>r.at>=1200000));assert.ok(h.calls.filter(r=>r.source==='cloudflare').every(r=>r.at>=1250000));
 const cold=harness({until:2000000});const c=initializeShards(cold.data.health,plan,1000000);c.sources.cloudflare.recoverBudgetAt=1;await cold.run();assert.equal(c.sources.cloudflare.requestBudget,2);assert.equal(cold.calls.length,0);
});

test('source freshness excludes historical cells collected by the other source',()=>{
 const data=emptySnapshot(stores,products,1);initializeShards(data.health,plan,1000000);for(const store of Object.values(data.stores))store.cells[0]={...store.cells[0],at:1000000,source:'mac-local'};
 const summary=summarizeShards(data,plan,1000001);assert.equal(summary['mac-local'].freshStores15m,2);assert.equal(summary.cloudflare.freshStores15m,0);
});


test('explicit temporary D1 maintenance uses only Mac at its previous budget and expires to the original assignment',async()=>{
 let time=1000000;const data=emptySnapshot(stores,products,1);data.health.requestBudget=4;
 const state=initializeShards(data.health,plan,time);state.sources.cloudflare.servicePauseReason='d1-quota';state.sources.cloudflare.cooldownUntil=2000000;
 const remoteBefore=structuredClone(state.sources.cloudflare);const active=temporaryMacPlan(plan,data.health,1500000,time);
 assert.equal(active.regions.filter(r=>r.source==='mac-local').length,4);assert.equal(active.macRequestBudgetCap,2);assert.equal(plan.regions.filter(r=>r.source==='cloudflare').length,2);
 // Make the previously remote stores oldest so the temporary round must cover them.
 for(const id of ['A','B'])data.stores[id].cells[0].at=time;
 const calls=[];await collectShardedRound({data,coverage:{},plan:active,stores,products,storage:{record:()=>{}},collectMac:async zip=>{calls.push({zip,at:time});return {status:200,stores:stores.map(s=>({id:s.id,codes:'1'}))}},collectCloudflare:async()=>{throw Error('Cloudflare must not be called')},publish:async()=>{},now:()=>time,sleep:async ms=>{time+=ms}});
 assert.equal(calls.length,2);assert.equal(calls[0].zip,'20001');assert.ok(calls[1].at-calls[0].at>=150000);assert.deepEqual(state.sources.cloudflare,remoteBefore);
 assert.equal(temporaryMacPlan(plan,data.health,1500000,1500000),plan);assert.equal(data.health.temporaryMacCollection,undefined);
});
test('temporary reassignment requires an explicit deadline and D1 pause, and preserves Apple Retry-After and regional waits',()=>{
 const data=emptySnapshot(stores,products,1);data.health.requestBudget=4;const state=initializeShards(data.health,plan,1000000);
 assert.equal(temporaryMacPlan(plan,data.health,1500000,1000000),plan);
 const remote=state.sources.cloudflare;remote.servicePauseReason='d1-quota';remote.serverRetryUntil=1200000;remote.regionCooldowns={'20001':{until:1400000,level:2}};
 assert.equal(temporaryMacPlan(plan,data.health,NaN,1000000),plan);temporaryMacPlan(plan,data.health,1500000,1000000);
 assert.equal(state.sources['mac-local'].regionCooldowns['20001'].until,1400000);assert.equal(state.sources['mac-local'].regionCooldowns['20002'].until,1200000);
 assert.equal(temporaryMacPlan(plan,data.health,1500000,1100000).macRequestBudgetCap,2);
});
