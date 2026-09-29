const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '..');
const gate = path.join(root, 'scripts', 'check-release-gate.cjs');
const version = require('../package.json').version;

for (const status of ['HOLD', 'CLEARED']) {
  test(`release gate ${status === 'HOLD' ? 'blocks' : 'allows'} a ${status} candidate`, t => {
    // Given a fixture using the release hold document's version/status declaration.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), '5e-release-gate-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const file = path.join(folder, 'RELEASE_HOLD.md');
    fs.writeFileSync(file, `# v${version} release hold\n\nThe ${version} candidate remains **${status}**.\n`);
    // When the real gate CLI runs, then its exit status enforces the declaration.
    const result = spawnSync(process.execPath, [gate, '--hold-file', file, '--tag', `v${version}`], { encoding: 'utf8' });
    assert.equal(result.status, status === 'HOLD' ? 1 : 0, result.stderr);
    assert.match(result.stdout + result.stderr, new RegExp(`${version}.*${status}`));
  });
}

for (const text of ['', 'The 0.0.0 candidate remains **CLEARED**.', `The ${version} candidate remains **PENDING**.`]) {
  test(`release gate fails closed for an absent or unrecognized candidate decision: ${text}`, t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), '5e-release-gate-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const file = path.join(folder, 'RELEASE_HOLD.md');
    fs.writeFileSync(file, text);
    const result = spawnSync(process.execPath, [gate, '--hold-file', file], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /release decision/i);
  });
}

test('release gate rejects a tag that differs from the package version', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), '5e-release-gate-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'RELEASE_HOLD.md');
  fs.writeFileSync(file, 'The 0.0.0 candidate remains **CLEARED**.');
  const result = spawnSync(process.execPath, [gate, '--hold-file', file, '--tag', 'v0.0.0'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /tag.*package version/i);
});

for (const filename of fs.readdirSync(path.join(root, '.github', 'workflows')).filter(name => /\.ya?ml$/.test(name))) {
  const workflow = yaml.load(fs.readFileSync(path.join(root, '.github', 'workflows', filename), 'utf8'));
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    const publishes = job.steps.map((step, index) => ({ step, index })).filter(({ step }) =>
      /gh release (create|edit)|--publish (always|onTag|onTagOrDraft)/.test(step.run || '') || /action-gh-release|release-action/.test(step.uses || ''));
    for (const { step, index } of publishes) {
      test(`${filename} ${jobName} step ${index} requires its release gate before creating only drafts`, () => {
        const priorGate = job.steps.slice(0, index).find(candidate => /node scripts\/check-release-gate\.cjs/.test(candidate.run || ''));
        assert.ok(priorGate, 'a required gate must precede every release creation');
        assert.equal(priorGate['continue-on-error'], undefined);
        assert.equal(priorGate.if, undefined);
        assert.match(priorGate.run, /--tag "\$\{\{ github\.ref_name \}\}"/);
        assert.equal(step['continue-on-error'], undefined);
        if (step.run) {
          const commands = step.run.split('\n').filter(line => /gh release create/.test(line));
          assert.ok(commands.length > 0, 'release commands must create drafts');
          for (const command of commands) assert.match(command, /--draft(?:\s|$)/);
          assert.doesNotMatch(step.run, /gh release edit|--draft[= ]false/);
        } else {
          assert.equal(step.with?.draft, true);
        }
      });
    }
  }
}
