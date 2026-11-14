import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { ROOT } from '../scripts/build-skills.mjs';
import { loadBrowser } from '../packages/core/scripts/core.mjs';
import { inventorySchema } from '../website/src/lib/examples.ts';
import { checkHomepage } from './helpers/homepage.mjs';
import { checkRealExamples } from './helpers/real-examples.mjs';
const run=promisify(execFile);
test('real viewer inventory rejects broken references and validates committed snapshots',async()=>{
 const inventory=JSON.parse(await readFile(path.join(ROOT,'website/examples/provenance.json'),'utf8'));
 assert.equal(inventorySchema.safeParse(inventory).success,true);
 assert.equal(inventorySchema.safeParse({...inventory,examples:[...inventory.examples,inventory.examples[0]]}).success,false);
 assert.equal(inventorySchema.safeParse({...inventory,examples:[{...inventory.examples[0],run:'missing'}]}).success,false);
 await run(process.execPath,[path.join(ROOT,'website/scripts/validate-examples.mjs')],{cwd:ROOT,windowsHide:true});
});
test('production site exposes real viewers, source-backed articles, mobile layouts and complete social metadata',{timeout:300000},async()=>{
 const cache=path.join(ROOT,'website/node_modules/.cache');await mkdir(cache,{recursive:true});
 const directory=await mkdtemp(path.join(cache,'code-unpacked-website-'));
 const output=path.join(directory,'site');let browser,server;
 try{
  await run(process.execPath,[path.join(ROOT,'website/node_modules/astro/bin/astro.mjs'),'build','--outDir',output],{cwd:path.join(ROOT,'website'),env:{...process.env,CONTEXT:'production',DEPLOY_PRIME_URL:'https://preview.example.test'},windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain'};
  server=createServer(async(request,response)=>{try{
   const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
   const file=path.resolve(output,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
   const relative=path.relative(output,file);
   if(relative.startsWith('..')||path.isAbsolute(relative)){response.writeHead(403).end();return;}
   response.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});response.end(await readFile(file));
  }catch{response.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  browser=await loadBrowser();await checkHomepage(browser,'http://127.0.0.1:'+address.port);
  await checkRealExamples(browser,'http://127.0.0.1:'+address.port);
 }finally{
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
  assert.ok(path.resolve(directory).startsWith(path.resolve(cache)+path.sep));
  await rm(directory,{recursive:true,force:true});
 }
});

test('preview metadata uses the deploy origin for sharing images while preserving production canonicals',{timeout:180000},async()=>{
 const cache=path.join(ROOT,'website/node_modules/.cache');await mkdir(cache,{recursive:true});
 const output=await mkdtemp(path.join(cache,'preview-metadata-'));
 try{
  await run(process.execPath,[path.join(ROOT,'website/node_modules/astro/bin/astro.mjs'),'build','--outDir',output],{cwd:path.join(ROOT,'website'),env:{...process.env,CONTEXT:'deploy-preview',DEPLOY_PRIME_URL:'https://preview.example.test'},windowsHide:true,timeout:120000,maxBuffer:4*1024*1024});
  const routes=['/','/showcase/','/showcase/react-compiler/','/showcase/vue-vapor/','/showcase/silk-gzip/'];
  for(const route of routes){
   const html=await readFile(path.join(output,route.slice(1),'index.html'),'utf8');
   const og=html.match(/property="og:image" content="([^"]+)"/);
   const twitter=html.match(/name="twitter:image" content="([^"]+)"/);
   const canonical=html.match(/rel="canonical" href="([^"]+)"/);
   assert.ok(og&&twitter&&canonical);
   assert.equal(new URL(og[1]).origin,'https://preview.example.test');assert.equal(twitter[1],og[1]);
   assert.match(og[1],/-v2\.jpg$/);
   assert.match(html,/property="og:image:type" content="image\/jpeg"/);
   assert.equal(canonical[1],'https://codeunpacked.san.cx'+route);
   assert.match(html,/name="robots" content="noindex, nofollow"/);
  }
  assert.match(await readFile(path.join(output,'robots.txt'),'utf8'),/Disallow: \//);
 }finally{
  assert.ok(path.resolve(output).startsWith(path.resolve(cache)+path.sep));await rm(output,{recursive:true,force:true});
 }
});
