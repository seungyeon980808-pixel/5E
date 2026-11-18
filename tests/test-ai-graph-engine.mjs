// 그림으로 만드는 그래프 엔진(js/ai-graph, 1.8.0 옵션) 단위 검사. AI 호출 0(가짜 ai), DOM 없음(가짜 그리기·가짜 글자 재기).
// 고정 자료: tests/fixtures/ai-graph/*.json — image_generator out/·cycles/의 실제 설계(그래프 엔진이 그렸던 것).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compileExpr } from '../js/ai-graph/expr.js';
import { parseJson, fixTick, curveYs, fixLabels, conventionsFor, plan, planPrompt, isPlan, makeReadText } from '../js/ai-graph/plan.js';
import { prepare, verifyPlan, planFacts } from '../js/ai-graph/verify.js';
import { layoutGraph, labelOverlaps, boxHit } from '../js/ai-graph/layout.js';
import { makeGraph, createGraphEngine, graphPlanMeta, minimalPlan, isAiGraphPictureEnabled, graphEngineChoice, AI_GRAPH_PICTURE_FLAG } from '../js/ai-graph/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests/fixtures/ai-graph');
const fixtures = Object.fromEntries(fs.readdirSync(FIX).filter((f) => f.endsWith('.json')).sort().map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'))]));
const conventions = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/ai-graph/conventions.json'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

// 가짜 AI: 답 목록을 차례로 돌려준다(Error면 던짐). 받은 지시문을 기록.
function fakeAi(answers) {
  const calls = [];
  return { calls, async readText({ text, signal }) { calls.push(text); if (signal?.aborted) { const e = new Error('abort'); e.name = 'AbortError'; throw e; } const a = answers.length ? answers.shift() : new Error('더 없음'); if (a instanceof Error) throw a; return { text: typeof a === 'string' ? a : JSON.stringify(a) }; } };
}
const fakeDraw = async (p) => ({ svg: `<svg data-x="${p.xMax}"/>`, png: 'data:image/png;base64,AAAA', collisions: { n: 0, list: [] }, parts: { axes: ['x', 'y'] }, size: { wMm: 60, hMm: 45 }, warnings: [] });

test('고정 자료가 과목 여럿에 걸쳐 있다', () => {
  assert.ok(Object.keys(fixtures).length >= 10);
  const subjects = new Set(Object.values(fixtures).map((f) => f.subject));
  for (const s of ['물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ', '화학Ⅱ', '생명과학Ⅱ', '지구과학Ⅱ']) assert.ok(subjects.has(s), s);
});

test('parseJson: 코드 펜스·앞뒤 글이 섞인 응답에서 JSON을 꺼낸다', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('설계는 다음과 같다: {"xMin":0,"b":[1,2]} 끝.'), { xMin: 0, b: [1, 2] });
  assert.deepEqual(parseJson('[1,{"a":2}]'), [1, { a: 2 }]);
  assert.throws(() => parseJson('JSON 없음'));
});

test('compileExpr: eval 없이 원본(JS Function)과 같은 뜻으로 계산', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);
  near(compileExpr('4-0.5*(x-1)^2')(3), 2);
  near(compileExpr('x**2')(3), 9);
  near(compileExpr('-x^2')(3), -9);
  near(compileExpr('2^3^2')(0), 512);
  near(compileExpr('log(x)')(Math.E), 1); // 원본은 Math.log(자연로그)
  near(compileExpr('10*(1-exp(-x/2))')(2), 10 * (1 - Math.exp(-1)));
  near(compileExpr('min(x, 2) + max(1, pow(x, 0))')(5), 3);
  near(compileExpr('Math.sqrt(x) + PI')(4), 2 + Math.PI);
  near(compileExpr('2x + 3(x+1)')(1), 8);
  near(compileExpr('0.5')(123), 0.5);
  near(compileExpr('1e-3*x')(1000), 1);
  for (const bad of ['x +', 'foo(x)', 'y*2', 'alert(1)', 'x; 1', 'sin(1,2)']) assert.throws(() => compileExpr(bad), bad);
});

