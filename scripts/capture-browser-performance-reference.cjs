const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { identity, validate } = require('../tests/helpers/performance-reference.cjs');
const root = path.resolve(__dirname, '..');
assert.notEqual(process.env.GITHUB_ACTIONS, 'true', 'Capture reference performance outside hosted CI');
assert.ok(process.argv[2], 'Pass the evidence directory from a successful strict headed run');
const evidence = path.resolve(process.argv[2]);
const read = (directory, name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const measuredIdentity = identity(root);
const scenarios = ['chromium', 'webkit'].flatMap(engine => ['tasks-1', 'tasks-10', 'tasks-30', 'loading'].map(name => {
  const directory = path.join(evidence, engine, name);
  const environment = read(directory, 'environment.json');
  const fields = ['node', 'engine', 'browserVersion', 'headless', 'platform', 'release', 'arch', 'cpu', 'cpuCount', 'totalMemory', 'viewport', 'deviceScaleFactor', 'head', 'dirtyStatus', 'measuredOutsideGitHubActions', 'performanceIdentity'];
  const source = read(directory, 'source-integrity.json');
  const cleanup = read(directory, 'cleanup.json');
  const row = { engine, name, environment: Object.fromEntries(fields.map(field => [field, environment[field]])), sourceIntegrity: source,
    cleanup: { serverClosed: cleanup.serverClosed, browserClosed: cleanup.browserClosed, contextClosed: cleanup.contextClosed } };
  if (name === 'loading') { row.transition = read(directory, 'loading-transition.json'); row.result = read(directory, 'results.json'); }
  else { row.performance = read(directory, 'performance.json'); const visual = read(directory, 'visual-content.json'); row.visual = { errors: visual.errors, sends: visual.sends }; }
  return row;
}));
const reference = { schemaVersion: 1, measuredOutsideGitHubActions: true, sourceDirty: false, sourceCommit, identity: measuredIdentity, scenarios };
validate(reference, measuredIdentity);
const destination = path.join(root, '.github/browser-performance-reference.json');
fs.writeFileSync(destination, JSON.stringify(reference, null, 2) + '\n');
console.log(`Captured 8 complete strict physical scenarios for ${sourceCommit}; 120 samples below 100ms; ${destination}`);
