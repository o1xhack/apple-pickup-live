import test from 'node:test';import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';import {publishPublicHistory,readPublicHistory} from '../src/public-history.js';
test('one bounded history file publication survives requests without any database and is throttled',async()=>{
 let value=null,metadata=null,writes=0;const env={LIVE_CACHE:{getWithMetadata:async()=>({value,metadata}),put:async(key,bytes,options)=>{value=bytes;metadata=options.metadata;writes++}}};
 const at=1000000,body=gzipSync(JSON.stringify({schemaVersion:1,currentDays:[],archives:{}}));const request=time=>new Request('https://test',{method:'POST',headers:{'x-history-published-at':String(time)},body});
 assert.equal((await publishPublicHistory(env,request(at),at)).stored,true);assert.equal((await publishPublicHistory(env,request(at+1000),at+1000)).stored,false);assert.equal(writes,1);assert.ok((await readPublicHistory(env)).value.byteLength>20);
 await assert.rejects(()=>publishPublicHistory({LIVE_CACHE:{getWithMetadata:async()=>({value:null,metadata:null}),put:async()=>{throw Error('must not write')}}},new Request('https://test',{method:'POST',headers:{'x-history-published-at':String(at)},body:'x'.repeat(30)}),at),/Invalid history publication size/);
});
