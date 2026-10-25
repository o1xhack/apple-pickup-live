import test from 'node:test';import assert from 'node:assert/strict';
import {collectLocal} from '../collector/apple.mjs';import {liveMetrics} from '../shared/live-metrics.js';import {emptySnapshot,applyObservation} from '../shared/model.js';
test('Mac collector calls Apple directly, batches products and preserves failures without retry',async()=>{
 const products=[{part:'p1'},{part:'p2'}];let calls=0;
 const out=await collectLocal('95014',products,[{id:'R1'}],{fetchImpl:async(url)=>{calls++;assert.equal(new URL(url).hostname,'www.apple.com');assert.equal(new URL(url).searchParams.get('parts.1'),'p2');return Response.json({body:{stores:[{storeNumber:'R1',partsAvailability:{p1:{pickupDisplay:'available'},p2:{pickupDisplay:'unavailable'}}}]}})}});
 assert.equal(out.status,200);assert.equal(calls,1);assert.equal(out.stores[0].codes,'10');
 const failed=await collectLocal('95014',products,[],{fetchImpl:async()=>new Response('blocked',{status:541,headers:{'retry-after':'300'}})});assert.equal(failed.status,541);assert.equal(failed.retryAfterSeconds,300);assert.equal(failed.stores.length,0);
});
test('live totals count repeat in-stock store/configuration observations, and freshness is exactly five minutes',()=>{
 const stores=[{id:'A'},{id:'B'}],products=[{part:'p1'},{part:'p2'}],s=emptySnapshot(stores,products,1);
 applyObservation(s,{requestId:'1',at:1000,stores:[{id:'A',codes:'11'}]});
 applyObservation(s,{requestId:'2',at:301000,stores:[{id:'A',codes:'11'}]});
 let m=liveMetrics(s,stores,[0,1],301000);assert.equal(m.hits,4);assert.equal(m.checks,4);assert.equal(m.stockConfigurations,2);assert.equal(m.stockStores,1);assert.equal(m.everStockStores,1);assert.equal(m.awaitingFreshStores,1);
 assert.equal(liveMetrics(s,stores,[0,1],601000).freshStores,1);m=liveMetrics(s,stores,[0,1],601001);assert.equal(m.freshStores,0);assert.equal(m.hits,4);assert.equal(m.stockStores,0);
});
