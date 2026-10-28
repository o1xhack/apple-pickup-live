import test from 'node:test';import assert from 'node:assert/strict';
import {launchNodePath} from '../scripts/node-runtime.mjs';
test('launchd follows stable Homebrew Node symlinks across keg upgrades',()=>{
 for(const [old,current,stable] of [
  ['/opt/homebrew/Cellar/node/26.9.0/bin/node','/opt/homebrew/Cellar/node/26.12.1_1/bin/node','/opt/homebrew/bin/node'],
  ['/usr/local/Cellar/node/26.9.0/bin/node','/usr/local/Cellar/node/26.12.1/bin/node','/usr/local/bin/node'],
  ['/opt/homebrew/Cellar/node@22/22.1.0/bin/node','/opt/homebrew/Cellar/node@22/22.2.0/bin/node','/opt/homebrew/opt/node@22/bin/node'],
 ]){
  let target=old;const io={exists:p=>p===stable,realpath:p=>p===stable?target:p};
  const installed=launchNodePath(old,io);assert.equal(installed,stable);
  target=current;assert.equal(io.realpath(installed),current);
  assert.equal(launchNodePath(current,io),installed);
 }
});
test('missing or unrelated Homebrew symlinks fail before writing a broken service',()=>{
 const exe='/opt/homebrew/Cellar/node/26.12.1/bin/node';
 assert.throws(()=>launchNodePath(exe,{exists:()=>false}),/Stable Node/);
 assert.throws(()=>launchNodePath(exe,{exists:()=>true,realpath:p=>p}),/Stable Node/);
 assert.equal(launchNodePath('/usr/bin/node'),'/usr/bin/node');
});
