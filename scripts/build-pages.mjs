import {cp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {mergeRedirects} from './pages-redirects.mjs';
await cp('dist','pages-dist',{recursive:true});
for(const name of ['_worker.js','_routes.json'])await rm('pages-dist/'+name,{force:true});
async function htmlFiles(dir){const files=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())files.push(...await htmlFiles(path));else if(entry.name.endsWith('.html'))files.push(path)}return files}
const snippet='<script>globalThis.APP_API_ORIGIN="https://apple-pickup-live.o1xhack.workers.dev";</script>';
for(const file of await htmlFiles('pages-dist')){let html=await readFile(file,'utf8');if(!html.includes('APP_API_ORIGIN')&&html.includes('</head>'))await writeFile(file,html.replace('</head>',snippet+'</head>'))}
let existing='';try{existing=await readFile('pages-dist/_redirects','utf8')}catch(error){if(error.code!=='ENOENT')throw error}
await writeFile('pages-dist/_redirects',mergeRedirects(existing));
