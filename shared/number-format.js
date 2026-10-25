export function metricNumber(value,language='en'){
 const number=Math.max(0,Number(value)||0),locale=language==='zh'?'zh-CN':'en-US';
 if(number<1000000)return number.toLocaleString(locale);
 const millions=Math.floor(number/1000000),thousands=Math.floor(number%1000000/1000);
 return millions.toLocaleString(locale)+'M'+(thousands?' '+thousands+'K':'');
}
