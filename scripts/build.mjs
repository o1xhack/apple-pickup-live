import {build} from 'esbuild';
import {cp,mkdir,access} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await mkdir('dist/data',{recursive:true});
for(const name of ['us-stores.json','products.json','zip-index.json','metadata.json','us-states-topology.json','LICENSE-geonames.txt','NOTICE-upstream.txt'])await cp('data/'+name,'dist/data/'+name);
await cp('shared/model.js','dist/model.js');
await cp('shared/daily.js','dist/daily.js');

await build({entryPoints:['public/app.js'],bundle:true,format:'esm',target:'es2022',outfile:'dist/app.js',minify:true});

try{await access('state.local/public-history/assets');await cp('state.local/public-history/assets','dist/data/history',{recursive:true})}catch(error){if(error.code!=='ENOENT')throw error}
