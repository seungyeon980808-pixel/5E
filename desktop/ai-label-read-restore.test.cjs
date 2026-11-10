// 11-10: 라벨 복원(기본) — 그림은 라벨 삭제와 같은 요청으로 한 번 그리고, 원본 글자는 글 읽기 호출로 병렬로 읽는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
const readItems = JSON.stringify([
  { text: 'H₂O(s)', kind: 'math', x: 0.1, y: 0.2, w: 0.2, h: 0.05, leader: null },
  { text: 'A', kind: 'en', x: 0.5, y: 0.5, w: 0.05, h: 0.05, leader: { x1: 0.5, y1: 0.5, x2: 0.7, y2: 0.7 } },
]);

// 실제 실행 모듈을 vm 안에서 돌린다(drafts 테스트와 같은 방식). 브라우저 Image가 없으므로 원본 판 맞춤은 건너뛴다.
async function loadRun() {
  const file = require.resolve('../js/ai-image-label-run.js');
  const source = fs.readFileSync(file, 'utf8');
  const dependencies = {};
  for (const match of source.matchAll(/^import \{ ([^}]+) \} from '([^']+)';$/gm)) {
    const module = await import(path.resolve(path.dirname(file), match[2].split('?')[0]));
    for (const name of match[1].split(',').map(s => s.trim())) dependencies[name] = module[name];
  }
  const context = vm.createContext({ ...dependencies, crypto, performance, DOMException, structuredClone, TextEncoder, Uint8Array, setTimeout, clearTimeout });
  vm.runInContext(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), context);
  return context;
}

// 관찰·검수 호출은 이 경로에서 부르면 안 된다(호출되면 실패).
function fakes({ readText, generate } = {}) {
  const calls = { generate: [], read: [], observer: 0 };
  const forbidden = name => async () => { calls.observer++; throw new Error(`${name} must not run`); };
  const options = {
    source: { data: png, name: 'source' }, selection: { model: 'chosen-model', effort: 'high' }, artboard: { w: 100, h: 100 },
    workflow: { imageKind: 'general', labelResult: 'restore-editable' }, queue: false, fallback: false,
    observer: { analyze: forbidden('analyze'), review: forbidden('review'), reviewFinal: forbidden('reviewFinal'), verifyPlacement: forbidden('verifyPlacement'), mapTargets: forbidden('mapTargets'), blankPlan: forbidden('blankPlan') },
    raster: { generate: generate || (async payload => { calls.generate.push(payload); return { src: png, imageToolCalls: 1, rendererPrompt: 'r' }; }) },
    readText: readText || (async payload => { calls.read.push(payload); return { text: readItems }; }),
  };
  return { calls, options };
}

test('restore-editable reads the original in parallel and returns accepted labels without AI review', async () => {
  const run = await loadRun();
  const { calls, options } = fakes();
  const result = await run.executeImageLabelRun(options);
  assert.equal(calls.observer, 0);
  assert.equal(calls.generate.length, 1);
  assert.equal(calls.generate[0].model, 'gpt-6-luna');
  assert.equal(calls.generate[0].effort, 'medium');
  assert.match(calls.generate[0].text, /첨부한 교과서 그림을/);
  assert.equal(calls.read.length, 1);
  assert.equal(calls.read[0].model, 'gpt-6.1-sol');
  assert.equal(calls.read[0].attachments[0], png);
  assert.equal(result.accepted, true);
  assert.equal(result.status, 'complete');
  assert.equal(result.labelPlan.frozen, true);
  assert.equal(result.labelPlan.labels.length, 2);
  assert.equal(result.labelPlan.labels[0].text, 'H₂O(s)');
  assert.equal(result.labelPlan.labels[0].typography.role, 'chemical');
  assert.deepEqual(result.labelPlan.labels[1].anchor, { x: 0.7, y: 0.7 });
  assert.equal(result.labelPlan.reviewRequired, false);
  assert.equal(result.labelReadNotice, undefined);
  assert.equal(result.data, png);
});

test('the generation request and the label read start together (no sequential wait)', async () => {
  const run = await loadRun();
  let genStarted, readStarted;
  const genP = new Promise(resolve => { genStarted = resolve; });
  const readP = new Promise(resolve => { readStarted = resolve; });
  const { options } = fakes({
    generate: async () => { genStarted(); await readP; return { src: png, imageToolCalls: 1, rendererPrompt: '' }; },
    readText: async () => { readStarted(); await genP; return { text: '[]' }; },
  });
  const result = await run.executeImageLabelRun(options);
  assert.equal(result.accepted, true);
  assert.equal(result.labelPlan.labels.length, 0);
});

test('a failed label read keeps the generated image with zero labels and a notice', async () => {
  const run = await loadRun();
  const { options } = fakes({ readText: async () => { throw new Error('Codex 응답 시간이 초과되었습니다.'); } });
  const result = await run.executeImageLabelRun(options);
  assert.equal(result.accepted, true);
  assert.equal(result.data, png);
  assert.equal(result.labelPlan.labels.length, 0);
  assert.equal(result.labelReadNotice, '라벨 글자를 읽지 못해 그림만 넣었습니다. 라벨은 직접 추가할 수 있습니다.');
});

