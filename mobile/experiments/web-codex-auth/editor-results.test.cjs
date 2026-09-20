const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { editorResultsSource, panelResultsSource } = require('./editor-results-source.cjs');
const workbench = fs.readFileSync('js/ai-workbench.js', 'utf8');
const panel = fs.readFileSync('js/ai-panel.js', 'utf8');
test('result comparison source is guarded and preserves existing candidate event path', () => {
  const transformed = editorResultsSource(workbench);
  new vm.Script(transformed.replaceAll('export ', ''));
  assert.match(transformed, /panel.dataset.aiResultView = 'single'/);
  assert.match(transformed, /\['multiple', '여러 개 비교'\]/);
  assert.match(transformed, /candidateSelect.dispatchEvent\(new Event\('change'/);
  assert.match(transformed, /!candidateSelect \|\| panel.dataset.aiBusy === 'true'/);
  assert.throws(() => editorResultsSource('source changed'), /source changed/);
});
test('restored task keeps the persisted candidate instead of replacing it with the newest result', () => {
  const transformed = panelResultsSource(panel);
  const restore = transformed.match(/selectedCandidateId = tab\.selectedCandidateId \|\| generatedImages\.at\(-1\)\?\.id \|\| null;/)?.[0];
  assert.ok(restore);
  const context = {
    tab: { selectedCandidateId: 'chosen-before-restart' },
    generatedImages: [{ id: 'older' }, { id: 'newest' }],
  };
  vm.runInNewContext(`let selectedCandidateId; ${restore}; globalThis.result = selectedCandidateId;`, context);
  assert.equal(context.result, 'chosen-before-restart');
  assert.match(transformed, /selectedCandidateId = item.id;/);
  assert.throws(() => panelResultsSource('source changed'), /source changed/);
});
