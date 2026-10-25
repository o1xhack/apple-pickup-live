import {cp,readFile,writeFile,rm} from 'node:fs/promises';
await cp('dist','pages-dist',{recursive:true});
for(const name of ['_worker.js','_routes.json'])await rm('pages-dist/'+name,{force:true});
let html=await readFile('pages-dist/index.html','utf8');html=html.replace('</head>','<script>globalThis.APP_API_ORIGIN="https://apple-pickup-live.o1xhack.workers.dev";</script></head>');await writeFile('pages-dist/index.html',html);
await writeFile('pages-dist/_redirects',['info','latest','checkpoint','series','history'].map(name=>`/api/${name} https://apple-pickup-live.o1xhack.workers.dev/api/${name} 302`).join('\n')+'\n');
