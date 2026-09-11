const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { editorCanvasSource } = require('./editor-canvas-source.cjs');
const source = editorCanvasSource(fs.readFileSync('js/ai-panel.js', 'utf8'));
const start = source.indexOf('    const selectedCanvasImage =');
const end = source.indexOf('    syncSelectedOutputActions();', start);
const selection = source.slice(start, end);

async function run(options = {}) {
  const context = {
    busy: false, reference: null, references: [],
    state: { get: () => ({ selectedIds: ['canvas-1'], objects: [{ id: 'canvas-1', type: 'image', src: 'data:image/png;base64,EXACT' }] }) },
    attachments: [], generatedImages: [], conversationMessages: [], input: { value: '' },
    taskTabs: new Map(), panel: { hidden: true },
    added: [], created: 0, restored: [], statuses: [], captured: 0,
    sourceToDataUrl: async src => src,
    isInputReference: item => !item.referenceRole || item.referenceRole === 'INPUT_SOURCE',
    ...options,
  };
  context.captureActiveTaskTab = () => { context.captured += 1; };
  context.restoreTaskTab = id => { context.restored.push(id); context.attachments = context.taskTabs.get(id).attachments; };
  context.createTaskTab = () => { context.created += 1; context.attachments = []; context.generatedImages = []; };
  context.addReferenceData = item => { context.added.push(item); context.attachments.push(item); };
  context.syncReferenceSummary = () => {};
  context.setStatus = (...status) => context.statuses.push(status);
  await vm.runInNewContext(`(async () => {${selection}})()`, context);
  return context;
}

test('ordinary selected canvas image attaches exact bytes without new task when empty', async () => {
  const result = await run();
  assert.equal(result.added[0].data, 'data:image/png;base64,EXACT');
  assert.equal(result.added[0].sourceKind, 'canvas');
  assert.equal(result.created, 0);
  assert.equal(result.panel.hidden, false);
});
test('unrelated generated work gets a separate canvas reference task', async () => {
  const previous = [{ id: 'result-1', data: 'old' }];
  const result = await run({ generatedImages: previous });
  assert.equal(result.created, 1);
  assert.equal(previous[0].data, 'old');
});
test('repeat open does not duplicate the current reference', async () => {
  const result = await run({ attachments: [{ data: 'data:image/png;base64,EXACT' }] });
  assert.equal(result.added.length, 0);
  assert.equal(result.created, 0);
});
test('previous reference task is captured and restored without duplicate', async () => {
  const result = await run({ taskTabs: new Map([['task-2', { id: 'task-2', attachments: [{ data: 'data:image/png;base64,EXACT' }] }]]) });
  assert.equal(result.restored[0], 'task-2');
  assert.equal(result.captured, 1);
  assert.equal(result.added.length, 0);
});
test('explicit references and busy state do not import canvas selection', async () => {
  for (const options of [{ busy: true }, { reference: { src: 'explicit' } }, { references: [{ src: 'explicit' }] }, { state: { get: () => ({ selectedIds: [], objects: [] }) } }]) {
    assert.equal((await run(options)).added.length, 0);
  }
});
test('load failure is visible and leaves existing task intact', async () => {
  const result = await run({ sourceToDataUrl: async () => { throw new Error('unavailable'); } });
  assert.equal(result.statuses[0][1], 'error');
  assert.equal(result.created, 0);
});
test('transform rejects a changed upstream selection block', () => {
  assert.throws(() => editorCanvasSource(''), /source changed/);
});
