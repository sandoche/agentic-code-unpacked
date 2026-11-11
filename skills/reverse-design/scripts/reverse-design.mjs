import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  escapeHtml, parseArgs, outputDirectory, validateContext, resolveEvidence,
  assertEvidence, readJson, writeJson, renderShell, finishArtifact, renderMermaid, loadBrowser,
} from '../../code-unpacked-core/scripts/core.mjs';

export const FAMILIES = Object.freeze([
  'requirements', 'stories', 'user-flows', 'c4', 'data-model', 'sequences',
  'state-machines', 'api-contracts', 'deployment', 'threat-model', 'decisions',
]);
const familyTitles = {
  requirements: 'Requirements / PRD', stories: 'User stories and acceptance criteria',
  'user-flows': 'User flows', c4: 'C4 architecture', 'data-model': 'ERD / data model',
  sequences: 'Sequence diagrams', 'state-machines': 'State machines',
  'api-contracts': 'API contracts', deployment: 'Deployment',
  'threat-model': 'Threat model', decisions: 'Decision records',
};
const statuses = new Set(['generated', 'not-applicable', 'insufficient-evidence']);
const bases = new Set(['observed', 'inferred', 'proposed']);
const text = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw Error(`${label} must be non-empty text`); };
const array = (value, label) => { if (!Array.isArray(value)) throw Error(`${label} must be an array`); };
const identifier = (value, label) => { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) throw Error(`Invalid ${label}`); };
const evidence = (context, ids, required = true) => {
  array(ids, 'evidence');
  if (required) assertEvidence(context, ids); else for (const id of ids) resolveEvidence(context, id);
};

