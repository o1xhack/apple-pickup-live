import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.LIVE_SITE_ORIGIN;
test('deployed snapshot survives compressed storage and public APIs are read-only',{skip:!base},async()=>{
 const r=await fetch(base+'/api/latest');assert.equal(r.status,200);const s=await r.json();assert.equal(s.version,1);assert.equal(Object.keys(s.stores).length,269);assert.equal(s.products.length,8);assert.ok(s.products.every(p=>p.model==='iPhone Duo'));assert.ok(s.totals.checks>0);assert.ok(s.publishedAt>Date.now()-600000);
 for(const path of ['/api/ingest','/api/collector/check']){const denied=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(denied.status,401)}
 assert.equal((await fetch(base+'/api/history?store=not-a-store')).status,400);
 assert.equal((await fetch(base+'/api/series?from=200&to=100')).status,400);
 const available=await(await fetch(base+'/api/history?result=in_stock&from=1792193860000')).json();assert.ok(available.events.every(e=>e.state==='1'&&s.products.some(p=>p.part===e.part)));assert.equal((await fetch(base+'/api/history?result=bad')).status,400);
 const history=await(await fetch(base+'/api/history?store=R099')).json();assert.ok(Array.isArray(history.events));
 const series=await(await fetch(base+'/api/series')).json();assert.ok(series.points.length>0);
});
