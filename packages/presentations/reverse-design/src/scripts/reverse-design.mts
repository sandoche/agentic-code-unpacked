import type { Context, Claim, Design, DesignDocument, DesignCoverage, Manifest } from '../../../../core/src/contracts.mjs';
import { decodeDesign } from '../../../../core/src/scripts/decode.mjs';
import { message, present } from '../../../../core/src/scripts/values.mjs';
import { option } from '../../../../core/src/scripts/core.mjs';
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  escapeHtml, parseArgs, outputDirectory, validateContext, resolveEvidence,
  assertEvidence, readJson, writeJson, renderShell, finishArtifact, renderMermaid, loadBrowser,
} from '../../../../core/src/scripts/core.mjs';

export const FAMILIES = Object.freeze([
  'requirements', 'stories', 'user-flows', 'c4', 'data-model', 'sequences',
  'state-machines', 'api-contracts', 'deployment', 'threat-model', 'decisions',
]);
const familyTitles: Record<string, string> = {
  requirements: 'Requirements / PRD', stories: 'User stories and acceptance criteria',
  'user-flows': 'User flows', c4: 'C4 architecture', 'data-model': 'ERD / data model',
  sequences: 'Sequence diagrams', 'state-machines': 'State machines',
  'api-contracts': 'API contracts', deployment: 'Deployment',
  'threat-model': 'Threat model', decisions: 'Decision records',
};
const statuses = new Set(['generated', 'not-applicable', 'insufficient-evidence']);
const bases = new Set(['observed', 'inferred', 'proposed']);
const text = (value: unknown, label: string): void => { if (typeof value !== 'string' || !value.trim()) throw Error(`${label} must be non-empty text`); };
const array = (value: unknown, label: string): void => { if (!Array.isArray(value)) throw Error(`${label} must be an array`); };
const identifier = (value: unknown, label: string): void => { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) throw Error(`Invalid ${label}`); };
const evidence = (context: Context, ids: string[], required = true): void => {
  array(ids, 'evidence');
  if (required) assertEvidence(context, ids); else for (const id of ids) resolveEvidence(context, id);
};
const familyTitle = (family: string): string => familyTitles[family] || family.replaceAll('-', ' ').replace(/^./, letter => letter.toUpperCase());
function validateClaim(context: Context, claim: Claim, label: string): void {
  if (!claim || typeof claim !== 'object') throw Error(`${label} must be a source-backed claim`);
  text(claim.markdown, `${label} markdown`);
  if (!bases.has(claim.basis)) throw Error(`Invalid ${label} basis: ${claim.basis}`);
  evidence(context, claim.evidence);
}
function analysisLinks(context: Context, ids: string[] | undefined, kind: string): void {
  if (ids === undefined) return;
  array(ids, `${kind} IDs`);
  const known = new Set((context.analysis?.[kind === 'topic' ? 'topics' : 'flows'] || []).map(item => item.id));
  for (const id of ids) if (!known.has(id)) throw Error(`Unknown analysis ${kind}: ${id}`);
}

