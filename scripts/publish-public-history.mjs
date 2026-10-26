import {HistoryExport} from '../collector/history-export.mjs';
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,cpSync,rmSync,openSync,closeSync,unlinkSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),folder=resolve(root,'state.local/public-history');
const volume=String(execFileSync('/usr/sbin/diskutil',['info','-plist','/Volumes/StudioSSD']));if(!volume.includes('9D5FE511-B66C-4765-BB8F-61E5ACB3969D')||!realpathSync(root).startsWith('/Volumes/StudioSSD/'))throw Error('StudioSSD validation failed');
mkdirSync(folder,{recursive:true});const lock=folder+'/publisher.lock';let fd;
try{fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid))}catch{try{process.kill(Number(readFileSync(lock,'utf8')),0);process.exit(0)}catch{unlinkSync(lock);fd=openSync(lock,'wx');writeFileSync(fd,String(process.pid))}}
process.on('exit',()=>{try{closeSync(fd);unlinkSync(lock)}catch{}});
const read=(name,fallback={})=>existsSync(folder+'/'+name)?JSON.parse(readFileSync(folder+'/'+name)):fallback;
const save=(name,value)=>{writeFileSync(folder+'/'+name+'.next',JSON.stringify(value));requireRename(folder+'/'+name+'.next',folder+'/'+name)};
import {renameSync as requireRename} from 'node:fs';
if(!existsSync(folder+'/legacy.json'))execFileSync('/opt/homebrew/bin/python3',[root+'/scripts/build-public-legacy.py','--output',folder],{stdio:'inherit'});
const info=JSON.parse(readFileSync(root+'/data/site-info.json')),products=JSON.parse(readFileSync(root+'/data/products.json'));
const exporter=new HistoryExport({source:root+'/state.local/collection.sqlite3',index:folder+'/index.sqlite3',output:folder,products,startedAt:info.startedAt});
try{
 const {prepared,days,state}=exporter.prepare();if(process.argv.includes('--prepare')){console.log(JSON.stringify({prepared:true,archives:Object.keys(prepared.archives).length,bytes:prepared.legacy.bytes,indexed:state}));process.exit(0)}
 let deployed=read('deployed.json');
 if(process.argv.includes('--adopt-deployed')){
  for(const path of [prepared.legacy.path,...Object.values(prepared.archives)]){const r=await fetch('https://pickup.o1xhack.com'+path);if(!r.ok)throw Error('Archive asset is not deployed');const actual=createHash('sha256').update(new Uint8Array(await r.arrayBuffer())).digest('hex').slice(0,16);if(!path.includes(actual))throw Error('Deployed archive hash mismatch')}
  deployed={archives:prepared.archives,legacy:prepared.legacy,deployedDay:new Date().toISOString().slice(0,10)};save('deployed.json',deployed);
 }
 const today=new Date().toISOString().slice(0,10),needsDeploy=JSON.stringify(prepared.archives)!==JSON.stringify(deployed.archives)||prepared.legacy.path!==deployed.legacy?.path;
 const deployBudget=read('deploy-attempts.json',{day:today,attempts:0});if(deployBudget.day!==today){deployBudget.day=today;deployBudget.attempts=0}
 if(needsDeploy&&deployed.deployedDay!==today&&deployBudget.attempts<2){
  const shell=root+'/state.local/released-site',stage=folder+'/site-staging';if(!existsSync(shell+'/index.html'))throw Error('Released website shell missing; deploy the website once first');
  rmSync(stage,{recursive:true,force:true});cpSync(shell,stage,{recursive:true});mkdirSync(stage+'/data/history',{recursive:true});cpSync(folder+'/assets',stage+'/data/history',{recursive:true});
  deployBudget.attempts++;save('deploy-attempts.json',deployBudget);
  let succeeded=false;try{execFileSync(process.execPath,[root+'/node_modules/wrangler/bin/wrangler.js','pages','deploy',stage,'--project-name','apple-pickup-live','--branch','main','--commit-dirty=true'],{cwd:root,stdio:'pipe',timeout:120000});
   succeeded=true;for(const [date,path] of Object.entries(prepared.archives)){if(deployed.archives?.[date]===path)continue;const check=await fetch('https://pickup.o1xhack.com'+path,{method:'HEAD'});if(!check.ok){succeeded=false;break}}
  }catch{}
  if(succeeded){deployed={archives:prepared.archives,legacy:prepared.legacy,deployedDay:today};save('deployed.json',deployed)}else console.error('Daily archive deployment not confirmed; unfinalized dates remain in the current history file');
 }

 const previous=read('publisher.json');const delay=(previous.nextAt||0)-Date.now();if(delay>5000){console.log(JSON.stringify({waitingUntil:previous.nextAt}));process.exit(0)}if(delay>0)await new Promise(r=>setTimeout(r,delay+100));
 const {bytes,data}=exporter.bundle(prepared,days,deployed);const config=Object.fromEntries(readFileSync(root+'/.env.local','utf8').split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return [s.slice(0,i),s.slice(i+1)]}));
 const response=await fetch(config.PUBLISH_URL+'/api/public-history/publish',{method:'POST',headers:{authorization:'Bearer '+config.INGEST_TOKEN,'content-type':'application/gzip','x-history-published-at':String(data.publishedAt)},body:bytes,signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('History publication HTTP '+response.status);const result=await response.json();save('publisher.json',{nextAt:result.nextAt});
 if(result.stored){const receipt={uptoCheckpoint:state.cursor,publishedAt:data.publishedAt,hash:createHash('sha256').update(bytes).digest('hex')};save('receipt.json',receipt)}
 console.log(JSON.stringify({stored:result.stored,bytes:bytes.length,records:Object.values(days).reduce((n,d)=>n+(d?.records.length||0),0),archives:Object.keys(data.archives).length,currentDays:data.currentDays.length}));
}finally{exporter.close()}
