import test from 'node:test';
import assert from 'node:assert/strict';
const base=process.env.LIVE_SITE_ORIGIN;
test('deployed snapshot survives compressed storage and public APIs are read-only',{skip:!base},async()=>{
 const r=await fetch(base+'/api/latest');assert.equal(r.status,200);const s=await r.json();assert.equal(s.version,1);assert.equal(Object.keys(s.stores).length,269);assert.equal(s.products.length,8);assert.ok(s.products.every(p=>p.model==='iPhone Duo'));assert.ok(s.totals.checks>0);assert.ok(s.publishedAt>Date.now()-600000);
 for(const path of ['/api/ingest','/api/collector/check','/api/live/publish']){const denied=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(denied.status,401)}
 for(const path of ['/api/history?store=not-a-store','/api/series?from=200&to=100','/api/legacy/statistics','/api/checkpoint']){const old=await fetch(base+path);assert.equal(old.status,410);assert.equal((await old.json()).code,'client_history')}
 const archive=await fetch(base+'/api/public-history');assert.equal(archive.status,200);assert.ok(archive.headers.get('content-type').includes('gzip'));await archive.arrayBuffer();
});
