const PERIOD=300000,KEY='public-history';
export async function readPublicHistory(env){if(!env.LIVE_CACHE)return null;return env.LIVE_CACHE.getWithMetadata(KEY,{type:'arrayBuffer',cacheTtl:60})}
export async function publishPublicHistory(env,request,now=Date.now()){
 const at=Number(request.headers.get('x-history-published-at'));if(!Number.isSafeInteger(at)||Math.abs(now-at)>600000)throw Error('Invalid history publication time');
 const old=await env.LIVE_CACHE.getWithMetadata(KEY,{type:'arrayBuffer',cacheTtl:30});
 if(old.metadata?.at>=at||old.metadata?.at&&now-old.metadata.at<PERIOD)return {ok:true,stored:false,nextAt:old.metadata.at+PERIOD};
 const bytes=await request.arrayBuffer();if(bytes.byteLength>20*1024*1024||bytes.byteLength<20||new Uint8Array(bytes)[0]!==31||new Uint8Array(bytes)[1]!==139)throw Error('Invalid history publication size');
 await env.LIVE_CACHE.put(KEY,bytes,{metadata:{at,schemaVersion:1}});return {ok:true,stored:true,nextAt:now+PERIOD};
}