test('fixTick: 분수·대문자 아래첨자·음수 눈금 글자', () => {
  assert.equal(fixTick('t_0/2'), '\\frac{t_0}{2}');
  assert.equal(fixTick('3 / 4'), '\\frac{3}{4}');
  assert.equal(fixTick('E_0'), '{E}_0');
  assert.equal(fixTick('E_{12}'), '{E}_{12}');
  assert.equal(fixTick('-E_0'), '−{E}_0');
  assert.equal(fixTick('−2v_0'), '−2v_0');
  assert.equal(fixTick('\\frac{v_0}{2}'), '\\frac{v_0}{2}');
  assert.equal(fixTick('2t_0'), '2t_0');
  assert.equal(fixTick(null), '');
  for (const f of Object.values(fixtures)) for (const t of [...f.plan.xTicks, ...f.plan.yTicks]) assert.equal(fixTick(fixTick(t.label)), fixTick(t.label), '두 번 고쳐도 같음');
});

test('curveYs: 꺾은선 보간·식·정의역', () => {
  const p = fixtures['speed-time'].plan;
  assert.deepEqual(curveYs(p, 0.5), [0.5, 0.5]);
  assert.deepEqual(curveYs(p, 1), [1, 1, 0.5]); // 꺾이는 점은 두 선분 모두, 점선 B는 0.5
  assert.deepEqual(curveYs(p, 2.2), []); // 정의역 밖
  const q = fixtures['two-lines-point'].plan;
  assert.deepEqual(curveYs(q, 2), [2, 2]); // 6-2x와 2가 만나는 점 P(2,2)
  assert.deepEqual(curveYs({ series: [{ expr: '1/(x-1)', domain: [0, 2] }] }, 1), []); // 무한대는 버림
  assert.deepEqual(curveYs({ series: [{ expr: '해석 불가 ((', domain: [0, 2] }] }, 1), []);
});

test('prepare: 눈금 정리·핵심 값·여유·곡선 밖 보조선 버리기, 두 번 해도 같음', () => {
  for (const [name, f] of Object.entries(fixtures)) {
    const p = prepare(f.plan, f.keyValues);
    for (const k of ['xTicks', 'yTicks']) for (const t of p[k]) {
      assert.equal(typeof t.value, 'number', name);
      assert.ok(Math.abs(t.value) > 1e-9, `${name} 원점 눈금 없음`);
      assert.equal(typeof t.key, 'boolean');
    }
    const top = (k) => Math.max(...p[k].map((t) => t.value), -Infinity);
    if (p.xTicks.length) assert.ok(p.xMax >= top('xTicks') + (p.xMax - p.xMin) * 0.1 - 1e-9, `${name} 가로 여유`);
    if (p.yTicks.length) assert.ok(p.yMax >= top('yTicks') + (p.yMax - p.yMin) * 0.1 - 1e-9, `${name} 세로 여유`);
    const span = p.yMax - p.yMin;
    for (const g of p.guides) { const ys = curveYs(p, g.x); assert.ok(!ys.length || ys.some((y) => Math.abs(y - g.y) < span * 0.03), `${name} 보조선 ${g.x},${g.y}`); }
    assert.deepEqual(prepare(p, f.keyValues), p, `${name} 두 번 다듬어도 같음`);
    assert.ok(!('collisions' in p));
    assert.deepEqual(f.plan, fixtures[name].plan, '원본 설계를 바꾸지 않음');
  }
  const p = clone(fixtures['speed-time'].plan);
  p.guides.push({ x: 1, y: 0.8 }, { x: 'a', y: 1 });
  p.labelX = '중력\\;퍼텐셜\\;에너지';
  p.xTicks.push({ value: 0, label: '0' }, { value: 1.5, label: 't_0/2' });
  const q = prepare(p, 't_0 와 v_0');
  assert.deepEqual(q.guides, [{ x: 1, y: 1 }, { x: 2, y: 1 }], '곡선 위에 없는 (1,0.8)과 숫자 아닌 것은 버림');
  assert.equal(q.labelX, '중력 퍼텐셜 에너지');
  assert.deepEqual(q.xTicks.map((t) => [t.value, t.label, t.key]), [[1, 't_0', true], [2, '2t_0', false], [1.5, '\\frac{t_0}{2}', false]]);
});

