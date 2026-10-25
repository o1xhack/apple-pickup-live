#!/usr/bin/env python3
"""Export whitelisted, pre-site California observations from a consistent read-only snapshot."""
import argparse,bisect,collections,hashlib,json,pathlib,re,sqlite3,subprocess,plistlib

def export(source,root,before):
 stores={s['id']:s for s in json.loads((root/'data/us-stores.json').read_text()) if s['stateCode']=='CA'}
 c=sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True);c.row_factory=sqlite3.Row;c.execute('BEGIN')
 sql='''SELECT o.*,t.store_number,t.part_number,t.product_name,c.session_id,c.next_check_in_secs FROM observations o JOIN targets t ON t.target_key=o.target_key JOIN cycles c ON c.id=o.cycle_id WHERE t.locale='en_US' AND o.checked_at_ms IS NOT NULL AND o.checked_at_ms<? ORDER BY o.checked_at_ms,o.cycle_id'''
 pauses=collections.defaultdict(list)
 for row in c.execute("SELECT session_id,occurred_at_ms FROM events WHERE kind IN ('started','paused') ORDER BY occurred_at_ms"):pauses[row[0]].append(row[1])
 buckets={};products={};events=[];last={};seen=set();cycles=set();first=None;end=None;quote_count=0
 for r in c.execute(sql,(before,)):
  if r['store_number'] not in stores:continue
  at=r['checked_at_ms'];key=(r['store_number'],r['part_number'],at)
  if key in seen:continue
  seen.add(key);cycles.add(r['cycle_id']);first=at if first is None else min(first,at);end=at if end is None else max(end,at)
  code={'in_stock':'1','out_of_stock':'0'}.get(r['availability'],'P' if r['reason']=='pickup_not_open' else 'U')
  part=r['part_number'];m=re.match(r'^(iPhone .+?)\s+(\d+(?:GB|TB))\s+(.+)$',r['product_name'])
  if not m:raise ValueError('Unrecognized historical configuration: '+r['product_name'])
  products[part]={'part':part,'partNumber':part,'model':m[1],'capacity':m[2],'color':m[3],'title':r['product_name'],'url':'https://www.apple.com/us/xc/product/'+part}
  bucket=at//3600000*3600000;b=buckets.setdefault((bucket,r['store_number'],part),{'checks':0,'hits':0,'unknown':0,'pending':0,'lastHit':0,'samples':[]})
  b['checks']+=1;b['hits']+=code=='1';b['unknown']+=code=='U';b['pending']+=code=='P';b['lastHit']=at if code=='1' else b['lastHit'];b['samples'].append([at-bucket,code]);quote_count+=code=='P' and bool(r['message'])
  target=(r['store_number'],part);prev=last.get(target);gap=True
  if prev:
   marks=pauses[r['session_id']];i=bisect.bisect_right(marks,prev['at']);interrupted=i<len(marks) and marks[i]<=at
   gap=prev['session']!=r['session_id'] or prev['code'] in ('U','P') or at-prev['at']>max(120000,prev['next']*2000) or interrupted
  if code=='1' and (not prev or prev['code']!='1' or gap) or prev and prev['code']=='1' and code!='1':
   kind='first_or_recovered' if code=='1' and gap else 'candidate_restock' if code=='1' and prev['code']=='0' else 'became_available' if code=='1' else 'state_change'
   ident=hashlib.sha256(f'legacy_ca|{target}|{at}|{code}'.encode()).hexdigest()[:24]
   events.append({'id':'legacy_ca-'+ident,'ts':at,'store':target[0],'part':part,'state':code,'kind':kind,'source':'legacy_ca'})
  last[target]={'at':at,'code':code,'session':r['session_id'],'next':r['next_check_in_secs']}
 c.rollback();c.close()
 totals={k:sum(b[k] for b in buckets.values()) for k in ['checks','hits','unknown','pending']}
 manifest={'source':'legacy_ca','label':'Early California monitoring','before':before,'startedAt':first,'endedAt':end,'stores':len({k[1] for k in buckets}),'products':list(products.values()),'recordedCycles':len(cycles),'hourlyRows':len(buckets),'events':len(events),**totals,'pendingQuotesPresent':quote_count}
 return buckets,events,manifest

def quote(value):return 'NULL' if value is None else str(value) if isinstance(value,(int,float)) else "'"+str(value).replace("'","''")+"'"
def make_sql(buckets,events,manifest):
 lines=[];values=[]
 for (bucket,store,part),b in sorted(buckets.items()):
  values.append('('+','.join(map(quote,['legacy_ca',bucket,store,part,b['checks'],b['hits'],b['unknown'],b['pending'],b['lastHit'],json.dumps(b['samples'],separators=(',',':'))]))+')')
 for i in range(0,len(values),40):lines.append('INSERT INTO legacy_hourly(source,bucket,store,part,checks,hits,unknown,pending,last_hit,samples) VALUES '+','.join(values[i:i+40])+' ON CONFLICT(source,store,part,bucket) DO NOTHING;')
 for i in range(0,len(events),40):
  batch=events[i:i+40];lines.append('INSERT OR IGNORE INTO stock_events(id,ts,store,part,state,kind,source) VALUES '+','.join('('+','.join(map(quote,[e[k] for k in ['id','ts','store','part','state','kind','source']]))+')' for e in batch)+';')
 lines.append('INSERT INTO metadata(key,value) VALUES(\'legacy_ca\','+quote(json.dumps(manifest,separators=(',',':')))+') ON CONFLICT(key) DO UPDATE SET value=excluded.value;')
 return '\n'.join(lines)+'\n'
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=pathlib.Path);p.add_argument('--before',required=True,type=int);p.add_argument('--output',required=True,type=pathlib.Path);args=p.parse_args()
 volume=plistlib.loads(subprocess.check_output(['/usr/sbin/diskutil','info','-plist','/Volumes/StudioSSD']))
 if volume.get('VolumeUUID')!='9D5FE511-B66C-4765-BB8F-61E5ACB3969D':raise SystemExit('StudioSSD identity mismatch')
 if not str(args.output.resolve()).startswith('/Volumes/StudioSSD/Developer/BuildScratch/'):raise SystemExit('Output must be under StudioSSD BuildScratch')
 root=pathlib.Path(__file__).resolve().parent.parent;buckets,events,manifest=export(args.source,root,args.before)
 args.output.write_text(make_sql(buckets,events,manifest));args.output.with_suffix('.summary.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({k:v for k,v in manifest.items() if k!='products'},ensure_ascii=False))
