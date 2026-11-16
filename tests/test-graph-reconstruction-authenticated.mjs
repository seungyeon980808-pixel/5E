/** Opt-in real observation acceptance. Never invoked by the default unit suite. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { graphSourceHash } from '../js/graph/reconstruction-workflow.js';
import { buildGraphExtractionPrompt, parseGraphPlanResponse } from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

if (process.env.GRAPH_RECONSTRUCTION_REAL !== '1') {
  console.error('Opt-in required: GRAPH_RECONSTRUCTION_REAL=1. This harness performs at most two authenticated model observations.');
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, '..');
const selectedCases = (process.env.GRAPH_RECONSTRUCTION_CASES || 'linear,axis-break').split(',').map(v => v.trim());
if (!selectedCases.length || new Set(selectedCases).size !== selectedCases.length || selectedCases.some(v => !['linear', 'axis-break'].includes(v))) throw Error('Unknown or duplicate GRAPH_RECONSTRUCTION_CASES; expected linear and/or axis-break.');
const dir = path.resolve(process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/graph-reconstruction-20261004/actual-model'));
fs.mkdirSync(dir, { recursive: true });
const ledgerFile = path.join(dir, 'requests.json');
if (fs.existsSync(ledgerFile)) throw Error('This evidence attempt already has a request ledger. Refusing automatic retries or overwritten observations.');
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const binary = process.env.CODEX_BINARY || 'codex';
const requests = [], results = [];
if (selectedCases.includes('linear') && process.env.GRAPH_RECONSTRUCTION_LINEAR_SOURCE) {
  fs.copyFileSync(path.resolve(process.env.GRAPH_RECONSTRUCTION_LINEAR_SOURCE), path.join(dir, 'linear-source.png'));
} else if (selectedCases.includes('linear')) {
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 580 }, deviceScaleFactor: 1 });
  const ticks = Array.from({ length: 5 }, (_, n) => `<path d="M ${120 + n * 105} 470 v 7 M 113 ${470 - n * 95} h 7" stroke="black" stroke-width="2"/><text x="${120 + n * 105}" y="502" text-anchor="middle">${n}</text><text x="98" y="${477 - n * 95}" text-anchor="end">${n}</text>`).join('');
  const markers = Array.from({ length: 5 }, (_, n) => `<circle cx="${120 + n * 105}" cy="${470 - n * 95}" r="5" fill="black"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="580"><rect width="720" height="580" fill="white"/><g font-family="Arial,sans-serif" font-size="24" fill="black"><path d="M120 90 V470 H540" fill="none" stroke="black" stroke-width="2"/>${ticks}<path d="M120 470 L540 90" stroke="black" stroke-width="3"/>${markers}<text x="335" y="548" text-anchor="middle">Time (s)</text><text x="38" y="280" text-anchor="middle" transform="rotate(-90 38 280)">Distance (m)</text><text x="330" y="170" font-size="28">y = x</text></g></svg>`;
  fs.writeFileSync(path.join(dir, 'linear-source.svg'), svg);
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`); await page.screenshot({ path: path.join(dir, 'linear-source.png') });
} finally { await browser.close(); }
}
if (selectedCases.includes('axis-break')) fs.copyFileSync(path.join(root, 'assets/exam-library/images/c2_2024_09_03.png'), path.join(dir, 'exam-axis-break.png'));

function dimensions(bytes) { return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; }
function invoke(sourcePath, prompt, outputDir) {
  return new Promise(resolve => {
    const started = performance.now();
    const responsePath = path.join(outputDir, 'response.txt');
    const cliArgs = ['exec', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--json', '--image', sourcePath, '-o', responsePath, '-'];
    fs.writeFileSync(path.join(outputDir, 'invocation.json'), JSON.stringify({ binary, args: cliArgs, cwd: root, stdin: 'prompt.txt', noModelOverride: true }, null, 2));
    const stdout = fs.createWriteStream(path.join(outputDir, 'events.jsonl')), stderr = fs.createWriteStream(path.join(outputDir, 'stderr.log'));
    const child = spawn(binary, cliArgs, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '', imageEvents = 0, toolEvents = 0, timedOut = false, spawnError = null;
    const events = [];
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 240000);
    const watchdog = setTimeout(() => { if (timedOut) child.kill('SIGKILL'); }, 245000);
    child.stdout.on('data', chunk => {
      stdout.write(chunk); buffer += chunk.toString();
      let boundary;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        try {
          const event = JSON.parse(line), type = String(event.item?.type || event.type || ''); events.push(event);
          if (/image.?generation/i.test(type)) { imageEvents++; child.kill('SIGTERM'); }
          if (/command_execution|mcp_tool_call|web_search|tool_call/.test(type)) { toolEvents++; child.kill('SIGTERM'); }
        } catch { /* Preserve raw non-JSON logs without interpreting them. */ }
      }
    });
    child.stderr.on('data', chunk => stderr.write(chunk));
    child.on('error', error => { spawnError = error.message; });
    child.on('close', (code, signal) => {
      clearTimeout(timer); clearTimeout(watchdog); stdout.end(); stderr.end();
      const text = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, 'utf8') : '';
      resolve({ code, signal, spawnError, wallMs: Math.round(performance.now() - started), imageEvents, toolEvents, timedOut, response: text,
        usage: events.filter(e => e.type === 'turn.completed').map(e => e.usage || null) });
    });
    child.stdin.on('error', () => {}); child.stdin.end(prompt);
  });
}
for (const [id, file] of [['linear', 'linear-source.png'], ['axis-break', 'exam-axis-break.png']].filter(([id]) => selectedCases.includes(id))) {
  const outputDir = path.join(dir, id); fs.mkdirSync(outputDir, { recursive: true });
  const sourcePath = path.join(dir, file), bytes = fs.readFileSync(sourcePath), size = dimensions(bytes);
  const hash = await graphSourceHash(`data:image/png;base64,${bytes.toString('base64')}`);
  const source = { id, hash, ...size, plotBox: { x: 0, y: 0, w: size.width, h: size.height } };
  const binding = { id, hash, ...size };
  const prompt = `Do not execute commands, call tools, browse, or generate/edit images. Inspect only the attached image and respond with the requested observation JSON. No prose or Markdown.\n${buildGraphExtractionPrompt(source)}`;
  fs.writeFileSync(path.join(outputDir, 'source.json'), JSON.stringify(source, null, 2)); fs.writeFileSync(path.join(outputDir, 'prompt.txt'), prompt);
  requests.push({ id, ordinal: requests.length + 1, startedAt: new Date().toISOString(), source, sourcePath }); fs.writeFileSync(ledgerFile, JSON.stringify(requests, null, 2));
  console.log(`Starting authenticated observation ${requests.length}/${selectedCases.length}: ${id}`);
  const call = await invoke(sourcePath, prompt, outputDir);
  const checked = parseGraphPlanResponse(call.response, { source: binding });
  fs.writeFileSync(path.join(outputDir, 'validation.json'), JSON.stringify(checked, null, 2));
  const native = checked.ok ? buildNativeGraph(checked.plan, { source: binding }) : { ok: false, error: 'Invalid observation contract' };
  fs.writeFileSync(path.join(outputDir, 'native-objects.json'), JSON.stringify(native, null, 2));
  const axes = checked.plan?.axes;
  const visibleDots = [];
  for (const series of checked.plan?.series || []) for (const endpoint of series.endpoints || []) {
    const pt = series.points?.[endpoint.index];
    if (pt && endpoint.kind === 'closed') visibleDots.push(series.coordinateSpace === 'normalized' ? { x: axes.x.min + pt.x * (axes.x.max - axes.x.min), y: axes[series.axis].min + pt.y * (axes[series.axis].max - axes[series.axis].min) } : pt);
  }
  for (const annotation of checked.plan?.annotations || []) if (annotation.kind === 'point' && annotation.endStyle !== 'none' && annotation.endStyle !== 'open') {
    visibleDots.push(annotation.coordinateSpace === 'normalized' ? { x: axes.x.min + annotation.x * (axes.x.max - axes.x.min), y: axes[annotation.axis || 'y'].min + annotation.y * (axes[annotation.axis || 'y'].max - axes[annotation.axis || 'y'].min) } : annotation);
  }
  const normalizedText = text => String(text || '').replace(/[\s_{}]/g, '').toLowerCase();
  const literalChecks = id === 'linear' ? {
    allFiveVisibleDots: [0, 1, 2, 3, 4].every(n => visibleDots.some(p => Math.abs(p.x - n) < 0.05 && Math.abs(p.y - n) < 0.05)),
    exactXRange: axes?.x.min === 0 && axes?.x.max === 4,
    exactYRange: axes?.y.min === 0 && axes?.y.max === 4,
    xTitle: normalizedText(axes?.x.title) === 'time', xUnit: normalizedText(axes?.x.unit) === 's',
    yTitle: normalizedText(axes?.y.title) === 'distance', yUnit: normalizedText(axes?.y.unit) === 'm',
    explicitPrintedFunction: checked.plan?.series?.some(s => s.kind === 'expression' && normalizedText(s.expression) === 'x' && s.certainty === 'exact'),
    nativeEditable: native.ok === true && native.objects?.some(o => o.type === 'coordplane') && native.objects?.some(o => o.type === 'funcgraph'),
  } : {
    detectedAxisBreak: checked.plan?.variant === 'axis-break', blocked: checked.blocked === true, reviewPresent: checked.review.length > 0,
    notInserted: native.ok === false, densityTitle: String(axes?.y.title || '').includes('밀도'), temperatureTitle: String(axes?.x.title || '').includes('온도'),
    pointLabels: ['A', 'B', 'C'].every(label => checked.plan?.annotations?.some(a => a.text.trim() === label)),
  };
  const result = { id, source, authenticatedCLI: true, desktopEndToEnd: false, requestCount: 1, retryCount: 0, imageGenerationRequests: 0,
    exitCode: call.code, signal: call.signal, error: call.spawnError, timedOut: call.timedOut, wallMs: call.wallMs, imageEvents: call.imageEvents, toolEvents: call.toolEvents, usage: call.usage,
    structurallyValid: checked.ok, blocked: checked.blocked, literalChecks,
    pass: call.code === 0 && !call.timedOut && call.imageEvents === 0 && call.toolEvents === 0 && checked.ok && Object.values(literalChecks).every(Boolean) };
  results.push(result); fs.writeFileSync(path.join(outputDir, 'metrics.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ invocation: `${process.execPath} tests/test-graph-reconstruction-authenticated.mjs`, realModelRequests: requests.length, noAutoRetry: true, results }, null, 2));
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${id}: wall ${result.wallMs}ms, valid=${checked.ok}, blocked=${checked.blocked}`);
}
if (results.some(r => !r.pass)) process.exitCode = 1;
