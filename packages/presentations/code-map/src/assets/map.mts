import type { CodeMap } from '../scripts/code-map.mjs';
type Model = Pick<CodeMap, 'summary' | 'nodes' | 'groups' | 'symbols' | 'relationships' | 'annotations' | 'evidence' | 'topics' | 'flows' | 'unresolved'>;
type MapNode = Model['nodes'][number];
type MapSymbol = Model['symbols'][number];
type MapRelationship = Model['relationships'][number];
type Citation = MapSymbol['citations'][number];
type MapClaim = Model['topics'][number]['reviewFocus'][number];
type Mode = 'head' | 'base' | 'diff';
type Guard<T> = (value: unknown) => value is T;
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw Error('Missing code-map element or source reference');
    return value;
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const string: Guard<string> = (value): value is string => typeof value === 'string';
const number: Guard<number> = (value): value is number => typeof value === 'number';
const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
function optional<T>(guard: Guard<T>): Guard<T | undefined> { return (value): value is T | undefined => value === undefined || guard(value); }
function array<T>(guard: Guard<T>): Guard<T[]> {
    return (value): value is T[] => { if (!Array.isArray(value))
        return false; const items: unknown[] = value; return items.every(guard); };
}
function object<T>(shape: {
    [K in keyof T]-?: Guard<T[K]>;
}): Guard<T> {
    return (value): value is T => { if (!isRecord(value))
        return false; for (const key in shape)
        if (!shape[key](value[key]))
            return false; return true; };
}
const strings = array(string);
const citation = object<Citation>({ id: string, path: string, side: string, startLine: number, endLine: number, url: optional(string) });
const claim = object<MapClaim>({ text: string, evidenceIds: strings, basis: optional(string), citations: array(citation) });
const nullableNumber: Guard<number | null> = (value): value is number | null => value === null || number(value);
const range: Guard<[
    number,
    number
]> = (value): value is [
    number,
    number
] => Array.isArray(value) && value.length === 2 && number(value[0]) && number(value[1]);
type Hunk = NonNullable<MapNode['hunks']>[number];
const diffLine = object<Hunk['lines'][number]>({ kind: string, text: string, oldLine: nullableNumber, newLine: nullableNumber });
const hunk = object<Hunk>({ header: string, oldStart: number, newStart: number, lines: array(diffLine) });
const highlighted = object<{
    head?: string;
    base?: string;
}>({ head: optional(string), base: optional(string) });
const node = object<MapNode>({ id: string, path: string, oldPath: optional(string), status: string, hunks: optional(array(hunk)), role: optional(string), binary: optional(boolean), omission: optional(string), content: optional(string), baseContent: optional(string), sha256: optional(string), selectedRange: optional(range), additions: number, deletions: number, highlighted: optional(highlighted), contextual: boolean, coverageRole: optional(string), coverageReason: optional(string), topicIds: strings, symbolIds: strings, x: number, y: number, width: number, height: number, evidenceIds: strings });
const symbol = object<MapSymbol>({ id: string, fileId: string, name: string, kind: string, startLine: number, endLine: number, evidenceIds: strings, side: optional(string), className: optional(string), qualifiedName: optional(string), exportedName: optional(string), anchor: string, citations: array(citation) });
const provenanceGuard: Guard<string | Record<string, unknown>> = (value): value is string | Record<string, unknown> => string(value) || isRecord(value);
const relationship = object<MapRelationship>({ id: string, fromFileId: string, toFileId: string, label: string, evidenceIds: strings, kind: string, provenance: provenanceGuard, fromSymbolId: optional(string), toSymbolId: optional(string), citations: array(citation) });
const annotation = object<Model['annotations'][number]>({ id: string, fileId: string, title: string, text: string, evidenceIds: strings, citations: array(citation) });
const group = object<Model['groups'][number]>({ name: string, x: number, y: number, fileIds: strings });
const evidence = object<Model['evidence'][number]>({ id: string, fileId: string, startLine: number, endLine: number, side: string, url: optional(string) });
const topic = object<Model['topics'][number]>({ id: string, title: string, summary: string, evidenceIds: strings, reviewFocus: array(claim), extensionPoints: array(claim), before: optional(string), after: optional(string), priority: optional(string), role: optional(string), comicSuitable: optional(boolean), fileIds: strings, citations: array(citation) });
const flowStep = object<Model['flows'][number]['steps'][number]>({ text: string, evidenceIds: strings, symbolIds: optional(strings), citations: array(citation) });
const flow = object<Model['flows'][number]>({ id: string, title: string, evidenceIds: strings, steps: array(flowStep), symbolIds: strings, fileIds: strings, citations: array(citation) });
const unresolved = object<Model['unresolved'][number]>({ fileId: string, fromSymbolId: optional(string), expression: optional(string), line: optional(number), reason: optional(string), evidenceIds: optional(strings), citations: array(citation) });
const isModel = object<Model>({ summary: string, nodes: array(node), groups: array(group), symbols: array(symbol), relationships: array(relationship), annotations: array(annotation), evidence: array(evidence), topics: array(topic), flows: array(flow), unresolved: array(unresolved) });
function parseModel(value: unknown): Model { if (!isModel(value))
    throw Error('Invalid code-map payload'); return value; }
