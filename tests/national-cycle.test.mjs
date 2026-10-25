import test from 'node:test';import assert from 'node:assert/strict';
import {verifiedCyclePlan,activateFiveMinuteTarget,nationalSchedule,nextVerifiedRegion,coverageRound} from '../shared/national-cycle.js';
test('full-country target replaces inherited throttle only once, never during cooldown or again after a block',()=>{
 const plan={complete:true,regions:Array.from({length:36},(_,i)=>({zip:String(i),ids:[String(i)]}))};const h={requestBudget:11,cooldownUntil:200};assert.equal(activateFiveMinuteTarget(h,plan,100),false);assert.equal(h.requestBudget,11);
 assert.equal(activateFiveMinuteTarget(h,plan,201),true);assert.equal(h.requestBudget,36);assert.equal(nationalSchedule(h,plan).spacingMs,7777);
 h.requestBudget=18;assert.equal(activateFiveMinuteTarget(h,plan,300),false);assert.equal(h.requestBudget,18);assert.equal(nationalSchedule(h,plan).spacingMs,16667);
 assert.equal(activateFiveMinuteTarget({}, {...plan,complete:false},300),false);
});
test('fixed tour covers every verified store once per window instead of spending its slots on learning',()=>{
 const stores=['A','B','C'].map(id=>({id})),snapshot={stores:{A:{cells:[{at:10}]},B:{cells:[{at:20}]},C:{cells:[{at:1}]}}};
 const plan=verifiedCyclePlan({one:['A','B'],two:['C'],redundant:['A']},stores,snapshot);assert.equal(plan.complete,true);assert.equal(plan.regions.length,2);const checked=new Set(),tried=new Set(),backoff={stores:new Set(),zips:new Set()};
 let next=nextVerifiedRegion(plan,{checked,tried,backoff});assert.equal(next.zip,'two');next.ids.forEach(id=>checked.add(id));tried.add(next.zip);next=nextVerifiedRegion(plan,{checked,tried,backoff});next.ids.forEach(id=>checked.add(id));assert.equal(checked.size,3);
 const summary=coverageRound({startedAt:1,completedAt:280001,stores,checked,attempts:2,errors:0,plannedRequests:2});assert.equal(summary.status,'complete');assert.deepEqual(summary.missingStores,[]);
 assert.equal(coverageRound({...summary,startedAt:1,completedAt:300002,stores,checked,attempts:2}).status,'partial');
});
test('resting regions and missing response membership cannot be certified as full coverage',()=>{
 const stores=[{id:'A'},{id:'B'}],plan=verifiedCyclePlan({one:['A'],two:['B']},stores,{stores:{}}),backoff={stores:new Set(),zips:new Set(['two'])};const checked=new Set(['A']),tried=new Set(['one']);assert.equal(nextVerifiedRegion(plan,{checked,tried,backoff}),null);
 const summary=coverageRound({startedAt:1,completedAt:2000,stores,checked,attempts:1,errors:1,plannedRequests:2});assert.equal(summary.status,'partial');assert.deepEqual(summary.missingStores,['B']);
});

test('recorded US regional membership covers all 269 stores within the five-minute request window',async()=>{
 const {readFileSync}=await import('node:fs');const stores=JSON.parse(readFileSync(new URL('../data/us-stores.json',import.meta.url))),fixture=JSON.parse(readFileSync(new URL('./fixtures/observed-region-membership.json',import.meta.url)));
 const plan=verifiedCyclePlan(fixture.coverage,stores,{stores:{}}),health={requestBudget:11},checked=new Set(),tried=new Set(),backoff={stores:new Set(),zips:new Set()};assert.equal(plan.covered,269);assert.equal(plan.regions.length,34);activateFiveMinuteTarget(health,plan,1000);const schedule=nationalSchedule(health,plan);let attempts=0;
 while(true){const region=nextVerifiedRegion(plan,{checked,tried,backoff});if(!region)break;tried.add(region.zip);region.ids.forEach(id=>checked.add(id));attempts++;}
 const summary=coverageRound({startedAt:1000,completedAt:1000+(attempts-1)*schedule.spacingMs+1700,stores,checked,attempts,errors:0,plannedRequests:plan.regions.length});assert.equal(summary.coveredStores,269);assert.equal(summary.status,'complete');assert.ok(summary.elapsedMs<300000);
});
