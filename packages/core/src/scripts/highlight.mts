import { importDependency } from './dependencies.mjs';
const { codeToTokens, bundledLanguages } = await importDependency('shiki');
import { escapeHtml } from './core.mjs';
import type { BundledLanguage } from 'shiki';

interface HighlightOptions { path?: string; language?: string; startLine?: number; focusLines?: number[] }
function isLanguage(value: string): value is BundledLanguage { return Object.hasOwn(bundledLanguages, value); }

const extensions: Record<string, string | undefined>={js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'jsx',ts:'typescript',tsx:'tsx',php:'php',json:'json',yml:'yaml',yaml:'yaml',md:'markdown',html:'html',css:'css',scss:'scss',sh:'bash',sql:'sql',xml:'xml',py:'python',go:'go',rs:'rust',dockerfile:'dockerfile'};
export const highlightCss='.source-code{counter-reset:line;overflow:auto;white-space:pre;tab-size:2}.source-code .line{display:block;min-height:1.55em}.source-code .line:before{content:attr(data-line);display:inline-block;min-width:3.5em;padding-right:1em;color:#8291a8;user-select:none}.source-code .focus{background:#83d4ba18;border-left:3px solid #83d4ba}.source-code code{font:inherit}';
export async function highlightCode(text: unknown,{path='',language,startLine=1,focusLines=[]}: HighlightOptions={}): Promise<string>{
  const leaf=(path.split('/').pop() ?? '').toLowerCase(),ext=(leaf.includes('.')?leaf.split('.').pop():leaf) ?? '';
  const lang=language||extensions[ext];let lines: string[];
  if(lang&&isLanguage(lang)){
    const result=await codeToTokens(String(text),{lang,theme:'github-dark'});
    lines=result.tokens.map(tokens=>tokens.map(t=>`<span style="color:${escapeHtml(t.color||'#e9edf5')}">${escapeHtml(t.content)}</span>`).join(''));
  }else lines=String(text).split('\n').map(escapeHtml);
  const focus=new Set(focusLines);
  return `<pre class="source-code"><code>${lines.map((line,i)=>`<span class="line${focus.has(startLine+i)?' focus':''}" data-line="${startLine+i}">${line||' '}</span>`).join('')}</code></pre>`;
}
