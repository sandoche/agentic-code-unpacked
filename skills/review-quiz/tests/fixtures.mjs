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
