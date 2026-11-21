import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeStructure } from '../scripts/analysis.mjs';
import { resolveEvidence } from '../scripts/core.mjs';

function context(sources) {
  const files = Object.entries(sources).map(([path, content], index) => ({
    id: 'file-' + index, path, content, status: 'snapshot', hunks: [],
  }));
  return {
    schemaVersion: 2, target: { kind: 'codebase' }, source: { head: 'a'.repeat(40) },
    files, relationships: [], limitations: [],
    evidence: files.map(({ id, content }) => ({
      id: id + '-head', fileId: id, side: 'head', startLine: 1, endLine: content.trimEnd().split('\n').length,
    })),
  };
}

function symbol(result, path, name) {
  return result.symbols.find(item => item.name === name && result.files.find(file => file.id === item.fileId).path === path);
}

function links(result, from, to, kind) {
  return result.relationships.filter(edge => edge.kind === kind
    && result.files.some(file => file.id === edge.fromFileId && file.path === from)
    && result.files.some(file => file.id === edge.toFileId && file.path === to));
}

test('extracts declarations, source lines and local relationships for all twelve new languages', async () => {
  const samples = [
    ['sample.sql', 'CREATE TABLE items (id INT);\nCREATE VIEW visible AS SELECT id FROM items;\n', 'items', 'visible', 'references', 2],
    ['sample.py', 'def helper():\n    return 1\n\ndef run():\n    return helper()\n', 'helper', 'run', 'calls', 5],
    ['sample.sh', 'helper() { :; }\nrun() { helper; }\n', 'helper', 'run', 'calls', 2],
    ['Sample.java', 'class Sample {\n void helper() {}\n void run() { this.helper(); }\n}\n', 'Sample.helper', 'Sample.run', 'calls', 3],
    ['Sample.cs', 'class Sample {\n void Helper() {}\n void Run() { this.Helper(); }\n}\n', 'Sample.Helper', 'Sample.Run', 'calls', 3],
    ['sample.ps1', 'function Helper { Write-Output 1 }\nfunction Run { helper }\n', 'Helper', 'Run', 'calls', 2],
    ['sample.cpp', 'void helper() {}\nvoid run() { helper(); }\n', 'helper', 'run', 'calls', 2],
    ['sample.c', 'void helper(void) {}\nvoid run(void) { helper(); }\n', 'helper', 'run', 'calls', 2],
    ['sample.rs', 'fn helper() {}\nfn run() { helper(); }\n', 'helper', 'run', 'calls', 2],
    ['sample.go', 'package test\nfunc helper() {}\nfunc run() { helper() }\n', 'helper', 'run', 'calls', 3],
    ['sample.kt', 'fun helper() {}\nfun run() { helper() }\n', 'helper', 'run', 'calls', 2],
    ['sample.lua', 'local function helper() end\nlocal function run() helper() end\n', 'helper', 'run', 'calls', 2],
  ];
  const result = await analyzeStructure(context(Object.fromEntries(samples.map(([path, code]) => [path, code]))));
  assert.deepEqual(result.limitations, []);
  for (const [path, , called, caller, kind, line] of samples) {
    const target = symbol(result, path, called);
    const source = symbol(result, path, caller);
    assert.ok(source && target, path + ' declarations');
    const edge = links(result, path, path, kind).find(item => item.fromSymbolId === source.id && item.toSymbolId === target.id);
    assert.ok(edge, path + ' relationship');
    const citation = resolveEvidence(result, edge.evidenceIds[0]);
    assert.equal(citation.startLine, line, path);
    assert.equal(citation.path, path);
    assert.equal(edge.provenance, 'source-ast');
  }
  assert.deepEqual(await analyzeStructure(result), result);
});

