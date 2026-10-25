// Only successful responses may certify coverage. Predicted hubs are learning
// proposals; they never contribute to freshness or recorded sweep coverage.
export function compactVerifiedCoverage(coverage){
 const selected=Object.entries(coverage).filter(([,ids])=>ids.length).map(([zip,ids])=>({zip,ids}));
 const counts=new Map();for(const row of selected)for(const id of new Set(row.ids))counts.set(id,(counts.get(id)||0)+1);
 // Remove redundant small sets first, preserving their unique-store witnesses.
 selected.sort((a,b)=>a.ids.length-b.ids.length||a.zip.localeCompare(b.zip));
 const kept=[];for(const row of selected){if(row.ids.every(id=>counts.get(id)>1)){for(const id of new Set(row.ids))counts.set(id,counts.get(id)-1)}else kept.push(row)}
 return kept;
}
export function learningProposal({proposals,coverage,attempted,backoff,eligible}){
 for(const row of proposals){if(coverage[row.zip]||attempted[row.zip]||backoff.zips.has(row.zip))continue;
 const ids=row.ids.filter(id=>eligible.has(id)&&!backoff.stores.has(id));if(ids.length)return {...row,ids,gain:ids.length,targetStore:ids[0],learning:true};}
 return null;
}
