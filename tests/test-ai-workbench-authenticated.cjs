'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.AI_WORKBENCH_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task10', `run-${Date.now()}`));
const panel = '#ai-image-panel';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const save = (name, data) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(data, null, 2));
const receipts = () => fs.readFileSync(path.join(evidence, 'receipts.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const resumeDirectory = process.env.AI_WORKBENCH_RESUME_FROM && path.resolve(process.env.AI_WORKBENCH_RESUME_FROM);
const preflightOnly = process.env.AI_WORKBENCH_RESUME_PREFLIGHT === '1';
const checkpointFile = process.env.AI_WORKBENCH_CHECKPOINT_FROM && path.resolve(process.env.AI_WORKBENCH_CHECKPOINT_FROM);
const expectedRequests = checkpointFile ? 2 : resumeDirectory ? 6 : 8;
const registryKeys = ['5e.aiParallelWorkspaces.v1', '5e.aiPrimaryWorkspace.v1', '5e.aiActiveTask.v1'];
async function checkpoint(page, label) {
  const content = await page.evaluate(async keys => {
    const databases = [];
    for (const meta of await indexedDB.databases()) {
      if (!meta.name.startsWith('5e.preview:5e-ai-image-tasks')) continue;
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(meta.name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Checkpoint database unavailable')); });
      try {
        const snapshot = await new Promise((resolve, reject) => { const r = db.transaction('tasks').objectStore('tasks').get('workspace'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Checkpoint read failed')); });
        if (snapshot) databases.push({ name: meta.name, snapshot });
      } finally { db.close(); }
    }
    return { databases, registry: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])) };
  }, registryKeys);
  const payload = { schema: 1, at: new Date().toISOString(), label, persistenceOnly: true, requestCount: requests().length, inventory: await inventory(page), ...content };
  const name = `checkpoint-${label}.json`;
  save(`${name}.tmp`, payload);
  fs.renameSync(path.join(evidence, `${name}.tmp`), path.join(evidence, name));
  save(`${name}.sha256.json`, { sha256: digest(fs.readFileSync(path.join(evidence, name))) });
}
function retainedResume() {
  const read = name => JSON.parse(fs.readFileSync(path.join(resumeDirectory, name), 'utf8'));
  const ledger = fs.readFileSync(path.join(resumeDirectory, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(ledger.filter(row => row.kind === 'request').length, 2, 'Resume source must be the two-request Sol attempt');
  const earlier = JSON.parse(fs.readFileSync(path.join(resumeDirectory, '../live-accepted-2/cleanup.json'), 'utf8'));
  assert.equal(earlier.requestCount, 1); assert.equal(earlier.acceptedCount, 1);
  const source = ['sol-initial', 'sol-point'].map(label => ({ label, value: read(`${label}.json`) }));
  const images = source.map(({ label, value }) => {
    const { output, receipt } = value;
    for (const row of [receipt.request, receipt.accepted, receipt.terminal, ...receipt.events]) assert.ok(ledger.some(entry => JSON.stringify(entry) === JSON.stringify(row)), 'Saved receipts must match actual observer ledger');
    assert.equal(receipt.request.model, 'gpt-6-sol');
    assert.equal(receipt.accepted.providerTurnId, receipt.accepted.turnId);
    assert.equal(receipt.terminal.turnId, receipt.accepted.turnId);
    assert.equal(receipt.request.clientScope, output.owner.split(':')[0]);
    assert.ok(receipt.events.some(event => event.hasImage));
    assert.ok(receipt.events.every(event => event.turnId === receipt.accepted.turnId && event.clientScope === receipt.request.clientScope));
    if (receipt.accepted.providerModel) assert.equal(receipt.accepted.providerModel, receipt.request.model);
    assert.ok(receipt.terminal.status === 'completed' || receipt.terminal.status === 'interrupted' && receipt.events.some(event => event.method === '5e/image-finalization' && event.status === 'interrupting'));
    const bytes = fs.readFileSync(path.join(resumeDirectory, `${label}-output.bin`));
    const data = 'data:image/png;base64,' + bytes.toString('base64');
    assert.equal(digest(bytes), output.outputSha256); assert.equal(digest(data), output.dataUrlSha256);
    assert.ok(value.after.find(tab => tab.id === output.owner).images.some(image => image.id === output.revision && image.sha256 === digest(data)));
    return { id: output.revision, kind: 'generated', name: label, data, reviewState: 'needs-attention', comments: [], nextCommentNumber: 1 };
  });
  assert.notEqual(source[0].value.receipt.accepted.turnId, source[1].value.receipt.accepted.turnId);
  assert.equal(source[0].value.output.owner, source[1].value.output.owner);
  preserved(source[0].value.after, source[1].value.after);
  const prior = source[1].value.after;
  const solId = source[1].value.output.owner;
  const spectator = prior.find(tab => tab.id === 'task-1')?.id;
  const lunaId = prior.find(tab => tab.id !== solId && tab.id !== spectator)?.id;
  assert.ok(spectator && lunaId && prior.length === 3);
  const reference = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'tests/fixtures/rights-clear-smoke.png')).toString('base64');
  const models = read('selected-models.json');
  const owners = [solId, lunaId].map((id, index) => ({ id, model: models[index].model, effort: models[index].defaultReasoningEffort, serviceTier: index ? 'priority' : null, label: index ? 'luna' : 'sol' }));
  const databases = prior.map(tab => {
    const original = tab.images.filter(image => image.kind === 'reference');
    assert.equal(original.length, 1); assert.equal(original[0].sha256, digest(reference));
    if (tab.id !== solId) assert.equal(tab.images.length, 1);
    else assert.deepEqual(tab.images.filter(image => image.kind === 'generated').map(image => image.id), images.map(image => image.id));
    const owner = owners.find(owner => owner.id === tab.id) || owners[0];
    const scope = tab.id === spectator ? '' : tab.id.split(':')[0];
    return { name: '5e.preview:5e-ai-image-tasks' + (scope ? '-' + scope : ''), snapshot: { key: 'workspace', activeTaskTabId: tab.id, taskTabSerial: 1, imageSerial: tab.id === solId ? 3 : 1, tabs: [{ id: tab.id, title: owner.label, attachments: [{ id: original[0].id, kind: 'reference', name: 'rights-clear-smoke.png', data: reference, comments: [], nextCommentNumber: 1 }], generated: tab.id === solId ? images : [], selectedCandidateId: tab.selectedCandidateId, conversationMessages: [], uiMessages: [], input: '', conversationId: null, generationTiming: null, mode: 'diagram', qualityMode: 'standard', outputEngine: 'raster', generationMode: 'single', outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 }, singleBackgroundPolicy: 'preserve', separationMode: 'off', model: owner.model, effort: owner.effort, serviceTier: owner.serviceTier, workState: tab.id === solId ? 'failed' : 'idle', inFlightRequest: null, retryRequest: null }] } };
  });
  const registry = { '5e.aiParallelWorkspaces.v1': JSON.stringify(owners.map(owner => owner.id.split(':')[0])), '5e.aiPrimaryWorkspace.v1': JSON.stringify(''), '5e.aiActiveTask.v1': JSON.stringify({ scope: solId.split(':')[0], taskId: solId }) };
  const lineage = { source: resumeDirectory, reconstructed: true, missing: ['original comments and UI messages', 'full prior tab snapshot', 'point phase idle completion'], recovered: ['original bytes and IDs', 'two real generated bytes, IDs and order', 'selected candidate', 'requested model, effort and tier', 'genuine accepted turn and image terminal receipts'], priorGenuineRequests: 3, remainingCeiling: 6, cumulativeCeiling: 9, priorPointUiCompletionClaimed: false, artifacts: Object.fromEntries(['receipts.jsonl', 'sol-initial.json', 'sol-initial-output.bin', 'sol-point.json', 'sol-point-output.bin', 'selected-models.json'].map(name => [name, digest(fs.readFileSync(path.join(resumeDirectory, name)))])) };
  save('resume-lineage.json', lineage);
  save('resume-reconstructed-checkpoint.json', { databases, registry, lineage });
  return { databases, registry, owners, spectator, prior };
}
function fullCheckpointResume() {
  assert.ok(!resumeDirectory, 'Choose full checkpoint or reconstructed legacy resume, never both');
  const directory = path.dirname(checkpointFile);
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const snapshot = read(checkpointFile);
  const hashes = {};
  for (const file of fs.readdirSync(directory).filter(name => /^checkpoint-.*\.json$/.test(name) && !name.endsWith('.sha256.json'))) {
    const bytes = fs.readFileSync(path.join(directory, file));
    assert.equal(digest(bytes), read(path.join(directory, file + '.sha256.json')).sha256, 'Every source checkpoint sidecar must match');
    hashes[file] = digest(bytes);
  }
  assert.ok(hashes[path.basename(checkpointFile)]);
  const allTabs = snapshot.databases.flatMap(entry => entry.snapshot.tabs);
  assert.equal(allTabs.length, 3);
  for (const entry of snapshot.databases) assert.match(entry.name, /^5e\.preview:5e-ai-image-tasks(?:-[a-f0-9-]+)?$/);
  assert.deepEqual(Object.keys(snapshot.registry).sort(), [...registryKeys].sort());
  const inventoryImages = snapshot.inventory.flatMap(tab => tab.images.map(image => ({ owner: tab.id, ...image })));
  for (const tab of allTabs) {
    assert.equal(tab.workState, 'idle');
    for (const image of [...tab.attachments, ...tab.generated]) assert.ok(inventoryImages.some(expected => expected.owner === tab.id && expected.id === image.id && expected.sha256 === digest(image.data)), 'Exact checkpoint image identity and data hash required');
  }
  const requestCounts = [], lineage = [], seenTurns = new Set();
  for (const [relative, labels] of [['../live-accepted-2', ['sol-initial']], ['../live-accepted-3', ['sol-initial', 'sol-point']], ['.', ['sol-area', 'luna-initial', 'luna-point', 'luna-area']]]) {
    const dir = path.resolve(directory, relative);
    const rows = fs.readFileSync(path.join(dir, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.filter(row => row.kind === 'request').length, labels.length);
    assert.equal(rows.filter(row => row.kind === 'accepted').length, labels.length);
    requestCounts.push(labels.length);
    for (const label of labels) {
      const result = read(path.join(dir, label + '.json'));
      const { output, receipt } = result;
      for (const row of [receipt.request, receipt.accepted, receipt.terminal, ...receipt.events]) assert.ok(rows.some(event => JSON.stringify(event) === JSON.stringify(row)), 'Receipt must match original observer ledger');
      assert.equal(receipt.accepted.providerTurnId, receipt.accepted.turnId);
      assert.ok(!seenTurns.has(receipt.accepted.turnId)); seenTurns.add(receipt.accepted.turnId);
      assert.ok(receipt.events.some(event => event.hasImage));
      assert.ok(receipt.events.every(event => event.turnId === receipt.accepted.turnId && event.clientScope === receipt.request.clientScope));
      assert.ok(receipt.terminal.status === 'completed' || receipt.terminal.status === 'interrupted' && receipt.events.some(event => event.method === '5e/image-finalization' && event.status === 'interrupting'));
      if (receipt.accepted.providerModel) assert.equal(receipt.accepted.providerModel, receipt.request.model);
      const bytes = fs.readFileSync(path.join(dir, label + '-output.bin'));
      assert.equal(digest(bytes), output.outputSha256);
      assert.equal(digest('data:image/png;base64,' + bytes.toString('base64')), output.dataUrlSha256);
      const duplicateEarlier = relative === '../live-accepted-2';
      if (!duplicateEarlier) assert.ok(inventoryImages.some(image => image.owner === output.owner && image.id === output.revision && image.sha256 === output.dataUrlSha256));
      lineage.push({ source: path.join(dir, label + '.json'), receiptSha256: digest(fs.readFileSync(path.join(dir, label + '.json'))), turnId: receipt.accepted.turnId, output, duplicateEarlier });
    }
  }
  assert.equal(requestCounts.reduce((a, b) => a + b), 7);
  assert.equal(inventoryImages.filter(image => image.kind === 'generated').length, 6);
  const spectator = allTabs.find(tab => tab.generated.length === 0)?.id;
  const owners = ['sol', 'luna'].map(label => {
    const tab = allTabs.find(tab => tab.generated.length === 3 && tab.model === 'gpt-6-' + label);
    assert.ok(tab); assert.equal(tab.generated.at(-1).id, 'generated-4');
    return { id: tab.id, model: tab.model, effort: tab.effort, serviceTier: tab.serviceTier ?? null, label };
  });
  assert.ok(spectator);
  const audit = { checkpointFile, checkpointSha256: hashes[path.basename(checkpointFile)], sidecars: hashes, priorRequests: 7, remainingCeiling: 2, cumulativeCeiling: 9, reconstructed: false, lineage };
  save('full-checkpoint-lineage.json', audit);
  return { databases: snapshot.databases, registry: snapshot.registry, owners, spectator, prior: snapshot.inventory };
}
async function versionState(page, revision) {
  return page.locator(panel).evaluate((node, revision) => {
    const button = node.querySelector('[data-ai-version-button]'), list = node.querySelector('[data-ai-version-list]');
    const option = [...list.querySelectorAll('[data-ai-candidate-option]')].find(item => item.dataset.aiCandidateOption === revision);
    const box = option?.getBoundingClientRect();
    return { owner: node.querySelector('.ai-task-tab-select[aria-pressed="true"]')?.closest('[data-tab-id]')?.dataset.tabId, busy: node.dataset.aiBusy, selected: node.dataset.aiSelectedCandidateId, expanded: button.getAttribute('aria-expanded'), listHidden: list.hidden, optionExists: !!option, optionVisible: !!option?.checkVisibility(), box: box && { x: box.x, y: box.y, width: box.width, height: box.height } };
  }, revision);
}
async function selectVersion(page, owner, revision, label) {
  assert.equal(await activeTask(page), owner);
  const before = await versionState(page, revision);
  save(`${label}-before.json`, before); await screenshot(page, `${label}-before`);
  if (before.listHidden) await page.click(`${panel} [data-ai-version-button]`);
  const option = page.locator(`${panel} [data-ai-candidate-option=${JSON.stringify(revision)}]`);
  await option.waitFor({ state: 'visible' });
  const open = await versionState(page, revision);
  assert.equal(open.expanded, 'true'); assert.equal(open.listHidden, false); assert.equal(open.optionVisible, true);
  save(`${label}-open.json`, open); await screenshot(page, `${label}-open`);
  await option.click();
  await until(async () => await page.locator(panel).getAttribute('data-ai-selected-candidate-id') === revision, 'visible candidate click selects exact revision', 15000);
  const after = await versionState(page, revision); assert.equal(after.listHidden, true);
  save(`${label}-after.json`, after); await screenshot(page, `${label}-after`);
}
async function selectorPreflight(page, resume) {
  const owner = resume.owners.find(owner => owner.label === 'luna');
  await selectTask(page, owner.id);
  await selectVersion(page, owner.id, 'generated-4', 'latest-normal');
  await page.click(`${panel} [data-ai-version-button]`);
  const open = await versionState(page, 'generated-4'); assert.equal(open.listHidden, false);
  await screenshot(page, 'stale-menu-open');
  await page.click(`${panel} [data-ai-version-button]`);
  const closed = await versionState(page, 'generated-4'); assert.equal(closed.listHidden, true);
  await screenshot(page, 'stale-menu-closed');
  let rejected = false;
  try { await page.locator(`${panel} [data-ai-candidate-option="generated-4"]`).click({ timeout: 700 }); } catch (error) { rejected = error.name === 'TimeoutError'; }
  assert.equal(rejected, true, 'Old unconditional toggle makes an already-open menu hidden and unactionable');
  save('selector-red.json', { open, closed, normalHiddenClickRejected: rejected, historicalExactMenuStateUnknown: true, providerRequests: requests().length });
  await selectVersion(page, owner.id, 'generated-4', 'latest-after-red');
  await page.click(`${panel} [data-ai-version-button]`);
  await selectVersion(page, owner.id, 'generated-4', 'latest-already-open');
  await compareAndInsert(page, owner.id, 'luna-preflight');
  for (const item of resume.owners) {
    await selectTask(page, item.id);
    await selectVersion(page, item.id, 'generated-4', `batch-latest-${item.label}`);
  }
  preserved(resume.prior, await inventory(page));
  await batchScenario(page, resume.owners, resume.spectator, true);
  assert.equal(requests().length, 0);
  save('batch-only-preflight.json', { verdict: 'LOCAL_PREFLIGHT_PASS', providerRequests: 0, visibleClicks: true, closedAndAlreadyOpenMenus: true, localCompareInsertUndo: true, batchSetupAndOwnerScopeCancellation: true, realAcceptance: false });
}
async function restoreResume(page, resume) {
  const rendererUrl = page.url();
  await page.goto(new URL('docs/credits.html', rendererUrl).href, { waitUntil: 'load' });
  await page.evaluate(async ({ databases, registry, rendererUrl }) => {
    const { IndexedDBOutputCacheBackend } = await import(new URL('js/ai-output-cache-store.js?v=1.5.3', rendererUrl).href);
    for (const entry of databases) {
      const store = new IndexedDBOutputCacheBackend({ databaseName: entry.name.replace('5e.preview:', ''), storeName: 'tasks' });
      await store.put(entry.snapshot); (await store.open()).close();
    }
    for (const [key, value] of Object.entries(registry)) localStorage.setItem(key, value);
  }, { databases: resume.databases, registry: resume.registry, rendererUrl });
  await page.goto(rendererUrl, { waitUntil: 'domcontentloaded' });
  await page.click('#ai-image-install-open');
  await until(async () => (await inventory(page)).length === 3, 'all restored workspaces must load', 15000);
  preserved(resume.prior, await inventory(page));
  await selectTask(page, resume.owners[0].id);
  assert.equal(await page.locator(panel).getAttribute('data-ai-selected-candidate-id'), resume.prior.find(tab => tab.id === resume.owners[0].id).selectedCandidateId);
  await until(async () => await page.locator(panel).getAttribute('data-ai-busy') === 'false', 'recovered Sol owner must be idle', 15000);
  await checkpoint(page, 'resume-restored');
  await screenshot(page, 'resume-restored');
}
async function screenshot(page, name) {
  await page.screenshot({ path: path.join(evidence, `${name}.png`), mask: [page.locator('[data-ai-account]'), page.locator('[data-ai-limit]'), page.locator('[data-ai-account-tokens]'), page.locator('[data-ai-log]')] });
}
async function inventory(page) {
  return page.evaluate(async () => {
    const output = [];
    for (const meta of await indexedDB.databases()) {
      if (!meta.name.includes('ai-image-tasks')) continue;
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open(meta.name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Workspace read failed')); });
      try {
        const snapshot = await new Promise((resolve, reject) => { const request = db.transaction('tasks').objectStore('tasks').get('workspace'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Workspace read failed')); });
        for (const tab of snapshot?.tabs || []) {
          const images = [];
          for (const item of [...tab.attachments || [], ...tab.generated || []]) {
            const bytes = new TextEncoder().encode(item.data || '');
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
            images.push({ id: item.id, kind: item.kind, sha256: hash });
          }
          output.push({ id: tab.id, selectedCandidateId: tab.selectedCandidateId, images });
        }
      } finally { db.close(); }
    }
    return output;
  });
}
const turnTimeout = Number(process.env.AI_WORKBENCH_TURN_TIMEOUT || 300000);
async function until(check, message, timeout = turnTimeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`BLOCKED: ${message}; no automatic retry`);
}
const requests = () => receipts().filter(row => row.kind === 'request');
const taskSelector = id => `${panel} [data-tab-id=${JSON.stringify(id)}] .ai-task-tab-select`;
async function activeTask(page) {
  return page.locator(`${panel} .ai-task-tab-select[aria-pressed="true"]`).evaluate(node => node.closest('[data-tab-id]').dataset.tabId);
}
async function selectTask(page, id, modifiers = []) {
  await page.click(taskSelector(id), { modifiers });
  if (!modifiers.length) assert.equal(await activeTask(page), id, 'Task activation must match clicked owner');
}
async function advanced(page) {
  const details = page.locator(`${panel} .ai-advanced-settings`);
  if (!await details.evaluate(node => node.open)) await details.locator('summary').click();
}
async function imageData(page, owner, id) {
  return page.evaluate(async ({ owner, id }) => {
    for (const meta of await indexedDB.databases()) {
      if (!meta.name.includes('ai-image-tasks')) continue;
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open(meta.name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('Workspace read failed')); });
      try {
        const snapshot = await new Promise((resolve, reject) => { const r = db.transaction('tasks').objectStore('tasks').get('workspace'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Workspace read failed')); });
        const tab = snapshot?.tabs?.find(tab => tab.id === owner);
        const item = [...tab?.attachments || [], ...tab?.generated || []].find(item => item.id === id);
        if (item) return item.data;
      } finally { db.close(); }
    }
    throw new Error('Persisted task image missing');
  }, { owner, id });
}
function preserved(before, after) {
  assert.ok(before.length, 'Preservation requires nonempty task inventory');
  for (const tab of before) {
    const next = after.find(item => item.id === tab.id);
    assert.ok(next, `Task ${tab.id} still exists`);
    for (const image of tab.images) assert.ok(next.images.some(item => item.id === image.id && item.sha256 === image.sha256), `Task ${tab.id} image ${image.id} remains byte-identical`);
  }
}
async function canvasObjects(page) {
  const source = fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8');
  const specifier = source.match(/import\s*\{\s*state\s*\}\s*from\s*["']([^"']+)["']/)?.[1];
  assert.ok(specifier, 'Production state import must be identified exactly');
  return page.evaluate(async spec => {
    const { state } = await import(new URL(spec, new URL('js/main.js', location.href)).href);
    return state.get().objects.map(item => ({ id: item.id, type: item.type, aiTaskId: item.aiTaskId, aiCandidateId: item.aiCandidateId, editableAssetRegionId: item.editableAssetRegionId }));
  }, specifier);
}
async function captureOutput(page, owner, revision, label) {
  const src = await imageData(page, owner, revision);
  const dimensions = await page.evaluate(async src => { const image = new Image(); image.src = src; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }, src);
  assert.ok(dimensions.width > 0 && dimensions.height > 0 && /^data:image\//.test(src), `${label}: decoded genuine output required`);
  const bytes = Buffer.from(src.split(',')[1], 'base64');
  fs.writeFileSync(path.join(evidence, `${label}-output.bin`), bytes);
  return { owner, revision, ...dimensions, outputSha256: digest(bytes), dataUrlSha256: digest(src) };
}
async function terminalReceipt(requestId) {
  return until(() => {
    const all = receipts();
    const request = all.find(row => row.kind === 'request' && row.requestId === requestId);
    assert.ok(!all.some(row => row.kind === 'send-failed' && row.requestId === requestId), 'Real service refused request; do not retry automatically');
    const accepted = all.find(row => row.kind === 'accepted' && row.requestId === requestId);
    if (!accepted) return null;
    assert.ok(accepted.turnId && accepted.providerTurnId === accepted.turnId, 'Production turn/start response must confirm this turn ID');
    if (accepted.providerModel) assert.equal(accepted.providerModel, request.model, 'Provider-returned model must match requested model');
    const events = all.filter(row => row.kind === 'runtime-event' && row.turnId === accepted.turnId);
    assert.ok(events.every(event => (event.clientScope || '') === request.clientScope), 'Every runtime event belongs to its requested workspace');
    assert.ok(!events.some(row => row.method === 'error'), 'Runtime error must block acceptance');
    const terminal = events.find(row => row.method === 'turn/completed');
    if (!terminal) return null;
    assert.ok(events.some(row => row.hasImage), 'Runtime terminal must include genuine image-generation output');
    assert.ok(terminal.status === 'completed' || (terminal.status === 'interrupted' && events.some(row => row.method === '5e/image-finalization' && row.status === 'interrupting')), 'Only completed or product image-auto-finalized turns are accepted');
    return { request, accepted, terminal, events, modelProof: accepted.providerModel ? 'provider-returned-model' : 'unchanged-production-turn-start-arguments-with-provider-accepted-turn-id' };
  }, 'genuine correlated runtime image and terminal receipt required');
}
async function confirmScope(page, owner, label) {
  assert.equal(await activeTask(page), owner);
  const dialog = page.locator(`${panel} dialog[open][aria-label="수정 허용 범위 확인"]`);
  await dialog.waitFor();
  const detail = await dialog.locator('pre').textContent();
  const rectangles = [...detail.matchAll(/x \[(\d+), (\d+)\), y \[(\d+), (\d+)\)/g)].map(match => ({ x0: +match[1], x1: +match[2], y0: +match[3], y1: +match[4] }));
  assert.ok(rectangles.length && rectangles.every(rect => rect.x1 > rect.x0 && rect.y1 > rect.y0), 'Displayed concrete pixel bounds required');
  await screenshot(page, `${label}-scope`);
  await dialog.locator('.ai-confirm-accept').click();
  return rectangles;
}
async function approveCandidate(page, owner, label) {
  assert.equal(await activeTask(page), owner);
  const dialog = page.locator(`${panel} dialog[open][aria-label="선택 영역 수정 후보 · 아직 미적용"]`);
  await dialog.waitFor({ timeout: turnTimeout });
  assert.match(await dialog.locator('pre').textContent(), /영역 밖 픽셀 동일: 확인됨/);
  await screenshot(page, `${label}-candidate-review`);
  await dialog.locator('.ai-confirm-accept').click();
}
async function outsidePixels(page, beforeSrc, afterSrc, rectangles) {
  const result = await page.evaluate(async ({ beforeSrc, afterSrc, rectangles }) => {
    async function decode(src) { const img = new Image(); img.src = src; await img.decode(); const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, canvas.width, canvas.height); }
    const a = await decode(beforeSrc), b = await decode(afterSrc);
    if (a.width !== b.width || a.height !== b.height) throw new Error('Scoped output dimensions changed');
    let outsideChanged = 0, insideChanged = 0, outsidePixels = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      const inside = rectangles.some(r => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
      if (!inside) outsidePixels++;
      for (let c = 0; c < 4; c++) if (a.data[(y * a.width + x) * 4 + c] !== b.data[(y * a.width + x) * 4 + c]) inside ? insideChanged++ : outsideChanged++;
    }
    return { width: a.width, height: a.height, outsidePixels, outsideChanged, insideChanged };
  }, { beforeSrc, afterSrc, rectangles });
  assert.ok(result.outsidePixels > 0, 'Area preservation must inspect nonempty outside pixels');
  assert.equal(result.outsideChanged, 0, 'Area edit preserves every outside pixel');
  return result;
}
async function turn(page, label, selector, { owner, spectator, scoped = false, model, effort, serviceTier = null }) {
  await checkpoint(page, `${label}-before`);
  console.log(`WORKING ${label}: one intentional real request`);
  const before = await inventory(page), source = before.find(tab => tab.id === owner);
  assert.ok(source?.images.length, 'Request source must have durable provenance');
  const spectatorBefore = before.find(tab => tab.id === spectator);
  const count = requests().length;
  const sourceSrc = scoped ? await imageData(page, owner, source.selectedCandidateId) : null;
  await page.click(`${panel} ${selector}`);
  let rectangles;
  try {
    if (scoped) rectangles = await confirmScope(page, owner, label);
    await until(() => requests().length === count + 1, 'request must start exactly once', 15000);
    const request = requests()[count];
    assert.deepEqual({ model: request.model, effort: request.effort, serviceTier: request.serviceTier }, { model, effort, serviceTier });
    assert.equal(await page.locator(panel).getAttribute('data-ai-busy'), 'true', 'Switch occurs during genuine pending request');
    await selectTask(page, spectator);
    assert.equal(await page.locator(`${panel} dialog[open]`).count(), 0, 'Spectator has no foreign approval dialog');
    await screenshot(page, `${label}-pending-switch`);
    const receipt = await terminalReceipt(request.requestId);
    assert.equal(await activeTask(page), spectator, 'Background completion does not steal activation');
    assert.equal(await page.locator(`${panel} dialog[open]`).count(), 0, 'Foreign candidate approval never appears on spectator');
    await selectTask(page, owner);
    if (scoped) await approveCandidate(page, owner, label);
    await until(async () => {
      const tab = (await inventory(page)).find(tab => tab.id === owner);
      return tab && tab.images.filter(item => item.kind === 'generated').length === source.images.filter(item => item.kind === 'generated').length + 1;
    }, 'one durable output must register on originating task');
    const after = await inventory(page), target = after.find(tab => tab.id === owner);
    preserved(before, after);
    for (const other of before.filter(tab => tab.id !== owner)) assert.deepEqual(after.find(tab => tab.id === other.id), other, 'No nonowner task may receive this output');
    assert.deepEqual(after.find(tab => tab.id === spectator), spectatorBefore, 'Spectator source/history/selection remain unchanged');
    const added = target.images.filter(item => !source.images.some(old => old.id === item.id));
    assert.equal(added.length, 1); assert.equal(target.selectedCandidateId, added[0].id);
    assert.equal(requests().length, count + 1, 'No automatic retries or duplicate requests');
    const output = await captureOutput(page, owner, added[0].id, label);
    const pixels = scoped ? await outsidePixels(page, sourceSrc, await imageData(page, owner, added[0].id), rectangles) : null;
    save(`${label}.json`, { output, receipt, rectangles, pixels, before, after });
    await checkpoint(page, `${label}-output`);
    await until(async () => await page.locator(panel).getAttribute('data-ai-busy') === 'false', 'owner must become idle after committed output', 15000);
    await screenshot(page, label);
    console.log(`VERIFIED ${label}: genuine output and owner provenance`);
    return target;
  } catch (error) {
    await selectTask(page, owner).catch(() => {});
    const cancel = page.locator(`${panel} [data-ai-interrupt]`);
    let cancellationRequested = false;
    if (await cancel.isVisible().catch(() => false)) cancellationRequested = await cancel.click().then(() => true, () => false);
    save(`${label}-failure.json`, { blocked: true, cancellationRequested, automaticRetry: false, requestCount: requests().length - count });
    throw error;
  }
}
async function comment(page, type) {
  await page.click(`${panel} [data-ai-comment-tool="${type}"]`);
  const box = await page.locator(`${panel} [data-ai-previews] .ai-preview-stage img:visible`).first().boundingBox();
  assert.ok(box, 'Generated image must be visible');
  await page.mouse.move(box.x + box.width * (type === 'area' ? .55 : .3), box.y + box.height * (type === 'area' ? .25 : .3));
  await page.mouse.down();
  if (type === 'area') await page.mouse.move(box.x + box.width * .75, box.y + box.height * .45, { steps: 8 });
  await page.mouse.up();
  await page.locator(`${panel} [data-ai-comment-row][data-active="true"] [data-ai-inline-editor]`).fill(type === 'point' ? '이 위치의 선만 조금 굵게 하세요. 다른 요소는 유지하세요.' : '이 영역의 선만 균일하게 정리하세요. 영역 밖은 유지하세요.');
  assert.match(await page.locator(`${panel} [data-ai-comment-row][data-active="true"] button`).first().textContent(), type === 'area' ? /영역/ : /점/, 'Pointer action creates the intended comment type');
  await page.locator(`${panel} [data-ai-comment-row][data-active="true"] [data-ai-inline-editor]`).press('Tab');
}
async function compareAndInsert(page, owner, label) {
  const before = await inventory(page), tab = before.find(tab => tab.id === owner);
  const versions = tab.images.filter(item => item.kind === 'generated');
  assert.ok(versions.length >= 3, 'Nonlatest comparison requires three genuine revisions');
  const revision = versions[0], original = tab.images.find(item => item.kind === 'reference');
  await selectVersion(page, owner, revision.id, `${label}-nonlatest-selection`);
  await page.click(`${panel} [data-ai-compare]`);
  const comparison = page.locator(`${panel} .ai-inline-comparison .ai-comparison`);
  await comparison.waitFor();
  assert.equal(await page.getByLabel('오른쪽 비교 버전', { exact: true }).inputValue(), revision.id);
  await page.getByLabel('왼쪽 비교 버전', { exact: true }).selectOption(original.id);
  assert.equal(await comparison.getAttribute('data-mode'), 'wipe');
  await until(async () => (await page.locator('.ai-comparison-right image').getAttribute('href')) && (await page.locator('.ai-comparison-left image').getAttribute('href')), 'comparison images decode', 15000);
  assert.equal(digest(await page.locator('.ai-comparison-right image').getAttribute('href')), revision.sha256);
  assert.equal(digest(await page.locator('.ai-comparison-left image').getAttribute('href')), original.sha256);
  const slider = page.getByRole('slider', { name: '원본과 수정본 비교 경계', exact: true });
  const ratio = await slider.getAttribute('aria-valuenow');
  await slider.focus(); await slider.press('ArrowRight');
  assert.notEqual(await slider.getAttribute('aria-valuenow'), ratio, 'Wipe boundary actually moves');
  await screenshot(page, `${label}-nonlatest-compare`);
  await page.click(`${panel} [data-ai-compare]`);
  const count = requests().length, canvasBefore = await canvasObjects(page);
  assert.equal(canvasBefore.length, 0, 'Owned acceptance canvas begins empty');
  await page.selectOption(`${panel} select[data-ai-generation-mode]`, 'single');
  await page.click(`${panel} [data-ai-insert-selected]`);
  await page.locator(panel).waitFor({ state: 'hidden' });
  const single = await canvasObjects(page);
  assert.equal(single.length, 1); assert.equal(single[0].aiTaskId, owner); assert.equal(single[0].aiCandidateId, revision.id);
  await screenshot(page, `${label}-single-insert`);
  await page.click('#undo-btn'); assert.deepEqual(await canvasObjects(page), canvasBefore);
  await screenshot(page, `${label}-single-undo`);
  await page.click('#ai-image-install-open');
  await selectTask(page, owner);
  await page.selectOption(`${panel} select[data-ai-generation-mode]`, 'separated');
  await page.waitForFunction(() => ['ready', 'fallback', 'manual'].includes(document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState), null, { timeout: 60000 });
  const separationState = await page.locator(`${panel} [data-ai-editable-groups]`).getAttribute('data-ai-separation-state');
  const separationNote = await page.locator(`${panel} [data-ai-selected-output-note]`).textContent();
  await page.click(`${panel} [data-ai-editable-groups]`);
  await page.locator('.aea-dialog').waitFor();
  if (separationState !== 'ready') {
    await page.click('.aea-dialog [data-mode="region"]');
    const corners = await page.locator('.aea-dialog .aea-overlay').evaluate(svg => {
      const v = svg.viewBox.baseVal, matrix = svg.getScreenCTM();
      return [[.03,.12,.45,.88],[.52,.12,.96,.88]].map(r => [new DOMPoint(v.x + v.width*r[0],v.y + v.height*r[1]).matrixTransform(matrix),new DOMPoint(v.x + v.width*r[2],v.y + v.height*r[3]).matrixTransform(matrix)].map(p => ({x:p.x,y:p.y})));
    });
    for (const [a,b] of corners) { await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:8}); await page.mouse.up(); }
    assert.equal(await page.locator('.aea-dialog .aea-row').count(), 2, 'Manual fallback defines two actual local regions');
    await page.click('.aea-dialog [data-action="preview"]');
    await until(() => page.locator('.aea-dialog [data-action="insert"]').isEnabled(), 'local region preview enables insertion', 60000);
  }
  const regions = await page.locator('.aea-dialog .aea-row').count(); assert.ok(regions > 0);
  await screenshot(page, `${label}-separation`);
  await page.click('.aea-dialog [data-action="insert"]');
  await page.locator(panel).waitFor({ state: 'hidden' });
  const separated = await canvasObjects(page);
  assert.equal(separated.length, regions);
  assert.ok(separated.every(item => item.aiTaskId === owner && item.aiCandidateId === revision.id && item.editableAssetRegionId));
  await screenshot(page, `${label}-separated-insert`);
  await page.click('#undo-btn'); assert.deepEqual(await canvasObjects(page), canvasBefore);
  await screenshot(page, `${label}-separated-undo`);
  assert.equal(requests().length, count, 'Compare/separation/insertion/Undo must not send');
  await page.click('#ai-image-install-open'); await selectTask(page, owner);
  preserved(before, await inventory(page));
  save(`${label}-local-actions.json`, { owner, revision: revision.id, original: original.id, comparedImageHashes: [original.sha256, revision.sha256], single, separated, separationState, separationNote, undo: await canvasObjects(page), extraRequests: 0 });
  await selectVersion(page, owner, versions.at(-1).id, `${label}-latest-restoration`);
}
async function batchJournal(page) {
  return page.evaluate(async () => {
    const { idbGet } = await import('./js/idb-store.js');
    const scope = JSON.parse(localStorage.getItem('5e.aiPrimaryWorkspace.v1') || 'null') || '';
    const rows = await idbGet('ai-workspace-batch:' + JSON.stringify(['5e', 'workspace-selection:' + (scope || 'main')]));
    return (rows || []).map(job => ({ id: job.id, state: job.state, attempt: job.attempt, progress: job.progress?.phase, owner: job.sourceSnapshot.owner, sourceRevision: job.sourceSnapshot.snapshot.revisionId, operation: job.sourceSnapshot.snapshot.operation, model: job.sourceSnapshot.snapshot.model, output: job.result?.output, generation: job.result?.generation ? { candidateId: job.result.generation.candidateId, scopeConfirmed: job.result.generation.scopeConfirmed, approved: job.result.generation.approved } : null }));
  });
}
async function batchScenario(page, owners, spectator, localPreflight = false) {
  console.log(localPreflight ? 'WORKING batch preflight: zero provider requests allowed' : 'WORKING batch: two intentional concurrent scoped requests');
  for (const owner of owners) { await selectTask(page, owner.id); await comment(page, 'area'); }
  await selectTask(page, spectator);
  const before = await inventory(page), spectatorBefore = before.find(tab => tab.id === spectator), count = requests().length;
  await selectTask(page, spectator, ['Meta']);
  for (const owner of owners) await selectTask(page, owner.id, ['Meta']);
  assert.equal(await page.locator(`${panel} [data-ai-selection-count]`).textContent(), '2개 선택');
  assert.equal(await page.locator(`${panel} [data-ai-batch-selected="true"]`).count(), 2);
  assert.equal(await activeTask(page), spectator);
  await page.click(`${panel} [data-ai-send]`);
  try {
    await until(async () => { const jobs = await batchJournal(page); return jobs.length === 2 && jobs.every(job => job.progress === 'confirmation-wait'); }, 'both batch jobs wait for owner scope approval', 15000);
  } catch (error) {
    save('batch-setup-failure.json', { jobs: await batchJournal(page), ui: await page.locator(panel).evaluate(node => ({ selected: [...node.querySelectorAll('[data-ai-batch-selected="true"]')].map(item => item.dataset.tabId), selection: node.querySelector('[data-ai-selection-count]')?.textContent, batch: node.querySelector('[data-ai-workspace-batch]')?.textContent, dialogs: [...document.querySelectorAll('dialog[open]')].map(item => ({ title: item.getAttribute('aria-label'), panel: item.closest('.ai-panel')?.id })), busy: node.dataset.aiBusy })) });
    await screenshot(page, 'batch-setup-failure'); throw error;
  }
  assert.equal(requests().length, count, 'Scoped batch sends nothing before owner confirmations');
  assert.equal(await page.locator(`${panel} dialog[open]`).count(), 0, 'Spectator never owns batch dialogs');
  if (localPreflight) {
    const pending = await batchJournal(page); save('batch-preflight-pending.json', pending);
    await screenshot(page, 'batch-preflight-spectator');
    for (const owner of owners) {
      await selectTask(page, owner.id);
      const dialog = page.locator(`${panel} dialog[open][aria-label="수정 허용 범위 확인"]`);
      await dialog.waitFor(); await screenshot(page, `batch-preflight-${owner.label}-scope`);
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      await until(async () => (await batchJournal(page)).find(job => job.owner.taskId === owner.id)?.state === 'cancelled', 'owner rejection is cancelled, never failed', 15000);
      assert.equal(await page.locator(panel).getAttribute('data-ai-busy'), 'false');
      assert.equal(await page.locator(panel).getAttribute('data-ai-request-phase'), 'cancelled');
      assert.doesNotMatch(await page.locator(`${panel} [data-ai-status]`).textContent(), /PNG 치수|차단/);
      await screenshot(page, `batch-preflight-${owner.label}-cancelled`);
      if (owner === owners[0]) {
        const peer = (await batchJournal(page)).find(job => job.owner.taskId === owners[1].id);
        assert.equal(peer.state, 'running'); assert.equal(peer.progress, 'confirmation-wait');
      }
    }
    await until(async () => (await batchJournal(page)).every(job => job.state === 'cancelled'), 'local owner rejection cancels both queued jobs', 15000);
    assert.equal(requests().length, count);
    assert.equal(await page.locator(`${panel} [data-ai-workspace-job-action="retry"]`).count(), 0);
    save('batch-preflight-cancelled.json', await batchJournal(page));
    preserved(before, await inventory(page));
    await checkpoint(page, 'batch-preflight-cancelled'); return;
  }
  const rectangles = new Map(), batchRequests = [];
  try {
    for (const owner of owners) {
      await selectTask(page, owner.id);
      rectangles.set(owner.id, await confirmScope(page, owner.id, `batch-${owner.label}`));
      await until(() => requests().length === count + batchRequests.length + 1, 'owner scope confirmation sends exactly once', 15000);
      const request = requests().at(-1); batchRequests.push(request);
      assert.deepEqual({ model: request.model, effort: request.effort, serviceTier: request.serviceTier }, { model: owner.model, effort: owner.effort, serviceTier: owner.serviceTier });
    }
    await selectTask(page, spectator);
    await screenshot(page, 'batch-pending-spectator');
    const turns = await Promise.all(batchRequests.map(request => terminalReceipt(request.requestId)));
    assert.ok(Math.max(...turns.map(turn => Date.parse(turn.accepted.at))) < Math.min(...turns.map(turn => Date.parse(turn.terminal.at))), 'Both runtime turns must be accepted before either terminates: actual concurrency, not serial fallback');
    assert.equal(await page.locator(`${panel} dialog[open]`).count(), 0);
    assert.deepEqual((await inventory(page)).find(tab => tab.id === spectator), spectatorBefore);
    for (const owner of owners) {
      await selectTask(page, owner.id);
      await approveCandidate(page, owner.id, `batch-${owner.label}`);
      await until(async () => (await batchJournal(page)).find(job => job.owner.taskId === owner.id)?.state === 'completed', 'owner-approved batch output durably commits');
    }
    const jobs = await batchJournal(page), after = await inventory(page);
    assert.equal(jobs.length, 2); assert.equal(requests().length, count + 2);
    preserved(before, after);
    for (const job of jobs) {
      assert.equal(job.state, 'completed'); assert.equal(job.output.committed, true);
      assert.deepEqual(job.output.scope, job.owner.scope); assert.equal(job.output.taskId, job.owner.taskId);
      assert.equal(job.operation, 'scoped-edit'); assert.equal(job.generation.scopeConfirmed, true); assert.equal(job.generation.approved, true);
      const old = before.find(tab => tab.id === job.owner.taskId), next = after.find(tab => tab.id === job.owner.taskId);
      assert.equal(next.images.length, old.images.length + 1);
      assert.ok(next.images.some(image => image.id === job.output.revisionId));
      assert.equal(next.selectedCandidateId, job.output.revisionId);
      const owner = owners.find(owner => owner.id === job.owner.taskId);
      const output = await captureOutput(page, owner.id, job.output.revisionId, `batch-${owner.label}`);
      const pixels = await outsidePixels(page, await imageData(page, owner.id, job.sourceRevision), await imageData(page, owner.id, job.output.revisionId), rectangles.get(owner.id));
      save(`batch-${owner.label}.json`, { job, output, pixels, receipt: turns.find(turn => turn.request.model === owner.model) });
    }
    assert.deepEqual(after.find(tab => tab.id === spectator), spectatorBefore);
    await selectTask(page, spectator); assert.equal(await page.locator(`${panel} dialog[open]`).count(), 0);
    await screenshot(page, 'batch-complete-spectator');
    save('batch.json', { jobs, turns, before, after, concurrent: true, requestCount: 2 });
  } catch (error) {
    await selectTask(page, spectator).catch(() => {});
    for (const job of await batchJournal(page)) {
      if (!['running', 'queued'].includes(job.state)) continue;
      await page.click(`${panel} [data-ai-workspace-job=${JSON.stringify(job.id)}] [data-ai-workspace-job-action="cancel"]`).catch(() => {});
    }
    save('batch-failure.json', { blocked: true, jobs: await batchJournal(page), requestCount: requests().length - count, automaticRetry: false });
    throw error;
  }
}

test('genuine authenticated workbench acceptance (unavailable is blocking)', { timeout: 8 * turnTimeout + 180000 }, async context => {
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'receipts.jsonl'), JSON.stringify({ kind: 'harness-start', at: new Date().toISOString(), generationGateReleased: process.env.AI_WORKBENCH_TASK9_RELEASE === 'accepted' }) + '\n');
  save('invocation.json', { argv: process.argv, environment: Object.fromEntries(['AI_WORKBENCH_REAL', 'AI_WORKBENCH_TASK9_RELEASE', 'AI_WORKBENCH_EVIDENCE', 'AI_WORKBENCH_DISCONNECTED', 'AI_WORKBENCH_SOL_MODEL', 'AI_WORKBENCH_LUNA_MODEL', 'AI_WORKBENCH_TURN_TIMEOUT', 'AI_WORKBENCH_TASK12_RELEASE', 'AI_WORKBENCH_RESUME_FROM', 'AI_WORKBENCH_RESUME_PREFLIGHT', 'AI_WORKBENCH_CHECKPOINT_FROM', 'AI_WORKBENCH_BATCH_RELEASE'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, node: process.version, cwd: root, sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), real: process.env.AI_WORKBENCH_REAL, gateReleased: process.env.AI_WORKBENCH_TASK9_RELEASE === 'accepted', disconnected: process.env.AI_WORKBENCH_DISCONNECTED === '1', sourceHashes: Object.fromEntries(['desktop/main.cjs', 'desktop/preload.cjs', 'preview/js/ai-panel.js', 'preview/js/ai-task-workspaces.js', 'preview/js/ai-workspace-batch.js', 'preview/js/state.js', 'preview/index.html', 'tests/test-ai-workbench-authenticated.cjs', 'tests/authenticated-desktop-observer.cjs'].map(file => [file, digest(fs.readFileSync(path.join(root, file)))])) });
  let app;
  let page;
  let profile;
  let verdict = 'BLOCKED';
  context.after(async () => {
    try { if (page && !page.isClosed()) await checkpoint(page, 'cleanup'); } catch (error) { save('checkpoint-cleanup-error.json', { message: error.message }); }
    if (app) await app.close();
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
    save('cleanup.json', { ownedDesktopClosed: !!app, ownedProfileRemoved: !!profile && !fs.existsSync(profile), verdict, requestCount: receipts().filter(row => row.kind === 'request').length, acceptedCount: receipts().filter(row => row.kind === 'accepted').length });
  });
  assert.equal(process.env.AI_WORKBENCH_REAL, '1', 'BLOCKED: set AI_WORKBENCH_REAL=1; this suite never mocks or skips');
  for (const key of ['FIVE_E_SMOKE_TEST', 'FIVE_E_SMOKE_IMAGE', 'FIVE_E_SMOKE_IMAGE_TEST']) assert.notEqual(process.env[key], '1', `BLOCKED: ${key} synthetic mode is forbidden`);
  const { _electron } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  profile = fs.mkdtempSync(path.join(os.tmpdir(), '5e-authenticated-'));
  app = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, 'authenticated-desktop-observer.cjs')], cwd: root, env: { ...process.env, FIVE_E_DEV_USER_DATA: profile, FIVE_E_SMOKE_USER_DATA: '', AI_WORKBENCH_RECEIPTS: path.join(evidence, 'receipts.jsonl'), PATH: process.env.AI_WORKBENCH_DISCONNECTED === '1' ? profile : `/opt/homebrew/bin:${process.env.PATH}` }, timeout: 30000 });
  const windowDeadline = Date.now() + 30000;
  while (!page && Date.now() < windowDeadline) {
    page = app.windows().find(candidate => candidate.url().endsWith('/preview/index.html'));
    if (!page) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'BLOCKED: production renderer did not open');
  await page.waitForLoadState('domcontentloaded');
  page.setDefaultTimeout(15000);
  await page.evaluate(() => { localStorage.setItem('5e.preview:5e.mode', 'pro'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.click('#ai-image-install-open');
  await advanced(page);
  const status = await page.evaluate(async () => { const value = await window.fiveEDesktop.status(); return { loggedIn: value.login?.loggedIn === true, server: value.server === true }; });
  save('status.json', status);
  await screenshot(page, 'status');
  assert.equal(status.loggedIn, true, 'BLOCKED: existing Codex CLI authentication unavailable; restore signed-in bridge and rerun explicitly (zero fallback)');
  const catalog = await page.evaluate(async () => { const result = await window.fiveEDesktop.models(); return (result.data || []).map(item => ({ model: item.model || item.id, displayName: item.displayName, supportedReasoningEfforts: item.supportedReasoningEfforts, defaultReasoningEffort: item.defaultReasoningEffort, serviceTiers: item.serviceTiers })); });
  save('models.json', catalog);
  await screenshot(page, 'model-selector');
  const selected = ['SOL', 'LUNA'].map(family => {
    const requested = process.env[`AI_WORKBENCH_${family}_MODEL`];
    const model = requested ? catalog.find(entry => entry.model === requested) : catalog.find(entry => new RegExp(family, 'i').test(`${entry.model} ${entry.displayName}`));
    assert.ok(model, `BLOCKED: provider model/list did not advertise required ${family}; no guessed model or fallback permitted`);
    return model;
  });
  for (const model of selected) {
    await page.selectOption(`${panel} [data-ai-model]`, model.model);
    assert.equal(await page.locator(`${panel} [data-ai-model]`).inputValue(), model.model);
    await screenshot(page, model === selected[0] ? 'selected-sol' : 'selected-luna');
  }
  save('selected-models.json', selected);
  assert.equal(process.env.AI_WORKBENCH_TASK9_RELEASE, 'accepted', 'BLOCKED: task9 gate not released; status/model inspection complete, no generation sent');
  let spectator, owners = [];
  if (resumeDirectory || checkpointFile) {
    const resume = checkpointFile ? fullCheckpointResume() : retainedResume();
    await restoreResume(page, resume);
    spectator = resume.spectator; owners = resume.owners;
    for (const owner of owners) assert.ok(selected.some(model => model.model === owner.model), 'Retained model must still be advertised');
    if (preflightOnly && checkpointFile) {
      await selectorPreflight(page, resume); verdict = 'LOCAL_PREFLIGHT_PASS'; return;
    }
    if (preflightOnly) {
      await comment(page, 'point');
      assert.equal(await page.locator(`${panel} [data-ai-comments-apply]`).isEnabled(), true);
      await comment(page, 'area');
      await page.click(`${panel} [data-ai-comments-apply]`);
      const dialog = page.locator(`${panel} dialog[open][aria-label="수정 허용 범위 확인"]`);
      await dialog.waitFor(); await screenshot(page, 'resume-preflight-scope');
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      assert.equal(requests().length, 0);
      preserved(resume.prior, await inventory(page));
      save('resume-preflight.json', { verdict: 'LOCAL_PREFLIGHT_PASS', providerRequests: 0, pointControlEnabled: true, areaScopeOpenedAndCancelled: true, preservedRealHistory: true, realAcceptance: false });
      verdict = 'LOCAL_PREFLIGHT_PASS'; return;
    }
    assert.equal(process.env.AI_WORKBENCH_TASK12_RELEASE, 'accepted', 'BLOCKED: task12 independently accepted release required before resume sends');
  } else {
  await page.locator(`${panel} [data-ai-source-file]`).setInputFiles(path.join(root, 'tests/fixtures/rights-clear-smoke.png'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel [data-ai-attachment-list] img')].some(image => image.naturalWidth > 0));
  spectator = await activeTask(page);

  for (const model of selected) {
    const previousTask = await activeTask(page);
    await page.click(`${panel} [data-ai-task-add]`);
    await until(async () => await activeTask(page) !== previousTask, 'new owned task activates', 15000);
    await page.locator(`${panel} [data-ai-source-file]`).setInputFiles(path.join(root, 'tests/fixtures/rights-clear-smoke.png'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel [data-ai-attachment-list] img')].some(image => image.naturalWidth > 0));
    await advanced(page);
    await page.selectOption(`${panel} [data-ai-model]`, model.model);
    assert.ok(model.defaultReasoningEffort, 'BLOCKED: advertised default effort required');
    await page.selectOption(`${panel} [data-ai-effort]`, model.defaultReasoningEffort);
    const serviceTier = model === selected[1] ? 'priority' : null;
    if (serviceTier) assert.ok(model.serviceTiers?.some(tier => (tier.id || tier) === serviceTier), 'Explicit priority tier must be advertised');
    await page.selectOption(`${panel} [data-ai-speed]`, serviceTier || '');
    await page.selectOption(`${panel} select[data-ai-generation-mode]`, 'single');
    assert.equal(await page.locator(`${panel} [data-ai-input]`).isHidden(), true, 'First conversion uses the product fixed white-PNG instruction');
    owners.push({ id: await activeTask(page), model: model.model, effort: model.defaultReasoningEffort, serviceTier, label: model === selected[0] ? 'sol' : 'luna' });
  }
  }
  await until(async () => { const tabs = (await inventory(page)).filter(tab => [spectator, ...owners.map(owner => owner.id)].includes(tab.id)); return tabs.length === 3 && tabs.every(tab => tab.images.some(image => image.kind === 'reference')); }, 'all three source references persist', 15000);
  const initial = await inventory(page);
  assert.equal(new Set([spectator, ...owners.map(owner => owner.id)]).size, 3);
  if (checkpointFile) {
    assert.equal(process.env.AI_WORKBENCH_BATCH_RELEASE, 'accepted', 'BLOCKED: separate batch-only release required');
    for (const owner of owners) { await selectTask(page, owner.id); await selectVersion(page, owner.id, 'generated-4', `batch-latest-${owner.label}`); }
  }
  for (const owner of checkpointFile ? [] : owners) {
    await selectTask(page, owner.id);
    const options = { owner: owner.id, spectator, model: owner.model, effort: owner.effort, serviceTier: owner.serviceTier };
    if (!(resumeDirectory && owner.label === 'sol')) {
      await turn(page, `${owner.label}-initial`, '[data-ai-send]', options);
      await comment(page, 'point'); await turn(page, `${owner.label}-point`, '[data-ai-comments-apply]', options);
    }
    await comment(page, 'area'); await turn(page, `${owner.label}-area`, '[data-ai-comments-apply]', { ...options, scoped: true });
    await compareAndInsert(page, owner.id, owner.label);
  }
  await checkpoint(page, 'batch-before');
  await batchScenario(page, owners, spectator);
  await checkpoint(page, 'batch-after');
  const final = await inventory(page);
  preserved(initial, final);
  assert.equal(requests().length, expectedRequests, 'Exactly the remaining planned requests; no retries');
  assert.equal(receipts().filter(row => row.kind === 'accepted').length, expectedRequests);
  assert.equal(receipts().filter(row => ['send-failed', 'blocked-send'].includes(row.kind)).length, 0);
  assert.deepEqual(await canvasObjects(page), []);
  save('acceptance.json', { verdict: 'PASS', initial, final, owners, spectator, requestCount: expectedRequests, acceptedCount: expectedRequests, cumulativeRequests: checkpointFile ? 7 + expectedRequests : resumeDirectory ? 3 + expectedRequests : expectedRequests, reusedOutputReceipts: checkpointFile ? 6 : resumeDirectory ? 2 : 0, canvasObjects: 0 });
  verdict = 'PASS';
});
