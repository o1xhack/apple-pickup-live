import test from 'node:test';import assert from 'node:assert/strict';
import {compactVerifiedCoverage,learningProposal,migrateLearningAttempts} from '../shared/coverage-plan.js';
test('coverage compaction removes overlap without losing unique remote stores',()=>{
 const input={one:['a','b'],two:['a'],remote:['c'],duplicate:['a','b']};const plan=compactVerifiedCoverage(input);
 assert.deepEqual(new Set(plan.flatMap(r=>r.ids)),new Set(['a','b','c']));assert.equal(plan.length,2);assert.equal(Object.keys(input).length,4);
});
test('learning uses only eligible non-quarantined candidates and conservatively skips legacy attempts',()=>{
 const proposals=[{zip:'new',ids:['a','b']},{zip:'second',ids:['c']}];const args={proposals,coverage:{},attempted:{},backoff:{stores:new Set(),zips:new Set()},eligible:new Set(['a','c'])};
 assert.deepEqual(learningProposal(args),{zip:'new',ids:['a'],gain:1,targetStore:'a',learning:true});
 assert.equal(learningProposal({...args,attempted:{new:1}}).zip,'second');
 assert.equal(learningProposal({...args,coverage:{new:['b']}}).zip,'second');
 assert.equal(learningProposal({...args,backoff:{stores:new Set(['a','c']),zips:new Set()}}),null);
 assert.equal(learningProposal({...args,eligible:new Set()}),null);
});

test('541 learning proposal gets only one retry after delay and confirmed recovery',()=>{
 const at=1000,now=at+1800000,args={proposals:[{zip:'new',ids:['a']}],coverage:{},attempted:{new:{at,status:541,attempts:1}},backoff:{stores:new Set(),zips:new Set()},eligible:new Set(['a']),now,lastSuccess:at+100};
 assert.equal(learningProposal(args)?.zip,'new');
 assert.equal(learningProposal({...args,now:now-1}),null);
 assert.equal(learningProposal({...args,lastSuccess:at}),null);
 assert.equal(learningProposal({...args,attempted:{new:{at,status:541,attempts:2}}}),null);
 for(const status of [0,200,403,429,500])assert.equal(learningProposal({...args,attempted:{new:{at,status,attempts:1}}}),null);
 assert.equal(learningProposal({...args,coverage:{new:['a']}}),null);
 assert.equal(learningProposal({...args,backoff:{stores:new Set(),zips:new Set(['new'])}}),null);
});
test('legacy learning migration requires an actual recorded 541',()=>{
 const attempted={blocked:1000,unknown:2000,other:3000};
 migrateLearningAttempts(attempted,(zip,at)=>zip==='unknown'?null:{at:at+1,status:zip==='blocked'?541:500});
 assert.deepEqual(attempted,{blocked:{at:1001,status:541,attempts:1},unknown:2000,other:3000});
});
