/** Opt-in five/20-source real observation harness. No model calls without explicit opt-in. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { graphSourceHash } from '../js/graph/reconstruction-workflow.js';
import { buildGraphExtractionPrompt, parseGraphPlanResponse } from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

const root = path.resolve(import.meta.dirname, '..');
const moduleBase = process.env.APP_MODULE_BASE || '/js/';
const moduleQuery = process.env.APP_MODULE_QUERY ?? '?v=1.7.0-four-session-integration';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function configError(message) { throw new Error(`Batch configuration: ${message}`); }
const replayBatch = process.env.GRAPH_RECONSTRUCTION_REPLAY_BATCH ? path.resolve(process.env.GRAPH_RECONSTRUCTION_REPLAY_BATCH) : null;
if (process.env.GRAPH_RECONSTRUCTION_REAL !== '1' && !replayBatch) { console.error('Explicit opt-in required: GRAPH_RECONSTRUCTION_REAL=1. No model calls made.'); process.exit(2); }
if (!process.env.GRAPH_RECONSTRUCTION_MANIFEST || !process.env.EVIDENCE_DIR) configError('GRAPH_RECONSTRUCTION_MANIFEST and fresh EVIDENCE_DIR are required.');
const manifestPath = path.resolve(process.env.GRAPH_RECONSTRUCTION_MANIFEST);
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR);
if (fs.existsSync(evidenceDir) && fs.readdirSync(evidenceDir).length) configError('EVIDENCE_DIR must be new or empty; refusing reuse/retries.');
const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = Array.isArray(raw) ? raw : raw?.cases;
const caseLimit = Number(process.env.GRAPH_RECONSTRUCTION_CASE_LIMIT || 5);
if (![5, 20].includes(caseLimit)) configError('GRAPH_RECONSTRUCTION_CASE_LIMIT must be 5 or 20.');
if (!Array.isArray(entries) || entries.length !== caseLimit) configError(`Manifest must contain exactly ${caseLimit} cases.`);
const concurrency = Number(process.env.GRAPH_RECONSTRUCTION_CONCURRENCY || 2);
if (![1, 2].includes(concurrency)) configError('Concurrency must be 1 or 2.');
const ids = new Set(), expectedKeys = ['blocked', 'variant', 'nativeEditable', 'axisTitles', 'labels', 'notes'];
const cases = entries.map((item, index) => {
  if (!plain(item) || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(item.id || '') || ids.has(item.id)) configError(`case ${index}: invalid or duplicate id.`);
  ids.add(item.id);
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) configError(`case ${item.id}: title required.`);
  if (typeof item.sourcePath !== 'string' || !item.sourcePath) configError(`case ${item.id}: sourcePath required.`);
  const sourcePath = path.resolve(path.dirname(manifestPath), item.sourcePath);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile() || fs.statSync(sourcePath).size > 8 * 1024 * 1024) configError(`case ${item.id}: readable source file <=8MB required.`);
  const extension = path.extname(sourcePath).toLowerCase();
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extension];
  if (!mime) configError(`case ${item.id}: unsupported image extension.`);
  const expected = item.expected || {};
  if (!plain(expected) || Object.keys(expected).some(key => !expectedKeys.includes(key))) configError(`case ${item.id}: unsupported expected field. Supported: ${expectedKeys.join(', ')}.`);
  for (const key of ['blocked', 'nativeEditable']) if (expected[key] !== undefined && typeof expected[key] !== 'boolean') configError(`case ${item.id}: expected.${key} must be boolean.`);
  if (expected.variant !== undefined && typeof expected.variant !== 'string') configError(`case ${item.id}: expected.variant must be string.`);
  if (expected.notes !== undefined && typeof expected.notes !== 'string') configError(`case ${item.id}: expected.notes must be string.`);
  if (expected.labels !== undefined && (!Array.isArray(expected.labels) || expected.labels.some(x => typeof x !== 'string'))) configError(`case ${item.id}: expected.labels must be strings.`);
  if (expected.axisTitles !== undefined && (!plain(expected.axisTitles) || Object.keys(expected.axisTitles).some(k => !['x', 'y', 'y2'].includes(k) || typeof expected.axisTitles[k] !== 'string'))) configError(`case ${item.id}: expected.axisTitles must map x/y/y2 to text.`);
  return { ...item, sourcePath, expected, mime, extension };
});
const filterText = process.env.GRAPH_RECONSTRUCTION_CASE_FILTER;
const selectedIds = filterText === undefined ? cases.map(item => item.id) : filterText.split(',').map(id => id.trim());
if (!selectedIds.length || new Set(selectedIds).size !== selectedIds.length || selectedIds.some(id => !id || !ids.has(id))) configError('GRAPH_RECONSTRUCTION_CASE_FILTER must contain unique known manifest IDs.');
const selectedCases = cases.filter(item => selectedIds.includes(item.id));
// This guard mode validates manifest/files without importing Playwright or spawning a provider.
if (process.env.GRAPH_RECONSTRUCTION_VALIDATE_ONLY === '1') { console.log(JSON.stringify({ valid: true, count: cases.length, selectedCount: selectedCases.length, selectedIds, concurrency, requestCount: 0 })); process.exit(0); }
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const binary = process.env.CODEX_BINARY || 'codex';
fs.mkdirSync(evidenceDir, { recursive: true });
const ledgerFile = path.join(evidenceDir, 'requests.json');
fs.writeFileSync(ledgerFile, '[]', { flag: 'wx' });
fs.writeFileSync(path.join(evidenceDir, 'manifest.json'), JSON.stringify({ cases, selectedIds, selectedCount: selectedCases.length, concurrency, originalManifestPath: manifestPath }, null, 2));
const ledger = [], results = [], errors = [];
let cursor = 0, inFlight = 0, maxInFlight = 0;
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
function saveSummary() {
  write(path.join(evidenceDir, 'results.json'), { schema: '5e.graph-csat-acceptance/v1', originalManifestPath: manifestPath, manifestCaseCount: cases.length, selectedIds, expectedResultCount: selectedCases.length, requestCount: ledger.length, automaticRetries: 0,
    concurrency, maxInFlight, replayedRecordedObservations: !!replayBatch, recordedBatch: replayBatch, modelSelection: 'CLI defaults with --ignore-user-config, matching previous observations; no model/effort overrides; model name not assumed', desktopEndToEnd: false,
    providerTransportPasses: replayBatch ? 0 : results.filter(r => r.providerPass).length,
    recordedProviderResponsePasses: replayBatch ? results.filter(r => r.providerPass).length : 0,
    structuralPasses: results.filter(r => r.structurallyValid).length,
    blocked: results.filter(r => r.blocked).length,
    nativeCandidates: results.filter(r => r.nativeEditable).length,
    geometryStyleValidated: 0, accepted: 0, // Human geometry/style review is intentionally a separate gate.
    results: [...results].sort((a, b) => cases.findIndex(c => c.id === a.id) - cases.findIndex(c => c.id === b.id)), errors });
}
const browser = await chromium.launch({ headless: true });
const server = http.createServer((request, response) => {
  let pathname; try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch { response.writeHead(400).end(); return; }
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/css/style.css"></head><body></body></html>'); return; }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  const type = { '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' }[path.extname(file)] || 'application/octet-stream';
  response.setHeader('Content-Type', type); fs.createReadStream(file).pipe(response);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
function invoke(item, sourcePath, prompt, dir) {
  return new Promise(resolve => {
    const args = ['exec', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--json', '--image', sourcePath, '-o', path.join(dir, 'response.txt'), '-'];
    write(path.join(dir, 'invocation.json'), { binary, args, cwd: root, stdin: 'prompt.txt', modelOverride: null, reasoningOverride: null, userConfig: 'ignored to match prior authenticated observations; no model/effort overrides' });
    ledger.push({ id: item.id, ordinal: ledger.length + 1, startedAt: new Date().toISOString(), sourcePath }); write(ledgerFile, ledger);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); const started = performance.now();
    const child = spawn(binary, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = fs.createWriteStream(path.join(dir, 'events.jsonl')), stderr = fs.createWriteStream(path.join(dir, 'stderr.log'));
    let buffer = '', imageEvents = 0, toolEvents = 0, spawnError = null, timedOut = false, killTimer;
    const usages = [], modelNames = new Set();
    function stop() { child.kill('SIGTERM'); if (!killTimer) killTimer = setTimeout(() => child.kill('SIGKILL'), 5000); }
    function eventLine(line) { try {
      const event = JSON.parse(line), type = String(event.item?.type || event.type || '');
      if (typeof event.model === 'string') modelNames.add(event.model);
      if (event.type === 'turn.completed') usages.push(event.usage || null);
      if (/image.?generation/i.test(type)) { imageEvents++; stop(); }
      if (/command_execution|mcp_tool_call|web_search|tool_call/.test(type)) { toolEvents++; stop(); }
    } catch { /* Raw non-JSON output remains captured. */ } }
    const timer = setTimeout(() => { timedOut = true; stop(); }, 240000);
    child.stdout.on('data', bytes => { output.write(bytes); buffer += bytes.toString(); let pos; while ((pos = buffer.indexOf('\n')) >= 0) { eventLine(buffer.slice(0, pos)); buffer = buffer.slice(pos + 1); } });
    child.stderr.on('data', bytes => stderr.write(bytes)); child.on('error', error => { spawnError = error.message; }); child.stdin.on('error', () => {});
    child.on('close', async (exitCode, signal) => {
      if (buffer.trim()) eventLine(buffer); clearTimeout(timer); clearTimeout(killTimer); inFlight--;
      await Promise.all([new Promise(r => output.end(r)), new Promise(r => stderr.end(r))]);
      const responseFile = path.join(dir, 'response.txt');
      resolve({ exitCode, signal, spawnError, timedOut, wallMs: Math.round(performance.now() - started), imageEvents, toolEvents, usage: usages, exposedModels: [...modelNames], response: fs.existsSync(responseFile) ? fs.readFileSync(responseFile, 'utf8') : '' });
    });
    child.stdin.end(prompt);
  });
}
// Source-pixel relation audit is separate from JSON/native validity. It never
// moves an observed point or snaps a floating leader into place.
function auditLeaderRelations(plan) {
  const frame = plan?.source?.plotBox;
  if (!frame) return [];
  const pixel = p => ({ x: p.x * frame.w, y: p.y * frame.h });
  const distance = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(p.x-a.x-t*dx, p.y-a.y-t*dy);
  };
  return (plan.annotations || []).filter(a => a.kind === 'leader' && a.seriesId).map(a => {
    const series = plan.series.find(s => s.id === a.seriesId), points = series?.points || [];
    let gapPx = Infinity;
    for (let i = 1; i < points.length; i++) {
      if ((series.breaks || []).includes(i)) continue;
      gapPx = Math.min(gapPx, distance(pixel(a.to), pixel(points[i-1]), pixel(points[i])));
    }
    return { annotationId: a.id, seriesId: a.seriesId, polylineGapPx: Number.isFinite(gapPx) ? gapPx : null,
      tolerancePx: 3, pass: gapPx <= 3, method: 'distance to recorded observation polyline; visual inspection still required' };
  });
}
async function renderComparison(item, dataUrl, native, checked, dir) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 830 }, deviceScaleFactor: 1 });
  try {
    await page.goto(origin);
    const render = await page.evaluate(async ({ title, dataUrl, native, review, moduleBase, moduleQuery }) => {
      await Promise.all([document.fonts.load('300 12px "Latin Modern Roman"'), document.fonts.load('italic 300 12px "Latin Modern Roman"')]);
      await document.fonts.ready;
      document.body.replaceChildren(); document.body.style.cssText = 'margin:0;padding:24px;background:#fff;color:#111;font-family:Arial,sans-serif;box-sizing:border-box;';
      const heading = document.createElement('h1'); heading.textContent = title; heading.style.fontSize = '22px'; document.body.append(heading);
      const layout = document.createElement('div'); layout.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:24px;'; document.body.append(layout);
      const section = title => { const el = document.createElement('section'), h = document.createElement('h2'); h.textContent = title; h.style.fontSize = '18px'; el.append(h); layout.append(el); return el; };
      const left = section('원본'), image = document.createElement('img'); image.src = dataUrl; image.style.cssText = 'width:100%;height:610px;object-fit:contain;background:white'; left.append(image); await image.decode();
      const right = section(native.ok ? '네이티브 후보 · 시각 검수 전' : '자동 삽입 차단 · 검수 필요');
      let svgText = null;
      if (native.ok) {
        const {renderCoordplane, renderFuncgraph} = await import(moduleBase + 'render/coordplane.js' + moduleQuery);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.style.cssText = 'width:100%;height:610px;background:white;overflow:visible';
        for (const object of [...native.objects.slice(1), native.objects[0]]) svg.append(object.type === 'coordplane' ? renderCoordplane(object) : renderFuncgraph(object));
        right.append(svg); await document.fonts.ready;
        const b = svg.getBBox(), padding = 7; svg.setAttribute('viewBox', `${b.x - padding} ${b.y - padding} ${Math.max(1, b.width) + 2 * padding} ${Math.max(1, b.height) + 2 * padding}`); svgText = svg.outerHTML;
      } else {
        const text = document.createElement('p'); text.textContent = native.error || '미지원 그래프 또는 확정할 수 없는 축입니다.'; right.append(text);
      }
      const notes = document.createElement('p'); notes.textContent = review.slice(0, 4).map(x => x.reason).join(' · '); notes.style.cssText = 'font-size:13px;line-height:1.5'; right.append(notes);
      let tickLayout = [];
      if (native.ok) {
        const plane = native.objects.find(o => o.type === 'coordplane');
        tickLayout = (plane.explicitTicksX || []).map((tick, index) => {
          const element = right.querySelector(`[data-tick="x:${index}"]`);
          if (!element) return { index, pass: false, error: 'missing x tick label' };
          const b = element.getBBox(), expectedX = plane.x + plane.w * (tick.value-plane.xMin)/(plane.xMax-plane.xMin);
          const gap = b.x+b.width/2-expectedX;
          return { index, label: tick.label, expectedX, gap, pass: Math.abs(gap) < (plane.tickLabelSize || 2.6)*.25 };
        });
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { svgText, tickLayout };
    }, { title: item.title, dataUrl, native, review: checked.review || [], moduleBase, moduleQuery });
    if (render.svgText) {
      fs.writeFileSync(path.join(dir, 'native-render.svg'), render.svgText);
      // Capture the concrete SVG surface before the full comparison page.
      await page.locator('svg').screenshot({ path: path.join(dir, 'native-render.png'), animations: 'disabled' });
    }
    await page.screenshot({ path: path.join(dir, 'comparison.png'), fullPage: true, animations: 'disabled' });
    return { comparison: 'comparison.png', nativeRender: render.svgText ? 'native-render.png' : null, status: 'captured-not-reviewed', tickLayout: render.tickLayout };
  } finally { await page.close(); }
}
try {
  // Decode every source before the first request. A bad fifth image cannot waste four paid calls.
  const decoder = await browser.newPage();
  try { for (const item of cases) {
    const bytes = fs.readFileSync(item.sourcePath); item.dataUrl = `data:${item.mime};base64,${bytes.toString('base64')}`;
    const size = await decoder.evaluate(async data => { const img = new Image(); img.src = data; await img.decode(); return { width: img.naturalWidth, height: img.naturalHeight }; }, item.dataUrl);
    if (!size.width || !size.height || size.width > 100000 || size.height > 100000) configError(`Invalid dimensions: ${item.id}`);
    item.binding = { id: item.id, hash: await graphSourceHash(item.dataUrl), ...size };
  } } finally { await decoder.close(); }
  async function worker() { while (cursor < selectedCases.length) {
    const item = selectedCases[cursor++], dir = path.join(evidenceDir, item.id); fs.mkdirSync(dir);
    const sourcePath = path.join(dir, 'source' + item.extension); fs.copyFileSync(item.sourcePath, sourcePath);
    const source = { ...item.binding, plotBox: { x: 0, y: 0, w: item.binding.width, h: item.binding.height } }; write(path.join(dir, 'source.json'), { ...source, originalPath: item.sourcePath });
    const prompt = `Do not execute commands, call tools, browse, or generate/edit images. Inspect only the attached image. Return only the requested observation JSON.\n${buildGraphExtractionPrompt(source)}`; fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt);
    console.log(`START ${item.id} (${replayBatch ? 'recorded-response replay, zero provider calls' : 'no retry'})`);
    try {
      let call;
      if (replayBatch) {
        const prior = path.join(replayBatch, item.id), recorded = JSON.parse(fs.readFileSync(path.join(prior, 'metrics.json')));
        if (!recorded.providerPass) throw Error('Refusing replay of failed provider response');
        const response = fs.readFileSync(path.join(prior, 'response.txt'), 'utf8');
        fs.copyFileSync(path.join(prior, 'response.txt'), path.join(dir, 'response.txt'));
        fs.copyFileSync(path.join(prior, 'prompt.txt'), path.join(dir, 'recorded-prompt.txt'));
        write(path.join(dir, 'replay.json'), { recordedBatch: replayBatch, newProviderCalls: 0, manualPlanCorrections: 0 });
        call = { exitCode: recorded.exitCode, signal: recorded.signal, spawnError: recorded.spawnError, timedOut: recorded.timedOut,
          wallMs: 0, recordedWallMs: recorded.wallMs, imageEvents: recorded.imageEvents, toolEvents: recorded.toolEvents, usage: [], response };
      } else call = await invoke(item, sourcePath, prompt, dir);
      const checked = parseGraphPlanResponse(call.response, { source: item.binding }); write(path.join(dir, 'validation.json'), checked);
      const frame = checked.plan?.source?.plotBox;
      const native = checked.ok ? buildNativeGraph(checked.plan, { source: item.binding, box: { x: 0, y: 0, w: 70, h: 70 * frame.h / frame.w } }) : { ok: false, error: 'Observation contract validation failed', objects: [], review: checked.review };
      write(path.join(dir, 'native-objects.json'), native);
      const checks = [];
      for (const key of ['blocked', 'variant', 'nativeEditable']) if (item.expected[key] !== undefined) {
        const actual = key === 'variant' ? checked.plan?.variant : key === 'nativeEditable' ? native.ok : checked.blocked;
        checks.push({ field: key, expected: item.expected[key], actual, pass: actual === item.expected[key] });
      }
      for (const [axis, value] of Object.entries(item.expected.axisTitles || {})) checks.push({ field: `axes.${axis}.title`, expected: value, actual: checked.plan?.axes?.[axis]?.title, pass: checked.plan?.axes?.[axis]?.title === value });
      const labels = (checked.plan?.annotations || []).map(a => a.text);
      for (const label of item.expected.labels || []) checks.push({ field: 'annotations.text', expected: label, pass: labels.includes(label) });
      let visual; try { visual = await renderComparison(item, item.dataUrl, native, checked, dir); } catch (error) { visual = { status: 'render-failed', error: error.message }; }
      const { response, ...metrics } = call;
      const result = { id: item.id, title: item.title, source: item.binding, ...metrics, requestCount: replayBatch ? 0 : 1, replayedRecordedObservation: !!replayBatch, recordedBatch: replayBatch, retryCount: 0, imageGenerationRequests: 0, desktopEndToEnd: false,
        providerPass: call.exitCode === 0 && !call.timedOut && !call.spawnError && call.imageEvents === 0 && call.toolEvents === 0,
        structurallyValid: checked.ok, blocked: checked.blocked, nativeEditable: native.ok,
        expectedChecks: checks, expectedChecksPass: checks.every(c => c.pass),
        leaderRelations: auditLeaderRelations(checked.plan),
        geometryValidation: { status: 'pending-human-review' }, styleValidation: { status: 'pending-human-review' },
        visual, accepted: false, outcome: !checked.ok ? 'invalid-contract' : checked.blocked ? 'blocked-review' : !native.ok ? 'native-build-failed' : visual.status === 'render-failed' ? 'render-failed' : 'native-candidate-awaiting-review' };
      write(path.join(dir, 'metrics.json'), result); results.push(result); saveSummary(); console.log(`DONE ${item.id}: ${result.outcome}, ${call.wallMs}ms`);
    } catch (error) { errors.push({ id: item.id, error: error.stack }); saveSummary(); console.error(`FAILED ${item.id}: ${error.message}`); }
  } }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); saveSummary(); }
// Capture completion is not reconstruction acceptance. Blocked or unreviewed cases never pass acceptance.
if (errors.length || results.length !== selectedCases.length || results.some(r => !r.providerPass || !r.structurallyValid || !r.expectedChecksPass || r.visual.status === 'render-failed' || r.visual.tickLayout?.some(t => !t.pass))) process.exitCode = 1;
