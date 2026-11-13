#!/usr/bin/env node
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { hash, parseArgs, parseTarget, captureLocal, capturePr, capturePinnedPr, addContextFiles, expandImports, readJson, writeJson, outputDirectory, validateContext, validateUploads, makeComment, deliveryArtifacts, option, run } from './core.mjs';
import { analyzeStructure, validateAnalysis } from './analysis.mjs';
import { decodePrMetadata, decodeManifest } from './decode.mjs';
import { record, isRecord, list, text, number, present, message } from './values.mjs';

async function main(): Promise<void> {
  const [command,...args]=process.argv.slice(2),{options}=parseArgs(args);
  if(command==='collect'){
    const root=path.resolve(option(options,'root')||process.cwd()),target=parseTarget(args),metadata=option(options,'metadata');
    let context=target.kind==='pr'?(metadata?await capturePinnedPr(target,decodePrMetadata(await readJson(metadata)),root):await capturePr(target,{root})):await captureLocal(target,root);
    context=await expandImports(context,root);
    const contextFiles=option(options,'context-files');
    if(contextFiles)context=await addContextFiles(context,root,contextFiles.split(','));
    context=await analyzeStructure(context);
    const dir=outputDirectory(root,target,'context');await writeJson(path.join(dir,'context.json'),context);console.log(path.join(dir,'context.json'));return;
  }
  if(command==='analyze'){
    const contextFile=option(options,'context'),contentFile=option(options,'content');
    if(!contextFile||!contentFile)throw Error('analyze requires --context FILE --content analysis.json');
    const context=validateContext(await readJson(contextFile));context.analysis=validateAnalysis(context,await readJson(contentFile));
    await writeJson(contextFile,context);await writeJson(path.join(path.dirname(contextFile),'analysis.json'),context.analysis);console.log(contextFile);return;
  }
  if(command==='validate'){validateContext(await readJson(present(args[0],'context file')));console.log('Context valid');return;}
  if(command==='comment'){
    const context=validateContext(await readJson(present(option(options,'context'),'context file'))),skill=present(option(options,'skill'),'skill'),dir=outputDirectory(option(options,'root')||process.cwd(),context.target,skill);
    const manifest=decodeManifest(await readJson(path.join(dir,'manifest.json')));
    const saved=await readJson(path.join(dir,'comment-content.json')).then(value=>record(value)).catch((): Record<string,unknown>=>({}));
    const summary=option(options,'summary')||(typeof saved.summary==='string'?saved.summary:'')||`Explore this ${skill} artifact.`,markdown=typeof saved.markdown==='string'?saved.markdown:'';
    const publishable=new Set(deliveryArtifacts(manifest.artifacts.map(item=>item.path))),attachments=manifest.artifacts.filter(item=>publishable.has(item.path));
    let comment=makeComment({skill,context,summary,markdown,attachments:attachments.map(item=>item.path)});
    if(options.publish){
      const attachmentFile=option(options,'attachments');
      if(!attachmentFile)throw Error('Publishing HTML requires completed browser uploads. Supply --attachments <JSON mapping local paths to actual GitHub attachment URLs>, or use --draft. No comment was posted.');
      const uploaded=validateUploads(attachments,await readJson(attachmentFile));
      if(manifest.inputs.contextHash!==hash(JSON.stringify(context)))throw Error('Source context changed since rendering; regenerate before publishing');
      const links=attachments.map(item=>/\.png$/.test(item.path)?`![${skill}](${uploaded[item.path]})`:`[Download ${item.path}](${uploaded[item.path]})`).join('\n\n');
      comment=makeComment({skill,context,summary,markdown,maxLength:60000-links.length-2})+'\n'+links+'\n';
      if(context.target.kind!=='pr')throw Error('Comments require a PR target');
      const endpoint=`repos/${context.target.repo}/issues/${context.target.number}/comments`;
      const comments=list(JSON.parse(await run('gh',['api','--paginate','--slurp',endpoint]))).flatMap(group=>list(group)).map(item=>record(item));
      const marker=`<!-- code-unpacked:${skill} -->`,me=text(record(JSON.parse(await run('gh',['api','user']))).login,'GitHub login');
      const previous=comments.find(item=>isRecord(item.user)&&item.user.login===me&&typeof item.body==='string'&&item.body.trimStart().startsWith(marker));
      const bodyFile=path.join(dir,'comment.md');await writeFile(bodyFile,comment);
      const payload=path.join(dir,'comment-payload.json');await writeJson(payload,{body:comment});
      const result=record(JSON.parse(await run('gh',['api','--method',previous?'PATCH':'POST',previous?`repos/${context.target.repo}/issues/comments/${number(previous.id)}`:endpoint,'--input',payload])));
      const url=text(result.html_url,'comment URL');
      manifest.delivery={status:'posted',commentId:number(result.id,'comment ID'),url,attachments:uploaded};
      const commentArtifact=manifest.artifacts.find(item=>item.path==='comment.md');
      if(commentArtifact){const bytes=await readFile(bodyFile);commentArtifact.sha256=hash(bytes);commentArtifact.bytes=bytes.length;}
      await writeJson(path.join(dir,'manifest.json'),manifest);console.log(url);return;
    }
    await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'comment.md'),comment);console.log(path.join(dir,'comment.md'));return;
  }
  console.log('Usage: code-unpacked.mjs collect <pr|branch|codebase|docs> ... [--root DIR]\n       code-unpacked.mjs validate CONTEXT\n       code-unpacked.mjs comment --context FILE --skill NAME [--draft|--publish --attachments JSON]');
}
main().catch((error: unknown)=>{console.error(message(error));process.exitCode=1;});
