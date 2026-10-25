import test from 'node:test';import assert from 'node:assert/strict';
import {emptySnapshot,applyObservation} from '../shared/model.js';import {initializeDailyCounters,dayKey} from '../shared/daily.js';import {liveMetrics} from '../shared/live-metrics.js';import {metricNumber} from '../shared/number-format.js';
test('today uses Pacific midnight, survives snapshot reload and counts repeated hits only once per observation',()=>{
 const before=Date.parse('2026-10-26T06:59:59Z'),midnight=Date.parse('2026-10-26T07:00:00Z');assert.equal(dayKey(before),'2026-10-25');assert.equal(dayKey(midnight),'2026-10-26');assert.equal(dayKey(Date.parse('2026-11-02T08:00:00Z')),'2026-11-02');
 const stores=[{id:'A'},{id:'B'}],products=[{part:'p'}],s=emptySnapshot(stores,products,before-60000);
 applyObservation(s,{requestId:'yesterday',at:before,stores:[{id:'A',codes:'1'},{id:'B',codes:'0'}]});
 let m=liveMetrics(s,stores,[0],midnight);assert.equal(m.checkedToday,0);assert.equal(m.todayHits,0);assert.equal(m.todayChecks,0);assert.equal(m.stockStores,1);
 applyObservation(s,{requestId:'today',at:midnight,stores:[{id:'A',codes:'1'}]});applyObservation(s,{requestId:'today',at:midnight,stores:[{id:'A',codes:'1'}]});
 const restored=JSON.parse(JSON.stringify(s));applyObservation(restored,{requestId:'repeat',at:midnight+300000,stores:[{id:'A',codes:'1'}]});
 m=liveMetrics(restored,stores,[0],midnight+300000);assert.equal(m.todayChecks,2);assert.equal(m.todayHits,2);assert.equal(m.hits,3);assert.equal(m.checkedToday,1);
 applyObservation(restored,{requestId:'blocked',at:midnight+400000,httpStatus:541,error:'blocked'});assert.equal(liveMetrics(restored,stores,[0],midnight+400000).todayChecks,2);
});
test('launch-day daily baseline preserves existing real cumulative counts',()=>{
 const at=Date.parse('2026-10-25T20:00:00Z'),s=emptySnapshot([{id:'A'}],[{part:'p'}],at-3600000);Object.assign(s.stores.A.cells[0],{at,checks:100,hits:10,code:'1'});initializeDailyCounters(s);initializeDailyCounters(s);
 assert.equal(liveMetrics(s,[{id:'A'}],[0],at).todayChecks,100);assert.equal(liveMetrics(s,[{id:'A'}],[0],at).todayHits,10);
 applyObservation(s,{requestId:'new',at:at+1,stores:[{id:'A',codes:'1'}]});assert.equal(s.stores.A.cells[0].dailyChecks,101);
});
test('stock and recent-check coverage use the exact fifteen-minute boundary',()=>{
 const at=Date.parse('2026-10-25T20:00:00Z'),stores=[{id:'A'}],s=emptySnapshot(stores,[{part:'p'}],at);applyObservation(s,{requestId:'one',at,stores:[{id:'A',codes:'1'}]});
 assert.equal(liveMetrics(s,stores,[0],at+900000).stockStores,1);assert.equal(liveMetrics(s,stores,[0],at+900001).stockStores,0);assert.equal(liveMetrics(s,stores,[0],at+900001).freshStores,0);assert.equal(liveMetrics(s,stores,[0],at+900001).checkedToday,1);
});
test('million-scale cards use M and K while values below one million remain exact',()=>{
 assert.equal(metricNumber(33296),'33,296');assert.equal(metricNumber(999999),'999,999');assert.equal(metricNumber(1000000),'1M');assert.equal(metricNumber(1234567),'1M 234K');assert.equal(metricNumber(1001000),'1M 1K');assert.equal(metricNumber(2999999),'2M 999K');
});
