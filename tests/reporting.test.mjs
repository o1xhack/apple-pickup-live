import test from 'node:test';import assert from 'node:assert/strict';
import {REPORTING_START,pacificInput,parsePacificInput,dailyStockObservations} from '../shared/reporting.js';
const start=REPORTING_START,cell=(hits)=>['1',start,10,hits,0,0,0,0,0];
test('reporting starts on Oct 24 Pacific midnight independently of browser timezone and handles DST',()=>{
 assert.equal(pacificInput(start),'2026-10-24T00:00');assert.equal(parsePacificInput('2026-10-24T00:00'),start);
 assert.equal(parsePacificInput('2026-12-01T00:00'),Date.parse('2026-12-01T00:00:00-08:00'));
 assert.equal(Number.isNaN(parsePacificInput('2026-03-08T02:30')),true);assert.equal(Number.isNaN(parsePacificInput('invalid')),true);
});
test('daily bars count repeated stock observations across store and SKU filters, not distinct phones or requests',()=>{
 const days=[{baseline:{A:[cell(5),cell(0)],B:[cell(0),cell(0)]},records:[[start-1,'A',[cell(6),cell(0)]],[start+1000,'A',[cell(8),cell(1)]],[start+2000,'A',[cell(9),cell(1)]],[start+3000,'B',[cell(1),cell(0)]],[start+86400000,'A',[cell(10),cell(1)]]]}];
 const legacy={buckets:[[start,'A','p',2,2,0,0,start,[[500,'1'],[1500,'1']]]]};
 const options={from:start,to:start+2*86400000,storeIds:['A','B'],indices:[0,1],parts:['p','q']};
 assert.deepEqual(dailyStockObservations(days,legacy,options),[{day:'2026-10-24',hits:7},{day:'2026-10-25',hits:1},{day:'2026-10-26',hits:0}]);
 assert.deepEqual(dailyStockObservations(days,legacy,{...options,storeIds:['A'],indices:[1],parts:['q']}).map(x=>x.hits),[1,0,0]);
 assert.deepEqual(dailyStockObservations(days,legacy,{...options,storeIds:[]}).map(x=>x.hits),[0,0,0]);
});