export function validateDesign(context: Context, value: unknown): Design {
  const content=decodeDesign(value);
  validateContext(context);
  if (![1, 2].includes(content?.schemaVersion)) throw Error('Design schemaVersion must be 1 or 2');
  text(content.title, 'title');
  if (content.schemaVersion === 1) {
    text(content.summary, 'summary'); evidence(context, content.summaryEvidence);
  } else {
    if (!content.overview || typeof content.overview !== 'object') throw Error('A concise overview is required');
    validateClaim(context, content.overview.purpose, 'overview purpose');
    for (const key of ['reviewFocus', 'extensionContext'] as const) {
      array(content.overview[key], `overview ${key}`);
      if (!content.overview[key].length) throw Error(`overview ${key} needs at least one useful claim`);
      for (const claim of content.overview[key]) validateClaim(context, claim, `overview ${key}`);
    }
  }
  if (content.coverage !== undefined) array(content.coverage, 'coverage');
  array(content.documents, 'documents');
  const coverage = new Map<string,DesignCoverage>();
  for (const entry of content.coverage || []) {
    identifier(entry.family, 'coverage family');
    if (coverage.has(entry.family)) throw Error(`Duplicate coverage family: ${entry.family}`);
    if (!statuses.has(entry.status)) throw Error(`Invalid coverage status: ${entry.status}`);
    text(entry.reason, 'coverage reason');
    evidence(context, entry.evidence, entry.status === 'generated');
    coverage.set(entry.family, entry);
  }
  const ids = new Set(), diagrams = new Set(), questions = new Set();
  for (const doc of content.documents) {
    identifier(doc.id, 'document id');
    if (ids.has(doc.id)) throw Error(`Duplicate document id: ${doc.id}`);
    ids.add(doc.id); text(doc.title, 'document title');
    identifier(doc.family, 'document family');
    if (coverage.has(doc.family) && present(coverage.get(doc.family)).status !== 'generated') throw Error(`Document ${doc.id} must belong to a generated coverage family`);
    analysisLinks(context, doc.topicIds, 'topic'); analysisLinks(context, doc.flowIds, 'flow');
    array(doc.sections, 'document sections');
    if (!doc.sections.length && !(content.schemaVersion === 2 && doc.diagrams?.length)) throw Error(`Document ${doc.id} requires explanatory sections or focused diagrams`);
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
      if (content.schemaVersion === 2 || diagram.question !== undefined) {
        text(diagram.question, 'diagram question');
        const question = present(diagram.question).trim().toLowerCase();
        if (questions.has(question)) throw Error(`Duplicate diagram question: ${diagram.question}`);
        questions.add(question);
      }
      if (diagram.flowId !== undefined) analysisLinks(context, [diagram.flowId], 'flow');
      if (/<\s*script|\bon\w+\s*=|(?:javascript|data):|^\s*click\s|%%\s*\{/im.test(diagram.mermaid)) {
        throw Error(`Unsafe Mermaid diagram: ${diagram.id}`);
      }
    }
  }
  for (const entry of content.coverage || []) {
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

function inline(markdown: string): string {
  const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let result = '', end = 0;
  for (const match of markdown.matchAll(pattern)) {
    result += escapeHtml(markdown.slice(end, match.index));
    if (match[1] !== undefined) result += `<code>${escapeHtml(match[1])}</code>`;
    else if (match[2] !== undefined) result += `<strong>${escapeHtml(match[2])}</strong>`;
    else if (/^(?:https?:\/\/|mailto:|#[a-z])/i.test(match[4] ?? '')) result += `<a href="${escapeHtml(match[4])}" rel="noreferrer">${escapeHtml(match[3])}</a>`;
    else result += escapeHtml(match[0]);
    end = match.index + match[0].length;
  }
  return result + escapeHtml(markdown.slice(end));
}

// A deliberately small Markdown subset: source HTML is always text, never executable.
export function renderMarkdown(markdown: string): string {
  const lines = String(markdown).replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim());
  for (let i = 0; i < lines.length;) {
    const line = present(lines[i]);
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(present(lines[i]))) code.push(present(lines[i++]));
      if (i < lines.length) i++;
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) { const level = Math.min(present(heading[1]).length + 2, 6); blocks.push(`<h${level}>${inline(present(heading[2]))}</h${level}>`); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(present(lines[i + 1]))) {
      const head = cells(line); i += 2; const rows = [];
      while (i < lines.length && present(lines[i]).includes('|') && present(lines[i]).trim()) rows.push(cells(present(lines[i++])));
      blocks.push(`<div class="table-scroll"><table><thead><tr>${head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${head.map((_, n) => `<td>${inline(row[n] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const bullet = /^\s*[-*]\s+/.test(line), ordered = /^\s*\d+\.\s+/.test(line);
    if (bullet || ordered) {
      const items = [], pattern = bullet ? /^\s*[-*]\s+(.+)$/ : /^\s*\d+\.\s+(.+)$/;
      while (i < lines.length && pattern.test(present(lines[i]))) items.push(`<li>${inline(present(present(pattern.exec(present(lines[i++])))[1]))}</li>`);
      const tag = bullet ? 'ul' : 'ol'; blocks.push(`<${tag}>${items.join('')}</${tag}>`); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && present(lines[i]).trim() && !/^(?:#{1,6}\s|\s*```|\s*[-*]\s|\s*\d+\.\s)/.test(present(lines[i]))) paragraph.push(present(lines[i++]));
    blocks.push(`<p>${inline(paragraph.join('\n')).replaceAll('\n', '<br>')}</p>`);
  }
  return blocks.join('\n');
}

function safeSourceUrl(url: unknown): string | undefined { return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : undefined; }
function citations(context: Context, ids: string[]): string {
  return ids.map(id => {
    const ref = resolveEvidence(context, id), label = `${ref.path}:${ref.startLine}–${ref.endLine}`;
    const url = safeSourceUrl(ref.url);
    return url ? `<a href="${escapeHtml(url)}" rel="noreferrer">${escapeHtml(label)}</a>` : `<span>${escapeHtml(label)} (local snapshot)</span>`;
  }).join(' · ');
}
function markdownSources(context: Context, ids: string[]): string {
  return ids.map(id => {
    const ref = resolveEvidence(context, id), label = `${ref.path}:${ref.startLine}–${ref.endLine}`.replaceAll('`', "'");
    const url = safeSourceUrl(ref.url);
    return url ? '[`' + label + '`](' + url.replaceAll(')', '%29').replaceAll('(', '%28') + ')' : '`' + label + '` (local snapshot)';
  }).join(' · ');
}
const labelBasis = (basis: string): string => basis.charAt(0).toUpperCase() + basis.slice(1);
function documentMarkdown(context: Context, doc: DesignDocument, { includeDiagrams = true }: { includeDiagrams?: boolean } = {}): string {
  const parts = [`# ${doc.title}`, `Document family: ${familyTitle(doc.family)}`];
  for (const section of doc.sections) parts.push(`## ${section.heading}\n\n**${labelBasis(section.basis)}**\n\n${section.markdown}\n\nSources: ${markdownSources(context, section.evidence)}`);
  if (includeDiagrams) for (const diagram of doc.diagrams || []) parts.push(`## ${diagram.title}\n\n${diagram.question || `What does ${diagram.title} show?`}\n\n` + '```mermaid\n' + diagram.mermaid + '\n```\n\nSources: ' + markdownSources(context, diagram.evidence));
  return parts.join('\n\n') + '\n';
}

function overviewFor(context: Context, content: Design): Extract<Design, { schemaVersion: 2 }>['overview'] {
  if (content.schemaVersion === 2) return content.overview;
  return {
    purpose: { markdown: content.summary, basis: 'observed', evidence: content.summaryEvidence },
    reviewFocus: (context.analysis?.topics || []).flatMap(topic => (topic.reviewFocus || []).map(item => ({ markdown: item.text, basis: 'observed', evidence: item.evidenceIds }))),
    extensionContext: (context.analysis?.topics || []).flatMap(topic => (topic.extensionPoints || []).map(item => ({ markdown: item.text, basis: item.basis || 'proposed', evidence: item.evidenceIds }))),
  };
}
function claimHtml(context: Context, claim: Claim): string {
  return `<div class="overview-claim"><span class="basis ${claim.basis}">${labelBasis(claim.basis)}</span>${renderMarkdown(claim.markdown)}<details class="evidence"><summary>Source evidence</summary><p class="sources">${citations(context, claim.evidence)}</p></details></div>`;
}
function claimMarkdown(context: Context, claim: Claim): string {
  return `**${labelBasis(claim.basis)}** — ${claim.markdown}\n\nSources: ${markdownSources(context, claim.evidence)}`;
}

export async function renderDesign(context: Context, content: Design, dir: string): Promise<Manifest> {
  validateDesign(context, content);
  const css = await readFile(new URL('../assets/design.css', import.meta.url), 'utf8');
  const overview = overviewFor(context, content), coverage = content.coverage || [];
  const diagramSvgs = new Map<string,string>();
  const sourceDiagrams = content.documents.flatMap(doc => doc.diagrams || []);
  // Render before writing: invalid diagrams do not replace an existing valid artifact.
  let browser;
  try {
    if (sourceDiagrams.length) browser = await loadBrowser();
    for (const diagram of sourceDiagrams) {
      try { diagramSvgs.set(diagram.id, await renderMermaid(diagram.mermaid, { browser })); }
      catch (error) { throw Error(`Cannot render Mermaid diagram ${diagram.id}: ${message(error)}`); }
    }
  } finally {
    if (browser) await browser.close();
  }
  await mkdir(dir, { recursive: true });
  const outputs = ['index.html', 'design.json'];
  const nav = content.documents.map(doc => `<li><a href="#${doc.id}">${escapeHtml(doc.title)}</a></li>`).join('');
  const rows = coverage.map(entry => {
    return `<tr><th scope="row">${escapeHtml(familyTitle(entry.family))}</th><td><span class="status ${entry.status}">${escapeHtml(entry.status)}</span></td><td>${escapeHtml(entry.reason)}${entry.evidence.length ? `<div class="sources">${citations(context, entry.evidence)}</div>` : ''}</td></tr>`;
  }).join('');
  const articles = [], featuredDiagrams = [];
  for (const doc of content.documents) {
    const md = documentMarkdown(context, doc);
    await writeFile(path.join(dir, `${doc.id}.md`), md); outputs.push(`${doc.id}.md`);
    const sections = doc.sections.map(section => `<section><h3>${escapeHtml(section.heading)}</h3><p class="basis ${section.basis}">${labelBasis(section.basis)}</p>${renderMarkdown(section.markdown)}<p class="sources">Sources: ${citations(context, section.evidence)}</p></section>`).join('');
    const diagramLinks = [];
    for (const diagram of doc.diagrams || []) {
      const svg = present(present(diagramSvgs.get(diagram.id)));
      await writeFile(path.join(dir, `${diagram.id}.mmd`), diagram.mermaid + '\n');
      await writeFile(path.join(dir, `${diagram.id}.svg`), svg);
      outputs.push(`${diagram.id}.mmd`, `${diagram.id}.svg`);
      const question = diagram.question || `What does ${diagram.title} show?`;
      featuredDiagrams.push(`<figure id="diagram-${diagram.id}"><figcaption>${escapeHtml(diagram.title)} · <a href="#${doc.id}">${escapeHtml(doc.title)}</a></figcaption><h3 class="diagram-question">${escapeHtml(question)}</h3><div class="diagram" role="img" aria-label="${escapeHtml(question)}">${svg}</div><details class="evidence"><summary>Diagram source and evidence</summary><pre>${escapeHtml(diagram.mermaid)}</pre><p class="sources">${citations(context, diagram.evidence)}</p></details></figure>`);
      diagramLinks.push(`<li><a href="#diagram-${diagram.id}">${escapeHtml(question)}</a></li>`);
    }
    articles.push(`<article id="${doc.id}"><p class="eyebrow">${escapeHtml(familyTitle(doc.family))}</p><h2>${escapeHtml(doc.title)}</h2>${diagramLinks.length ? `<ul class="diagram-links">${diagramLinks.join('')}</ul>` : ''}<details class="document-details"><summary>Read detailed explanation${doc.sections.length ? ` (${doc.sections.length} section${doc.sections.length === 1 ? '' : 's'})` : ''}</summary>${sections}</details></article>`);
  }
  const overviewHtml = `<section id="overview"><h2>Purpose</h2>${claimHtml(context, overview.purpose)}${overview.reviewFocus.length ? `<div class="overview-group"><h3>Review focus</h3>${overview.reviewFocus.map(claim => claimHtml(context, claim)).join('')}</div>` : ''}${overview.extensionContext.length ? `<div class="overview-group"><h3>Where to extend</h3>${overview.extensionContext.map(claim => claimHtml(context, claim)).join('')}</div>` : ''}</section>`;
  const diagramsHtml = featuredDiagrams.length ? `<section id="key-diagrams"><h2>Questions the diagrams answer</h2>${featuredDiagrams.join('')}</section>` : '';
  const coverageHtml = coverage.length ? `<details id="coverage" class="coverage"><summary>Document selection and applicability (${coverage.length} considered)</summary><div class="table-scroll"><table><thead><tr><th>Document family</th><th>Status</th><th>Reason and evidence</th></tr></thead><tbody>${rows}</tbody></table></div></details>` : '';
  const gaps = content.gaps?.length ? `<section id="open-questions"><h2>Open questions</h2><ul>${content.gaps.map(gap => `<li>${escapeHtml(gap.question)}${gap.evidence.length ? `<div class="sources">${citations(context, gap.evidence)}</div>` : ''}</li>`).join('')}</ul></section>` : '';
  const limits = context.limitations.length ? `<details class="coverage"><summary>Source coverage limitations</summary><ul>${context.limitations.map(limit => `<li>${escapeHtml(limit)}</li>`).join('')}</ul></details>` : '';
  const body = `<a class="skip" href="#main">Skip to overview</a><header><p class="eyebrow">Code Unpacked · Reverse design</p><h1>${escapeHtml(content.title)}</h1><p class="revision">Source revision <code>${escapeHtml(context.source.head)}</code>${context.source.base ? ` · Base <code>${escapeHtml(context.source.base)}</code>` : ''}</p></header><div class="layout"><nav aria-label="Design documents"><strong>Explore</strong><ul><li><a href="#overview">Purpose and review focus</a></li>${featuredDiagrams.length ? '<li><a href="#key-diagrams">Key diagrams</a></li>' : ''}${nav}${content.gaps?.length ? '<li><a href="#open-questions">Open questions</a></li>' : ''}${coverage.length ? '<li><a href="#coverage">Document selection</a></li>' : ''}</ul><p class="muted">Observed = supported behavior.<br>Inferred = reconstructed intent.<br>Proposed = suggested change.</p></nav><main id="main">${overviewHtml}${diagramsHtml}${articles.join('')}${gaps}${coverageHtml}${limits}</main></div>`;
  await writeFile(path.join(dir, 'index.html'), renderShell({ title: content.title, body, css }));
  await writeJson(path.join(dir, 'design.json'), content);
  const coverageMarkdown = coverage.length ? `<details><summary>Document selection and applicability</summary>\n\n| Document family | Status | Reason |\n| --- | --- | --- |\n${coverage.map(entry => `| ${familyTitle(entry.family)} | ${entry.status} | ${entry.reason.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`).join('\n')}\n\n</details>` : '';
  const commentDocs = content.documents.map(doc => `<details><summary>${escapeHtml(doc.title)}</summary>\n\n${documentMarkdown(context, doc, { includeDiagrams: false }).replace(/^(#{1,5}) /gm, '#$1 ')}\n</details>`);
  const overviewMarkdown = `### Purpose\n\n${claimMarkdown(context, overview.purpose)}${overview.reviewFocus.length ? `\n\n### Review focus\n\n${overview.reviewFocus.map(claim => claimMarkdown(context, claim)).join('\n\n')}` : ''}${overview.extensionContext.length ? `\n\n### Where to extend\n\n${overview.extensionContext.map(claim => claimMarkdown(context, claim)).join('\n\n')}` : ''}`;
  const diagramsMarkdown = sourceDiagrams.length ? '\n\n### Key diagrams\n\n' + sourceDiagrams.map(diagram => `#### ${diagram.question || `What does ${diagram.title} show?`}\n\n` + '```mermaid\n' + diagram.mermaid + '\n```\n\nSources: ' + markdownSources(context, diagram.evidence)).join('\n\n') : '';
  const openQuestions = content.gaps?.length ? `\n\n### Open questions\n\n${content.gaps.map(gap => `- ${gap.question}${gap.evidence.length ? ` — ${markdownSources(context, gap.evidence)}` : ''}`).join('\n')}` : '';
  return finishArtifact({
    dir, skill: 'reverse-design', context, outputs, summary: content.title,
    markdown: `${overviewMarkdown}${diagramsMarkdown}\n\n${commentDocs.join('\n\n')}${openQuestions}${coverageMarkdown ? `\n\n${coverageMarkdown}` : ''}`,
    limitations: coverage.filter(entry => entry.status === 'insufficient-evidence').map(entry => `${familyTitle(entry.family)}: ${entry.reason}`),
  });
}

export async function main(args: string[] = process.argv.slice(2)): Promise<string> {
  const { positional, options } = parseArgs(args);
  if (positional[0] !== 'render' || !option(options, 'context') || !option(options, 'content') || !option(options, 'root')) throw Error('Usage: reverse-design.mjs render --context FILE --content FILE --root DIR');
  const context = validateContext(await readJson(present(option(options, 'context')))), content = validateDesign(context, await readJson(present(option(options, 'content'))));
  const dir = outputDirectory(present(option(options, 'root')), context.target, 'reverse-design');
  await renderDesign(context, content, dir);
  process.stdout.write(`Reverse design: ${path.join(dir, 'index.html')}\n`);
  return dir;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => { process.stderr.write(`${message(error)}\n`); process.exitCode = 1; });
}
