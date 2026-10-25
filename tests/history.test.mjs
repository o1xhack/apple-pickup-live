import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {stockHistory} from '../src/history.js';
test('in-stock history is filtered before pagination and excludes unrelated models',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE stock_events(ts INTEGER,store TEXT,part TEXT,state TEXT,kind TEXT,source TEXT)');const insert=db.prepare('INSERT INTO stock_events VALUES(?,?,?,?,?,?)');
 for(let i=1;i<=250;i++)insert.run(10000+i,'A','Duo','0','state_change','national');
 for(let i=1;i<=3;i++)insert.run(1000+i,'A','Duo','1','candidate_restock','legacy_ca');insert.run(11000,'A','ProMax','1','candidate_restock','legacy_ca');
 const env={DB:{prepare(sql){return {bind(...args){return {async all(){return {results:db.prepare(sql).all(...args)}}}}}}}};
 const query=s=>stockHistory(env,new URL('https://test/api/history?from=1&to=20000'+s),[{id:'A'}],[{part:'Duo'}]);
 const available=await query('&result=in_stock');assert.equal(available.events.length,3);assert.ok(available.events.every(e=>e.state==='1'&&e.part==='Duo'));
 assert.equal((await query('')).events.length,200);await assert.rejects(()=>query('&result=bad'),/Invalid result/);await assert.rejects(()=>query('&part=ProMax'),/Unknown/);db.close();
});
