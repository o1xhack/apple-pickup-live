const metadataCache=new WeakMap(),resultCaches=new WeakMap();
export async function legacyMetadata(env){
 const saved=metadataCache.get(env.DB);if(saved&&saved.until>Date.now())return saved.value;
 const row=await env.DB.prepare("SELECT value FROM metadata WHERE key='legacy_ca'").first();const value=row?JSON.parse(row.value):null;
 metadataCache.set(env.DB,{value,until:Date.now()+60000});return value;
}
export async function legacyStatistics(env,url,storeCatalog,productCatalog){
 let from=Math.max(0,Number(url.searchParams.get('from')||0)),to=Math.min(Date.now(),Number(url.searchParams.get('to')||Date.now()));
 if(!Number.isFinite(from+to)||from>to||to-from>366*86400000)throw Error('Invalid historical date range');
 const ids=[...new Set((url.searchParams.get('stores')||'').split(',').filter(Boolean))].sort(),parts=[...new Set((url.searchParams.get('parts')||'').split(',').filter(Boolean))].sort();
 if(ids.some(id=>!storeCatalog.some(s=>s.id===id))||parts.some(part=>!productCatalog.some(p=>p.part===part)))throw Error('Invalid historical filters');
 const metadata=await legacyMetadata(env);
 // The archive is immutable. Different 'now' timestamps after its end describe
 // exactly the same records and must not trigger another full historical scan.
 if(metadata){from=Math.max(from,metadata.startedAt);to=Math.min(to,metadata.endedAt)}
 if(from>to)return {source:'legacy_ca',rows:[],series:[]};
 const key=JSON.stringify([metadata?.startedAt,metadata?.endedAt,metadata?.checks,from,to,ids,parts]);
 let cache=resultCaches.get(env.DB);if(!cache){cache=new Map();resultCaches.set(env.DB,cache)}
 const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.result;
 if(cache.size>=64)cache.delete(cache.keys().next().value);
 const result=computeLegacyStatistics(env,url,key,from,to,ids,parts);
 cache.set(key,{until:Date.now()+300000,result});try{return await result}catch(error){cache.delete(key);throw error}
}
async function computeLegacyStatistics(env,url,key,from,to,ids,parts){
 const edge=globalThis.caches?.default;
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const cacheKey=new Request(new URL('/__cache/legacy-statistics-v2/'+digest,url.origin));
 if(edge){try{const cached=await edge.match(cacheKey);if(cached)return await cached.json()}catch{}}
 const params=[Math.floor(from/3600000)*3600000,Math.floor(to/3600000)*3600000,ids.length,JSON.stringify(ids),parts.length,JSON.stringify(parts),from,to,from,to,from,to];
 const cte=`WITH matched AS (SELECT * FROM legacy_hourly WHERE source='legacy_ca' AND bucket BETWEEN ? AND ? AND (?=0 OR store IN(SELECT value FROM json_each(?))) AND (?=0 OR part IN(SELECT value FROM json_each(?)))), ranged AS (
 SELECT bucket,store,part,checks,hits,unknown,pending,last_hit FROM matched WHERE bucket>=? AND bucket+3599999<=?
 UNION ALL
 SELECT bucket,store,part,count(*) checks,sum(json_extract(j.value,'$[1]')='1') hits,sum(json_extract(j.value,'$[1]')='U') unknown,sum(json_extract(j.value,'$[1]')='P') pending,max(CASE WHEN json_extract(j.value,'$[1]')='1' THEN bucket+json_extract(j.value,'$[0]') ELSE 0 END) last_hit FROM matched,json_each(samples) j WHERE (bucket<? OR bucket+3599999>?) AND bucket+json_extract(j.value,'$[0]') BETWEEN ? AND ? GROUP BY bucket,store,part)
 `;
 // Aggregate both result views from one materialized range, rather than
 // executing the same archive scan twice in independent statements.
 const statement=cte+`SELECT json_object(
 'rows',json((SELECT json_group_array(json_object('store',store,'part',part,'checks',checks,'hits',hits,'unknown',unknown,'pending',pending,'lastHit',lastHit)) FROM (SELECT store,part,sum(checks) checks,sum(hits) hits,sum(unknown) unknown,sum(pending) pending,max(last_hit) lastHit FROM ranged GROUP BY store,part))),
 'series',json((SELECT json_group_array(json_object('ts',ts,'checks',checks)) FROM (SELECT bucket ts,sum(checks) checks FROM ranged GROUP BY bucket ORDER BY bucket)))) payload`;
 const results=await env.DB.batch([env.DB.prepare(statement).bind(...params)]);
 const result={source:'legacy_ca',...JSON.parse(results[0].results[0].payload)};
 if(edge){try{await edge.put(cacheKey,Response.json(result,{headers:{'cache-control':'public, max-age=300'}}))}catch{}}
 return result;
}
