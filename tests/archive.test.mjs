import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {legacyStatistics} from '../src/legacy.js';
import {combineMetrics,combineStoreRows} from '../shared/archive.js';

test('archive ranges preserve exact boundary samples and independent source totals',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE legacy_hourly(source TEXT,bucket INTEGER,store TEXT,part TEXT,checks INTEGER,hits INTEGER,unknown INTEGER,pending INTEGER,last_hit INTEGER,samples TEXT)`);
 db.prepare('INSERT INTO legacy_hourly VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy_ca',3600000,'R1','P1',4,1,1,1,3600200,JSON.stringify([[100,'0'],[200,'1'],[300,'U'],[400,'P']]));
 const env={DB:{prepare(sql){return {async first(){return db.prepare(sql).get()},bind(...params){return {sql,params}}}},async batch(statements){return statements.map(s=>({results:db.prepare(s.sql).all(...s.params)}))}}};
 const query=(from,to)=>legacyStatistics(env,new URL(`https://test/api?from=${from}&to=${to}`),[{id:'R1'}],[{part:'P1'}]);
 assert.deepEqual((await query(3600150,3600350)).rows.map(r=>({...r})),[{store:'R1',part:'P1',checks:2,hits:1,unknown:1,pending:0,lastHit:3600200}]);
 const rows=(await query(3600000,7199999)).rows;
 assert.deepEqual(combineMetrics({checks:8,hits:2},rows,'all'),{checks:12,hits:3,unknown:1,pending:1});
 assert.equal(combineMetrics({checks:8},rows,'national').checks,8);
 assert.equal(combineMetrics({checks:8},rows,'legacy_ca').checks,4);
 assert.equal(combineStoreRows([{store:{id:'R1'},checks:8,hits:2,lastHit:123}],rows,'legacy_ca')[0].checks,4);
 await assert.rejects(()=>query(0,367*86400000),/Invalid historical date/);db.close();
});

test('moving present-day end dates share one bounded archive computation without changing exact filters',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE legacy_hourly(source TEXT,bucket INTEGER,store TEXT,part TEXT,checks INTEGER,hits INTEGER,unknown INTEGER,pending INTEGER,last_hit INTEGER,samples TEXT)`);
 db.prepare('INSERT INTO metadata VALUES(?,?)').run('legacy_ca',JSON.stringify({startedAt:3600100,endedAt:3600400,checks:4}));
 db.prepare('INSERT INTO legacy_hourly VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy_ca',3600000,'R1','P1',4,1,1,1,3600200,JSON.stringify([[100,'0'],[200,'1'],[300,'U'],[400,'P']]));
 let batches=0,statements=0,metadataReads=0;const env={DB:{prepare(sql){return {async first(){metadataReads++;return db.prepare(sql).get()},bind(...params){return {sql,params}}}},async batch(items){batches++;statements+=items.length;return items.map(s=>({results:db.prepare(s.sql).all(...s.params)}))}}};
 const query=(from,to,filters='')=>legacyStatistics(env,new URL(`https://test/api?from=${from}&to=${to}${filters}`),[{id:'R1'},{id:'R2'}],[{part:'P1'}]);
 const results=await Promise.all([query(0,7200000),query(0,8200000),query(0,9200000)]);assert.equal(batches,1);assert.equal(statements,1);assert.equal(results[0].rows[0].checks,4);assert.deepEqual(results[0],results[2]);
 assert.equal((await query(3600150,3600350)).rows[0].checks,2);assert.equal(batches,2);
 assert.deepEqual((await query(0,7200000,'&stores=R2')).rows,[]);assert.equal(batches,3);
 assert.deepEqual((await query(4000000,7200000)).rows,[]);assert.equal(batches,3);assert.ok(metadataReads<=3);
 db.close();
});

test('archive cache does not retain failed database work',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT)`);let batches=0;
 const env={DB:{prepare(sql){return {async first(){return db.prepare(sql).get()},bind(...params){return {sql,params}}}},async batch(){batches++;throw Error('database temporarily unavailable')}}};
 const query=()=>legacyStatistics(env,new URL('https://test/api?from=1&to=1000'),[],[]);
 await assert.rejects(query(),/temporarily unavailable/);await assert.rejects(query(),/temporarily unavailable/);assert.equal(batches,2);db.close();
});