function sourceMode(value: string): Mode { if (value === 'head' || value === 'base' || value === 'diff')
    return value; throw Error('Invalid code view'); }
const model = parseModel(JSON.parse(required(document.getElementById('artifact-data')).textContent ?? ''));
const viewport = required(document.getElementById('viewport'));
const plane = required(document.getElementById('plane'));
const cards = required(document.getElementById('cards'));
const edges = required(document.getElementById('edges'));
const detail = required(document.getElementById('detail'));
const search = required(document.querySelector<HTMLInputElement>('input#search'));
const changed = required(document.querySelector<HTMLInputElement>('input#changed'));
const topicFilter = required(document.querySelector<HTMLSelectElement>('select#topic-filter'));
const flowFilter = required(document.querySelector<HTMLSelectElement>('select#flow-filter'));
const kindFilter = required(document.querySelector<HTMLSelectElement>('select#relationship-kind'));
const svgNS = 'http://www.w3.org/2000/svg';
const nodes = model.nodes.map(node => ({ ...node }));
const byId = new Map(nodes.map(node => [node.id, node]));
const bySymbol = new Map(model.symbols.map(symbol => [symbol.id, symbol]));
const initial = new Map(nodes.map(node => [node.id, { x: node.x, y: node.y }]));
const elements = new Map<string, HTMLElement>(), groupLabels = new Map<string, HTMLElement>();
const listItems = new Map([...document.querySelectorAll<HTMLElement>('#file-list li')].map(item => [item.dataset.file, item]));
let view = { x: 20, y: 20, scale: 1 };
let selected: string | undefined, selectedSymbol: string | undefined;
type PointerStart = {
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
};
let gesture: (PointerStart & ({
    kind: 'pan';
} | {
    kind: 'node';
    id: string;
    dragged: boolean;
})) | undefined;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string | number, className?: string): HTMLElementTagNameMap[K] {
    const item = document.createElement(tag);
    if (text !== undefined)
        item.textContent = String(text);
    if (className)
        item.className = className;
    return item;
}
function transform(): void {
    plane.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`;
    plane.classList.toggle('semantic-small', view.scale < .6);
    required(document.getElementById('zoom-label')).textContent = `${Math.round(view.scale * 100)}%`;
}
function matchesSearch(node: MapNode): boolean {
    const query = search.value.toLowerCase();
    return node.path.toLowerCase().includes(query) || node.symbolIds.some(id => required(bySymbol.get(id)).name.toLowerCase().includes(query));
}
function visible(node: MapNode): boolean {
    const topic = model.topics.find(item => item.id === topicFilter.value);
    const flow = model.flows.find(item => item.id === flowFilter.value);
    return matchesSearch(node)
        && (!changed.checked || !node.contextual && !['snapshot', 'context', 'unchanged'].includes(node.status))
        && (!topic || topic.fileIds.includes(node.id))
        && (!flow || flow.fileIds.includes(node.id));
}
function edgeVisible(edge: MapRelationship): boolean {
    return (!kindFilter.value || edge.kind === kindFilter.value) && visible(required(byId.get(edge.fromFileId))) && visible(required(byId.get(edge.toFileId)));
}
function provenance(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value) ?? ''; }
function drawEdges(): void {
    edges.replaceChildren();
    const bundles = new Map<string, MapRelationship[]>();
    for (const edge of model.relationships.filter(edgeVisible)) {
        const key = JSON.stringify([edge.fromFileId, edge.toFileId, edge.kind]);
        if (!bundles.has(key))
            bundles.set(key, []);
        required(bundles.get(key)).push(edge);
    }
    for (const bundle of bundles.values()) {
        const edge = required(bundle[0]), from = required(byId.get(edge.fromFileId)), to = required(byId.get(edge.toFileId));
        const x1 = from.x + from.width / 2, y1 = from.y + from.height / 2;
        const x2 = to.x + to.width / 2, y2 = to.y + to.height / 2;
        const line = document.createElementNS(svgNS, 'path');
        const self = from.id === to.id;
        line.setAttribute('d', self ? `M${from.x + from.width},${from.y + 35} C${from.x + from.width + 95},${from.y - 30} ${from.x + from.width + 95},${from.y + from.height + 30} ${from.x + from.width},${from.y + from.height - 35}` : `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`);
        line.setAttribute('class', `edge kind-${edge.kind.replace(/[^a-z-]/gi, '')}`);
        line.dataset.kind = edge.kind;
        line.dataset.count = String(bundle.length);
        if (selectedSymbol && !bundle.some(item => item.fromSymbolId === selectedSymbol || item.toSymbolId === selectedSymbol))
            line.classList.add('edge-muted');
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = `${from.path} → ${to.path}: ${bundle.map(item => `${item.kind}: ${item.label} [${provenance(item.provenance)}]`).join('; ')}`;
        line.append(title);
        const label = document.createElementNS(svgNS, 'text');
        label.setAttribute('x', String(self ? from.x + from.width + 15 : (x1 + x2) / 2));
        label.setAttribute('y', String(self ? from.y + from.height / 2 : (y1 + y2) / 2 - 7));
        label.setAttribute('class', 'edge-label');
        label.textContent = `${edge.kind}${bundle.length > 1 ? ` ×${bundle.length}` : ''}`;
        edges.append(line, label);
    }
}
function filter(): void {
    let count = 0;
    for (const node of nodes) {
        const show = visible(node);
        required(elements.get(node.id)).hidden = !show;
        required(listItems.get(node.id)).hidden = !show;
        if (show)
            count++;
    }
    for (const group of model.groups)
        required(groupLabels.get(group.name)).hidden = !group.fileIds.some(id => visible(required(byId.get(id))));
    required(document.getElementById('count')).textContent = `${count} of ${nodes.length} files · ${model.relationships.filter(edgeVisible).length} cited relationships`;
    required(document.getElementById('empty')).hidden = count !== 0;
    drawEdges();
}
function addCitations(parent: Element, citations: Citation[]): void {
    const list = element('div', undefined, 'sources');
    for (const citation of citations) {
        const label = `${citation.path}:${citation.startLine}–${citation.endLine} (${citation.side})`;
        const item = element(citation.url && /^https?:\/\//.test(citation.url) ? 'a' : 'span', label);
        if (item instanceof HTMLAnchorElement && citation.url) {
            item.href = citation.url;
            item.target = '_blank';
            item.rel = 'noreferrer';
        }
        list.append(item);
    }
    parent.append(list);
}
function primarySource(citations: Citation[]): HTMLDetailsElement | undefined {
    const ordered = [...citations].sort((a, b) => Number(b.side === 'head') - Number(a.side === 'head') || (b.endLine - b.startLine) - (a.endLine - a.startLine));
    if (!ordered.length)
        return;
    const primary = element('div', undefined, 'primary-source');
    addCitations(primary, [required(ordered[0])]);
    detail.append(primary);
    if (ordered.length === 1)
        return;
    const more = element('details', undefined, 'source-evidence');
    more.append(element('summary', `Additional source evidence (${ordered.length - 1})`));
    addCitations(more, ordered.slice(1));
    return more;
}
function symbolButton(id: string): HTMLButtonElement {
    const symbol = required(bySymbol.get(id));
    const button = element('button', `${symbol.name} · ${symbol.kind}`, 'symbol-link');
    button.setAttribute('aria-label', `Open symbol ${symbol.name}`);
    button.addEventListener('click', () => select(required(byId.get(symbol.fileId)), true, symbol));
    return button;
}
function fileButton(id: string): HTMLButtonElement {
    const node = required(byId.get(id));
    const button = element('button', node.path, 'file-link');
    button.setAttribute('aria-label', `Open file ${node.path}`);
    button.addEventListener('click', () => select(node, true));
    return button;
}
function teachingClaims(parent: Element, title: string, claims: MapClaim[]): void {
    if (!claims?.length)
        return;
    parent.append(element('h3', title));
    for (const item of claims) {
        const section = element('div', undefined, 'teaching-claim');
        section.append(element('p', item.text));
        addCitations(section, item.citations || []);
        parent.append(section);
    }
}
function showGuide(): void {
    selectedSymbol = undefined;
    detail.replaceChildren(element('h2', 'Purpose and review order'), element('p', model.summary));
    const flow = model.flows.find(item => item.id === flowFilter.value);
    const topics = topicFilter.value ? model.topics.filter(item => item.id === topicFilter.value) : model.topics;
    if (flow) {
        detail.append(element('h3', flow.title));
        const steps = element('ol', undefined, 'flow-steps');
        for (const step of flow.steps) {
            const item = element('li');
            item.append(element('p', step.text));
            for (const id of step.symbolIds || [])
                item.append(symbolButton(id));
            addCitations(item, step.citations);
            steps.append(item);
        }
        detail.append(steps);
    }
    for (const topic of topics) {
        const section = element('section', undefined, 'review-topic');
        section.id = `topic-${topic.id}`;
        const focus = element('button', topic.title, 'topic-link');
        focus.addEventListener('click', () => { topicFilter.value = topic.id; flowFilter.value = ''; changed.checked = false; filter(); fit(); showGuide(); });
        section.append(focus, element('p', topic.summary));
        if (topic.before)
            section.append(element('p', `Before: ${typeof topic.before === 'string' ? topic.before : JSON.stringify(topic.before)}`));
        if (topic.after)
            section.append(element('p', `After: ${typeof topic.after === 'string' ? topic.after : JSON.stringify(topic.after)}`));
        teachingClaims(section, 'Review focus', topic.reviewFocus);
        teachingClaims(section, 'Where to extend (proposed)', topic.extensionPoints);
        addCitations(section, topic.citations);
        detail.append(section);
    }
    if (!topics.length && !flow)
        detail.append(element('p', 'Select a file to inspect its functions, typed relationships, and source. Teaching topics can be supplied through shared analysis.', 'muted'));
    detail.append(element('p', `${model.symbols.length} extracted symbols; ${model.unresolved.length} unresolved or external targets. Context files are labelled and are not counted as changes.`, 'muted'));
    drawEdges();
}
function highlightedSource(node: MapNode, mode: 'head' | 'base'): Element | null | undefined {
    const html = node.highlighted?.[mode];
    if (!html)
        return undefined;
    // Only the shared renderer creates this markup; source text is never used as HTML.
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content.firstElementChild;
}
function codeBlock(node: MapNode, mode: Mode, symbol?: MapSymbol): Element {
    if (mode !== 'diff') {
        const source = mode === 'base' ? node.baseContent : node.content;
        if (typeof source !== 'string')
            return element('pre', 'Source is unavailable for this revision.');
        const root = highlightedSource(node, mode);
        if (root) {
            const range = symbol ? [symbol.startLine, symbol.endLine] as const : node.selectedRange;
            if (range)
                for (const line of root.querySelectorAll<HTMLElement>('.line')) {
                    const number = Number(line.dataset.line);
                    if (number < range[0] || number > range[1])
                        line.remove();
                    else if (symbol)
                        line.classList.add('focus');
                }
            return root;
        }
    }
    const pre = element('pre');
    if (mode === 'diff' && node.hunks?.length) {
        const highlighted: Record<'head' | 'base', Map<number | null, HTMLElement>> = { head: new Map(), base: new Map() };
        for (const side of ['head', 'base'] as const)
            highlighted[side] = new Map([...(highlightedSource(node, side)?.querySelectorAll<HTMLElement>('.line') || [])].map(line => [Number(line.dataset.line), line]));
        for (const hunk of node.hunks) {
            pre.append(element('span', hunk.header, 'hunk-header'));
            for (const line of hunk.lines) {
                const row = element('span', undefined, `diff-line ${line.kind}`);
                row.append(element('span', line.oldLine ?? '', 'line-number'), element('span', line.newLine ?? '', 'line-number'), document.createTextNode(`${line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '} `));
                const syntax = highlighted[line.kind === 'remove' ? 'base' : 'head'].get(line.kind === 'remove' ? line.oldLine : line.newLine);
                if (syntax?.textContent === line.text)
                    row.append(...[...syntax.childNodes].map(token => token.cloneNode(true)));
                else
                    row.append(document.createTextNode(line.text));
                pre.append(row);
            }
        }
    }
    else {
        const source = mode === 'base' ? node.baseContent : node.content;
        const lines = String(source ?? 'Source is unavailable for this revision.').replace(/\n$/, '').split('\n');
        const [start, end]: [
            number,
            number
        ] = symbol ? [symbol.startLine, symbol.endLine] : node.selectedRange || [1, lines.length];
        for (let index = start - 1; index < Math.min(end, lines.length); index++) {
            const row = element('span', undefined, 'diff-line');
            row.append(element('span', index + 1, 'line-number'), document.createTextNode(required(lines[index])));
            pre.append(row);
        }
    }
    return pre;
}
function reveal(node: MapNode): void {
    if (node.contextual || ['snapshot', 'context', 'unchanged'].includes(node.status))
        changed.checked = false;
    if (!matchesSearch(node))
        search.value = '';
    if (topicFilter.value && !model.topics.find(item => item.id === topicFilter.value)?.fileIds.includes(node.id))
        topicFilter.value = '';
    if (flowFilter.value && !model.flows.find(item => item.id === flowFilter.value)?.fileIds.includes(node.id))
        flowFilter.value = '';
    filter();
}
function relationshipDetails(node: MapNode, symbol: MapSymbol | undefined, controls: HTMLElement): void {
    const sections: [
        string,
        string,
        (edge: MapRelationship) => boolean
    ][] = [
        ['callers', 'Callers', edge => edge.kind === 'calls' && (symbol ? edge.toSymbolId === symbol.id : edge.toFileId === node.id)],
        ['callees', 'Callees', edge => edge.kind === 'calls' && (symbol ? edge.fromSymbolId === symbol.id : edge.fromFileId === node.id)],
        ['constructs', 'Constructs', edge => edge.kind === 'constructs'],
        ['imports', 'Imports (file relationships)', edge => edge.kind === 'imports'],
        ['routes', 'Verified routes', edge => ['routes', 'route'].includes(edge.kind)],
        ['tests', 'Test relationships', edge => ['tests', 'test'].includes(edge.kind)],
        ['other-relationships', 'Other source relationships', edge => !['calls', 'constructs', 'imports', 'routes', 'route', 'tests', 'test'].includes(edge.kind)],
    ];
    const relationships = model.relationships.filter(edge => {
        if (edge.fromFileId !== node.id && edge.toFileId !== node.id)
            return false;
        if (!symbol || edge.kind === 'imports')
            return true;
        return edge.fromSymbolId === symbol.id || edge.toSymbolId === symbol.id;
    });
    for (const [id, title, match] of sections) {
        const matching = relationships.filter(match);
        if (!matching.length)
            continue;
        const section = element('section', undefined, 'relationship-section');
        section.id = id;
        const heading = id === 'routes' && !matching.every(edge => /verified|source-ast/.test(provenance(edge.provenance))) ? 'Route bindings (verification not supplied)' : title;
        section.append(element('h3', `${heading} (${matching.length})`));
        const jump = element('button', `${title} (${matching.length})`);
        jump.setAttribute('aria-label', `Show ${id === 'other-relationships' ? 'other relationships' : id}`);
        jump.setAttribute('aria-controls', id);
        jump.addEventListener('click', () => { detail.scrollTop += section.getBoundingClientRect().top - detail.getBoundingClientRect().top - 12; section.tabIndex = -1; section.focus({ preventScroll: true }); });
        controls.append(jump);
        for (const edge of matching) {
            const block = element('div', undefined, 'relationship-item');
            const outgoing = symbol ? edge.fromSymbolId === symbol.id : edge.fromFileId === node.id;
            const symbolId = outgoing ? edge.toSymbolId : edge.fromSymbolId;
            const fileId = outgoing ? edge.toFileId : edge.fromFileId;
            block.append(symbolId ? symbolButton(symbolId) : fileButton(fileId), element('p', edge.label), element('small', `${edge.kind} · ${provenance(edge.provenance)}`, 'provenance'));
            addCitations(block, edge.citations);
            section.append(block);
        }
        detail.append(section);
    }
    controls.hidden = !relationships.length;
    if (!relationships.length)
        detail.append(element('p', 'No source-backed relationships were supplied for this selection. Missing edges do not prove independence.', 'empty-notes'));
}
function unresolvedDetails(node: MapNode, symbol: MapSymbol | undefined): void {
    const unresolved = model.unresolved.filter(item => item.fileId === node.id && (!symbol || item.fromSymbolId === symbol.id));
    if (!unresolved.length)
        return;
    const section = element('details', undefined, 'unresolved');
    section.id = 'unresolved';
    section.open = !!symbol;
    section.append(element('summary', `Unresolved or external targets (${unresolved.length})`));
    section.append(element('p', 'These are extraction gaps, not verified calls to captured code. External libraries and dynamic dispatch can legitimately appear here.', 'warning'));
    for (const item of unresolved.slice(0, 20)) {
        const block = element('div');
        block.append(element('p', `${item.expression || 'Dynamic expression'}${item.line ? ` · line ${item.line}` : ''}: ${item.reason || 'Target unavailable'}`));
        addCitations(block, item.citations);
        section.append(block);
    }
    if (unresolved.length > 20)
        section.append(element('p', `${unresolved.length - 20} more entries are retained in map.json. Select a function to narrow this list.`, 'muted'));
    detail.append(section);
}
function select(node: MapNode, center = false, symbol?: MapSymbol, updateHash = true): void {
    reveal(node);
    selected = node.id;
    selectedSymbol = symbol?.id;
    for (const item of nodes)
        required(elements.get(item.id)).classList.toggle('selected', item.id === selected);
    document.querySelectorAll<HTMLElement>('.file-select').forEach(button => button.setAttribute('aria-current', String(button.dataset.id === selected)));
    detail.replaceChildren(element('h2', symbol?.name || node.path));
    if (symbol) {
        const back = element('button', `Back to ${node.path}`, 'back-file');
        back.addEventListener('click', () => select(node));
        detail.append(back);
    }
    const description = [node.contextual ? 'context (unchanged neighbor)' : node.status, symbol ? `${symbol.kind} · lines ${symbol.startLine}–${symbol.endLine}` : '', node.oldPath && node.oldPath !== node.path ? `from ${node.oldPath}` : '', node.selectedRange ? `selected lines ${node.selectedRange.join('–')}` : ''].filter(Boolean).join(' · ');
    detail.append(element('p', description, 'file-state'));
    if (node.omission)
        detail.append(element('p', node.omission, 'warning'));
    const moreEvidence = primarySource(symbol ? symbol.citations : model.evidence.filter(item => item.fileId === node.id).map(item => ({ ...item, path: item.side === 'base' && node.oldPath ? node.oldPath : node.path })));
    if (!symbol && node.symbolIds.length) {
        const list = element('section', undefined, 'symbol-list');
        list.append(element('h3', `Functions and symbols (${node.symbolIds.length})`));
        const buttons = element('div', undefined, 'symbol-buttons');
        for (const id of node.symbolIds)
            buttons.append(symbolButton(id));
        list.append(buttons);
        detail.append(list);
    }
    const controls = element('nav', undefined, 'relationship-controls');
    controls.id = 'relationship-controls';
    controls.setAttribute('aria-label', 'Relationship navigation');
    detail.append(controls);
    if (node.coverageReason)
        detail.append(element('p', `${node.coverageRole}: ${node.coverageReason}`, 'muted'));
    if (moreEvidence)
        detail.append(moreEvidence);
    if (!node.binary && !node.omission) {
        const modes: [
            Mode,
            string
        ][] = [];
        if (!symbol && node.hunks?.length)
            modes.push(['diff', 'Unified diff']);
        if (typeof node.content === 'string')
            modes.push(['head', 'Head source']);
        if (typeof node.baseContent === 'string')
            modes.push(['base', 'Base source']);
        if (!modes.length)
            detail.append(element('p', 'No code excerpt was supplied.', 'warning'));
        else {
            const chooser = element('select');
            chooser.setAttribute('aria-label', 'Code view');
            for (const [value, label] of modes) {
                const option = element('option', label);
                option.value = value;
                chooser.append(option);
            }
            const code = element('div');
            code.append(codeBlock(node, required(modes[0])[0], symbol));
            chooser.addEventListener('change', () => code.replaceChildren(codeBlock(node, sourceMode(chooser.value), symbol)));
            detail.append(chooser, code);
        }
    }
    for (const note of model.annotations.filter(item => item.fileId === node.id)) {
        const block = element('section', undefined, 'annotation');
        block.append(element('h3', note.title), element('p', note.text));
        addCitations(block, note.citations);
        detail.append(block);
    }
    relationshipDetails(node, symbol, controls);
    unresolvedDetails(node, symbol);
    detail.scrollTop = 0;
    if (center) {
        view.x = viewport.clientWidth / 2 - (node.x + node.width / 2) * view.scale;
        view.y = viewport.clientHeight / 2 - (node.y + node.height / 2) * view.scale;
        transform();
    }
    if (updateHash)
        history.replaceState(null, '', `#${symbol ? symbol.anchor : `file=${encodeURIComponent(node.id)}`}`);
    drawEdges();
}
for (const group of model.groups) {
    const label = element('div', group.name === '.' ? 'Repository root' : group.name, 'group-label');
    label.style.left = `${group.x}px`;
    label.style.top = `${group.y}px`;
    required(document.getElementById('groups')).append(label);
    groupLabels.set(group.name, label);
}
for (const node of nodes) {
    const card = element('article', undefined, `file-card${node.contextual ? ' context-card' : ''}`);
    card.dataset.id = node.id;
    card.dataset.moved = 'false';
    card.dataset.role = node.contextual ? 'context' : 'changed';
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    const heading = element('div', node.path.split('/').at(-1), 'card-heading');
    heading.title = node.path;
    const meta = element('div', undefined, 'card-meta');
    meta.append(element('span', node.contextual ? 'context' : node.status, `status ${node.contextual ? 'context' : node.status}`), element('span', `+${node.additions}`, 'stat-add'), document.createTextNode(' / '), element('span', `−${node.deletions}`, 'stat-remove'), document.createTextNode(` · ${node.symbolIds.length} symbols`));
    card.append(heading, meta, element('div', node.omission || node.path, 'card-path'));
    card.addEventListener('click', () => { if (!card.dataset.justDragged)
        select(node); });
    heading.addEventListener('pointerdown', event => { if (event.button !== 0)
        return; event.stopPropagation(); heading.setPointerCapture(event.pointerId); gesture = { kind: 'node', id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, dragged: false }; });
    heading.addEventListener('pointermove', event => {
        if (gesture?.kind !== 'node' || gesture.id !== node.id || gesture.pointerId !== event.pointerId)
            return;
        const dx = (event.clientX - gesture.startX) / view.scale, dy = (event.clientY - gesture.startY) / view.scale;
        if (Math.abs(dx) + Math.abs(dy) > 3)
            gesture.dragged = true;
        node.x = gesture.x + dx;
        node.y = gesture.y + dy;
        card.style.left = `${node.x}px`;
        card.style.top = `${node.y}px`;
        card.dataset.moved = String(gesture.dragged);
        drawEdges();
    });
    heading.addEventListener('pointerup', () => { if (gesture?.kind === 'node') {
        if (gesture.dragged) {
            card.dataset.justDragged = 'true';
            setTimeout(() => delete card.dataset.justDragged, 0);
        }
        gesture = undefined;
    } });
    cards.append(card);
    elements.set(node.id, card);
    if (node.contextual) {
        const list = required(listItems.get(node.id));
        list.classList.add('context-file');
        required(list.querySelector('small')).textContent = 'context (unchanged neighbor)';
    }
}
document.querySelectorAll<HTMLElement>('.file-select').forEach(button => button.addEventListener('click', () => select(required(byId.get(required(button.dataset.id))), true)));
function zoom(factor: number, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2): void {
    const next = Math.min(2.5, Math.max(.12, view.scale * factor));
    view.x = x - (x - view.x) * next / view.scale;
    view.y = y - (y - view.y) * next / view.scale;
    view.scale = next;
    transform();
}
function fit(): void {
    const shown = nodes.filter(visible);
    if (!shown.length)
        return;
    const minX = Math.min(...shown.map(node => node.x)), minY = Math.min(...shown.map(node => node.y));
    const maxX = Math.max(...shown.map(node => node.x + node.width)), maxY = Math.max(...shown.map(node => node.y + node.height));
    view.scale = Math.min(1, Math.max(.12, Math.min((viewport.clientWidth - 50) / (maxX - minX), (viewport.clientHeight - 50) / (maxY - minY))));
    view.x = (viewport.clientWidth - (maxX - minX) * view.scale) / 2 - minX * view.scale;
    view.y = (viewport.clientHeight - (maxY - minY) * view.scale) / 2 - minY * view.scale;
    transform();
}
viewport.addEventListener('wheel', event => { event.preventDefault(); const bounds = viewport.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - bounds.left, event.clientY - bounds.top); }, { passive: false });
viewport.addEventListener('pointerdown', event => { if (event.button !== 0 || event.target instanceof Element && event.target.closest('.file-card'))
    return; viewport.setPointerCapture(event.pointerId); gesture = { kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: view.x, y: view.y }; });
