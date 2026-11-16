'use strict';

// Standalone and official-runner entry. No server, dependency installation,
// source-suite subprocess, live account, or native Safari is started here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function selectors(argv) {
  if (!argv.length) return Array.from({ length: 8 }, (_, i) => `QA${i + 1}`);
  assert.equal(argv.length, 2, 'Usage: node tests/test-four-session-integration-browser.cjs [--scenario QA1..QA8]');
  assert.equal(argv[0], '--scenario', 'Unknown option; expected --scenario');
  assert.match(argv[1], /^QA[1-8]$/, 'Unknown/missing scenario; expected QA1..QA8');
  return [argv[1]];
}

function selection(argv) {
  if (argv[0] !== '--probe') return { selected: selectors(argv), probe: null };
  assert.equal(argv.length, 2, 'Usage: node tests/test-four-session-integration-browser.cjs --probe zoom-api|zoom');
  assert.ok(['zoom-api', 'zoom'].includes(argv[1]), 'Unknown/missing probe; expected zoom-api|zoom');
  return { selected: ['QA8'], probe: argv[1] };
}

async function main() {
  // Validate all selectors/configuration before requiring Playwright or launching.
  const { selected, probe } = selection(process.argv.slice(2));
  assert.equal(process.env.APP_ENTRY || '/', '/', 'Cross-feature QA must start at the actual canonical root');
  process.env.APP_ENTRY = '/';
  process.env.APP_MODULE_BASE ||= '/js/';
  process.env.APP_MODULE_QUERY ||= '?v=1.7.0-four-session-integration';
  assert.equal(process.env.APP_MODULE_BASE, '/js/');
  assert.equal(process.env.APP_MODULE_QUERY, '?v=1.7.0-four-session-integration');
  assert.equal(process.version, 'v24.21.0', 'Use the pinned Node v24.21.0');
  const configured = process.env.RELEASE_URL || process.env.EXAM_URL;
  assert.ok(configured, 'Set RELEASE_URL/EXAM_URL to the retained external candidate server (65177); this test never starts one');
  const url = new URL(configured);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol === 'http:', 'A local candidate URL is required');
  for (const key of ['RELEASE_URL', 'EXAM_URL']) {
    if (process.env[key]) assert.equal(new URL(process.env[key]).origin, url.origin, 'All QA must use the same actual runtime/origin');
    process.env[key] = new URL('/', url).href;
  }
  process.env.PREVIEW_URL = process.env.RELEASE_URL;
  if (!probe && selected.includes('QA8')) {
    assert.ok(process.env.CROSS_TRANSFER_URL, 'Supply a second actual owned preview origin with CROSS_TRANSFER_URL; the official runner prepares it automatically');
    const transfer = new URL(process.env.CROSS_TRANSFER_URL);
    assert.ok(['127.0.0.1', 'localhost'].includes(transfer.hostname) && transfer.protocol === 'http:' && transfer.pathname === '/' && !transfer.search && !transfer.hash && !transfer.username && !transfer.password);
    assert.notEqual(transfer.origin, url.origin, 'Explicit file transfer requires a genuinely different storage origin');
  }
  const root = path.resolve(__dirname, '..');
  const sha = value => createHash('sha256').update(value).digest('hex');
  const helperFile = path.join(__dirname, 'helpers/four-session-cross-scenarios.cjs');
  const helpers = require(helperFile);
  const revision = helpers.fingerprint(root);
  const base = path.resolve(process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/four-session-integration', revision.head, 'cross-feature'));
  fs.mkdirSync(base, { recursive: true });
  let output;
  for (let i = 1; !output; i++) {
    const candidate = path.join(base, `attempt-${String(i).padStart(3, '0')}`);
    try { fs.mkdirSync(candidate); output = candidate; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const report = {
    schemaVersion: 1, kind: probe ? 'focused-actual-browser-zoom-probe' : 'actual-cross-feature-automated-QA',
    startedAt: new Date().toISOString(), selected, engines: ['chromium', 'webkit'],
    probe, fullScenarioCoverageClaim: !probe && selected.length === 8,
    coverageScope: probe === 'zoom-api' ? ['backend/metrics/graph/AI diagnostic only; no mandatory QA8 row certified']
      : probe ? ['QA8/real-browser-zoom-200 only; does not certify the other QA8 rows'] : selected,
    root, entry: '/', url: process.env.RELEASE_URL, runtime: process.version,
    invocation: process.argv, executable: process.execPath,
    exactCommand: helpers.command(process.execPath, process.argv.slice(1)),
    environment: Object.fromEntries(['APP_ENTRY', 'APP_MODULE_BASE', 'APP_MODULE_QUERY', 'RELEASE_URL', 'EXAM_URL', 'CROSS_TRANSFER_URL', 'PLAYWRIGHT_MODULE', 'NODE_PATH'].map(k => [k, process.env[k] || null])),
    ...revision, harnessSha256: sha(fs.readFileSync(__filename)), helperSha256: sha(fs.readFileSync(helperFile)),
    providerCalls: 0, authentication: 'transport fixture only', qualityClaim: false,
    nativeSafari: { status: 'PENDING_SEPARATE_RECEIPT', automatedWebKitIsNativeSafari: false },
    knownMissingOracles: helpers.pendingOracles,
    results: [], cleanup: { externalServerRetained: true, sourceRootsReadOnly: true },
  };
  const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  save();
  // Both dimensions are serial, including failures. No hidden engine selector.
  for (const scenario of selected) for (const engine of report.engines) {
    const directory = path.join(output, scenario, engine);
    fs.mkdirSync(directory, { recursive: true });
    const result = await helpers.execute({ scenario, engine, directory, report, probe });
    report.results.push(result);
    save();
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${probe ? probe.toUpperCase() + '_PROBE' : scenario}/${engine}: ${result.assertions.filter(a => a.status === 'PASS').length} assertions; ${result.coverage.filter(a => a.status !== 'PASS').length} unsatisfied requirements`);
  }
  report.endedAt = new Date().toISOString();
  report.finalFingerprint = helpers.fingerprint(root);
  report.inputChangedDuringRun = report.dirtyHash !== report.finalFingerprint.dirtyHash || report.head !== report.finalFingerprint.head;
  report.pass = report.results.length === selected.length * 2 && report.results.every(r => r.pass) && !report.inputChangedDuringRun;
  report.exitCode = report.pass ? 0 : 1;
  save();
  console.log(`Receipt: ${path.join(output, 'report.json')}`);
  if (!report.pass) process.exitCode = 1;
}

if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });
module.exports = { selectors, selection };