export function validateDesign(context, content) {
  validateContext(context);
  if (content?.schemaVersion !== 1) throw Error('Design schemaVersion must be 1');
  text(content.title, 'title'); text(content.summary, 'summary');
  evidence(context, content.summaryEvidence);
  array(content.coverage, 'coverage'); array(content.documents, 'documents');
  const coverage = new Map();
  for (const entry of content.coverage) {
    if (!FAMILIES.includes(entry.family)) throw Error(`Unknown coverage family: ${entry.family}`);
    if (coverage.has(entry.family)) throw Error(`Duplicate coverage family: ${entry.family}`);
    if (!statuses.has(entry.status)) throw Error(`Invalid coverage status: ${entry.status}`);
    text(entry.reason, 'coverage reason');
    evidence(context, entry.evidence, entry.status === 'generated');
    coverage.set(entry.family, entry);
  }
  if (coverage.size !== FAMILIES.length) throw Error('Coverage must account for all 11 document families');
  if (coverage.get('requirements').status !== 'generated') throw Error('An observed requirements overview is always required');
  const ids = new Set(), diagrams = new Set();
  for (const doc of content.documents) {
    identifier(doc.id, 'document id');
    if (ids.has(doc.id)) throw Error(`Duplicate document id: ${doc.id}`);
    ids.add(doc.id); text(doc.title, 'document title');
    if (coverage.get(doc.family)?.status !== 'generated') throw Error(`Document ${doc.id} must belong to a generated coverage family`);
    array(doc.sections, 'document sections');
    if (!doc.sections.length) throw Error(`Document ${doc.id} requires at least one section`);
    for (const section of doc.sections) {
      text(section.heading, 'section heading'); text(section.markdown, 'section markdown');
      if (!bases.has(section.basis)) throw Error(`Invalid section basis: ${section.basis}`);
      evidence(context, section.evidence);
    }
    if (doc.family === 'decisions') {
      const refs = doc.sections.flatMap(section => section.evidence).map(id => resolveEvidence(context, id));
      const recorded = refs.some(ref => /(?:^|\/)(?:adrs?|decisions?)(?:\/|[-_.])|(?:^|\/)architecture[-_]decision[-_]/i.test(ref.path));
      if ((!recorded || doc.sections.some(section => section.basis !== 'observed')) && !/reconstructed/i.test(doc.title)) {
        throw Error('Unrecorded or inferred decisions must be explicitly titled Reconstructed decision notes');
      }
    }
    if (doc.diagrams !== undefined) array(doc.diagrams, 'diagrams');
    for (const diagram of doc.diagrams || []) {
      identifier(diagram.id, 'diagram id');
      if (diagrams.has(diagram.id)) throw Error(`Duplicate diagram id: ${diagram.id}`);
      diagrams.add(diagram.id); text(diagram.title, 'diagram title'); text(diagram.mermaid, 'Mermaid diagram');
      evidence(context, diagram.evidence);
      if (/<\s*script|\bon\w+\s*=|(?:javascript|data):|^\s*click\s|%%\s*\{/im.test(diagram.mermaid)) {
        throw Error(`Unsafe Mermaid diagram: ${diagram.id}`);
      }
    }
  }
  for (const entry of content.coverage) {
    if (entry.status === 'generated' && !content.documents.some(doc => doc.family === entry.family)) throw Error(`Generated coverage family ${entry.family} requires a document`);
  }
  if (content.gaps !== undefined) array(content.gaps, 'gaps');
  for (const gap of content.gaps || []) {
    text(gap.question, 'gap question'); array(gap.affectedDocuments, 'affectedDocuments');
    for (const id of gap.affectedDocuments) if (!ids.has(id)) throw Error(`Unknown affected document: ${id}`);
    evidence(context, gap.evidence, false);
  }
  return content;
}

function inline(markdown) {
  const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let result = '', end = 0;
  for (const match of markdown.matchAll(pattern)) {
    result += escapeHtml(markdown.slice(end, match.index));
    if (match[1] !== undefined) result += `<code>${escapeHtml(match[1])}</code>`;
    else if (match[2] !== undefined) result += `<strong>${escapeHtml(match[2])}</strong>`;
    else if (/^(?:https?:\/\/|mailto:|#[a-z])/i.test(match[4])) result += `<a href="${escapeHtml(match[4])}" rel="noreferrer">${escapeHtml(match[3])}</a>`;
    else result += escapeHtml(match[0]);
    end = match.index + match[0].length;
  }
  return result + escapeHtml(markdown.slice(end));
}

// A deliberately small Markdown subset: source HTML is always text, never executable.
export function renderMarkdown(markdown) {
  const lines = String(markdown).replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  const cells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const level = Math.min(heading[1].length + 2, 6); blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(`<div class="table-scroll"><table><thead><tr>${head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${head.map((_, n) => `<td>${inline(row[n] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const bullet = /^\s*[-*]\s+/.test(line), ordered = /^\s*\d+\.\s+/.test(line);
    if (bullet || ordered) {
      const items = [], pattern = bullet ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (i < lines.length && pattern.test(lines[i])) items.push(`<li>${inline(pattern.exec(lines[i++])[1])}</li>`);
      const tag = bullet ? 'ul' : 'ol'; blocks.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,6}\s|\s*```|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(`<p>${inline(paragraph.join('\n')).replaceAll('\n', '<br>')}</p>`);
  }
  return blocks.join('\n');
}

function safeSourceUrl(url) { return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : undefined; }
function citations(context, ids) {
  return ids.map(id => {
    const ref = resolveEvidence(context, id), label = `${ref.path}:${ref.startLine}–${ref.endLine}`;
    const url = safeSourceUrl(ref.url);
    return url ? `<a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)} (local snapshot)</span>`;
  }).join(' · ');
}
function markdownSources(context, ids) {
  return ids.map(id => {
    const ref = resolveEvidence(context, id), label = `${ref.path}:${ref.startLine}–${ref.endLine}`.replaceAll('`', "'");
    const url = safeSourceUrl(ref.url);
    return url ? '[`' + label + '`](' + url.replaceAll(')', '%29').replaceAll('(', '%28') + ')' : '`' + label + '` (local snapshot)';
  }).join(' · ');
}
const labelBasis = basis => basis[0].toUpperCase() + basis.slice(1);
function documentMarkdown(context, doc) {
  const parts = [`# ${doc.title}`, `Document family: ${familyTitles[doc.family]}`];
  for (const section of doc.sections) parts.push(`## ${section.heading}\n\n**${labelBasis(section.basis)}**\n\n${section.markdown}\n\nSources: ${markdownSources(context, section.evidence)}`);
  for (const diagram of doc.diagrams || []) parts.push(`## ${diagram.title}\n\n` + '```mermaid\n' + diagram.mermaid + '\n```\n\nSources: ' + markdownSources(context, diagram.evidence));
  return parts.join('\n\n') + '\n';
}

export async function renderDesign(context, content, dir) {
  validateDesign(context, content);
  const css = await readFile(new URL('../assets/design.css', import.meta.url), 'utf8');
  const diagramSvgs = new Map();
  const sourceDiagrams = content.documents.flatMap(doc => doc.diagrams || []);
  // Render before writing: invalid diagrams do not replace an existing valid artifact.
  let browser;
  try {
    if (sourceDiagrams.length) browser = await loadBrowser();
    for (const diagram of sourceDiagrams) {
      try { diagramSvgs.set(diagram.id, await renderMermaid(diagram.mermaid, { browser })); }
      catch (error) { throw Error(`Cannot render Mermaid diagram ${diagram.id}: ${error.message}`); }
    }
  } finally {
    if (browser) await browser.close();
  }
  await mkdir(dir, { recursive: true });
  const outputs = ['index.html', 'design.json'];
  const nav = content.documents.map(doc => `<li><a href="#${doc.id}">${escapeHtml(doc.title)}</a></li>`).join('');
  const rows = FAMILIES.map(family => {
    const entry = content.coverage.find(item => item.family === family);
    return `<tr><th scope="row">${escapeHtml(familyTitles[family])}</th><td><span class="status ${entry.status}">${escapeHtml(entry.status)}</span></td><td>${escapeHtml(entry.reason)}${entry.evidence.length ? `<div class="sources">${citations(context, entry.evidence)}</div>` : ''}</td></tr>`;
  }).join('');
  const articles = [];
  for (const doc of content.documents) {
    const md = documentMarkdown(context, doc);
    await writeFile(path.join(dir, `${doc.id}.md`), md); outputs.push(`${doc.id}.md`);
    const sections = doc.sections.map(section => `<section><h3>${escapeHtml(section.heading)}</h3><p class="basis ${section.basis}">${labelBasis(section.basis)}</p>${renderMarkdown(section.markdown)}<p class="sources">Sources: ${citations(context, section.evidence)}</p></section>`).join('');
    const diagrams = [];
    for (const diagram of doc.diagrams || []) {
      const svg = diagramSvgs.get(diagram.id);
      await writeFile(path.join(dir, `${diagram.id}.mmd`), diagram.mermaid + '\n');
      await writeFile(path.join(dir, `${diagram.id}.svg`), svg);
      outputs.push(`${diagram.id}.mmd`, `${diagram.id}.svg`);
      diagrams.push(`<figure id="diagram-${diagram.id}"><figcaption>${escapeHtml(diagram.title)}</figcaption><div class="diagram" role="img" aria-label="${escapeHtml(diagram.title)}">${svg}</div><details><summary>Mermaid source</summary><pre>${escapeHtml(diagram.mermaid)}</pre></details><p class="sources">${citations(context, diagram.evidence)}</p></figure>`);
    }
    articles.push(`<article id="${doc.id}"><p class="eyebrow">${escapeHtml(familyTitles[doc.family])}</p><h2>${escapeHtml(doc.title)}</h2>${sections}${diagrams.join('')}</article>`);
  }
  const gaps = content.gaps?.length ? `<section id="open-questions"><h2>Open questions</h2><ul>${content.gaps.map(gap => `<li>${escapeHtml(gap.question)}${gap.evidence.length ? `<div class="sources">${citations(context, gap.evidence)}</div>` : ''}</li>`).join('')}</ul></section>` : '';
  const limits = context.limitations.length ? `<section><h2>Source coverage limitations</h2><ul>${context.limitations.map(limit => `<li>${escapeHtml(limit)}</li>`).join('')}</ul></section>` : '';
  const body = `<a class="skip" href="#main">Skip to documents</a><header><p class="eyebrow">Code Unpacked · Reverse design</p><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(content.summary)}</p><p class="sources">${citations(context, content.summaryEvidence)}</p><p class="revision">Source revision <code>${escapeHtml(context.source.head)}</code>${context.source.base ? ` · Base <code>${escapeHtml(context.source.base)}</code>` : ''}</p></header><div class="layout"><nav aria-label="Design documents"><strong>Documents</strong><ul><li><a href="#coverage">Coverage and applicability</a></li>${nav}${content.gaps?.length ? '<li><a href="#open-questions">Open questions</a></li>' : ''}</ul><p class="muted">Observed = supported behavior.<br>Inferred = reconstructed intent.<br>Proposed = suggested change.</p></nav><main id="main"><section id="coverage"><h2>Coverage and applicability</h2><p>Every document family is accounted for. Missing evidence is recorded explicitly.</p><div class="table-scroll"><table><thead><tr><th>Document family</th><th>Status</th><th>Reason and evidence</th></tr></thead><tbody>${rows}</tbody></table></div></section>${articles.join('')}${gaps}${limits}</main></div>`;
  await writeFile(path.join(dir, 'index.html'), renderShell({ title: content.title, body, css }));
  await writeJson(path.join(dir, 'design.json'), content);
  const coverageMarkdown = `### Coverage\n\n| Document family | Status | Reason |\n| --- | --- | --- |\n${FAMILIES.map(family => { const entry = content.coverage.find(item => item.family === family); return `| ${familyTitles[family]} | ${entry.status} | ${entry.reason.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`; }).join('\n')}`;
  const commentDocs = content.documents.map(doc => documentMarkdown(context, doc).replace(/^(#{1,5}) /gm, '#$1 '));
  const openQuestions = content.gaps?.length ? `\n\n### Open questions\n\n${content.gaps.map(gap => `- ${gap.question}${gap.evidence.length ? ` — ${markdownSources(context, gap.evidence)}` : ''}`).join('\n')}` : '';
  return finishArtifact({
    dir, skill: 'reverse-design', context, outputs, summary: content.summary,
    markdown: `Sources: ${markdownSources(context, content.summaryEvidence)}\n\n${coverageMarkdown}\n\n${commentDocs.join('\n\n')}${openQuestions}`,
    limitations: content.coverage.filter(entry => entry.status === 'insufficient-evidence').map(entry => `${familyTitles[entry.family]}: ${entry.reason}`),
  });
}

export async function main(args = process.argv.slice(2)) {
  const { positional, options } = parseArgs(args);
  if (positional[0] !== 'render' || !options.context || !options.content || !options.root) throw Error('Usage: reverse-design.mjs render --context FILE --content FILE --root DIR');
  const context = await readJson(options.context), content = await readJson(options.content);
  const dir = outputDirectory(options.root, context.target, 'reverse-design');
  await renderDesign(context, content, dir);
  process.stdout.write(`Reverse design: ${path.join(dir, 'index.html')}\n`);
  return dir;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
