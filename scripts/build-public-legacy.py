#!/usr/bin/env python3
import argparse,importlib.util,pathlib,json,gzip,hashlib,plistlib,subprocess
p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--source',default=str(pathlib.Path.home()/'Library/Application Support/apple-pickup-watcher/inventory-history.sqlite3'));a=p.parse_args()
volume=plistlib.loads(subprocess.check_output(['/usr/sbin/diskutil','info','-plist','/Volumes/StudioSSD']))
if volume.get('VolumeUUID')!='9D5FE511-B66C-4765-BB8F-61E5ACB3969D':raise SystemExit('StudioSSD identity mismatch')
root=pathlib.Path(__file__).resolve().parent.parent;out=pathlib.Path(a.output).resolve()
if not str(out).startswith('/Volumes/StudioSSD/'):raise SystemExit('Output must be on StudioSSD')
spec=importlib.util.spec_from_file_location('exporter',root/'scripts/export-legacy-ca.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
buckets,events,manifest=module.export(pathlib.Path(a.source),root,json.loads((root/'data/site-info.json').read_text())['startedAt'])
parts={p['part']for p in json.loads((root/'data/products.json').read_text())}
if any(k[2]not in parts for k in buckets):raise SystemExit('Historical catalog mismatch')
rows=[[bucket,store,part,b['checks'],b['hits'],b['unknown'],b['pending'],b['lastHit'],b['samples']]for (bucket,store,part),b in sorted(buckets.items())]
payload=gzip.compress(json.dumps({'schemaVersion':1,'metadata':manifest,'buckets':rows,'events':events},separators=(',',':')).encode(),mtime=0)
name='legacy-'+hashlib.sha256(payload).hexdigest()[:16]+'.json.gz';(out/'assets').mkdir(parents=True,exist_ok=True);(out/'assets'/name).write_bytes(payload)
(out/'legacy.json').write_text(json.dumps({'path':'/data/history/'+name,'checks':manifest['checks'],'hits':manifest['hits'],'bytes':len(payload)}))
print(json.dumps({'checks':manifest['checks'],'hits':manifest['hits'],'bytes':len(payload)}))
