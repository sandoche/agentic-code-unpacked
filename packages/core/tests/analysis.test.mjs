import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStructure, validateAnalysis } from '../scripts/analysis.mjs';
import { highlightCode } from '../scripts/highlight.mjs';
const context=()=>({schemaVersion:2,target:{kind:'pr',number:1,repo:'a/b'},source:{head:'a'.repeat(40)},files:[
{id:'a',path:'a.js',status:'modified',hunks:[],content:'import { work as execute } from "./b";\nexport function start(){return execute();}\n'},
{id:'b',path:'b.js',status:'context',role:'context',hunks:[],content:'export function work(){ return 42; }\n'}],evidence:[{id:'a-head',fileId:'a',startLine:1,endLine:2,side:'head'},{id:'b-head',fileId:'b',startLine:1,endLine:1,side:'head'}],limitations:[],relationships:[]});
test('extracts import aliases and real calls with source-backed endpoints',async()=>{const c=await analyzeStructure(context());const start=c.symbols.find(s=>s.name==='start'),work=c.symbols.find(s=>s.name==='work');assert.ok(start&&work);assert.ok(c.relationships.some(e=>e.kind==='calls'&&e.fromSymbolId===start.id&&e.toSymbolId===work.id&&e.evidenceIds.length===2));assert.ok(c.relationships.some(e=>e.kind==='imports'));assert.deepEqual(c,await analyzeStructure(context()));});
test('TypeScript generics and assertions preserve structure and clear stale parser gaps',async()=>{
  for(const extension of ['ts','mts','cts']){
    const c=context();c.files=[{id:'typed',path:`typed.${extension}`,status:'modified',hunks:[],content:'export function identity<T>(value: T): T { return <T>value; }\n'}];
    c.evidence=[{id:'typed-head',fileId:'typed',startLine:1,endLine:1,side:'head'}];c.limitations=[`typed.${extension}: parser diagnostics; structure omitted`,'Independent coverage gap'];
    const result=await analyzeStructure(c);
    assert.ok(result.symbols.some(symbol=>symbol.name==='identity'),`${extension} declaration must be extracted`);
    assert.deepEqual(result.limitations,['Independent coverage gap']);
    assert.deepEqual(result,await analyzeStructure(result),'re-extraction keeps stable evidence IDs');
  }
});
test('dynamic calls remain unresolved and stale graph edges cannot override source',async()=>{const c=context();c.files[0].content='export function start(fn){ fn(); }\n';c.evidence[0].endLine=1;const result=await analyzeStructure(c);assert.ok(result.unresolved.some(e=>e.expression==='fn'));assert.ok(!result.relationships.some(e=>e.kind==='calls'));});
test('PHP alias resolves the named class rather than a same-name local class',async()=>{const c=context();c.files=[{id:'p',path:'Api.php',status:'modified',hunks:[],content:'<?php namespace App; use Vendor\\Tag as EvernoteTag; class Api { function create(){ return new EvernoteTag(); } }'},{id:'t',path:'Tag.php',status:'context',hunks:[],content:'<?php namespace Vendor; class Tag {}'},{id:'x',path:'Other.php',status:'context',hunks:[],content:'<?php namespace App; class Tag {}'}];c.evidence=c.files.map(f=>({id:f.id+'-head',fileId:f.id,startLine:1,endLine:1,side:'head'}));const result=await analyzeStructure(c);assert.ok(result.relationships.some(e=>e.kind==='constructs'&&e.fromFileId==='p'&&e.toFileId==='t'));assert.ok(!result.relationships.some(e=>e.kind==='constructs'&&e.toFileId==='x'));});
test('analysis accounts for each changed file and rejects ungrounded claims',()=>{const c=context(),a={schemaVersion:2,title:'Change',summary:'Start invokes work',evidenceIds:['a-head'],topics:[{id:'flow',title:'Flow',summary:'Invokes work',evidenceIds:['a-head'],reviewFocus:[{text:'Check return',evidenceIds:['a-head']}],extensionPoints:[]}],flows:[],fileCoverage:[{fileId:'a',role:'substantive',topicIds:['flow'],reason:'Entry point'}],limitations:[]};assert.equal(validateAnalysis(c,a),a);assert.throws(()=>validateAnalysis(c,{...a,fileCoverage:[]}),/coverage/i);assert.throws(()=>validateAnalysis(c,{...a,topics:[{...a.topics[0],evidenceIds:['missing']}]}),/evidence/i);});
test('highlighting embeds escaped tokens and handles unknown languages',async()=>{const html=await highlightCode('<script>alert("x")</script>',{path:'a.html',startLine:4,focusLines:[4]});assert.ok(!html.includes('<script>'));assert.match(html,/class="line/);assert.match(html,/data-line="4"/);assert.match(html,/style=/);assert.match(await highlightCode('<unsafe>',{path:'file.unknown'}),/&lt;unsafe&gt;/);});

test('shadowed imports cannot create false call edges',async()=>{const c=context();c.files[0].content='import {work as execute} from "./b";\nexport function start(execute){return execute();}';const result=await analyzeStructure(c);assert.ok(!result.relationships.some(e=>e.kind==='calls'));});
test('structure validation rejects fabricated symbol and endpoint evidence',async()=>{const c=await analyzeStructure(context());c.symbols[0].fileId='missing';assert.throws(()=>validateAnalysis(c,{schemaVersion:2}),/symbol/i);});

test('a function in a sibling lexical scope is not a callee',async()=>{const c=context();c.files[0].content='function outer(){ function hidden(){} }\nexport function start(){hidden();}';const result=await analyzeStructure(c);assert.ok(!result.relationships.some(e=>e.kind==='calls'&&e.label.includes('hidden')));assert.ok(result.unresolved.some(e=>e.expression==='hidden'));});
