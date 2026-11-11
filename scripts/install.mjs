#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const SKILLS=['walkthrough','reverse-design','code-map','review-quiz','xkcd'];
export async function installSuite({destination=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'skills'),skills=SKILLS,dependencies=true}={}){
  if(!skills.length||skills.some(skill=>!SKILLS.includes(skill)))throw Error('Unknown skill selection');
  const selected=['code-unpacked-core',...new Set(skills)];
  for(const skill of selected){try{await access(path.join(destination,skill));throw Error(`Destination already exists: ${path.join(destination,skill)}. Back up/remove it explicitly before reinstalling.`);}catch(error){if(error.code!=='ENOENT')throw error;}}
  await mkdir(destination,{recursive:true});
  for(const skill of selected)await cp(path.join(root,'skills',skill),path.join(destination,skill),{recursive:true,filter:source=>!source.split(path.sep).some(part=>['node_modules','.code-unpacked','.gitkeep'].includes(part))});
  if(dependencies)await new Promise((resolve,reject)=>{const child=spawn(process.platform==='win32'?'npm.cmd':'npm',['install','--omit=dev','--ignore-scripts','--no-package-lock'],{cwd:path.join(destination,'code-unpacked-core'),stdio:'inherit',shell:process.platform==='win32',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Dependencies failed to install; files remain installed. Run npm install in code-unpacked-core.')));});
  return selected.map(skill=>path.join(destination,skill));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),destination=args.includes('--dest')?args[args.indexOf('--dest')+1]:undefined,skills=args.includes('--skill')?args[args.indexOf('--skill')+1].split(','):undefined;
  installSuite({destination,skills,dependencies:!args.includes('--no-deps')}).then(paths=>console.log(paths.join('\n'))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
