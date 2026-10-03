const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('provider defaults initialize absent preferences and explicit choices never silently fall back', async () => {
  const { defaultAIModelSelection } = await import(pathToFileURL(path.join(__dirname, '../js/ai-model-capabilities.js')));
  const catalog = [
    { model: 'gpt-6-sol', isDefault: true, supportedReasoningEfforts: ['medium', 'high'], defaultReasoningEffort: 'medium', serviceTiers: ['priority'] },
    { model: 'gpt-6-luna', supportedReasoningEfforts: ['low'], defaultReasoningEffort: 'low', serviceTiers: [] },
  ];
  assert.deepEqual(defaultAIModelSelection(catalog), { model: 'gpt-6-sol', effort: 'medium', serviceTier: null });
  assert.deepEqual(defaultAIModelSelection(catalog, { model: 'gpt-6-luna' }), { model: 'gpt-6-luna', effort: 'low', serviceTier: null });
  const explicit = { model: 'gpt-6-sol', effort: 'high', serviceTier: 'priority' };
  assert.deepEqual(defaultAIModelSelection(catalog, explicit), explicit);
  assert.throws(() => defaultAIModelSelection(catalog, { model: 'unavailable' }), /새로고침/);
  assert.throws(() => defaultAIModelSelection(catalog, { model: 'gpt-6-luna', effort: 'high' }), /추론/);
  const panel = read('js/ai-panel.js');
  assert.match(panel, /sessionStorage\.getItem\(['"]5e\.aiModelExplicit['"]\)/);
  assert.match(panel, /sessionStorage\.setItem\(['"]5e\.aiModelExplicit['"], choice\.model\)/);
  assert.match(panel, /defaultAIModelSelection\(availableModels, preference\)/);
  assert.match(panel, /modelWarning\.textContent = message; modelWarning\.hidden = !message/);
  assert.match(read('index.html'), /data-ai-model-warning[^>]*role="status"[^>]*hidden/);
  assert.match(read('css/ai-panel.css'), /\.ai-model-warning\[hidden\]\s*\{\s*display:\s*none;/);
});
