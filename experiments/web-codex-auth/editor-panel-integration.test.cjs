const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createGateway } = require('./editor-gateway.cjs');

test('gateway serves a valid separated-image panel with all web adapters applied', async t => {
  // Given the real gateway and current editor sources, without an AI request.
  const gateway = createGateway();
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
  });

  // When the browser requests the complete transformed panel module.
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/editor/js/ai-panel.js`);
  const source = await response.text();

  // Then it loads as JavaScript and retains both separated-image and web controls.
  assert.equal(response.status, 200, source);
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const marker of [
    'data-ai-generation-mode',
    'candidateUsesSeparatedAssets(item)',
    'openGroupsForItem(item, true)',
    'separatedRecovery.dataset.aiSeparatedRecovery',
    "separatedCandidateNextAction(item) !== 'manual-regions'",
    'background.register(item, img)',
    'background.output(item).then(src => insertImageFromSrc',
    'preserveBytes:true,at:{x:0,y:0},aiTaskId',
    'taskFeedback(text, kind)',
    'content: simplifyComparison(comparison)',
    'const selectedCanvasImage =',
    'selectedCandidateId = generatedImages.at(-1)?.id || null;',
  ]) assert.ok(source.includes(marker), `Missing runtime integration: ${marker}`);
  assert.doesNotMatch(source, /savePng\.dataset\.aiSaveCandidate/);
});