test('an empty label read is treated like a failure and never fails the conversion', async () => {
  const run = await loadRun();
  const { options } = fakes({ readText: async () => ({ text: '   ' }) });
  const result = await run.executeImageLabelRun(options);
  assert.equal(result.accepted, true);
  assert.equal(result.labelPlan.labels.length, 0);
  assert.ok(result.labelReadNotice);
});

test('an exam restore uses the same redraw as remove and never runs pixel removal', async () => {
  const run = await loadRun();
  const { calls, options } = fakes();
  options.workflow = { imageKind: 'exam', labelResult: 'restore-editable' };
  const result = await run.executeImageLabelRun(options);
  assert.equal(calls.generate.length, 1);
  assert.equal(calls.generate[0].model, 'gpt-6-luna');
  assert.match(calls.generate[0].text, /글자·숫자·문자와, 글자를 가리키는 지시선만 지워/);
  assert.equal(calls.observer, 0);
  assert.equal(result.labelPlan.labels.length, 2);
});

test('label on and off reuse the same generated image through the background cache', async () => {
  const run = await loadRun();
  const { ExactOutputCacheStore, MemoryOutputCacheBackend } = await import('../js/ai-output-cache-store.js');
  const backgroundCache = new ExactOutputCacheStore({ backend: new MemoryOutputCacheBackend() });
  const generated = [];
  const { options: off, calls: offCalls } = fakes({ generate: async payload => { generated.push(payload); return { src: png, imageToolCalls: 1, rendererPrompt: 'off' }; } });
  off.workflow = { imageKind: 'general', labelResult: 'remove' };
  off.observer.blankPlan = async () => ({ version: 4, frozen: true, labels: [], excludedLabels: [], relationGroups: [], sourceBindings: [] });
  off.backgroundCache = backgroundCache;
  const removed = await run.executeImageLabelRun(off);
  const { options: on, calls: onCalls } = fakes({ generate: async payload => { generated.push(payload); return { src: png, imageToolCalls: 1, rendererPrompt: 'on' }; } });
  on.backgroundCache = backgroundCache;
  const restored = await run.executeImageLabelRun(on);
  assert.equal(generated.length, 1, 'the second request must come from the cached generation');
  assert.equal(removed.data, restored.data);
  assert.equal(offCalls.read.length, 0);
  assert.equal(onCalls.read.length, 1);
  assert.equal(restored.labelPlan.labels.length, 2);
});

test('the legacy restore pipeline stays reachable only with the explicit internal flag', async () => {
  const run = await loadRun();
  const { options } = fakes();
  options.legacyLabelPipeline = true;
  options.retryPolicy = { attempts: 1, analysisTimeoutMs: 2000, generationTimeoutMs: [2000], backoffMs: 0 };
  options.observer = { analyze: async () => { throw new Error('legacy observer reached'); } };
  await assert.rejects(run.executeImageLabelRun(options), /legacy observer reached/);
});

// 11-10: 글 읽기 채널 연결(데스크톱 IPC·웹 미리보기 서버·웹 허용 목록)과 직접 호출 제한 시간이 맞는지 확인한다.
test('the label read channel is wired through preload, the preview bridge, the web allowlist and the direct timeouts', () => {
  const root = path.join(__dirname, '..');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('desktop/preload.cjs'), /readImageText:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\("codex:read-image-text", payload\)/);
  assert.match(read('scripts/preview-local-server.cjs'), /bridge-\(status\|models\|account\|send\|events\|interrupt\|read-text\)/);
  assert.match(read('scripts/local-codex-bridge.cjs'), /action==='bridge-read-text'/);
  assert.match(read('js/web-ai-connection.js'), /'bridge-read-text'\]\.includes\(action\)/);
  assert.match(read('experiments/web-codex-auth/editor-bridge.js'), /readImageText:\s*payload\s*=>\s*request\('bridge-read-text', payload\)/);
  assert.match(read('js/ai-task-workspaces.js'), /'interrupt', 'readImageText'\]/);
  assert.match(read('desktop/main.cjs'), /createDirectImageClient\(\{ log: entry => appendAiTurnLog\(entry\), timeoutMs: 100_000, retries: 1 \}\)/);
  assert.match(read('scripts/local-codex-bridge.cjs'), /createDirectImageClient\(\{log,timeoutMs:100000,retries:1\}\)/);
  assert.match(read('js/state.js'), /EQUATION_FONT_FAMILY = '"Latin Modern Roman", "Latin Modern Math", "HYhwpEQ"/);
  assert.match(read('css/style.css'), /font-family: "Latin Modern Math";\s*src: url\("\.\.\/vendor\/rhwp-studio\/fonts\/LatinModernMath-Regular\.woff2"\)/);
  assert.ok(fs.existsSync(path.join(root, 'vendor/rhwp-studio/fonts/LatinModernMath-Regular.woff2')));
});

test('label restore is the default and the legacy long prompt is not used by default', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/ai-image-label-run.js'), 'utf8');
  assert.match(source, /const legacyLabelPath = workflow\.labelResult === 'restore-editable' && legacyLabelPipeline;/);
  assert.match(source, /legacyLabelPipeline = false, grayscale = grayscaleGeneratedPng \} = \{\}\)/);
});

test('the default label result depends on the source kind', async () => {
  const { defaultLabelResultFor } = await import('../js/ai-image-label-workflow.js');
  assert.equal(defaultLabelResultFor('exam'), 'restore-editable');
  assert.equal(defaultLabelResultFor('general'), 'remove');
});
