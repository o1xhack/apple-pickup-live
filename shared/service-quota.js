export function isD1QuotaError(error){return /exceeded D1.*daily.*limit|D1.*free tier.*limit/i.test(String(error?.message||error))}
export function nextQuotaReset(now=Date.now()){return (Math.floor(now/86400000)+1)*86400000}
