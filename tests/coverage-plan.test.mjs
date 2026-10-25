import test from 'node:test';import assert from 'node:assert/strict';
import {compactVerifiedCoverage,learningProposal} from '../shared/coverage-plan.js';
test('coverage compaction removes overlap without losing unique remote stores',()=>{
 const input={one:['a','b'],two:['a'],remote:['c'],duplicate:['a','b']};const plan=compactVerifiedCoverage(input);
 assert.deepEqual(new Set(plan.flatMap(r=>r.ids)),new Set(['a','b','c']));assert.equal(plan.length,2);assert.equal(Object.keys(input).length,4);
});
test('learning uses only eligible non-quarantined candidates and never retries a failed proposal',()=>{
 const proposals=[{zip:'new',ids:['a','b']},{zip:'second',ids:['c']}];const args={proposals,coverage:{},attempted:{},backoff:{stores:new Set(),zips:new Set()},eligible:new Set(['a','c'])};
 assert.deepEqual(learningProposal(args),{zip:'new',ids:['a'],gain:1,targetStore:'a',learning:true});
 assert.equal(learningProposal({...args,attempted:{new:1}}).zip,'second');
 assert.equal(learningProposal({...args,coverage:{new:['b']}}).zip,'second');
 assert.equal(learningProposal({...args,backoff:{stores:new Set(['a','c']),zips:new Set()}}),null);
 assert.equal(learningProposal({...args,eligible:new Set()}),null);
});