test('fixLabels(옛 5E 객체용): 축 이름 띄어쓰기를 \\; 로, 원점 눈금 제거', () => {
  const p = fixLabels(clone({ ...fixtures['speed-time'].plan, labelX: '반응 시간(s)', xTicks: [{ value: 0, label: '0' }, { value: 1, label: 'E_0' }] }));
  assert.equal(p.labelX, '반응\\;시간(s)');
  assert.deepEqual(p.xTicks, [{ value: 1, label: '{E}_0' }]);
});

test('conventionsFor: 요청 낱말로 과목 관례 두 개', () => {
  const c = conventionsFor('뉴런의 막전위와 활동전위, 탈분극·재분극·과분극', conventions);
  assert.match(c, /^\[평가원 관례: 생명과학Ⅰ /);
  assert.equal((c.match(/\[평가원 관례/g) || []).length, 2);
  assert.equal(conventionsFor('아무 관계 없는 글', conventions), '');
  assert.equal(conventionsFor('속도', null), '');
  const prompt = planPrompt('뉴런 막전위 활동전위 요청 글', '값 글', conventions);
  assert.match(prompt, /\[평가원 관례: 생명과학Ⅰ/);
  assert.match(prompt, /요청: 뉴런 막전위 활동전위 요청 글\n정확해야 할 값: 값 글$/);
});

test('plan: 설계 모양이 아니면 한 번 더 묻고, 그래도 아니면 GRAPH_PLAN', async () => {
  const f = fixtures['enzyme-rate'];
  const ai = fakeAi(['설명만 있음', '```json\n' + JSON.stringify(f.plan) + '\n```']);
  const p = await plan(makeReadText(ai), f.request, 'v=10', { conventions });
  assert.equal(ai.calls.length, 2);
  assert.match(ai.calls[0], /\[평가원 관례: /);
  assert.match(ai.calls[0], /정확해야 할 값: v=10/);
  assert.equal(p.series.length, f.plan.series.length);
  await assert.rejects(plan(makeReadText(fakeAi([{ xMin: 0, xMax: 1, yMin: 0, yMax: 1, series: [] }, '없음'])), 'x'), { code: 'GRAPH_PLAN' });
  // 연결 오류는 textTries(3)번 다시 시도 뒤 올림
  const down = fakeAi([new Error('망'), new Error('망'), new Error('망')]);
  await assert.rejects(plan(makeReadText(down, { tries: 3 }), 'x'), /망/);
  assert.equal(down.calls.length, 3);
  assert.throws(() => makeReadText(null), /ai\.readText/);
  assert.equal(isPlan(f.plan), true); assert.equal(isPlan({ ...f.plan, series: [] }), false); assert.equal(isPlan([]), false);
});

test('verifyPlan: 계산값을 보여 주고 ok면 그대로, 고친 설계면 바꿈, 실패하면 앞 설계', async () => {
  const f = fixtures['two-lines-point'];
  const facts = planFacts(f.plan);
  assert.ok(facts.some((l) => l.startsWith('점 P (2, 2): 그 x에서 곡선 값 [2,2]')), facts.join('\n'));
  const ok = fakeAi([{ ok: true }]);
  const v1 = await verifyPlan(makeReadText(ok), f.request, f.keyValues, f.plan);
  assert.equal(v1.changed, false); assert.equal(v1.plan, f.plan);
  assert.match(ok.calls[0], /실제 계산값:\n/);
  const fixed = { ...clone(f.plan), marks: [{ x: 2, y: 2, name: 'Q', style: 'filled' }] };
  const v2 = await verifyPlan(makeReadText(fakeAi([fixed])), f.request, f.keyValues, f.plan);
  assert.equal(v2.changed, true); assert.equal(v2.plan.marks[0].name, 'Q');
  const broken = await verifyPlan(makeReadText(fakeAi([{ series: [], xMin: 'a' }])), f.request, f.keyValues, f.plan);
  assert.equal(broken.changed, false, '쓸 수 없는 고친 설계는 무시');
  const down = await verifyPlan(makeReadText(fakeAi([new Error('끊김')]), { tries: 1 }), f.request, f.keyValues, f.plan);
  assert.equal(down.plan, f.plan); assert.match(down.error, /끊김/);
  const abort = { async readText() { const e = new Error('x'); e.code = 'DIRECT_ABORTED'; throw e; } };
  await assert.rejects(verifyPlan(makeReadText(abort), 'r', '', f.plan), { code: 'DIRECT_ABORTED' });
});

test('layoutGraph(가짜 글자 재기): 축·눈금·곡선 이름이 다 놓이고 글자끼리 안 겹침', () => {
  const measure = (html, mm) => { const t = html.replace(/<[^>]+>/g, '').replace(/\\[a-z]+/g, '').replace(/[{}_^]/g, ''); return { w: Math.max(1, t.length) * mm * 0.55, h: mm * 0.8, dx: 0, dy: 0 }; };
  const labelHtml = (src) => `<span>${src}</span>`;
  for (const [name, f] of Object.entries(fixtures)) {
    const p = prepare(f.plan, f.drawKeyValues ?? f.keyValues);
    const lay = layoutGraph(p, { measure, labelHtml });
    assert.deepEqual(lay.parts.axes, ['x', 'y'], name);
    assert.ok(lay.shapes.some((s) => s.role === 'axis-x' && s.type === 'arrow') && lay.shapes.some((s) => s.role === 'axis-y' && s.type === 'arrow'), `${name} 축 화살표`);
    const bold = (p.series || []).filter((s) => !s.thin);
    assert.equal(lay.parts.curves, bold.length, `${name} 굵은 곡선 수`);
    if (p.labelX) assert.ok(lay.labels.some((l) => l.kind === 'axis' && l.axis === 'x'), `${name} 가로축 이름`);
    if (p.labelY) assert.ok(lay.labels.some((l) => l.kind === 'axis' && l.axis === 'y'), `${name} 세로축 이름`);
    const named = bold.filter((s) => s.label).map((s) => s.label);
    assert.deepEqual([...lay.parts.curveNames].sort(), [...named].sort(), `${name} 곡선 이름`);
    const keyTicks = [...p.xTicks, ...p.yTicks].filter((t) => t.key).map((t) => t.label);
    for (const k of keyTicks) assert.ok([...lay.parts.xTicks, ...lay.parts.yTicks].includes(k), `${name} 핵심 눈금 ${k}`);
    const boxes = lay.labels.map((l) => ({ ...l.at }));
    for (const b of boxes) for (const a of lay.arrowBoxes) assert.ok(!boxHit(b, a, 0), `${name} 글자가 화살촉(${a.role})에 닿음`);
    if (f.originalCollisions?.n === 0) assert.deepEqual(labelOverlaps(boxes), [], `${name} 글자 상자 겹침`);
    assert.ok(lay.bounds.w > 56 && lay.bounds.h > 38, name);
  }
});

test('makeGraph: 설계 → 검사 → 정리 → 그리기, 계약 모양(plan·prepared·verified·verifyError)', async () => {
  const f = fixtures['enzyme-rate'];
  const ai = fakeAi([f.plan, { ok: true }]);
  const phases = [];
  const eng = createGraphEngine({ ai, conventions, drawGraph: fakeDraw, onPhase: (x) => phases.push(x.phase) });
  const r = await eng.makeGraph({ request: f.request, keyValues: f.keyValues, subject: f.subject });
  assert.deepEqual(phases, ['graph-plan', 'graph-verify', 'graph-draw', 'done']);
  assert.equal(r.verified, false); assert.equal(r.verifyError, null); assert.equal(r.fallback, null);
  assert.equal(r.png, 'data:image/png;base64,AAAA'); assert.match(r.svg, /^<svg/);
  assert.deepEqual(r.collisions, { n: 0, list: [] });
  assert.equal(r.plan.request, f.request); assert.equal(r.plan.subject, f.subject); assert.equal(r.plan.keyText, f.keyValues);
  assert.deepEqual(r.prepared, prepare(r.plan, f.keyValues));
  const meta = graphPlanMeta(r);
  assert.equal(meta.graphEngine, 'ai-graph-picture'); assert.equal(meta.graphVerified, false);
  // 다시 열어 다시 그리기: AI 없이 같은 설계
  const ai2 = fakeAi([]);
  const again = await makeGraph({ plan: clone(meta.graphPlan) }, { ai: ai2, drawGraph: fakeDraw });
  assert.equal(ai2.calls.length, 0);
  assert.deepEqual(again.prepared, r.prepared);
  assert.equal(again.verified, null);
  const fixedPlan = { ...clone(f.plan), notes: '고침' };
  const r2 = await makeGraph({ request: f.request }, { ai: fakeAi([f.plan, fixedPlan]), conventions: null, drawGraph: fakeDraw });
  assert.equal(r2.verified, true); assert.equal(r2.plan.notes, '고침');
  const noDraw = await makeGraph({ request: f.request, verify: false }, { ai: fakeAi([f.plan]), conventions: null, drawGraph: async () => ({}) });
  assert.equal(noDraw.png, null);
});

test('makeGraph는 실패로 끝나지 않는다: 설계 실패 → 축만 / 앞 결과 유지, 검사 실패 → 앞 설계', async () => {
  const request = '가로축은 시간, 세로축은 속도로 쓰고 A를 그려 줘';
  const fails = () => fakeAi(Array(6).fill(0).map(() => new Error('연결 끊김')));
  const r1 = await makeGraph({ request }, { ai: fails(), conventions: null, drawGraph: fakeDraw });
  assert.equal(r1.fallback, 'minimal'); assert.equal(r1.plan.labelX, '시간'); assert.equal(r1.plan.labelY, '속도');
  assert.ok(r1.png && r1.warnings.some((w) => /설계 AI 실패/.test(w)));
  const previous = { png: 'data:image/png;base64,PREV', svg: '<svg/>', plan: { xMin: 0 }, collisions: { n: 0, list: [] } };
  const r2 = await makeGraph({ request, previous }, { ai: fakeAi(['엉뚱', '엉뚱']), conventions: null, drawGraph: fakeDraw });
  assert.equal(r2.png, previous.png); assert.equal(r2.fallback, 'previous');
  const f = fixtures['velocity-bent'];
  const r3 = await makeGraph({ request: f.request }, { ai: fakeAi([f.plan, new Error('x'), new Error('y'), new Error('z')]), conventions: null, drawGraph: fakeDraw });
  assert.equal(r3.verified, false); assert.match(r3.verifyError, /z|y|x/); assert.equal(r3.fallback, null); assert.ok(r3.png);
  let n = 0; const flaky = async (p) => { if (n++ === 0) throw new Error('판 없음'); return fakeDraw(p); };
  const r4 = await makeGraph({ request: f.request, verify: false }, { ai: fakeAi([f.plan]), conventions: null, drawGraph: flaky });
  assert.equal(r4.fallback, 'minimal');
  const r5 = await makeGraph({ request: f.request, verify: false, previous }, { ai: fakeAi([f.plan]), conventions: null, drawGraph: async () => { throw new Error('판 없음'); } });
  assert.equal(r5.png, previous.png);
  const r6 = await makeGraph({ plan: { xMin: 'a' } }, { ai: fakeAi([]), drawGraph: fakeDraw });
  assert.equal(r6.fallback, 'minimal');
  assert.deepEqual(minimalPlan('세로축은 ‘반응 속도’, 가로축: 기질 농도.'), { ...minimalPlan(''), labelX: '기질 농도', labelY: '반응 속도' });
});

test('makeGraph 취소: 앞 결과가 있으면 그대로(cancelled), 없으면 AbortError', async () => {
  const controller = new AbortController(); controller.abort();
  const previous = { png: 'data:image/png;base64,PREV', plan: {} };
  const r = await makeGraph({ request: 'x', previous, signal: controller.signal }, { ai: fakeAi([]), conventions: null, drawGraph: fakeDraw });
  assert.equal(r.cancelled, true); assert.equal(r.png, previous.png);
  await assert.rejects(makeGraph({ request: 'x', signal: controller.signal }, { ai: fakeAi([]), conventions: null, drawGraph: fakeDraw }), { name: 'AbortError' });
  const c2 = new AbortController();
  const ai = { calls: 0, async readText() { this.calls++; c2.abort(); const e = new Error('aborted'); e.name = 'AbortError'; throw e; } };
  await assert.rejects(makeGraph({ request: 'x', signal: c2.signal }, { ai, conventions: null, drawGraph: fakeDraw }), { name: 'AbortError' });
  assert.equal(ai.calls, 1, '취소는 다시 시도하지 않음');
});

test('옵션 플래그: 기본은 지금의 그래프 객체 생성', () => {
  const store = (v) => ({ getItem: (k) => (k === AI_GRAPH_PICTURE_FLAG ? v : null) });
  assert.equal(isAiGraphPictureEnabled(store(null)), false);
  assert.equal(isAiGraphPictureEnabled(store('1')), true);
  assert.equal(graphEngineChoice({ storage: store('1') }), 'objects', '옵션을 고르지 않으면 기본');
  assert.equal(graphEngineChoice({ picture: true, storage: store(null) }), 'objects', '플래그가 꺼져 있으면 기본');
  assert.equal(graphEngineChoice({ picture: true, storage: store('1') }), 'picture');
  assert.equal(isAiGraphPictureEnabled({ getItem() { throw new Error('막힘'); } }), false);
});

test('기본 그래프 생성 경로는 이 엔진을 부르지 않는다(화면 변화 없음) — 연결은 js/ai-engines.js 한곳, 옵션일 때만', () => {
  const r = spawnSync('git', ['grep', '-l', 'ai-graph/', '--', 'js', 'index.html', 'css'], { cwd: ROOT, encoding: 'utf8' });
  const users = r.stdout.split('\n').filter(Boolean).filter((f) => !f.startsWith('js/ai-graph/') && f !== 'js/ai-engines.js');
  assert.deepEqual(users, []);
  const connect = fs.readFileSync(path.join(ROOT, 'js/ai-engines.js'), 'utf8');
  assert.match(connect, /import\('\.\/ai-graph\/index\.js'/, '그래프 엔진은 처음 쓸 때만 불러옴');
  assert.doesNotMatch(connect, /^import .*ai-graph/m);
});

test('KaTeX는 vendor에 고정 판으로, 그래프 판 스타일은 최신이고 이름이 섞이지 않음', () => {
  const lic = fs.readFileSync(path.join(ROOT, 'vendor/katex/LICENSE'), 'utf8');
  assert.match(lic, /The MIT License/);
  assert.match(fs.readFileSync(path.join(ROOT, 'vendor/katex/README-5E.txt'), 'utf8'), /0\.16\.11/);
  const css = fs.readFileSync(path.join(ROOT, 'assets/ai-graph/graph-stage.css'), 'utf8');
  assert.match(css, /content:"0\.16\.11"/);
  assert.doesNotMatch(css, /font-family:KaTeX_|[ ,]KaTeX_Main/, 'KaTeX_ 글꼴 이름을 그대로 쓰지 않음(MathLive와 분리)');
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert.ok(fs.existsSync(path.join(ROOT, 'assets/ai-graph', m[1])), m[1]);
  assert.match(css, /FEGKaTeX_Main;font-style:normal;font-weight:400;src:url\(\.\.\/\.\.\/fonts\/lmroman10-regular\.woff2\)/);
  const check = spawnSync(process.execPath, ['data/ai-graph/build-stage-css.cjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.match(fs.readFileSync(path.join(ROOT, 'docs/credits.html'), 'utf8'), /KaTeX[\s\S]{0,200}MIT/);
});
