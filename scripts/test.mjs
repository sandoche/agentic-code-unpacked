import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function find(dir){const output=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='node_modules')continue;const file=path.join(dir,entry.name);if(entry.isDirectory())output.push(...await find(file));else if(entry.name.endsWith('.test.mjs'))output.push(file);}return output;}
const files=[...await find(path.join(root,'skills')),...await find(path.join(root,'tests')).catch(()=>[])].sort();
if(!files.length)throw Error('No tests found');
const child=spawn(process.execPath,['--test','--test-concurrency=3',...files],{cwd:root,stdio:'inherit',windowsHide:true});child.on('exit',code=>{process.exitCode=code??1;});
