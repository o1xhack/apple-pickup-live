import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {gzipSync} from 'node:zlib';import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';
import {HistoryExport} from '../collector/history-export.mjs';import {PublicHistory} from '../public/history-client.js';import {encodeCells,reconstructCheckpoint,legacyRange,historyEvents} from '../shared/history-files.js';import {emptySnapshot,rangeMetrics} from '../shared/model.js';
const stores=[{id:'A'},{id:'B'}],products=[{part:'p'}],start=Date.parse('2026-10-25T00:00:00Z');
const base=emptySnapshot(stores,products,start);base.stores.A.cells[0]={...base.stores.A.cells[0],code:'1',at:start+1000,checks:4,hits:1,lastHit:start+1000};
const day={schemaVersion:1,day:'2026-10-25',baseline:{},baselineAt:start,records:[[start+1000,'A',encodeCells(base.stores.A.cells)]],points:[{ts:start+1000,checks:4}],events:[{id:'e1',ts:start+1000,store:'A',part:'p',state:'1',source:'national'}]};
const legacy={buckets:[[start-3600000,'A','p',2,1,0,0,start-3599900,[[100,'1'],[200,'0']]]],events:[]};
test('file reconstruction preserves cumulative endpoints and exact legacy boundaries',()=>{
 const snapshot=reconstructCheckpoint(day,start+1500,stores,products,start);assert.equal(rangeMetrics(snapshot,null,['A'],[0]).checks,4);assert.equal(snapshot.stores.B.cells[0].checks,0);
 assert.equal(legacyRange(legacy,start-3599850,start-3599700).rows[0].checks,1);assert.equal(legacyRange(legacy,start-3600000,start-1).rows[0].checks,2);
 assert.equal(historyEvents([...day.events,...day.events],{stores:['B']}).length,0);assert.equal(historyEvents([...day.events,...day.events],{stores:['A'],result:'in_stock'}).length,1);
});
test('many browser store/color/date searches use downloaded files and never database API routes',async()=>{
 const manifest={schemaVersion:1,archives:{},legacy:{path:'/data/history/legacy-a.json.gz'},currentDays:[day]};const calls=[];
 const client=new PublicHistory({stores,products,info:{startedAt:start},getLatest:()=>({...base,publishedAt:start+5000}),now:()=>start+5000,fetchImpl:async url=>{calls.push(url);if(url==='/api/public-history')return new Response(gzipSync(JSON.stringify(manifest)),{headers:{'content-type':'application/gzip'}});if(url==='/data/history/legacy-a.json.gz')return new Response(gzipSync(JSON.stringify(legacy)));throw Error('Unexpected query '+url)}});
 await Promise.all([client.checkpoint(start+1500),client.series(start,start+2000),client.legacy(start-3600000,start),client.history({from:start,to:start+3000,stores:['A']})]);
 for(let i=0;i<100;i++){assert.equal((await client.checkpoint(start+1000+i)).stores.A.cells[0].checks,4);await client.history({from:start,to:start+3000,stores:[i%2?'A':'B']});await client.legacy(start-3600000+i,start)}
 assert.deepEqual(calls.sort(),['/api/public-history','/data/history/legacy-a.json.gz'].sort());
});
test('export index is incremental, immutable output is deterministic, and failed deployment keeps closed dates in current bundle',()=>{
 mkdirSync('state.local',{recursive:true});const folder=mkdtempSync(resolve('state.local/test-history-'));
 try{const source=new DatabaseSync(folder+'/source.sqlite3');source.exec('CREATE TABLE checkpoints(ts INTEGER PRIMARY KEY,payload BLOB);CREATE TABLE events(payload TEXT)');source.prepare('INSERT INTO checkpoints VALUES(?,?)').run(start+1000,gzipSync(JSON.stringify({...base,publishedAt:start+1000})));source.close();
  writeFileSync(folder+'/legacy.json',JSON.stringify({path:'/data/history/legacy-a.json.gz'}));const exporter=new HistoryExport({source:folder+'/source.sqlite3',index:folder+'/index.sqlite3',output:folder,products,startedAt:start});
  const today=exporter.prepare(start+2000);const current=exporter.bundle(today.prepared,today.days,{legacy:today.prepared.legacy},start+2000);assert.equal(current.data.currentDays.length,1);assert.equal(Object.keys(current.data.archives).length,0);
  const first=exporter.prepare(start+86400000+1000);assert.equal(first.state.read,0);const second=exporter.prepare(start+86400000+2000);assert.equal(second.state.read,0);assert.deepEqual(first.prepared.archives,second.prepared.archives);
  const pending=exporter.bundle(first.prepared,first.days,{legacy:first.prepared.legacy},start+86400000+1000);assert.equal(pending.data.currentDays.length,1);assert.equal(Object.keys(pending.data.archives).length,0);
  const deployed=exporter.bundle(first.prepared,first.days,{legacy:first.prepared.legacy,archives:first.prepared.archives},start+86400000+1000);assert.equal(deployed.data.currentDays.length,0);assert.equal(Object.keys(deployed.data.archives).length,1);exporter.close();
 }finally{rmSync(folder,{recursive:true,force:true})}
});
test('default browser fetch is invoked with Window/global receiver rather than the client object',async()=>{
 const original=globalThis.fetch;globalThis.fetch=function(){assert.equal(this,globalThis);return Promise.resolve(Response.json({schemaVersion:1,archives:{},currentDays:[],legacy:{path:'/data/history/legacy-a.json.gz'}}))};
 try{const client=new PublicHistory({stores,products,info:{startedAt:start},getLatest:()=>base});await client.ensure()}finally{globalThis.fetch=original}
});
