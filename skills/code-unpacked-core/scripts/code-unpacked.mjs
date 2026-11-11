#!/usr/bin/env node
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { hash, parseArgs, parseTarget, captureLocal, capturePr, capturePinnedPr, readJson, writeJson, outputDirectory, validateContext, validateUploads, makeComment } from './core.mjs';

async function main(){
  const [command,...args]=process.argv.slice(2);const {options}=parseArgs(args);
  if(command==='collect'){
    const root=path.resolve(options.root||process.cwd()),target=parseTarget(args);
    const context=target.kind==='pr'?(options.metadata?await capturePinnedPr(target,await readJson(options.metadata),root):await capturePr(target,{root})):await captureLocal(target,root);
    const dir=outputDirectory(root,target,'context');await writeJson(path.join(dir,'context.json'),context);console.log(path.join(dir,'context.json'));return;
  }
  if(command==='validate'){validateContext(await readJson(args[0]));console.log('Context valid');return;}
  if(command==='comment'){
    const context=validateContext(await readJson(options.context));const skill=options.skill,dir=outputDirectory(options.root||process.cwd(),context.target,skill);
    const manifest=await readJson(path.join(dir,'manifest.json'));const saved=await readJson(path.join(dir,'comment-content.json')).catch(()=>({}));const summary=options.summary||saved.summary||`Explore this ${skill} artifact.`;const markdown=saved.markdown||'';
    const attachments=manifest.artifacts.filter(a=>/\.(html|png|mp4|zip)$/.test(a.path));
    let comment=makeComment({skill,context,summary,markdown,attachments:attachments.map(a=>a.path)});
    if(options.publish){
      if(!options.attachments)throw Error('Publishing HTML requires completed browser uploads. Supply --attachments <JSON mapping local paths to actual GitHub attachment URLs>, or use --draft. No comment was posted.');
      const uploaded=validateUploads(attachments,await readJson(options.attachments));
      if(manifest.inputs.contextHash!==hash(JSON.stringify(context)))throw Error('Source context changed since rendering; regenerate before publishing');
      comment=makeComment({skill,context,summary,markdown})+'\n'+attachments.map(a=>/\.png$/.test(a.path)?`![${skill}](${uploaded[a.path]})`:`[Download ${a.path}](${uploaded[a.path]})`).join('\n\n')+'\n';
      const {run}=await import('./core.mjs');const endpoint=`repos/${context.target.repo}/issues/${context.target.number}/comments`;
      if(context.target.kind!=='pr')throw Error('Comments require a PR target');
      const comments=JSON.parse(await run('gh',['api','--paginate','--slurp',endpoint]));const marker=`<!-- code-unpacked:${skill} -->`;
      const me=JSON.parse(await run('gh',['api','user'])).login;
      const previous=comments.flat().find(c=>c.user?.login===me&&c.body?.trimStart().startsWith(marker));
      const bodyFile=path.join(dir,'comment.md');await writeFile(bodyFile,comment);
      const payload=path.join(dir,'comment-payload.json');await writeJson(payload,{body:comment});
      const result=JSON.parse(await run('gh',['api','--method',previous?'PATCH':'POST',previous?`repos/${context.target.repo}/issues/comments/${previous.id}`:endpoint,'--input',payload]));
      manifest.delivery={status:'posted',commentId:result.id,url:result.html_url,attachments:uploaded};const commentArtifact=manifest.artifacts.find(item=>item.path==='comment.md');if(commentArtifact){const bytes=await readFile(bodyFile);commentArtifact.sha256=hash(bytes);commentArtifact.bytes=bytes.length;}await writeJson(path.join(dir,'manifest.json'),manifest);console.log(result.html_url);return;
    }
    await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'comment.md'),comment);console.log(path.join(dir,'comment.md'));return;
  }
  console.log('Usage: code-unpacked.mjs collect <pr|branch|codebase|docs> ... [--root DIR]\n       code-unpacked.mjs validate CONTEXT\n       code-unpacked.mjs comment --context FILE --skill NAME [--draft|--publish --attachments JSON]');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
