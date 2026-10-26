import test from 'node:test';import assert from 'node:assert/strict';
import {publishLive,readLive} from '../src/live-cache.js';import {isD1QuotaError,nextQuotaReset} from '../shared/service-quota.js';
import {CollectionStorage} from '../collector/storage.mjs';import {emptySnapshot,applyObservation} from '../shared/model.js';
function kv(){let writes=0,value=null;return {env:{LIVE_CACHE:{get:async()=>value?JSON.parse(value):null,put:async(k,v)=>{writes++;value=v}}},writes:()=>writes}}
test('live-only cache requires no D1 and caps publications at one every five minutes',async()=>{
 const k=kv();let at=1000000;assert.equal(await readLive(k.env),null);
 const snapshot={version:1,publishedAt:at,stores:{A:{cells:[{at,code:'1'}]}}};assert.equal((await publishLive(k.env,snapshot,at)).stored,true);
 for(let i=1;i<300;i++)assert.equal((await publishLive(k.env,{...snapshot,publishedAt:at+i*1000},at+i*1000)).stored,false);
 assert.equal(k.writes(),1);assert.equal((await readLive(k.env)).stores.A.cells[0].at,at);
 at+=300000;await publishLive(k.env,{...snapshot,publishedAt:at},at);assert.equal(k.writes(),2);
});
test('stale/regressed publications cannot replace current stock; KV failure does not claim success',async()=>{
 const k=kv(),s={version:1,publishedAt:1000000};await publishLive(k.env,s,1000000);assert.equal((await publishLive(k.env,{...s,publishedAt:999999},1000100)).stored,false);
 await assert.rejects(()=>publishLive({LIVE_CACHE:{get:async()=>null,put:async()=>{throw Error('quota')}}},s,1000000),/quota/);
});
test('quota classification and UTC resume do not confuse Apple blocks with D1 failures',()=>{
 assert.ok(isD1QuotaError(Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.")));assert.equal(isD1QuotaError(Error('Apple HTTP 541')),false);
 assert.equal(nextQuotaReset(Date.parse('2026-10-26T15:00:00Z')),Date.parse('2026-10-27T00:00:00Z'));
});
test('full local samples survive cloud quota failure and backlog is acknowledged only after history sync',()=>{
 const store=new CollectionStorage(':memory:'),data=emptySnapshot([{id:'A'}],[{part:'p'}],1);
 for(let i=1;i<=3;i++){const at=i*1000,events=applyObservation(data,{requestId:String(i),at,stores:[{id:'A',codes:'1'}]});store.record(data,{}, {id:String(i),at,zip:'10001',status:200},events)}
 const queued=store.pendingCheckpoints();assert.equal(queued.length,2);assert.equal(queued[0].snapshot.stores.A.cells[0].checks,1);assert.equal(queued[1].snapshot.stores.A.cells[0].checks,2);
 assert.equal(store.pending().length,1);assert.equal(store.pendingCheckpoints(10).length,3);
 data.publishedAt=3500;store.acknowledge(store.pending(),data,queued);assert.equal(store.pending().length,0);assert.equal(store.pendingCheckpoints(10).length,1);assert.equal(store.pendingCheckpoints(10)[0].ts,3000);store.close();
});