viewport.addEventListener('pointermove', event => { if (gesture?.kind !== 'pan' || gesture.pointerId !== event.pointerId)
    return; view.x = gesture.x + event.clientX - gesture.startX; view.y = gesture.y + event.clientY - gesture.startY; transform(); });
viewport.addEventListener('pointerup', () => { if (gesture?.kind === 'pan')
    gesture = undefined; });
viewport.addEventListener('pointercancel', () => { gesture = undefined; });
viewport.addEventListener('keydown', event => {
    const moves: Record<string, [
        number,
        number
    ] | undefined> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    const move = moves[event.key];
    if (move) {
        event.preventDefault();
        view.x += move[0];
        view.y += move[1];
        transform();
    }
    else if (event.key === '+' || event.key === '=')
        zoom(1.2);
    else if (event.key === '-')
        zoom(1 / 1.2);
    else if (event.key === '0')
        fit();
});
search.addEventListener('input', filter);
changed.addEventListener('change', () => { filter(); fit(); });
topicFilter.addEventListener('change', () => { if (topicFilter.value)
    changed.checked = false; filter(); fit(); showGuide(); });
flowFilter.addEventListener('change', () => { if (flowFilter.value)
    changed.checked = false; filter(); fit(); showGuide(); });
kindFilter.addEventListener('change', drawEdges);
required(document.getElementById('review-guide')).addEventListener('click', showGuide);
required(document.getElementById('zoom-in')).addEventListener('click', () => zoom(1.2));
required(document.getElementById('zoom-out')).addEventListener('click', () => zoom(1 / 1.2));
required(document.getElementById('fit')).addEventListener('click', fit);
required(document.getElementById('reset')).addEventListener('click', () => { for (const node of nodes) {
    Object.assign(node, initial.get(node.id));
    const card = required(elements.get(node.id));
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.dataset.moved = 'false';
} drawEdges(); fit(); });
function openAnchor(): void {
    const params = new URLSearchParams(location.hash.slice(1));
    const symbolId = params.get('symbol'), fileId = params.get('file');
    const symbol = symbolId ? bySymbol.get(symbolId) : undefined;
    const file = fileId ? byId.get(fileId) : undefined;
    if (symbol)
        select(required(byId.get(symbol.fileId)), true, symbol, false);
    else if (file)
        select(file, true, undefined, false);
}
window.addEventListener('hashchange', openAnchor);
filter();
fit();
showGuide();
openAnchor();
