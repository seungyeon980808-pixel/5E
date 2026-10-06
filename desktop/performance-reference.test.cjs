const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../tests/helpers/performance-reference.cjs');
const expected = { previewTree: 'a'.repeat(40), methodologyBlobs: { benchmark: 'b'.repeat(40) } };
function fixture() {
  const sourceCommit = 'c'.repeat(40);
  return {
    schemaVersion: 1, measuredOutsideGitHubActions: true, sourceDirty: false, sourceCommit, identity: expected,
    scenarios: ['chromium', 'webkit'].flatMap(engine => ['tasks-1', 'tasks-10', 'tasks-30', 'loading'].map(name => {
      const row = { engine, name, environment: { headless: false, deviceScaleFactor: 2, viewport: { width: 1440, height: 1000 }, platform: 'darwin', node: 'v24.21.0', head: sourceCommit, performanceIdentity: expected, measuredOutsideGitHubActions: true, dirtyStatus: '' }, sourceIntegrity: { unchanged: true, before: {}, after: {} }, cleanup: { serverClosed: true, browserClosed: true, contextClosed: true } };
      if (name === 'loading') { row.transition = { settledMs: 10, timings: [{ timing: { duration: 1 } }] }; row.result = { errors: [], touchHidesLens: true, dark: true, reducedMotion: true, decodedWidth: 800, retryWidth: 700, reopenedWidth: 600 }; }
      else { const count = Number(name.slice(6)); row.performance = { engine, count, dpr: 2, samples: Array.from({ length: 20 }, (_, index) => ({ id: `task-${count === 1 ? 0 : (index * 7 + 1) % count}`, ms: 30, ready: true })), over100ms: 0, longTaskSupported: engine === 'chromium', longTasks: [], longTasksOver50ms: [] }; row.visual = { errors: [], sends: 0 }; }
      return row;
    })),
  };
}
test('physical acceptance requires all engines, task counts, decoded targets and loading scenarios', () => {
  assert.ok(validate(fixture(), expected));
  for (const mutate of [r => r.scenarios.pop(), r => r.scenarios[1] = r.scenarios[0], r => r.scenarios[0].performance.samples[0].ready = false, r => r.scenarios[0].performance.samples.pop(), r => r.scenarios[0].performance.samples[0].id = 'wrong']) {
    const record = fixture(); mutate(record); assert.throws(() => validate(record, expected));
  }
});
test('slow physical samples and long tasks cannot be accepted by editing summary counters', () => {
  for (const mutate of [r => r.scenarios[0].performance.samples[0].ms = 100, r => r.scenarios[0].performance.samples[0].ms = NaN, r => r.scenarios[0].performance.longTasks = [{ duration: 51 }], r => r.scenarios[3].transition.settledMs = 100, r => r.scenarios[3].transition.timings[0].timing.duration = 2]) {
    const record = fixture(); mutate(record); assert.throws(() => validate(record, expected));
  }
});
test('a previous performance record is invalid after any preview or methodology change', () => {
  assert.throws(() => validate(fixture(), { ...expected, previewTree: 'd'.repeat(40) }));
  assert.throws(() => validate(fixture(), { ...expected, methodologyBlobs: { benchmark: 'e'.repeat(40) } }));
});
test('dirty, hosted, incomplete cleanup and failed visual evidence are rejected', () => {
  for (const mutate of [r => r.sourceDirty = true, r => r.measuredOutsideGitHubActions = false, r => r.scenarios[0].environment.measuredOutsideGitHubActions = false, r => r.scenarios[0].environment.dirtyStatus = ' M preview/js/ai-panel.js', r => r.scenarios[0].cleanup.browserClosed = false, r => r.scenarios[0].sourceIntegrity.unchanged = false, r => r.scenarios[0].visual.errors = ['runtime error'], r => r.scenarios[0].visual.sends = 1, r => r.scenarios[3].result.errors = ['runtime error']]) {
    const record = fixture(); mutate(record); assert.throws(() => validate(record, expected));
  }
});

test('a local supplied performance reference cannot relax live timing gates', () => {
  const { spawnSync } = require('node:child_process');
  const root = require('node:path').resolve(__dirname, '..');
  const run = spawnSync(process.execPath, ['-e', "require('./tests/helpers/performance-reference.cjs').loadForHostedCi(process.cwd())"], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'false', TASK9_PERFORMANCE_REFERENCE: 'nonexistent-reference.json' },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Only hosted CI may use physical reference acceptance/);
});

test('hosted acceptance fails closed when its reference is missing', () => {
  const { spawnSync } = require('node:child_process');
  const root = require('node:path').resolve(__dirname, '..');
  const run = spawnSync(process.execPath, ['-e', "require('./tests/helpers/performance-reference.cjs').loadForHostedCi(process.cwd())"], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: 'true', TASK9_PERFORMANCE_REFERENCE: 'nonexistent-reference.json' },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /ENOENT/);
});
