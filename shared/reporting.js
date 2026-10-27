import {dayKey} from './daily.js';
export const REPORTING_START=Date.parse('2026-10-24T00:00:00-07:00');
const pt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function pacificInput(at){const p=Object.fromEntries(pt.formatToParts(new Date(at)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`}
export function parsePacificInput(value){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;const wall=Date.parse(value+'Z');let at=wall;for(let i=0;i<3;i++)at+=wall-Date.parse(pacificInput(at)+'Z');return pacificInput(at)===value?at:NaN}
export function dailyStockObservations(days,legacy,{from,to,storeIds,indices,parts}){
 const ids=new Set(storeIds),skus=new Set(parts),totals=new Map();
 for(let day=dayKey(from);day<=dayKey(to);day=new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10))totals.set(day,0);
 const add=(at,count)=>{if(at<from||at>to||count<=0)return;const day=dayKey(at);totals.set(day,(totals.get(day)||0)+count)};
 for(const day of days){const previous=new Map(Object.entries(day.baseline||{}));for(const [at,id,cells] of day.records||[]){const old=previous.get(id)||[];if(ids.has(id))for(const i of indices)add(at,Math.max(0,(cells[i]?.[3]||0)-(old[i]?.[3]||0)));previous.set(id,cells)}}
 for(const [bucket,id,part,,,,,,samples] of legacy.buckets||[])if(ids.has(id)&&skus.has(part))for(const [offset,code] of samples)if(code==='1')add(bucket+offset,1);
 return [...totals].map(([day,hits])=>({day,hits}));
}
