import {DatabaseSync} from 'node:sqlite';import {gunzipSync,gzipSync} from 'node:zlib';import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';
import {encodeCells,utcDay} from '../shared/history-files.js';
export class HistoryExport{
 constructor({source,index,output,products,startedAt}){
  Object.assign(this,{output,products,startedAt});mkdirSync(output+'/assets',{recursive:true});this.allowed=new Set(products.map(p=>p.part));
  this.source=new DatabaseSync(source,{readOnly:true});this.db=new DatabaseSync(index);this.db.exec(`PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS samples(at INTEGER,store TEXT,cells TEXT,quality INTEGER,PRIMARY KEY(at,store));CREATE INDEX IF NOT EXISTS samples_store_at ON samples(store,at);CREATE TABLE IF NOT EXISTS points(ts INTEGER PRIMARY KEY,payload TEXT);CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,ts INTEGER,payload TEXT);CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,value TEXT);`);
 }
 ingest(){
  const cursor=Number(this.db.prepare("SELECT value FROM state WHERE key='cursor'").get()?.value)||0;let last=cursor,read=0;const changedDates=new Set();const seenEvents=new Set(this.db.prepare('SELECT id FROM events').all().map(e=>e.id));
  const addEvent=e=>{const part=e.part;if(!this.allowed.has(part)||!e.store||!Number.isSafeInteger(e.at??e.ts)||seenEvents.has(e.id))return;const event={id:e.id,ts:e.at??e.ts,store:e.store,part,state:e.code??e.state,kind:e.kind,source:e.source==='legacy_ca'?'legacy_ca':'national'};if(!['0','1','U','P'].includes(event.state))return;this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?)').run(event.id,event.ts,JSON.stringify(event));seenEvents.add(event.id);changedDates.add(utcDay(event.ts))};
  this.source.exec('BEGIN');this.db.exec('BEGIN');try{
   for(const row of this.source.prepare('SELECT ts,payload FROM checkpoints WHERE ts>? ORDER BY ts').iterate(cursor)){
    const snapshot=JSON.parse(gunzipSync(row.payload));if(snapshot.products.map(p=>p.part).join('|')!==this.products.map(p=>p.part).join('|'))throw Error('Snapshot catalog mismatch');
    for(const [id,store] of Object.entries(snapshot.stores)){
     const at=Math.max(0,...store.cells.map(c=>c.at||0));if(!at)continue;
     const cells=encodeCells(store.cells),quality=store.cells.reduce((n,c)=>n+(c.checks||0),0);
     const change=this.db.prepare('INSERT INTO samples VALUES(?,?,?,?) ON CONFLICT(at,store) DO UPDATE SET cells=excluded.cells,quality=excluded.quality WHERE excluded.quality>samples.quality').run(at,id,JSON.stringify(cells),quality);if(change.changes)changedDates.add(utcDay(at));
    }
    for(const event of snapshot.recentEvents||[])addEvent(event);
    const totals=snapshot.totals;const point={ts:row.ts,checks:totals.checks,positives:totals.hits,requests:totals.requests,errors:totals.errors,fresh_stores:Object.values(snapshot.stores).filter(s=>s.cells.every(c=>c.at&&row.ts-c.at<=900000)).length};
    this.db.prepare('INSERT OR REPLACE INTO points VALUES(?,?)').run(row.ts,JSON.stringify(point));last=row.ts;read++;changedDates.add(utcDay(row.ts));
   }
   for(const row of this.source.prepare('SELECT payload FROM events').iterate())addEvent(JSON.parse(row.payload));
   this.db.prepare("INSERT INTO state VALUES('cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(last));this.db.exec('COMMIT');this.source.exec('ROLLBACK');return {read,cursor:last,changedDates:[...changedDates]};
  }catch(error){this.db.exec('ROLLBACK');this.source.exec('ROLLBACK');throw error}
 }
 dates(){return [...new Set([...this.db.prepare('SELECT DISTINCT substr(datetime(at/1000,\'unixepoch\'),1,10) day FROM samples').all().map(x=>x.day),...this.db.prepare('SELECT DISTINCT substr(datetime(ts/1000,\'unixepoch\'),1,10) day FROM points').all().map(x=>x.day)])].sort()}
 day(date){
  const start=Date.parse(date+'T00:00:00Z'),end=start+86400000,baseline={};
  for(const row of this.db.prepare('SELECT s.* FROM samples s JOIN (SELECT store,max(at) at FROM samples WHERE at<? GROUP BY store) last ON s.store=last.store AND s.at=last.at').all(start))baseline[row.store]=JSON.parse(row.cells);
  const baselineAt=this.db.prepare('SELECT max(ts) ts FROM points WHERE ts<?').get(start)?.ts||this.startedAt;
  const records=this.db.prepare('SELECT at,store,cells FROM samples WHERE at>=? AND at<? ORDER BY at,store').all(start,end).map(r=>[r.at,r.store,JSON.parse(r.cells)]);
  const points=this.db.prepare('SELECT payload FROM points WHERE ts>=? AND ts<? ORDER BY ts').all(start,end).map(r=>JSON.parse(r.payload));
  const events=this.db.prepare('SELECT payload FROM events WHERE ts>=? AND ts<? ORDER BY ts').all(start,end).map(r=>JSON.parse(r.payload));
  return {schemaVersion:1,day:date,baseline,baselineAt,records,points,events};
 }
 prepare(now=Date.now()){
  const state=this.ingest(),today=utcDay(now),archives={},days={};
  const filesPath=this.output+'/file-index.json',files=existsSync(filesPath)?JSON.parse(readFileSync(filesPath)):{};const changed=state.changedDates.sort()[0]||'9999-99-99';
  for(const date of this.dates()){
   if(date<today&&date<changed&&files[date]&&existsSync(this.output+'/assets/'+files[date].split('/').at(-1))){archives[date]=files[date];days[date]=null;continue}
   const data=this.day(date);days[date]=data;if(date>=today)continue;
   const payload=gzipSync(JSON.stringify(data)),hash=createHash('sha256').update(payload).digest('hex').slice(0,16),name='national-'+date+'.'+hash+'.json.gz';
   if(payload.length>25*1024*1024)throw Error('Historical file exceeds static asset limit');this.atomic(this.output+'/assets/'+name,payload);archives[date]='/data/history/'+name;files[date]=archives[date];
  }
  this.atomic(filesPath,JSON.stringify(files));
  const legacy=JSON.parse(readFileSync(this.output+'/legacy.json','utf8'));
  const prepared={schemaVersion:1,preparedAt:now,archives,legacy,cursor:state.cursor};this.atomic(this.output+'/prepared.json',JSON.stringify(prepared));return {prepared,days,state};
 }
 bundle(prepared,days,deployed={},now=Date.now()){
  const archives={},currentDays=[];for(const [date,data] of Object.entries(days)){if(prepared.archives[date]&&deployed.archives?.[date]===prepared.archives[date])archives[date]=deployed.archives[date];else currentDays.push(data||this.day(date))}
  if(deployed.legacy?.path!==prepared.legacy.path)throw Error('Legacy archive has not been deployed');
  const data={schemaVersion:1,publishedAt:now,startedAt:this.startedAt,archives,legacy:prepared.legacy,currentDays,coverage:{source:'saved-local-observations',missingIntervalsAreUnknown:true}};
  const bytes=gzipSync(JSON.stringify(data));if(bytes.length>20*1024*1024)throw Error('Current history bundle exceeds bounded publication size');return {bytes,data};
 }
 atomic(path,bytes){writeFileSync(path+'.next',bytes);renameSync(path+'.next',path)}
 close(){this.source.close();this.db.close()}
}
