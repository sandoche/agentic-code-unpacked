const model = JSON.parse(document.getElementById('artifact-data').textContent);
const viewport = document.getElementById('viewport');
const plane = document.getElementById('plane');
const cards = document.getElementById('cards');
const edges = document.getElementById('edges');
const detail = document.getElementById('detail');
const search = document.getElementById('search');
const changed = document.getElementById('changed');
const svgNS = 'http://www.w3.org/2000/svg';
const nodes = model.nodes.map(node => ({ ...node }));
const initial = new Map(nodes.map(node => [node.id, { x: node.x, y: node.y }]));
const elements = new Map();
const listItems = new Map([...document.querySelectorAll('#file-list li')].map(item => [item.dataset.file, item]));
let view = { x: 20, y: 20, scale: 1 };
let selected;
let gesture;

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function transform() {
  plane.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`;
  plane.classList.toggle('semantic-small', view.scale < .6);
  document.getElementById('zoom-label').textContent = `${Math.round(view.scale * 100)}%`;
}

function visible(node) {
  return node.path.toLowerCase().includes(search.value.toLowerCase()) && (!changed.checked || node.status !== 'snapshot');
}

function drawEdges() {
  edges.replaceChildren();
  for (const edge of model.relationships) {
    const from = nodes.find(node => node.id === edge.fromFileId);
    const to = nodes.find(node => node.id === edge.toFileId);
    if (!visible(from) || !visible(to)) continue;
    const x1 = from.x + from.width / 2, y1 = from.y + from.height / 2;
    const x2 = to.x + to.width / 2, y2 = to.y + to.height / 2;
    const line = document.createElementNS(svgNS, 'path');
    line.setAttribute('d', `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}`);
    line.setAttribute('class', 'edge');
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${from.path} → ${to.path}: ${edge.label}`;
    line.append(title);
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', String((x1+x2)/2)); label.setAttribute('y', String((y1+y2)/2 - 7));
    label.setAttribute('class', 'edge-label'); label.textContent = edge.label;
    edges.append(line, label);
  }
}

function filter() {
  let count = 0;
  for (const node of nodes) {
    const show = visible(node);
    elements.get(node.id).hidden = !show;
    listItems.get(node.id).hidden = !show;
    if (show) count++;
  }
  document.getElementById('count').textContent = `${count} of ${nodes.length} files · ${model.relationships.length} cited relationships`;
  document.getElementById('empty').hidden = count !== 0;
  drawEdges();
}

