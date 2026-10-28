import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchNodePath} from './node-runtime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const xml=String(execFileSync('/usr/sbin/diskutil',['info','-plist','/Volumes/StudioSSD']));
if(!xml.includes('9D5FE511-B66C-4765-BB8F-61E5ACB3969D'))throw Error('StudioSSD identity mismatch');
if(!root.startsWith('/Volumes/StudioSSD/'))throw Error('Collector must run on StudioSSD');
if(!existsSync(resolve(root,'.env.local')))throw Error('Configure .env.local before installing');
const label='com.o1xhack.apple-pickup-live.collector',domain=`gui/${process.getuid()}`;
const p=resolve(homedir(),'Library/LaunchAgents',label+'.plist');mkdirSync(dirname(p),{recursive:true});mkdirSync(resolve(root,'state.local'),{recursive:true});
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
writeFileSync(p,`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${escape(launchNodePath())}</string><string>${escape(root+'/collector/runner.mjs')}</string></array><key>WorkingDirectory</key><string>${escape(root)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>60</integer><key>StandardOutPath</key><string>${escape(root+'/state.local/service.log')}</string><key>StandardErrorPath</key><string>${escape(root+'/state.local/service-error.log')}</string></dict></plist>`);
try{execFileSync('launchctl',['bootout',domain,p],{stdio:'ignore'})}catch{}
execFileSync('launchctl',['bootstrap',domain,p]);console.log('Installed independent collector:',label);
