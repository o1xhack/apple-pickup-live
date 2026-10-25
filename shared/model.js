// Stock observations are not a count of phones, reservations or restocks.
export const CODES={in_stock:'1',out_of_stock:'0',unknown:'U',pickup_not_open:'P'};
export function emptySnapshot(stores,products,startedAt=Date.now()){
 return {version:1,startedAt,publishedAt:startedAt,products,stores:Object.fromEntries(stores.map(s=>[s.id,{id:s.id,cells:products.map(()=>({code:'U',at:0,checks:0,hits:0,unknown:0,pending:0,lastHit:0,intervals:0,firstHit:0}))}])),totals:{requests:0,errors:0,checks:0,hits:0,sweeps:0},health:{mode:'initializing',message:'National collector is starting',nextAt:0,cooldownUntil:0},recentEvents:[],lastRequestId:null};
}
export function parseApple(body,products){
 if(!body||typeof body!=='object')throw Error('Invalid Apple response');
 if(body.body?.errorMessage)throw Error('Apple error: '+body.body.errorMessage);
 if(body.head?.status!=null&&String(body.head.status)!=='200')throw Error('Apple envelope status '+String(body.head.status));
 const section=Array.isArray(body.body?.stores)&&body.body.stores.length?body.body:body.body?.content?.pickupMessage;
 if(!section||!Array.isArray(section.stores)||!section.stores.length)throw Error('Apple response schema changed: stores missing');
 return section.stores.filter(s=>typeof s.storeNumber==='string').map(store=>({id:store.storeNumber,codes:products.map(p=>{
  const part=store.partsAvailability?.[p.part];
  if(!part)return 'U';
  if(part.partNumber&&part.partNumber!==p.part)return 'U';
  const display=String(part.pickupDisplay||'').trim().toLowerCase();
  if(display==='available')return '1';
  if(display==='unavailable'||display==='ineligible')return '0';
  if(display==='default'&&part.messageTypes?.regular?.storeSearchEnabled===false&&(part.pickupSearchQuote||part.messageTypes.regular.storePickupQuote))return 'P';
  return 'U';
 }).join('')}));
}
export function applyObservation(snapshot,{requestId,at,stores=[],httpStatus=200,error=null,source='collector'}){
 if(snapshot.lastRequestId===requestId)return [];
 snapshot.lastRequestId=requestId;snapshot.totals.requests++;
 if(error||httpStatus!==200){snapshot.totals.errors++;snapshot.health.message=error||`Apple HTTP ${httpStatus}`;return []}
 const events=[];
 for(const row of stores){const target=snapshot.stores[row.id];if(!target)continue;
  for(let i=0;i<snapshot.products.length;i++){
   const code=row.codes[i]||'U';const cell=target.cells[i];if(at<=cell.at)continue;
   const previous=cell.code;const gap=cell.at===0||at-cell.at>600000||previous==='U';
   cell.code=code;cell.at=at;cell.source=source;cell.checks++;snapshot.totals.checks++;
   if(code==='1'){cell.hits++;snapshot.totals.hits++;cell.lastHit=at;if(!cell.firstHit)cell.firstHit=at;if(previous!=='1'||gap)cell.intervals++;}
   if(code==='U')cell.unknown++;if(code==='P')cell.pending++;
   if((code!==previous||(gap&&code==='1'))&&(code==='1'||previous==='1'||previous!=='U')){const event={id:`${at}-${row.id}-${i}`,at,store:row.id,part:snapshot.products[i].part,code,kind:code==='1'?(gap?'first_or_recovered':previous==='0'?'candidate_restock':'became_available'):'state_change'};events.push(event)}
  }
 }
 snapshot.recentEvents=[...events.toReversed(),...snapshot.recentEvents].slice(0,1000);return events;
}
export function haversineMiles(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);return 3958.7613*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2));}
export function filterStores(stores,{zip='',radius=100,state='',city='',query=''},zips){
 let center=null;if(zip){if(!/^\d{5}$/.test(zip)||!zips[zip])throw Error('Enter a valid US ZIP code');const p=zips[zip];center={lat:p[0],lon:p[1]};}
 return stores.map(s=>({...s,distance:center?haversineMiles(center,s):null})).filter(s=>(!state||s.stateCode===state)&&(!city||s.city.toLowerCase().includes(city.toLowerCase()))&&(!query||`${s.name} ${s.city} ${s.state} ${s.zip}`.toLowerCase().includes(query.toLowerCase()))&&(!center||s.distance<=Number(radius))).sort((a,b)=>center?a.distance-b.distance:a.state.localeCompare(b.state)||a.city.localeCompare(b.city));
}
export function viewCell(cell,now=Date.now(),staleAfter=300000){return !cell?.at?'unscanned':now-cell.at>staleAfter?'stale':({'1':'in_stock','0':'out_of_stock','P':'pickup_not_open','U':'unknown'}[cell.code]||'unknown');}
export function rangeMetrics(end,start,storeIds,partIndices){let checks=0,hits=0,unknown=0,pending=0;for(const id of storeIds)for(const i of partIndices){const a=end?.stores[id]?.cells[i],b=start?.stores[id]?.cells[i];if(!a)continue;checks+=Math.max(0,a.checks-(b?.checks||0));hits+=Math.max(0,a.hits-(b?.hits||0));unknown+=Math.max(0,a.unknown-(b?.unknown||0));pending+=Math.max(0,a.pending-(b?.pending||0));}return {checks,hits,unknown,pending};}
