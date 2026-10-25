import test from 'node:test';import assert from 'node:assert/strict';
const base=process.env.PUBLIC_SITE_ORIGIN;
test('custom-domain static site exposes cached reads and rejects write methods',{skip:!base},async()=>{
 const page=await fetch(base);assert.equal(page.status,200);assert.ok((await page.text()).includes('APP_API_ORIGIN'));
 const info=await(await fetch(base+'/api/info')).json();assert.equal(info.stores,269);
 const snapshot=await(await fetch(base+'/api/latest')).json();assert.equal(Object.keys(snapshot.stores).length,269);assert.equal(snapshot.health.intervalSeconds,180);
 assert.equal((await fetch(base+'/api/history?store=not-a-store')).status,400);
 assert.equal((await fetch(base+'/api/ingest',{method:'POST',body:'{}'})).status,405);
});
