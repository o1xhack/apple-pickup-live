import {emptySnapshot} from '../shared/model.js';
import {reconstructCheckpoint,legacyRange,historyEvents,activitySeries,utcDay} from '../shared/history-files.js';
export class PublicHistory{
 constructor({stores,products,info,getLatest,apiOrigin='',assetOrigin='',fetchImpl=(...args)=>globalThis.fetch(...args),now=Date.now}){Object.assign(this,{stores,products,info,getLatest,apiOrigin,assetOrigin,fetchImpl,now});this.files=new Map();this.loadedAt=0;this.manifest=null;this.pending=null}
 async read(url){const response=await this.fetchImpl(url,{cache:'default'});if(!response.ok)throw Error('Published history unavailable');const bytes=new Uint8Array(await response.arrayBuffer());const text=bytes[0]===31&&bytes[1]===139?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);return JSON.parse(text)}

 async ensure(){if(this.manifest&&this.now()-this.loadedAt<300000)return this.manifest;if(this.pending)return this.pending;
  this.pending=this.read(this.apiOrigin+'/api/public-history').then(data=>{if(data.schemaVersion!==1||!data.legacy?.path||!Array.isArray(data.currentDays))throw Error('Invalid history publication');this.manifest=data;this.loadedAt=this.now();return data}).finally(()=>{this.pending=null});return this.pending;
 }
 async file(path){if(!/^\/data\/history\/[a-zA-Z0-9.-]+\.json\.gz$/.test(path))throw Error('Invalid history file');if(!this.files.has(path)){const p=this.read(this.assetOrigin+path).catch(error=>{this.files.delete(path);throw error});this.files.set(path,p)}return this.files.get(path)}
 async days(from,to){const m=await this.ensure(),start=utcDay(Math.max(from,this.info.startedAt)),end=utcDay(to);const dates=new Set([...Object.keys(m.archives||{}),...m.currentDays.map(d=>d.day)].filter(d=>d>=start&&d<=end));return Promise.all([...dates].sort().map(async date=>m.currentDays.find(d=>d.day===date)||this.file(m.archives[date])))}
 async checkpoint(at){const current=this.getLatest();if(current&&at>=current.publishedAt)return current;if(at<this.info.startedAt)return emptySnapshot(this.stores,this.products,this.info.startedAt);
  const m=await this.ensure(),date=utcDay(at),available=[...new Set([...Object.keys(m.archives||{}),...m.currentDays.map(d=>d.day)])].filter(d=>d<=date).sort();const selected=available.at(-1);
  if(!selected)return emptySnapshot(this.stores,this.products,this.info.startedAt);const day=m.currentDays.find(d=>d.day===selected)||await this.file(m.archives[selected]);return reconstructCheckpoint(day,at,this.stores,this.products,this.info.startedAt);
 }
 async dailyInputs(from,to){const m=await this.ensure();const [days,legacy]=await Promise.all([this.days(from,to),this.file(m.legacy.path)]);return {days,legacy}}
 async series(from,to){return activitySeries(await this.days(from,to),from,to)}
 async legacy(from,to){const m=await this.ensure();return legacyRange(await this.file(m.legacy.path),from,to)}
 async history(filters){const m=await this.ensure();const [days,legacy]=await Promise.all([this.days(filters.from,filters.to),this.file(m.legacy.path)]);return {publishedAt:m.publishedAt,through:m.coverage?.latestCheckpointAt??m.publishedAt,events:historyEvents([...legacy.events,...days.flatMap(d=>d.events||[])],filters)}}
}
