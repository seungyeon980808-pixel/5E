'use strict';
// Prepared helper only. No shared test input is changed while the frozen run lives.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const INIT = 'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh", materializeCandidate });';

function fixtureContext(root, { siteRoot = root } = {}) {
  const entryHelpers = require(path.join(root, 'tests/helpers/four-session-entry.cjs'));
  const config = entryHelpers.entryConfiguration(process.env);
  const origin = 'http://127.0.0.1';
  const entryUrl = new URL(config.entry, origin).href;
  const html = fs.readFileSync(path.join(siteRoot, config.entry === '/' ? 'index.html' : 'preview/index.html'), 'utf8');
  const mainUrl = entryHelpers.mainModuleUrl(html, entryUrl);
  const source = fs.readFileSync(path.join(siteRoot, new URL(mainUrl).pathname), 'utf8');
  const bound = entryHelpers.runtimeConfiguration(config, entryUrl, mainUrl, source);
  const runtime = { ...config, moduleBase: bound.moduleBase, moduleQuery: bound.moduleQuery };
  const runtimeInit = { base: runtime.moduleBase, query: runtime.moduleQuery };
  const { startServer, stopServer } = require(path.join(root, 'tests/run-browser-tests.cjs'));
  const { mixedCandidate } = require(path.join(root, 'tests/fixtures/candidate-union.cjs'));
  return { runtime, runtimeInit, inspectEntry: entryHelpers.inspectEntry, startServer, stopServer, mixedCandidate };
}

function instrumentAiMain(root, { seedReady = true, manager = '__task2Manager', state = '__integrationState', serviceCap } = {}) {
  for (const name of [manager, state].filter(Boolean)) assert.match(name, /^__[A-Za-z0-9_]+$/, 'Explicit fixture observation name');
  if (serviceCap !== undefined) assert.ok(Number.isInteger(serviceCap) && serviceCap > 0, 'Explicit fixture service cap');
  const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  assert.equal(source.split(INIT).length - 1, 1, 'Canonical full AI initialization seam occurs once');
  const init = serviceCap === undefined ? INIT : INIT.replace('materializeCandidate }', `materializeCandidate, serviceCap: ${serviceCap} }`);
  const observation = `${manager ? ` window.${manager} = aiPanel;` : ''}${state ? ` window.${state} = state;` : ''}`;
  const body = (seedReady ? 'await window.__seedReady;\n' : '') + source.replace(INIT, init + observation);
  return { body, originalSHA256: crypto.createHash('sha256').update(source).digest('hex'), instrumentedSHA256: crypto.createHash('sha256').update(body).digest('hex'), sourcePath: path.join(root, 'js/main.js'), retainedFullInitialization: true, originalFreshStartRetained: true, materializeCandidateRetained: true, serviceCap: serviceCap ?? null };
}

async function installAiMain(page, root, options, evidence) {
  const { runtime, runtimeInit } = fixtureContext(root);
  const instrumented = instrumentAiMain(root, options);
  await page.addInitScript(value => { window.__runtime = value; }, runtimeInit);
  await page.route(`**${runtime.moduleBase}main.js*`, route => route.fulfill({ contentType: 'text/javascript', body: instrumented.body }));
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    const { body, ...receipt } = instrumented;
    fs.writeFileSync(path.join(evidence, 'canonical-fixture-main.json'), JSON.stringify(receipt, null, 2) + '\n');
  }
  return fixtureContext(root);
}

module.exports = { fixtureContext, instrumentAiMain, installAiMain };
