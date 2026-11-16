/** Opt-in evaluation through the real workbench and authenticated local App Server.
 * No synthetic provider replies, automatic retries, or manual plan corrections.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { parseGraphPlanResponse, GRAPH_ENGINE_PROMPT_VERSION } from '../js/graph/reconstruction-contract.js';
import { resolveAIModelSelection } from '../js/ai-model-capabilities.js';
import { auditPhysicsGraphResult, isPhysicsProviderUnavailable } from './physics-graph-result-audit.mjs';
import { auditGraphReconstructionQuality } from '../js/graph/reconstruction-quality.js';
import { GRAPH_PIPELINE_VERSION } from '../js/graph/reconstruction-workflow.js';

const { buildEphemeralThreadStartParams } = createRequire(import.meta.url)('../desktop/ai-thread-profile.cjs');
const { resolveTurnPlan } = createRequire(import.meta.url)('../desktop/codex-turn-runtime.cjs');
const evaluationPass = Number(process.env.PHYSICS_GRAPH_PASS || 1);
assert(Number.isInteger(evaluationPass) && evaluationPass >= 1 && evaluationPass <= 3, 'Pass must be 1..3');
const root = path.resolve(import.meta.dirname, '..');
const selection = { model: 'gpt-6.1-sol', effort: 'medium', serviceTier: null };
if (process.env.PHYSICS_GRAPH_REAL !== '1') throw Error('PHYSICS_GRAPH_REAL=1 is required; no model calls made.');
if (!process.env.PHYSICS_GRAPH_MANIFEST || !process.env.EVIDENCE_DIR) throw Error('Manifest and evidence directory required.');
const manifest = JSON.parse(fs.readFileSync(process.env.PHYSICS_GRAPH_MANIFEST));
assert.equal(manifest.model, selection.model); assert.equal(manifest.effort, selection.effort);
if (evaluationPass === 1 && manifest.frozenPromptVersion) assert.equal(manifest.frozenPromptVersion, GRAPH_ENGINE_PROMPT_VERSION, 'Frozen baseline prompt changed');
const expectedCount = manifest.expectedCount ?? 20;
assert(Number.isInteger(expectedCount) && expectedCount >= 1 && expectedCount <= 20, 'Bounded manifest count required');
assert.equal(manifest.cases.length, expectedCount); assert.equal(new Set(manifest.cases.map(c => c.id)).size, expectedCount);
assert.equal(new Set(manifest.cases.map(c => c.sourceSHA256)).size, expectedCount, 'Sources must be distinct');
for (const c of manifest.cases) {
  assert.match(c.id, /^[a-z0-9_-]+$/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(c.sourcePath)).digest('hex'), c.sourceSHA256, 'Frozen source changed');
  assert(c.notInPreviousSubmittedHashes === true || c.priorSubmissionExpected === true || c.newToBaseline === true,
    'Each source must declare a new baseline observation or an explicitly requested repeat');
}
const selectedIds = process.env.PHYSICS_GRAPH_CASES?.split(',') || manifest.cases.map(c => c.id);
assert(selectedIds.length && new Set(selectedIds).size === selectedIds.length && selectedIds.every(id => manifest.cases.some(c => c.id === id)));
const output = path.resolve(process.env.EVIDENCE_DIR);
fs.mkdirSync(output, { recursive: true });
const selectedCases = manifest.cases.filter(c => selectedIds.includes(c.id));
for (const c of selectedCases) assert(!fs.existsSync(path.join(output, c.id)), 'Refusing repeated paid observation; choose a fresh evidence directory.');
if (process.env.PHYSICS_GRAPH_VALIDATE_ONLY === '1') {
  console.log(JSON.stringify({ valid: true, manifestCount: expectedCount, selectedCount: selectedCases.length, modelCalls: 0, evaluationPass }));
  process.exit(0);
}
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const binary = process.env.CODEX_BINARY || 'codex';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8795/preview/';
const profileDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', '5e-physics-eval-'));
const child = spawn(binary, ['app-server', '--stdio'], { cwd: profileDir, stdio: ['pipe', 'pipe', 'pipe'] });
const pending = new Map(); let serial = 0, current = null;
const rpc = (method, params) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 30000);
  pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: e => { clearTimeout(timer); reject(e); } });
  child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
});
createInterface({ input: child.stdout }).on('line', line => {
  let message; try { message = JSON.parse(line); } catch { return; }
  if (message.id != null && pending.has(message.id)) {
    const p = pending.get(message.id); pending.delete(message.id);
    message.error ? p.reject(Error(message.error.message)) : p.resolve(message.result); return;
  }
  if (!message.method || !current) return;
  const eventThread = message.params?.threadId;
  if (eventThread && current.threadId && eventThread !== current.threadId) return;
  const captured = current;
  fs.appendFileSync(path.join(captured.dir, 'events.jsonl'), line + '\n');
  if (message.method === 'thread/tokenUsage/updated') captured.tokenUsage = message.params.tokenUsage;
  if (message.method === 'thread/settings/updated') captured.providerSettings = message.params.threadSettings;
  if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') captured.response = message.params.item.text;
  if (message.method === 'turn/completed') captured.terminal = message.params.turn;
  const event = { ...message, clientScope: captured.scope };
  captured.delivery = captured.delivery.then(() => captured.page.evaluate(event => window.__physicsProvider.emit(event), event)).catch(error => { captured.deliveryError = error.message; });
});
child.stderr.on('data', chunk => {
  if (current) fs.appendFileSync(path.join(current.dir, 'provider-stderr.log'), chunk);
});
child.stdin.on('error', () => {});
child.on('exit', (code, signal) => { for (const p of pending.values()) p.reject(Error(`App Server exited: ${code || signal}`)); pending.clear(); });
child.on('error', error => { for (const p of pending.values()) p.reject(error); pending.clear(); });
const manifestHash = crypto.createHash('sha256').update(fs.readFileSync(process.env.PHYSICS_GRAPH_MANIFEST)).digest('hex');
const pipelineFiles = ['preview/js/ai-panel.js', 'preview/js/graph/reconstruction-workflow.js', 'preview/js/graph/reconstruction-contract.js', 'preview/js/graph/reconstruction-quality.js', 'preview/js/graph/workbench-result.js', 'preview/js/graph/native-graph.js', 'preview/js/graph/source-frame.js', 'preview/js/graph/source-grid.js', 'preview/js/graph/source-guide-style.js', 'preview/js/graph/source-arrow-size.js', 'preview/js/function-graph/analytic-fit.js', 'preview/js/function-graph/physics-fit.js', 'preview/js/function-graph/physics-relations.js', 'preview/js/render/coordplane.js', 'preview/js/render/graph-label.js', 'preview/js/formula.js'];
const pipelineHash = () => crypto.createHash('sha256').update(JSON.stringify(pipelineFiles.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]))).digest('hex');
const pipelineSourceSHA256 = pipelineHash();
const reportFile = path.join(output, 'results.json');
const prior = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile)) : null;
if (prior) {
  assert.equal(prior.schema, '5e.physics-workbench-evaluation/v1');
  assert.deepEqual(prior.selection, selection);
  assert.equal(prior.evaluationPass || 1, evaluationPass);
  assert.equal(prior.sourceManifest, path.resolve(process.env.PHYSICS_GRAPH_MANIFEST));
  if (prior.manifestHash) assert.equal(prior.manifestHash, manifestHash, 'Frozen manifest changed');
  assert(selectedIds.every(id => !prior.cases.some(c => c.id === id)), 'Refusing repeated observations');
}
const report = prior || { schema: '5e.physics-workbench-evaluation/v1', selection, binary, sourceManifest: path.resolve(process.env.PHYSICS_GRAPH_MANIFEST), evaluationPass, firstGenerationOnly: evaluationPass === 1, manualPlanCorrections: 0, automaticRetries: 0, actualModelCalls: 0, transport: 'real workbench → test adapter → authenticated local App Server', desktopIpcVerified: false, deployedWebAuthenticationVerified: false, visualAcceptance: false, cases: [] };
report.manifestHash = manifestHash;
if (prior?.promptVersion) assert.equal(prior.promptVersion, GRAPH_ENGINE_PROMPT_VERSION);
if (prior) {
  assert.equal(prior.pipelineVersion, GRAPH_PIPELINE_VERSION, 'Cannot resume a different pipeline version');
  assert.equal(prior.pipelineSourceSHA256, pipelineSourceSHA256, 'Cannot resume changed product code');
}
report.promptVersion = GRAPH_ENGINE_PROMPT_VERSION;
report.pipelineVersion = GRAPH_PIPELINE_VERSION;
report.pipelineSourceSHA256 = pipelineSourceSHA256;
const save = () => fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
let browser;
try {
  await rpc('initialize', { clientInfo: { name: '5e-physics-workbench-eval', version: '1.7.0' }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  const catalog = await rpc('model/list', { limit: 100, includeHidden: false });
  resolveAIModelSelection(selection, catalog);
  fs.writeFileSync(path.join(output, 'model-catalog.json'), JSON.stringify(catalog, null, 2));
  browser = await chromium.launch({ headless: true });
  for (const c of selectedCases) {
    assert.equal(pipelineHash(), pipelineSourceSHA256, 'Product changed during frozen first-generation evaluation');
    const dir = path.join(output, c.id); fs.mkdirSync(dir);
    fs.copyFileSync(c.sourcePath, path.join(dir, 'source.png'));
    const record = { id: c.id, title: c.title, referenceFeature: c.referenceFeature, sourceSHA256: c.sourceSHA256, promptVersion: GRAPH_ENGINE_PROMPT_VERSION, pipelineVersion: GRAPH_PIPELINE_VERSION, pipelineSourceSHA256, requestCount: 0, nativeResult: false, editingPass: false, checks: [], errors: [] };
    report.cases.push(record); save();
    const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    current = { dir, page, delivery: Promise.resolve(), scope: null, threadId: null, turnId: null, response: '', started: 0, record };
    page.on('pageerror', error => record.errors.push(String(error)));
    await page.exposeBinding('__callPhysicsProvider', async (_, method, request) => {
      if (method === 'models') return catalog;
      if (method === 'status') return { login: { loggedIn: true }, server: true };
      if (method === 'start') return { ok: true };
      if (method === 'account') return {};
      if (method === 'interrupt') {
        if (current?.turnId) await rpc('turn/interrupt', { threadId: current.threadId, turnId: current.turnId });
        return { ok: true, acknowledged: true };
      }
      assert.equal(method, 'send');
      assert.equal(record.requestCount, 0, 'No automatic paid retry');
      assert.equal(request.model, selection.model); assert.equal(request.effort, selection.effort); assert.equal(request.purpose, 'scene'); assert.equal(request.ephemeralRender, true);
      assert.equal(request.attachments.length, 1);
      const bytes = Buffer.from(request.attachments[0].data.split(',')[1], 'base64');
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), c.sourceSHA256);
      fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify(request, null, 2));
      fs.writeFileSync(path.join(dir, 'prompt.txt'), request.text);
      current.scope = request.clientScope;
      const turnPlan = resolveTurnPlan(request);
      assert.equal(turnPlan.purpose, 'scene'); assert.equal(turnPlan.resumeConversationId, null);
      const started = await rpc('thread/start', buildEphemeralThreadStartParams({ purpose: turnPlan.purpose, ...selection, cwd: profileDir }));
      current.threadId = started.thread.id;
      current.started = Date.now(); record.requestCount++; report.actualModelCalls++; save();
      const turn = await rpc('turn/start', { threadId: current.threadId, input: [{ type: 'text', text: request.text }, { type: 'localImage', path: path.join(dir, 'source.png') }], ...selection });
      current.turnId = turn.turn.id;
      fs.writeFileSync(path.join(dir, 'invocation.json'), JSON.stringify({ binary, threadId: current.threadId, turnId: current.turnId, model: request.model, effort: request.effort, inputSource: 'source.png', request: 'request.json', actualProvider: true, evaluationPass, purpose: request.purpose }, null, 2));
      return { threadId: current.threadId, turnId: current.turnId };
    });
    await page.addInitScript(() => {
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.mode', 'pro');
      window.showSaveFilePicker = undefined; window.showDirectoryPicker = undefined;
      const listeners = new Set(); window.__physicsProvider = { terminal: false, emit: event => { if (event.method === 'turn/completed') window.__physicsProvider.terminal = true; listeners.forEach(fn => fn(event)); } };
      window.fiveEDesktop = Object.fromEntries(['status', 'models', 'start', 'account', 'send', 'interrupt'].map(method => [method, request => window.__callPhysicsProvider(method, request)]));
      Object.assign(window.fiveEDesktop, { web: true, onEvent: fn => { listeners.add(fn); return () => listeners.delete(fn); }, onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {} });
    });
    try {
      // External font/network activity must not prevent local workbench readiness.
      await page.goto(base + '?mode=pro', { waitUntil: 'domcontentloaded' });
      await page.locator('#ai-image-install-open').waitFor({ state: 'visible' });
      await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
      await page.locator('#ai-image-panel [data-ai-workflow="graph"][aria-pressed="true"]').waitFor();
      await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles(c.sourcePath);
      await page.locator('#ai-image-panel [data-ai-attachment-list] img').first().waitFor({ state: 'attached' });
      await page.locator('#ai-image-panel [data-ai-input]').fill(c.instructions);
      await page.locator('#ai-image-panel [data-ai-send]').click();
      await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiBusy !== 'true' && (window.__physicsProvider.terminal || /오류|error|Expected|Invalid|시간|지원|일치|유효|확인하지|올바르|실패/.test(document.querySelector('#ai-image-panel [data-ai-status]')?.textContent || '')), null, { timeout: 270000 });
      await current.delivery;
      record.wallMs = current.started ? Date.now() - current.started : 0;
      record.tokenUsage = current.tokenUsage || null; record.providerStatus = current.terminal?.status || null;
      if (record.requestCount) {
        assert.equal(current.providerSettings?.model, selection.model, 'Provider model must match fixed selection');
        assert.equal(current.providerSettings?.effort, selection.effort, 'Provider effort must match fixed selection');
        record.providerSettings = { model: current.providerSettings.model, effort: current.providerSettings.effort };
      }
      fs.writeFileSync(path.join(dir, 'response.txt'), current.response || '');
      record.statusText = await page.locator('#ai-image-panel [data-ai-status]').textContent();
      await page.screenshot({ path: path.join(dir, 'workbench.png') });
      const tabs = await page.evaluate(async () => {
        const { IndexedDBOutputCacheBackend } = await import('./js/ai-output-cache-store.js?v=1.7.0-four-session-integration');
        return (await new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-image-tasks', storeName: 'tasks' }).get('workspace'))?.tabs;
      });
      const candidate = tabs?.flatMap(t => t.generated || []).find(item => item.graphResult);
      if (!candidate) {
        const parsed = parseGraphPlanResponse(current.response);
        if (parsed.ok && parsed.blocked) { record.blocked = true; record.unsupportedVariant = parsed.plan.variant; }
        throw Error('Workbench did not produce a native graph: ' + record.statusText);
      }
      record.nativeResult = true;
      fs.writeFileSync(path.join(dir, 'candidate.json'), JSON.stringify(candidate, null, 2));
      fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(candidate.graphResult.plan, null, 2));
      record.relationshipAudit = auditGraphReconstructionQuality(candidate.graphResult.plan, { reference: c.reference });
      fs.writeFileSync(path.join(dir, 'relationship-audit.json'), JSON.stringify(record.relationshipAudit, null, 2));
      const styleEvidence = await page.evaluate(async ({ result, sourceData, renderedData }) => {
        const { decodeGraphSourceRaster, matchSourceAxisArrowSize } = await import('./js/graph/source-arrow-size.js?v=1.7.0-four-session-integration');
        const measure = async data => {
          const measured = matchSourceAxisArrowSize(result.plan, await decodeGraphSourceRaster(data, result.source));
          return { applied: measured.applied, measurements: measured.measurements, reason: measured.reason };
        };
        const svg = new TextDecoder().decode(Uint8Array.from(atob(renderedData.split(',')[1]), c => c.charCodeAt(0)));
        return { sourceHeads: await measure(sourceData), renderedHeads: await measure(renderedData),
          fontEmbedded: /@font-face/.test(svg) && /font-family\s*:\s*["']?Latin Modern Roman/.test(svg) && /url\(["']?data:/.test(svg) };
      }, { result: candidate.graphResult, sourceData: JSON.parse(fs.readFileSync(path.join(dir, 'request.json'))).attachments[0].data, renderedData: candidate.data });
      record.resultAudit = auditPhysicsGraphResult(candidate.graphResult.plan, { ...styleEvidence, objects: candidate.graphResult.objects, expectedAnalyticCurves: c.expectedAnalyticCurves });
      fs.writeFileSync(path.join(dir, 'result-audit.json'), JSON.stringify(record.resultAudit, null, 2));
      const anchorReview = await page.evaluate(async ({plan, data}) => {
        const {reviewSourceAnchors} = await import('./js/graph/source-anchor-review.js?v=1.7.0-four-session-integration');
        const img = new Image(); img.src = data; await img.decode(); const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
        return reviewSourceAnchors(plan, {width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data});
      }, {plan:candidate.graphResult.plan,data:JSON.parse(fs.readFileSync(path.join(dir,'request.json'))).attachments[0].data});
      fs.writeFileSync(path.join(dir,'anchor-review.json'),JSON.stringify(anchorReview,null,2));
      record.anchorReview = {checked:anchorReview.checked,flagged:anchorReview.flagged,coordinatesChanged:false,visualAcceptance:false};
      fs.writeFileSync(path.join(dir, 'native.svg'), Buffer.from(candidate.data.split(',')[1], 'base64'));
      const png = await page.evaluate(async data => {
        const img = new Image(); img.src = data; await img.decode(); const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0); return canvas.toDataURL('image/png');
      }, candidate.data);
      fs.writeFileSync(path.join(dir, 'native.png'), Buffer.from(png.split(',')[1], 'base64'));
      await page.locator('#ai-image-panel [data-ai-compare]').click();
      const slider = page.locator('#ai-image-panel [role="slider"]'); await slider.waitFor(); const box = await slider.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 80, box.y + box.height / 2); await page.mouse.up();
      assert.notEqual(await slider.getAttribute('aria-valuenow'), '50'); record.checks.push('live result wipe drag');
      await page.screenshot({ path: path.join(dir, 'wipe.png') });
      await page.locator('#ai-image-panel [data-ai-compare]').click();
      await page.locator('#ai-image-panel .ai-previews img').first().dblclick();
      await page.locator('#gm-labelx').fill('취소 검증'); await page.locator('#gm-cancel').click(); record.checks.push('result doubleclick; cancel isolated');
      await page.locator('#ai-image-panel [data-ai-insert-selected]').click();
      const snapshot = () => page.evaluate(async () => structuredClone((await import('./js/state.js?v=1.7.0-four-session-integration')).state.get().objects));
      const before = await snapshot(); const plane = before.find(o => o.type === 'coordplane'); assert(plane); assert(before.some(o => o.type === 'funcgraph')); assert(!before.some(o => o.type === 'image'));
      await page.evaluate(async id => (await import('./js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id), plane.id);
      await page.locator('#gm-confirm').click(); assert.deepEqual(await snapshot(), before); record.checks.push('native insertion; no-op exact');
      await page.evaluate(async id => (await import('./js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal(id), plane.id);
      await page.locator('#gm-labelx').fill('편집 검증'); await page.locator('#gm-confirm').click(); assert.equal((await snapshot()).find(o => o.id === plane.id).labelX, '편집 검증');
      for (const action of ['undo', 'redo', 'undo']) await page.evaluate(async action => { const { state } = await import('./js/state.js?v=1.7.0-four-session-integration'); (await import('./js/transform.js?v=1.7.0-four-session-integration'))[action](state); }, action);
      assert.deepEqual(await snapshot(), before); record.checks.push('label edit; undo/redo; original restored');
      await page.locator('#file-menu-btn').click(); await page.locator('#project-save').click();
      const downloading = page.waitForEvent('download'); const explicit = page.locator('#project-save-download');
      if (await explicit.isVisible().catch(() => false)) await explicit.click(); else await page.getByRole('button', { name: '저장', exact: true }).click();
      const projectPath = path.join(dir, 'editable-graph.5e'); await (await downloading).saveAs(projectPath);
      await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#file-menu-btn').click();
      const chooser = page.waitForEvent('filechooser'); await page.locator('#project-open').click(); await (await chooser).setFiles(projectPath); await page.getByRole('button', { name: '열기', exact: true }).click();
      await page.waitForFunction(async () => (await import('./js/state.js?v=1.7.0-four-session-integration')).state.get().objects.some(o => o.type === 'funcgraph'));
      const reopened = await snapshot();
      for (const o of before) { const loaded = reopened.find(x => x.id === o.id); for (const k of Object.keys(o)) assert.deepEqual(loaded[k], o[k], `Reopened ${o.type}.${k}`); }
      assert(!reopened.some(o => o.type === 'image')); assert.deepEqual(record.errors, []); record.checks.push('actual .5e download and reopen; original fields exact'); record.editingPass = true;
    } catch (error) {
      record.error = error.message; record.wallMs ||= current.started ? Date.now() - current.started : 0; record.tokenUsage ||= current.tokenUsage || null;
      fs.writeFileSync(path.join(dir, 'response.txt'), current.response || '');
      await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => {});
      if (current.turnId && !current.terminal) await rpc('turn/interrupt', { threadId: current.threadId, turnId: current.turnId }).catch(() => {});
    } finally {
      fs.writeFileSync(path.join(dir, 'verification.json'), JSON.stringify(record, null, 2)); save();
      console.log(JSON.stringify({ id: record.id, nativeResult: record.nativeResult, editingPass: record.editingPass, wallMs: record.wallMs, error: record.error }));
      current = null; await context.close();
    }
    // A provider-wide failure cannot be fixed by submitting the other sources.
    const providerLog = path.join(dir, 'provider-stderr.log');
    const providerFailure = `${record.statusText || ''}\n${record.error || ''}\n${record.error && fs.existsSync(providerLog) ? fs.readFileSync(providerLog, 'utf8') : ''}`;
    if (isPhysicsProviderUnavailable(providerFailure)) {
      report.stopped = { reason: 'provider-unavailable', afterCase: c.id, remainingCases: selectedCases.length - report.cases.filter(r => selectedIds.includes(r.id)).length };
      save(); break;
    }
  }
} finally {
  save(); await browser?.close(); child.kill(); fs.rmSync(profileDir, { recursive: true, force: true });
}
