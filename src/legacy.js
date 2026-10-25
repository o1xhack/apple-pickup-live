export async function legacyMetadata(env){const row=await env.DB.prepare("SELECT value FROM metadata WHERE key='legacy_ca'").first();return row?JSON.parse(row.value):null}
export async function legacyStatistics(env,url,storeCatalog,productCatalog){
 const from=Math.max(0,Number(url.searchParams.get('from')||0)),to=Math.min(Date.now(),Number(url.searchParams.get('to')||Date.now()));
 if(!Number.isFinite(from+to)||from>to||to-from>366*86400000)throw Error('Invalid historical date range');
 const ids=(url.searchParams.get('stores')||'').split(',').filter(Boolean),parts=(url.searchParams.get('parts')||'').split(',').filter(Boolean);
 if(ids.some(id=>!storeCatalog.some(s=>s.id===id))||parts.some(part=>!productCatalog.some(p=>p.part===part)))throw Error('Invalid historical filters');
 const params=[Math.floor(from/3600000)*3600000,Math.floor(to/3600000)*3600000,ids.length,JSON.stringify(ids),parts.length,JSON.stringify(parts),from,to,from,to,from,to];
 const cte=`WITH matched AS (SELECT * FROM legacy_hourly WHERE source='legacy_ca' AND bucket BETWEEN ? AND ? AND (?=0 OR store IN(SELECT value FROM json_each(?))) AND (?=0 OR part IN(SELECT value FROM json_each(?)))), ranged AS (
 SELECT bucket,store,part,checks,hits,unknown,pending,last_hit FROM matched WHERE bucket>=? AND bucket+3599999<=?
 UNION ALL
 SELECT bucket,store,part,count(*) checks,sum(json_extract(j.value,'$[1]')='1') hits,sum(json_extract(j.value,'$[1]')='U') unknown,sum(json_extract(j.value,'$[1]')='P') pending,max(CASE WHEN json_extract(j.value,'$[1]')='1' THEN bucket+json_extract(j.value,'$[0]') ELSE 0 END) last_hit FROM matched,json_each(samples) j WHERE (bucket<? OR bucket+3599999>?) AND bucket+json_extract(j.value,'$[0]') BETWEEN ? AND ? GROUP BY bucket,store,part)
 `;
 const results=await env.DB.batch([env.DB.prepare(cte+'SELECT store,part,sum(checks) checks,sum(hits) hits,sum(unknown) unknown,sum(pending) pending,max(last_hit) lastHit FROM ranged GROUP BY store,part').bind(...params),env.DB.prepare(cte+'SELECT bucket ts,sum(checks) checks FROM ranged GROUP BY bucket ORDER BY bucket').bind(...params)]);
 return {source:'legacy_ca',rows:results[0].results,series:results[1].results};
}