function addCitations(parent, citations) {
  const list = element('div', undefined, 'sources');
  for (const citation of citations) {
    const label = `${citation.path}:${citation.startLine}–${citation.endLine} (${citation.side})`;
    const item = element(citation.url && /^https?:\/\//.test(citation.url) ? 'a' : 'span', label);
    if (item.tagName === 'A') { item.href = citation.url; item.target = '_blank'; item.rel = 'noreferrer'; }
    list.append(item);
  }
  parent.append(list);
}

function codeBlock(node, mode) {
  const pre = element('pre');
  if (mode === 'diff' && node.hunks?.length) {
    for (const hunk of node.hunks) {
      pre.append(element('span', hunk.header, 'hunk-header'));
      for (const line of hunk.lines) {
        const row = element('span', undefined, `diff-line ${line.kind}`);
        row.append(element('span', line.oldLine ?? '', 'line-number'), element('span', line.newLine ?? '', 'line-number'), document.createTextNode(`${line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '} ${line.text}`));
        pre.append(row);
      }
    }
  } else {
    const source = mode === 'base' ? node.baseContent : node.content;
    if (typeof source !== 'string') { pre.textContent = 'Source is unavailable for this revision.'; return pre; }
    const lines = source.replace(/\n$/, '').split('\n');
    const [start, end] = node.selectedRange || [1, lines.length];
    for (let index = start - 1; index < Math.min(end, lines.length); index++) {
      const row = element('span', undefined, 'diff-line');
      row.append(element('span', index + 1, 'line-number'), document.createTextNode(lines[index])); pre.append(row);
    }
  }
  return pre;
}

function select(node, center = false) {
  selected = node.id;
  for (const item of nodes) elements.get(item.id).classList.toggle('selected', item.id === selected);
  document.querySelectorAll('.file-select').forEach(button => button.setAttribute('aria-current', String(button.dataset.id === selected)));
  detail.replaceChildren(element('h2', node.path));
  const description = [node.status, node.oldPath && node.oldPath !== node.path ? `from ${node.oldPath}` : '', node.selectedRange ? `selected lines ${node.selectedRange.join('–')}` : ''].filter(Boolean).join(' · ');
  detail.append(element('p', description, 'file-state'));
  if (node.omission) detail.append(element('p', node.omission, 'warning'));
  const citations = model.evidence.filter(item => item.fileId === node.id).map(item => ({ ...item, path: item.side === 'base' && node.oldPath ? node.oldPath : node.path }));
  addCitations(detail, citations);
  if (!node.binary && !node.omission) {
    const modes = [];
    if (node.hunks?.length) modes.push(['diff', 'Unified diff']);
    if (typeof node.content === 'string') modes.push(['head', 'Head source']);
    if (typeof node.baseContent === 'string') modes.push(['base', 'Base source']);
    if (!modes.length) detail.append(element('p', 'No code excerpt was supplied.', 'warning'));
    else {
      const chooser = element('select'); chooser.setAttribute('aria-label', 'Code view');
      for (const [value, label] of modes) { const option = element('option', label); option.value = value; chooser.append(option); }
      const code = element('div'); code.append(codeBlock(node, modes[0][0]));
      chooser.addEventListener('change', () => code.replaceChildren(codeBlock(node, chooser.value)));
      detail.append(chooser, code);
    }
  }
  for (const note of model.annotations.filter(item => item.fileId === node.id)) {
    const block = element('section', undefined, 'annotation');
    block.append(element('h3', note.title), element('p', note.text)); addCitations(block, note.citations); detail.append(block);
  }
  const relationships = model.relationships.filter(edge => edge.fromFileId === node.id || edge.toFileId === node.id);
  if (relationships.length) {
    detail.append(element('h3', 'Source-backed relationships'));
    for (const edge of relationships) {
      const from = nodes.find(item => item.id === edge.fromFileId), to = nodes.find(item => item.id === edge.toFileId);
      const block = element('div'); block.append(element('p', `${from.path} → ${to.path}: ${edge.label}`)); addCitations(block, edge.citations); detail.append(block);
    }
  } else detail.append(element('p', 'No source-backed relationships were supplied for this file.', 'empty-notes'));
  if (center) { view.x = viewport.clientWidth / 2 - (node.x + node.width / 2) * view.scale; view.y = viewport.clientHeight / 2 - (node.y + node.height / 2) * view.scale; transform(); }
}

for (const group of model.groups) {
  const label = element('div', group.name === '.' ? 'Repository root' : group.name, 'group-label');
  label.style.left = `${group.x}px`; label.style.top = `${group.y}px`; document.getElementById('groups').append(label);
}
for (const node of nodes) {
  const card = element('article', undefined, 'file-card'); card.dataset.id = node.id; card.dataset.moved = 'false';
  card.style.left = `${node.x}px`; card.style.top = `${node.y}px`;
  const heading = element('div', node.path.split('/').at(-1), 'card-heading'); heading.title = node.path;
  const meta = element('div', undefined, 'card-meta'); meta.append(element('span', node.status, `status ${node.status}`), element('span', `+${node.additions}`, 'stat-add'), document.createTextNode(' / '), element('span', `−${node.deletions}`, 'stat-remove'));
  card.append(heading, meta, element('div', node.omission || node.path, 'card-path'));
  card.addEventListener('click', () => { if (!card.dataset.justDragged) select(node); });
  heading.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.stopPropagation(); heading.setPointerCapture(event.pointerId);
    gesture = { kind: 'node', id: node.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: node.x, y: node.y, dragged: false };
  });
  heading.addEventListener('pointermove', event => {
    if (gesture?.kind !== 'node' || gesture.id !== node.id || gesture.pointerId !== event.pointerId) return;
    const dx = (event.clientX - gesture.startX) / view.scale, dy = (event.clientY - gesture.startY) / view.scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) gesture.dragged = true;
    node.x = gesture.x + dx; node.y = gesture.y + dy; card.style.left = `${node.x}px`; card.style.top = `${node.y}px`; card.dataset.moved = String(gesture.dragged); drawEdges();
  });
  heading.addEventListener('pointerup', () => { if (gesture?.kind === 'node') { if (gesture.dragged) { card.dataset.justDragged = 'true'; setTimeout(() => delete card.dataset.justDragged, 0); } gesture = undefined; } });
  cards.append(card); elements.set(node.id, card);
}
document.querySelectorAll('.file-select').forEach(button => button.addEventListener('click', () => select(nodes.find(node => node.id === button.dataset.id), true)));

