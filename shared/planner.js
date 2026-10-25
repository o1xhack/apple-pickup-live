export function chooseRegion({stores,candidates,coverage,seen,checked,backoff,snapshot,now,intervalMs,tried}){
 const available=stores.filter(s=>!backoff.stores.has(s.id)&&!checked.has(s.id));
 const unvisited=available.filter(s=>!seen.has(s.id));
 const due=unvisited.length?unvisited:available.filter(s=>now-(snapshot.stores[s.id]?.cells[0]?.at||0)>=intervalMs);
 if(!due.length)return null;
 const dueIds=new Set(due.map(s=>s.id));let best=null;
 for(const candidate of candidates){if(tried.has(candidate.zip)||backoff.zips.has(candidate.zip))continue;
  const ids=coverage[candidate.zip]||candidate.ids;const freshIds=ids.filter(id=>dueIds.has(id));if(!freshIds.length)continue;
  const oldest=Math.min(...freshIds.map(id=>snapshot.stores[id]?.cells[0]?.at||0));
  if(!best||freshIds.length>best.gain||freshIds.length===best.gain&&oldest<best.oldest)best={...candidate,ids,gain:freshIds.length,oldest,targetStore:freshIds[0]};
 }
 return best;
}
