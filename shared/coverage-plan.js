// Only successful responses may certify coverage. Predicted hubs are learning
// proposals; they never contribute to freshness or recorded sweep coverage.
export function compactVerifiedCoverage(coverage){
 const selected=Object.entries(coverage).filter(([,ids])=>ids.length).map(([zip,ids])=>({zip,ids:[...new Set(ids)]}));
 const counts=new Map();for(const row of selected)for(const id of row.ids)counts.set(id,(counts.get(id)||0)+1);
 selected.sort((a,b)=>a.ids.length-b.ids.length||a.zip.localeCompare(b.zip));
 const fallback=[];for(const row of selected){if(row.ids.every(id=>counts.get(id)>1)){for(const id of row.ids)counts.set(id,counts.get(id)-1)}else fallback.push(row)}
 // Uniform-cost exact set cover, bounded to avoid delaying collection on a new
 // catalog. If the search grows too large, retain the safe full-coverage tour.
 const ids=[...new Set(selected.flatMap(row=>row.ids))],index=new Map(ids.map((id,i)=>[id,i]));
 const sets=selected.map(row=>({...row,mask:row.ids.reduce((m,id)=>m|(1n<<BigInt(index.get(id))),0n)}));
 const useful=sets.filter(a=>!sets.some(b=>a!==b&&(a.mask&b.mask)===a.mask&&(a.mask!==b.mask||a.zip>b.zip)));
 const byId=ids.map((_,i)=>useful.filter(row=>(row.mask&(1n<<BigInt(i)))!==0n)),memo=new Map();let states=0;const deadline=performance.now()+100;
 const size=mask=>{let n=0;while(mask){mask&=mask-1n;n++}return n};
 function solve(left){if(!left)return [];if(memo.has(left))return memo.get(left);if(++states>20000||(states%128===0&&performance.now()>deadline))throw Error('coverage search bound');
  let options=null;for(let i=0;i<ids.length;i++)if(left&(1n<<BigInt(i))){if(!options||byId[i].length<options.length)options=byId[i];if(options.length===1)break}
  let best=null;for(const row of [...options].sort((a,b)=>size(b.mask&left)-size(a.mask&left))){const answer=[row,...solve(left&~row.mask)];if(!best||answer.length<best.length)best=answer}memo.set(left,best);return best;
 }
 try{const exact=solve((1n<<BigInt(ids.length))-1n);return exact.length<fallback.length?exact.map(({zip,ids})=>({zip,ids})):fallback}catch{return fallback}
}
export function learningProposal({proposals,coverage,attempted,backoff,eligible}){
 for(const row of proposals){if(coverage[row.zip]||attempted[row.zip]||backoff.zips.has(row.zip))continue;
 const ids=row.ids.filter(id=>eligible.has(id)&&!backoff.stores.has(id));if(ids.length)return {...row,ids,gain:ids.length,targetStore:ids[0],learning:true};}
 return null;
}