test('resolves captured path imports and explicit bindings across files', async () => {
  const result = await analyzeStructure(context({
    'py/main.py': 'from .worker import send as dispatch\n\ndef run():\n    dispatch()\n',
    'py/worker.py': 'def send():\n    pass\n',
    'c/main.c': '#include "worker.h"\nvoid run(void) { send(); }\n',
    'c/worker.h': 'static inline void send(void) {}\n',
    'cpp/main.cpp': '#include "worker.hpp"\nvoid run() { helpers::send(); }\n',
    'cpp/worker.hpp': 'namespace helpers { inline void send() {} }\n',
    'sh/main.sh': 'source "$' + '{BASH_SOURCE[0]%/*}/worker.sh"\n',
    'sh/worker.sh': 'worker() { :; }\n',
    'ps/main.ps1': 'Import-Module "$PSScriptRoot/Worker.psm1"\n',
    'ps/Worker.psm1': 'function Invoke-Worker { Write-Output 1 }\n',
    'rs/lib.rs': 'mod worker;\nuse self::worker::send as dispatch;\nfn run() { dispatch(); worker::send(); }\n',
    'rs/worker.rs': 'pub fn send() {}\n',
    'lua/main.lua': 'local worker = require("tasks.worker")\n',
    'tasks/worker.lua': 'function send() end\n',
    'jvm/Main.java': 'package main;\nimport utility.Worker;\nclass Main { void run() { Worker.send(); new Worker(); } }\n',
    'jvm/Worker.java': 'package utility;\npublic class Worker { public static void send() {} }\n',
    'cs/Main.cs': 'using Worker = Utility.Worker;\nclass Main { void Run() { Worker.Send(); new Worker(); } }\n',
    'cs/Worker.cs': 'namespace Utility;\nclass Worker { public static void Send() {} }\n',
    'kt/Main.kt': 'package main\nimport utility.send as dispatch\nfun run() { dispatch() }\n',
    'kt/Worker.kt': 'package utility\nfun send() {}\n',
    'go/main.go': 'package main\nfunc run() { send() }\n',
    'go/worker.go': 'package main\nfunc send() {}\n',
    'other/worker.go': 'package main\nfunc send() {}\n',
    'db/table.sql': 'CREATE TABLE app.items (id INT);\nCREATE FUNCTION app.count_items() RETURNS INT AS $$ SELECT 1 $$ LANGUAGE SQL;\n',
    'db/view.sql': 'CREATE VIEW app.visible AS SELECT id FROM app.items;\nSELECT app.count_items();\n',
  }));
  assert.deepEqual(result.limitations, []);
  for (const [from, to, kind] of [
    ['py/main.py', 'py/worker.py', 'imports'], ['py/main.py', 'py/worker.py', 'calls'],
    ['c/main.c', 'c/worker.h', 'imports'], ['c/main.c', 'c/worker.h', 'calls'],
    ['cpp/main.cpp', 'cpp/worker.hpp', 'imports'], ['cpp/main.cpp', 'cpp/worker.hpp', 'calls'],
    ['sh/main.sh', 'sh/worker.sh', 'imports'], ['ps/main.ps1', 'ps/Worker.psm1', 'imports'],
    ['rs/lib.rs', 'rs/worker.rs', 'imports'], ['rs/lib.rs', 'rs/worker.rs', 'calls'],
    ['lua/main.lua', 'tasks/worker.lua', 'imports'],
    ['jvm/Main.java', 'jvm/Worker.java', 'imports'], ['jvm/Main.java', 'jvm/Worker.java', 'calls'],
    ['jvm/Main.java', 'jvm/Worker.java', 'constructs'],
    ['cs/Main.cs', 'cs/Worker.cs', 'imports'], ['cs/Main.cs', 'cs/Worker.cs', 'calls'],
    ['cs/Main.cs', 'cs/Worker.cs', 'constructs'],
    ['kt/Main.kt', 'kt/Worker.kt', 'imports'], ['kt/Main.kt', 'kt/Worker.kt', 'calls'],
    ['go/main.go', 'go/worker.go', 'calls'], ['db/view.sql', 'db/table.sql', 'references'], ['db/view.sql', 'db/table.sql', 'calls'],
  ]) {
    const [edge] = links(result, from, to, kind);
    assert.ok(edge, [from, to, kind].join(' '));
    assert.deepEqual(edge.evidenceIds.map(id => resolveEvidence(result, id).path), [from, to]);
  }
  assert.deepEqual(links(result, 'go/main.go', 'other/worker.go', 'calls'), []);
});

test('leaves shadowed, ambiguous, dynamic and unavailable targets unresolved', async () => {
  const result = await analyzeStructure(context({
    'py/main.py': 'from .worker import send as work\n\ndef run(work):\n    work()\n    external.run()\n',
    'py/worker.py': 'def send():\n    pass\n',
    'py/nested.py': 'def outer():\n    def hidden():\n        pass\n\ndef sibling():\n    hidden()\n',
    'py/ambiguous.py': 'from .tools import execute\n\ndef run():\n    execute()\n',
    'py/tools.py': 'def execute():\n    pass\n',
    'py/tools/__init__.py': 'def execute():\n    pass\n',
    'c/missing.c': '#include <worker.h>\nvoid run(void) { send(); }\n',
    'c/worker.h': 'static inline void send(void) {}\n',
    'sh/dynamic.sh': 'source "$worker"\n',
    'rs/main.rs': 'use self::worker::send;\nfn run() { send(); }\n',
    'rs/worker.rs': 'pub fn send() {}\n',
    'kt/shadowed.kt': 'fun work() {}\nfun run(work: () -> Unit) { work() }\n',
    'lua/shadowed.lua': 'local require = load\nlocal task = require("tasks.worker")\n',
    'tasks/worker.lua': 'function work() end\n',
    'go/main.go': 'package main\nfunc run() { testOnly() }\n',
    'go/helper_test.go': 'package main\nfunc testOnly() {}\n',
    'db/cte.sql': 'CREATE TABLE items(id INT);\nWITH items AS (SELECT 1 AS id) SELECT id FROM items;\n',
    'cpp/overloads.cpp': 'void send(int x) {} void send(float x) {} void run() { send(0); }\n',
  }));
  assert.deepEqual(result.limitations, []);
  assert.deepEqual(result.relationships.map(edge => edge.kind), ['imports']);
  assert.equal(result.symbols.filter(item => item.name === 'send' && item.kind === 'function').length, 5);
  for (const expression of ['work', 'external.run', 'hidden', 'execute', 'send', 'items', 'testOnly', 'tasks.worker', 'source "$worker"']) {
    const unresolved = result.unresolved.find(item => item.expression === expression);
    assert.ok(unresolved, expression);
    assert.equal(resolveEvidence(result, unresolved.evidenceIds[0]).startLine, unresolved.line);
  }
});

test('preserves source for parser diagnostics and selected ranges and clears stale parser limitations', async () => {
  const original = context({
    'broken.py': 'def invalid(\n',
    'selected.py': 'def subset(): pass\n',
    'working.kt': 'fun execute() {}\n',
    'plain.txt': 'this is content\n',
  });
  original.files[1].selectedRange = [1, 1];
  original.limitations = ['working.kt: structure omitted (Tree-sitter parser diagnostics)', 'Unrelated limit'];
  const result = await analyzeStructure(original);
  assert.deepEqual(result.files, original.files);
  assert.deepEqual(result.symbols.map(item => item.name), ['execute']);
  assert.ok(result.limitations.some(item => item.startsWith('broken.py: structure omitted')));
  assert.ok(result.limitations.some(item => item.startsWith('selected.py: structural extraction omitted')));
  assert.ok(result.limitations.includes('Unrelated limit'));
  assert.ok(!result.limitations.some(item => item.startsWith('working.kt')));
});
