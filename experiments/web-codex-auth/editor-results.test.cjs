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
test('restored task starts on newest while manual candidate selection handler stays intact', () => {
  const transformed = panelResultsSource(panel);
  assert.match(transformed, /selectedCandidateId = generatedImages.at\(-1\)\?\.id \|\| null;/);
  assert.doesNotMatch(transformed, /selectedCandidateId = tab.selectedCandidateId/);
  assert.match(transformed, /selectedCandidateId = item.id;/);
  assert.throws(() => panelResultsSource('source changed'), /source changed/);
});
