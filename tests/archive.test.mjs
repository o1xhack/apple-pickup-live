import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {legacyStatistics} from '../src/legacy.js';
import {combineMetrics,combineStoreRows} from '../shared/archive.js';

test('archive ranges preserve exact boundary samples and independent source totals',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE legacy_hourly(source TEXT,bucket INTEGER,store TEXT,part TEXT,checks INTEGER,hits INTEGER,unknown INTEGER,pending INTEGER,last_hit INTEGER,samples TEXT)`);
 db.prepare('INSERT INTO legacy_hourly VALUES(?,?,?,?,?,?,?,?,?,?)').run('legacy_ca',3600000,'R1','P1',4,1,1,1,3600200,JSON.stringify([[100,'0'],[200,'1'],[300,'U'],[400,'P']]));
 const env={DB:{prepare(sql){return {bind(...params){return {sql,params}}}},async batch(statements){return statements.map(s=>({results:db.prepare(s.sql).all(...s.params)}))}}};
 const query=(from,to)=>legacyStatistics(env,new URL(`https://test/api?from=${from}&to=${to}`),[{id:'R1'}],[{part:'P1'}]);
 assert.deepEqual((await query(3600150,3600350)).rows.map(r=>({...r})),[{store:'R1',part:'P1',checks:2,hits:1,unknown:1,pending:0,lastHit:3600200}]);
 const rows=(await query(3600000,7199999)).rows;
 assert.deepEqual(combineMetrics({checks:8,hits:2},rows,'all'),{checks:12,hits:3,unknown:1,pending:1});
 assert.equal(combineMetrics({checks:8},rows,'national').checks,8);
 assert.equal(combineMetrics({checks:8},rows,'legacy_ca').checks,4);
 assert.equal(combineStoreRows([{store:{id:'R1'},checks:8,hits:2,lastHit:123}],rows,'legacy_ca')[0].checks,4);
 await assert.rejects(()=>query(0,367*86400000),/Invalid historical date/);db.close();
});
