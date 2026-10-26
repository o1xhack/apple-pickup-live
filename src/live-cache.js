export const LIVE_PERIOD_MS=300000;
export async function readLive(env){return env.LIVE_CACHE?env.LIVE_CACHE.get('latest',{type:'json',cacheTtl:30}):null}
export async function publishLive(env,snapshot,now=Date.now()){
 if(!env.LIVE_CACHE)throw Error('Live cache unavailable');
 if(!snapshot||snapshot.version!==1||!Number.isSafeInteger(snapshot.publishedAt)||Math.abs(now-snapshot.publishedAt)>600000)throw Error('Invalid live publication');
 const previous=await readLive(env);
 if(previous?.publishedAt>=snapshot.publishedAt||previous&&now-previous.publishedAt<LIVE_PERIOD_MS)return {ok:true,stored:false,nextAt:previous.publishedAt+LIVE_PERIOD_MS};
 await env.LIVE_CACHE.put('latest',JSON.stringify(snapshot));
 return {ok:true,stored:true,nextAt:now+LIVE_PERIOD_MS};
}
