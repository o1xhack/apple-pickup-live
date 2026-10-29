import {cp,readFile,writeFile,rm} from 'node:fs/promises';
import {mergeRedirects} from './pages-redirects.mjs';
await cp('dist','pages-dist',{recursive:true});
for(const name of ['_worker.js','_routes.json'])await rm('pages-dist/'+name,{force:true});
let html=await readFile('pages-dist/index.html','utf8');html=html.replace('</head>','<script>globalThis.APP_API_ORIGIN="https://apple-pickup-live.o1xhack.workers.dev";</script></head>');await writeFile('pages-dist/index.html',html);
let existing='';try{existing=await readFile('pages-dist/_redirects','utf8')}catch(error){if(error.code!=='ENOENT')throw error}
await writeFile('pages-dist/_redirects',mergeRedirects(existing));
