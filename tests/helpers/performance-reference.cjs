const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const methodologyFiles = [
  'tests/test-ai-workbench-polish-browser.cjs',
  'tests/test-ai-workspace-lifecycle-browser.cjs',
  'tests/helpers/crop-loading-fixture.cjs',
  'tests/helpers/performance-reference.cjs',
  'package-lock.json',
  'scripts/check-browser-performance-reference.cjs',
];
function identity(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'preview', ...methodologyFiles);
  assert.equal(dirty, '', 'Performance inputs must be committed and clean');
  return {
    previewTree: git('rev-parse', 'HEAD:preview'),
    methodologyBlobs: Object.fromEntries(methodologyFiles.map(file => [file, git('rev-parse', `HEAD:${file}`)])),
  };
}
function validate(reference, expected) {
  assert.equal(reference.schemaVersion, 1);
  assert.equal(reference.measuredOutsideGitHubActions, true, 'Hosted VM timings cannot certify the physical reference');
  assert.equal(reference.sourceDirty, false);
  assert.match(reference.sourceCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(reference.identity, expected, 'Performance reference does not match the current preview tree and methodology');
  assert.equal(reference.scenarios.length, 8, 'All eight physical scenarios are required');
  const required = new Set(['chromium', 'webkit'].flatMap(engine => ['tasks-1', 'tasks-10', 'tasks-30', 'loading'].map(name => `${engine}/${name}`)));
  for (const row of reference.scenarios) {
    assert.ok(required.delete(`${row.engine}/${row.name}`), 'Unexpected or duplicate reference scenario');
    assert.equal(row.environment.headless, false);
    assert.equal(row.environment.deviceScaleFactor, 2);
    assert.deepEqual(row.environment.viewport, { width: 1440, height: 1000 });
    assert.equal(row.environment.platform, 'darwin');
    assert.equal(row.environment.node, 'v24.21.0');
    assert.equal(row.environment.head, reference.sourceCommit);
    assert.deepEqual(row.environment.performanceIdentity, reference.identity);
    assert.equal(row.environment.measuredOutsideGitHubActions, true);
    assert.equal(row.environment.dirtyStatus, '');
    assert.equal(row.sourceIntegrity.unchanged, true);
    assert.deepEqual(row.sourceIntegrity.before, row.sourceIntegrity.after);
    assert.ok(row.cleanup.serverClosed && row.cleanup.browserClosed && row.cleanup.contextClosed);
    if (row.name === 'loading') {
      assert.ok(Number.isFinite(row.transition.settledMs) && row.transition.settledMs >= 0 && row.transition.settledMs < 100);
      assert.ok(row.transition.timings.every(item => item.timing.duration <= 1));
      assert.deepEqual(row.result.errors, []);
      assert.ok(row.result.touchHidesLens && row.result.dark && row.result.reducedMotion);
      assert.deepEqual([row.result.decodedWidth, row.result.retryWidth, row.result.reopenedWidth], [800, 700, 600]);
    } else {
      const report = row.performance;
      assert.equal(report.count, Number(row.name.slice(6)));
      assert.equal(report.engine, row.engine);
      assert.equal(report.dpr, 2);
      assert.equal(report.samples.length, 20);
      assert.ok(report.samples.every(sample => sample.ready === true && Number.isFinite(sample.ms) && sample.ms >= 0 && sample.ms < 100), 'Every physical click-to-paint sample must stay below 100ms');
      report.samples.forEach((sample, index) => assert.equal(sample.id, `task-${report.count === 1 ? 0 : (index * 7 + 1) % report.count}`));
      assert.equal(report.over100ms, 0);
      assert.equal(report.longTaskSupported, row.engine === 'chromium');
      assert.equal(report.longTasksOver50ms.length, 0);
      if (report.longTaskSupported) assert.ok(report.longTasks.every(task => task.duration <= 50));
      assert.equal(row.visual.errors.length, 0);
      assert.equal(row.visual.sends, 0);
    }
  }
  assert.equal(required.size, 0);
  return reference;
}
function loadForHostedCi(root) {
  const file = process.env.TASK9_PERFORMANCE_REFERENCE;
  if (!file) return null; // Local and standalone diagnostics retain the live strict timing assertions.
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Only hosted CI may use physical reference acceptance');
  return validate(JSON.parse(fs.readFileSync(path.resolve(root, file), 'utf8')), identity(root));
}
module.exports = { identity, validate, loadForHostedCi };
