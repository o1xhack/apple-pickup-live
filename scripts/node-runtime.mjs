import {existsSync,realpathSync} from 'node:fs';

// launchd must follow Homebrew's stable symlink after upgrades remove a keg.
export function launchNodePath(executable=process.execPath,{exists=existsSync,realpath=realpathSync}={}){
 const match=executable.match(/^(.*)\/Cellar\/(node(?:@\d+)?)\/[^/]+\/bin\/node$/);
 if(!match)return executable;
 const [,prefix,formula]=match;
 const stable=formula==='node'?`${prefix}/bin/node`:`${prefix}/opt/${formula}/bin/node`;
 if(!exists(stable)||realpath(stable)!==realpath(executable))throw Error('Stable Node runtime is unavailable; repair Homebrew before installing background services');
 return stable;
}
