export class SiteRequestError extends Error{constructor(message,status=0){super(message);this.status=status}}
export async function requestJSON(base,path,body,{token,fetchImpl=fetch,timeoutMs=30000}={}){
 let response;try{response=await fetchImpl(base+path,{method:body?'POST':'GET',headers:{'user-agent':'ApplePickupLiveCollector/0.2','content-type':'application/json',...(body?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(timeoutMs)})}catch{throw new SiteRequestError('Collection service unreachable or timed out')}
 if(!response.ok)throw new SiteRequestError(`Collection service HTTP ${response.status}`,response.status);
 try{return await response.json()}catch{throw new SiteRequestError('Collection service returned invalid JSON')}
}
export async function publishWithRetry(action,{sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;attempt<3;attempt++)try{return await action()}catch(error){if([400,401,403,413].includes(error.status)||attempt===2)throw error;await sleep(2000*2**attempt)}
}

export function validateRegionalResponse(result,partCount=8){
 if(!result||!Number.isInteger(result.status)||!Array.isArray(result.stores))throw new SiteRequestError('Invalid regional response');
 if(result.stores.some(s=>typeof s.id!=='string'||typeof s.codes!=='string'||s.codes.length!==partCount||/[^01UP]/.test(s.codes)))throw new SiteRequestError('Invalid regional observation');
 if(result.status===200&&!result.error&&!result.stores.length)throw new SiteRequestError('Regional response has no matching stores');
 return result;
}
