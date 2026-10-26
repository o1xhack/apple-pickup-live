import {cpSync,rmSync,existsSync} from 'node:fs';
if(!existsSync('pages-dist/index.html'))throw Error('No deployed website shell');
rmSync('state.local/released-site',{recursive:true,force:true});cpSync('pages-dist','state.local/released-site',{recursive:true});console.log('Saved released website shell for data-only publication');
