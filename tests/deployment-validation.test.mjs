import test from 'node:test';import assert from 'node:assert/strict';
import {queueValidation,validateRound,nextCollectionDelay} from '../shared/deployment-validation.js';
test('deployment queues once, preserves cooldown, and records actual scheduled coverage',()=>{
 const health={cooldownUntil:10000};queueValidation(health,'v2',5000);assert.equal(health.deploymentValidation.notBefore,10000);
 assert.equal(validateRound(health,{attempts:0,covered:0,errors:0},6000),false);assert.equal(health.deploymentValidation.status,'queued');
 assert.equal(nextCollectionDelay(health,300000,0,5000),5000);assert.equal(health.cooldownUntil,10000);
 validateRound(health,{attempts:2,covered:12,errors:1,firstResult:{httpStatus:541,stores:0}},20000);
 assert.equal(health.deploymentValidation.status,'degraded');assert.equal(health.deploymentValidation.coveredStores,12);
 queueValidation(health,'v2',30000);assert.equal(health.deploymentValidation.status,'degraded');queueValidation(health,'v3',30000);assert.equal(health.deploymentValidation.status,'queued');
});
test('ordinary cadence never bursts after deployment or cooldown',()=>{
 assert.equal(nextCollectionDelay({},300000,20000,5000),280000);
 assert.equal(nextCollectionDelay({cooldownUntil:500000},300000,20000,5000),280000);
 assert.equal(nextCollectionDelay({cooldownUntil:4000},300000,400000,5000),1000);
 const h={};queueValidation(h,'v1',1);validateRound(h,{attempts:1,covered:6,errors:0,firstResult:{httpStatus:200,stores:6}},5);assert.equal(h.deploymentValidation.status,'passed');
});
