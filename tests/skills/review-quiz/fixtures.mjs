export const context = {
  schemaVersion: 1,
  target: { kind: 'docs', name: 'fixture', files: ['handler.js'] },
  source: { head: '1234567890abcdef', kind: 'working-tree' },
  files: [{ id: 'handler', path: 'handler.js', status: 'snapshot', hunks: [], content: 'function save(value) {\n  if (!value) throw Error("Missing value");\n  return value;\n}\n' }],
  evidence: [{ id: 'save-head', fileId: 'handler', startLine: 1, endLine: 4, side: 'head' }],
  limitations: ['Only the selected handler was captured.'],
};

export function quizFixture() {
  return {
    schemaVersion: 1,
    title: 'Understand the save handler',
    summary: 'Check behavior and limits before reviewing.',
    questions: [
      { id: 'behavior', prompt: 'What does the handler return for a truthy value?', topic: 'behavior', options: [{ id: 'value', text: 'The input value' }, { id: 'null', text: 'Null' }, { id: 'promise', text: 'A promise' }], correctOptionId: 'value', explanation: 'The handler returns its argument directly.', evidence: ['save-head'], recommendation: 'Read the return statement and identify its value.' },
      { id: 'failure', prompt: 'What happens with an empty string?', topic: 'failures', options: [{ id: 'throw', text: 'A missing-value error is thrown' }, { id: 'saved', text: 'The value is saved' }, { id: 'null', text: 'Null is returned' }], correctOptionId: 'throw', explanation: 'An empty string is falsy and reaches the guard.', evidence: ['save-head'], recommendation: 'Trace falsy values through the guard.' },
      { id: 'failure-again', prompt: 'What happens with zero?', topic: 'failures', options: [{ id: 'throw', text: 'The guard throws' }, { id: 'number', text: 'Zero is returned' }, { id: 'retry', text: 'The handler retries' }], correctOptionId: 'throw', explanation: 'Zero is also falsy.', evidence: ['save-head'], recommendation: 'Trace falsy values through the guard.' },
    ],
    limitations: ['This quiz does not establish whether truthiness is the desired validation rule.'],
  };
}

export const architectureContext = {
  ...context,
  target: { kind: 'docs', name: 'architecture-fixture', files: ['handler.js', 'repository.js', 'storage.js'] },
  files: [
    { id: 'handler', path: 'handler.js', status: 'snapshot', hunks: [], content: 'import { save } from "./repository.js";\nexport function handle(input) {\n  return save(input);\n}\n' },
    { id: 'repository', path: 'repository.js', status: 'snapshot', hunks: [], content: 'import { write } from "./storage.js";\nexport function save(input) {\n  return write(input);\n}\n' },
    { id: 'storage', path: 'storage.js', status: 'snapshot', hunks: [], content: 'export function write(input) {\n  return { stored: input };\n}\n' },
  ],
  evidence: [
    { id: 'handler-head', fileId: 'handler', startLine: 1, endLine: 4, side: 'head' },
    { id: 'repository-head', fileId: 'repository', startLine: 1, endLine: 4, side: 'head' },
    { id: 'storage-head', fileId: 'storage', startLine: 1, endLine: 3, side: 'head' },
  ],
  limitations: [],
};

export function architectureQuizFixture() {
  const sequence = {
    title: 'Sequence A',
    description: 'The handler calls the repository, which calls storage.',
    mermaid: 'sequenceDiagram\n  Handler->>Repository: save(input)\n  Repository->>Storage: write(input)',
  };
  return {
    schemaVersion: 3,
    title: 'Understand the storage architecture',
    requestedCount: 3,
    questions: [
      {
        id: 'missing', topic: 'architecture', prompt: 'Which component replaces the question mark?',
        diagram: { title: 'Partial request flow', description: 'The handler calls an unknown component before storage.', mermaid: 'flowchart LR\n  Handler --> Missing["?"]\n  Missing --> Storage' },
        options: [{ id: 'repository', text: 'The repository' }, { id: 'browser', text: 'The browser' }, { id: 'handler', text: 'Another handler' }],
        correctOptionId: 'repository', explanation: 'The handler calls save in the repository, which delegates to storage.',
        explanationDiagram: { title: 'Completed request flow', description: 'The handler delegates through the repository to storage.', mermaid: 'flowchart LR\n  Handler --> Repository\n  Repository --> Storage' },
        evidence: ['handler-head', 'repository-head'], recommendation: 'Follow the imports and return expressions across the handler and repository.',
      },
      {
        id: 'sequence', topic: 'architecture', prompt: 'Which candidate sequence matches a successful request?',
        options: [
          { id: 'chain', text: 'Sequence A', diagram: sequence },
          { id: 'direct', text: 'Sequence B', diagram: { title: 'Sequence B', description: 'The handler calls storage directly.', mermaid: 'sequenceDiagram\n  Handler->>Storage: write(input)' } },
          { id: 'reversed', text: 'Sequence C', diagram: { title: 'Sequence C', description: 'Storage calls the repository, which calls the handler.', mermaid: 'sequenceDiagram\n  Storage->>Repository: save(input)\n  Repository->>Handler: handle(input)' } },
        ],
        correctOptionId: 'chain', explanation: 'The imports and calls establish Handler → Repository → Storage.',
        explanationDiagram: { ...sequence, title: 'Verified call sequence' },
        evidence: ['handler-head', 'repository-head', 'storage-head'], recommendation: 'Trace handle(input) into save(input) and then write(input).',
      },
      {
        id: 'correction', topic: 'architecture', prompt: 'This candidate skips a component. Which correction matches the source?',
        diagram: { title: 'Candidate execution states', description: 'The candidate moves directly from handling to writing.', mermaid: 'stateDiagram-v2\n  [*] --> Handling\n  Handling --> Writing\n  Writing --> [*]' },
        options: [{ id: 'repository', text: 'Insert a repository call before writing' }, { id: 'reverse', text: 'Write before handling' }, { id: 'remove', text: 'Remove the storage call' }],
        correctOptionId: 'repository', explanation: 'Handling invokes save in the repository before write in storage.',
        evidence: ['handler-head', 'repository-head'], recommendation: 'Compare the candidate transition with the actual call chain.',
      },
    ],
  };
}
