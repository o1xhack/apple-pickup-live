export async function stockHistory(env,url,stores,products){
 const store=url.searchParams.get('store')||'',part=url.searchParams.get('part')||'';
 if(store&&!stores.some(s=>s.id===store)||part&&!products.some(p=>p.part===part))throw Error('Unknown store or configuration');
 const ids=(url.searchParams.get('stores')||'').split(',').filter(Boolean),parts=(url.searchParams.get('parts')||'').split(',').filter(Boolean);
 if(ids.length>stores.length||ids.some(id=>!stores.some(s=>s.id===id))||parts.some(id=>!products.some(p=>p.part===id)))throw Error('Invalid filters');
 const from=Math.max(0,Number(url.searchParams.get('from')||Date.now()-7*86400000)),to=Math.min(Date.now(),Number(url.searchParams.get('to')||Date.now()));
 if(!Number.isFinite(from+to)||to<from)throw Error('Invalid dates');
 const source=url.searchParams.get('source')||'all',result=url.searchParams.get('result')||'all';
 if(!['all','national','legacy_ca'].includes(source))throw Error('Invalid source');if(!['all','in_stock'].includes(result))throw Error('Invalid result filter');
 const rows=await env.DB.prepare(`SELECT ts,store,part,state,kind,source FROM stock_events WHERE ts>=? AND ts<=? AND (?='' OR store=?) AND (?='' OR part=?) AND (?=0 OR store IN(SELECT value FROM json_each(?))) AND (?=0 OR part IN(SELECT value FROM json_each(?))) AND (?='all' OR source=?) AND (?='all' OR state='1') AND part IN(SELECT value FROM json_each(?)) ORDER BY ts DESC LIMIT 200`).bind(from,to,store,store,part,part,ids.length,JSON.stringify(ids),parts.length,JSON.stringify(parts),source,source,result,JSON.stringify(products.map(p=>p.part))).all();return {events:rows.results};
}
