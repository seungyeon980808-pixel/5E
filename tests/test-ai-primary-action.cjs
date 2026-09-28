const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(new URL('../preview/js/ai-panel.js', `file://${__filename}`), 'utf8');
const handler = source.match(/sendButton\.onclick = \(\) => \{[\s\S]*?\n  \};/)[0];
function route(item, launchSelected = () => false) {
  const calls = [];
  const context = { sendButton: {}, launchSelected, selectedOutputItem: () => item,
    startScopedEdit: value => calls.push(['scoped', value]),
    submit: (kind, options) => calls.push(['transform', kind, options.bypassCache]) };
  vm.runInNewContext(handler, context);
  context.sendButton.onclick();
  return calls;
}
assert.deepEqual(route(null), [['transform', 'image', true]]);
assert.deepEqual(route({kind:'generated',comments:[]}), [['transform', 'image', true]]);
const image = {kind:'generated',comments:[{type:'area',text:'컵만 수정'}]};
assert.deepEqual(route(image), [['scoped',image]]);
const unfinished = {kind:'generated',comments:[{type:'area',text:''}]};
assert.deepEqual(route(unfinished), [['scoped',unfinished]], 'Incomplete area requests must validate, never fall through to full generation');
assert.deepEqual(route({kind:'generated',comments:[{type:'point',text:'수정'}]}), [['transform','image',true]]);
let batchCalls = 0;
for (const selected of [null, image, unfinished]) {
  assert.deepEqual(route(selected, () => { batchCalls += 1; return true; }), [],
    'An accepted multiselect action must not also submit or scope-edit the active task');
}
assert.equal(batchCalls, 3, 'Each primary click offers the selected task set exactly once');
assert.deepEqual(route(image, null), [['scoped', image]], 'A declared absent batch callback preserves single-task behavior');
console.log('Primary action: original single-task routing, incomplete-area guard, and exclusive batch routing passed');

const library = fs.readFileSync(new URL('../preview/js/unified-library-ui.js', `file://${__filename}`), 'utf8');
const selectedActive = library.match(/const selectedActiveResult = \(\) => \{[\s\S]*?\n  \};/)[0];
const emptyContext = { selectedResult: () => null, cropSession: null, continuousView: null, pdfMatchIndex: 0,
  activePdfPageResult: result => result, pdfFilePageResult: () => { throw new Error('Empty library is not a PDF page'); } };
assert.equal(vm.runInNewContext(selectedActive + '\nselectedActiveResult()', emptyContext), null);
console.log('Library empty selection: no null PDF-view access');

const pdfResult = { id: 'pdf-result', kind: 'pdf' };
const cropContext = { selectedResult: () => pdfResult,
  cropSession: { resultId: pdfResult.id, pageNumber: 2 }, continuousView: null, pdfMatchIndex: 0,
  activePdfPageResult: () => { throw new Error('Crop session must select its bound PDF page'); },
  pdfFilePageResult: (result, pageNumber) => ({ result, pageNumber }) };
assert.deepEqual(vm.runInNewContext(selectedActive + '\nselectedActiveResult()', cropContext),
  { result: pdfResult, pageNumber: 2 });
console.log('Library crop selection: bound PDF page remains active');

const useResultBlock = source.match(/if \(useResult && initialPrepared\) \{[\s\S]*?\n        return;\n      \}/)[0];
const used = [];
const useContext = { useResult: true, initialPrepared: { assets: [{ id: 'one' }], labelsDisabled: false },
  item: {}, state: {}, isCurrent: () => true, taskId: 'task', candidateId: 'candidate',
  candidateAlreadyInserted: () => false,
  insertEditableAssets: (_state, prepared) => { used.push(prepared); return true; },
  captureActiveTaskTab: () => {}, persistTasks: () => {}, close: options => used.push(options) };
vm.runInNewContext(`(() => { ${useResultBlock} })()`, useContext);
assert.equal(used[0].labelsDisabled, true);
assert.equal(used[0].assets[0].id, 'one');
assert.equal(used[1].integratedEdit, true);
assert.equal(useContext.initialPrepared.labelsDisabled, false, 'Do not mutate the prepared cache');
console.log('Result use: inserts prepared objects with labels off and enters canvas');
