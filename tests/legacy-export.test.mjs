import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('legacy export excludes other countries and post-launch rows; replay is idempotent',()=>{
 const script=String.raw`
import importlib.util,json,pathlib,sqlite3,tempfile
root=pathlib.Path.cwd();spec=importlib.util.spec_from_file_location('exporter',root/'scripts/export-legacy-ca.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as tmp:
 path=pathlib.Path(tmp)/'small-fixture.sqlite3';db=sqlite3.connect(path)
 db.executescript('CREATE TABLE targets(target_key TEXT,locale TEXT,store_number TEXT,part_number TEXT,product_name TEXT);CREATE TABLE cycles(id INTEGER,session_id INTEGER,next_check_in_secs INTEGER);CREATE TABLE events(session_id INTEGER,occurred_at_ms INTEGER,kind TEXT);CREATE TABLE observations(cycle_id INTEGER,target_key TEXT,checked_at_ms INTEGER,availability TEXT,reason TEXT,message TEXT);')
 ca=next(s['id'] for s in json.loads((root/'data/us-stores.json').read_text()) if s['stateCode']=='CA')
 for key,locale in [('us','en_US'),('cn','zh_CN')]:db.execute('INSERT INTO targets VALUES(?,?,?,?,?)',(key,locale,ca,'MK1E4LL/A','iPhone Duo 256GB Star White'))
 for i,(at,key,state) in enumerate([(1000,'us','out_of_stock'),(61000,'us','in_stock'),(121000,'us','in_stock'),(500,'cn','in_stock'),(200000,'us','in_stock')]):
  db.execute('INSERT INTO cycles VALUES(?,?,?)',(i,1,60));db.execute('INSERT INTO observations VALUES(?,?,?,?,?,?)',(i,key,at,state,None,'private message must not be exported'))
 db.execute('INSERT INTO targets VALUES(?,?,?,?,?)',('other','en_US',ca,'OLD','iPhone 18 Pro Max 1TB Burgundy'));db.execute('INSERT INTO observations VALUES(?,?,?,?,?,?)',(1,'other',61000,'in_stock',None,'private'));db.commit();db.close();b,e,meta=m.export(path,root,150000);sql=m.make_sql(b,e,meta)
 assert meta['checks']==3 and meta['hits']==2 and len(e)==1 and e[0]['kind']=='candidate_restock'
 assert 'private message' not in sql
 out=sqlite3.connect(':memory:');out.executescript((root/'migrations/0001_init.sql').read_text());out.executescript((root/'migrations/0002_legacy_ca.sql').read_text());out.executescript(sql);out.executescript(sql)
 assert out.execute('SELECT sum(checks),sum(hits) FROM legacy_hourly').fetchone()==(3,2)
 assert out.execute("SELECT count(*) FROM stock_events WHERE source='legacy_ca'").fetchone()[0]==1
 print('verified')
`;
 assert.equal(execFileSync('python3',['-c',script],{encoding:'utf8'}).trim(),'verified');
});
