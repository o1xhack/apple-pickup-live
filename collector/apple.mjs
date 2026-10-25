import {appleUrl,appleHeaders} from '../shared/apple-request.js';
import {parseApple} from '../shared/model.js';
import {parseRetryAfter} from '../shared/throttle.js';
export async function collectLocal(zip,products,storeCatalog,{fetchImpl=fetch,now=Date.now}={}){
 const at=now();let response;
 try{response=await fetchImpl(appleUrl(zip,products),{headers:appleHeaders(),signal:AbortSignal.timeout(20000)})}catch{return {at,status:0,stores:[],durationMs:now()-at,error:'Local Apple request unreachable or timed out'}}
 let stores=[],error=null;
 if(response.ok){try{stores=parseApple(await response.json(),products).filter(row=>storeCatalog.some(s=>s.id===row.id))}catch{error='Apple response missing or unrecognized'}}else{await response.body?.cancel();error=`Apple HTTP ${response.status}`}
 return {at,status:response.status,stores,error,durationMs:now()-at,retryAfterSeconds:parseRetryAfter(response.headers.get('retry-after'))};
}
