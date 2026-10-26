import {collectLocal} from '../collector/apple.mjs';
export async function executeCloudflare(request,env,plan,products,stores,{collect=collectLocal,now=Date.now}={}){
 const input=await request.json(),at=now();
 if(input.planVersion!==plan.version||!plan.regions.some(r=>r.source==='cloudflare'&&r.zip===input.zip)||!/^[-a-zA-Z0-9]{16,64}$/.test(input.requestId||'')||!Number.isSafeInteger(input.at)||Math.abs(at-input.at)>600000)return {httpStatus:400,body:{error:'Invalid fixed regional task'}};
 const previous=await env.DB.prepare('SELECT zip,result FROM collector_executions WHERE id=?').bind(input.requestId).first();
 if(previous&&previous.zip!==input.zip)return {httpStatus:400,body:{error:'Task ID already belongs to another region'}};
 if(previous)return {httpStatus:200,body:previous.result?JSON.parse(previous.result):{skipped:true,retryAt:at+60000}};
 // Conditional insert is an atomic lease: at least 20 seconds between outbound
 // starts, at most the fixed regional count per rolling five minutes, and each
 // ZIP at most once per five minutes. Replayed or raced tasks cannot fetch twice.
 const claim=await env.DB.prepare(`INSERT OR IGNORE INTO collector_executions(id,at,zip)
 SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM collector_executions WHERE at>?)
 AND NOT EXISTS(SELECT 1 FROM collector_executions WHERE zip=? AND at>?)
 AND (SELECT count(*) FROM collector_executions WHERE at>?)<?`).bind(input.requestId,at,input.zip,at-20000,input.zip,at-300000,at-300000,plan.regions.filter(r=>r.source==='cloudflare').length).run();
 if(!claim.meta?.changes)return {httpStatus:200,body:{skipped:true,retryAt:at+20000}};
 const result=await collect(input.zip,products,stores);result.source='cloudflare';
 await env.DB.prepare('UPDATE collector_executions SET result=?,completed=1 WHERE id=?').bind(JSON.stringify(result),input.requestId).run();
 return {httpStatus:200,body:result};
}
