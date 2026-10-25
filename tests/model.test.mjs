import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySnapshot,parseApple,applyObservation,viewCell,filterStores,rangeMetrics} from '../shared/model.js';
const stores=[{id:'a',name:'Near',state:'California',stateCode:'CA',city:'San Jose',zip:'95125',lat:37.3,lon:-121.9},{id:'b',name:'Far',state:'Florida',stateCode:'FL',city:'Miami',zip:'33180',lat:25.9,lon:-80.1}];
const products=[{part:'one'},{part:'two'}];
const apple=(display='available')=>({head:{status:'200'},body:{stores:[{storeNumber:'a',partsAvailability:{one:{partNumber:'one',pickupDisplay:display}}}]}});
test('Apple parser distinguishes available, unavailable, missing and malformed responses',()=>{
 assert.equal(parseApple(apple(),products)[0].codes,'1U');assert.equal(parseApple(apple('ineligible'),products)[0].codes,'0U');
 assert.throws(()=>parseApple({head:{status:'541'},body:{stores:[]}},products));assert.throws(()=>parseApple({},products));
 const p=apple('default');p.body.stores[0].partsAvailability.one.messageTypes={regular:{storeSearchEnabled:false,storePickupQuote:'Check back later'}};assert.equal(parseApple(p,products)[0].codes,'PU');
});
test('continuous stock is observations, not repeated replenishments; retry is idempotent',()=>{
 const s=emptySnapshot(stores,products,1000);const one=applyObservation(s,{requestId:'1',at:2000,stores:[{id:'a',codes:'10'}]});assert.equal(one[0].kind,'first_or_recovered');
 assert.equal(applyObservation(s,{requestId:'1',at:2000,stores:[{id:'a',codes:'10'}]}).length,0);
 assert.equal(applyObservation(s,{requestId:'2',at:62000,stores:[{id:'a',codes:'10'}]}).length,0);assert.equal(s.stores.a.cells[0].hits,2);assert.equal(s.stores.a.cells[0].intervals,1);
 applyObservation(s,{requestId:'3',at:122000,stores:[{id:'a',codes:'00'}]});assert.equal(applyObservation(s,{requestId:'4',at:182000,stores:[{id:'a',codes:'10'}]})[0].kind,'candidate_restock');
 assert.equal(rangeMetrics(s,null,['a'],[0]).checks,4);
});
test('failure never means out of stock; old success becomes stale; recovery is not a restock',()=>{
 const s=emptySnapshot(stores,products,1000);applyObservation(s,{requestId:'1',at:2000,stores:[{id:'a',codes:'10'}]});
 applyObservation(s,{requestId:'2',at:650000,httpStatus:541,error:'Limited'});assert.equal(s.stores.a.cells[0].code,'1');assert.equal(s.totals.errors,1);assert.equal(viewCell(s.stores.a.cells[0],650000),'stale');
 assert.equal(applyObservation(s,{requestId:'3',at:700000,stores:[{id:'a',codes:'10'}]})[0].kind,'first_or_recovered');assert.equal(viewCell(s.stores.b.cells[0],700000),'unscanned');
});
test('ZIP search only filters stored geography and sorts by distance',()=>{
 const z={'95125':[37.3,-121.9,'San Jose','CA']};const nearby=filterStores(stores,{zip:'95125',radius:100},z);assert.equal(nearby.length,1);assert.equal(nearby[0].id,'a');assert.equal(nearby[0].distance,0);assert.throws(()=>filterStores(stores,{zip:'99999'},z));
});