function zoom(factor, x = viewport.clientWidth / 2, y = viewport.clientHeight / 2) {
  const next = Math.min(2.5, Math.max(.12, view.scale * factor));
  view.x = x - (x - view.x) * next / view.scale; view.y = y - (y - view.y) * next / view.scale; view.scale = next; transform();
}
function fit() {
  const shown = nodes.filter(visible);
  if (!shown.length) return;
  const minX = Math.min(...shown.map(node => node.x)), minY = Math.min(...shown.map(node => node.y));
  const maxX = Math.max(...shown.map(node => node.x + node.width)), maxY = Math.max(...shown.map(node => node.y + node.height));
  view.scale = Math.min(1, Math.max(.12, Math.min((viewport.clientWidth - 50) / (maxX - minX), (viewport.clientHeight - 50) / (maxY - minY))));
  view.x = (viewport.clientWidth - (maxX - minX) * view.scale) / 2 - minX * view.scale; view.y = (viewport.clientHeight - (maxY - minY) * view.scale) / 2 - minY * view.scale; transform();
}
viewport.addEventListener('wheel', event => { event.preventDefault(); const bounds = viewport.getBoundingClientRect(); zoom(Math.exp(-event.deltaY * .0015), event.clientX - bounds.left, event.clientY - bounds.top); }, { passive: false });
viewport.addEventListener('pointerdown', event => { if (event.button !== 0 || event.target.closest('.file-card')) return; viewport.setPointerCapture(event.pointerId); gesture = { kind: 'pan', pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: view.x, y: view.y }; });
viewport.addEventListener('pointermove', event => { if (gesture?.kind !== 'pan' || gesture.pointerId !== event.pointerId) return; view.x = gesture.x + event.clientX - gesture.startX; view.y = gesture.y + event.clientY - gesture.startY; transform(); });
viewport.addEventListener('pointerup', () => { if (gesture?.kind === 'pan') gesture = undefined; });
viewport.addEventListener('pointercancel', () => { gesture = undefined; });
viewport.addEventListener('keydown', event => {
  const moves = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
  if (moves[event.key]) { event.preventDefault(); view.x += moves[event.key][0]; view.y += moves[event.key][1]; transform(); }
  else if (event.key === '+' || event.key === '=') zoom(1.2);
  else if (event.key === '-') zoom(1 / 1.2);
  else if (event.key === '0') fit();
});
search.addEventListener('input', filter); changed.addEventListener('change', filter);
document.getElementById('zoom-in').addEventListener('click', () => zoom(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoom(1 / 1.2));
document.getElementById('fit').addEventListener('click', fit);
document.getElementById('reset').addEventListener('click', () => {
  for (const node of nodes) { Object.assign(node, initial.get(node.id)); const card = elements.get(node.id); card.style.left = `${node.x}px`; card.style.top = `${node.y}px`; card.dataset.moved = 'false'; }
  drawEdges(); fit();
});
filter(); fit();
