// 11-21: 그림 변환 「목록 대조 뒤 빠진 것만 다시 그리기」 — 어느 단계가 실패해도 변환은 앞 결과로 끝난다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const api = import('../js/ai-image-convert-check.js');
const src = 'data:image/png;base64,U1JD';
const pic = name => ({ data: `data:image/png;base64,${Buffer.from(name).toString('base64')}`, rendererPrompt: name });
const isList = p => /^첨부 그림은/.test(p.text), isCheck = p => /^첫째 그림은/.test(p.text);

// 글 읽기 가짜: 목록은 고정, 대조 답은 결과 그림마다 정한다.
function reader({ list = '- 띠 5개\n- 혈류 화살표 2개', answers = {}, fail = {} } = {}) {
  const calls = [];
  const readText = async payload => {
    calls.push(payload);
    if (isList(payload)) { if (fail.list) throw new Error('list down'); return { text: list }; }
    if (isCheck(payload)) {
      if (fail.check) throw new Error('check down');
      const answer = answers[payload.attachments[1]];
      return { text: typeof answer === 'string' ? answer : JSON.stringify(answer || { missing: [], leftover: [] }) };
    }
    throw new Error('unexpected');
  };
  return { calls, readText };
}

test('a clean first picture passes with one generation and no redraw', async () => {
  const { runConvertCheck } = await api;
  const first = pic('first'); const r = reader();
  let redraws = 0;
  const out = await runConvertCheck({ readText: r.readText, sourceData: src, generateFirst: async () => first, redraw: async () => { redraws++; return pic('x'); } });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'pass'); assert.equal(redraws, 0);
  assert.equal(r.calls.filter(isList).length, 1); assert.equal(r.calls.filter(isCheck).length, 1);
  assert.equal(r.calls[0].model, 'gpt-6.1-sol'); assert.deepEqual(r.calls.find(isCheck).attachments, [src, first.data]);
});

test('the list starts before the first picture is finished (parallel, no added wait)', async () => {
  const { runConvertCheck } = await api;
  const order = []; const r = reader();
  const readText = async p => { order.push(isList(p) ? 'list' : 'check'); return r.readText(p); };
  await runConvertCheck({ readText, sourceData: src, generateFirst: async () => { order.push('generate-start'); await new Promise(f => setTimeout(f, 5)); order.push('generate-end'); return pic('first'); }, redraw: async () => pic('x') });
  assert.equal(order[0], 'list'); assert.ok(order.indexOf('list') < order.indexOf('generate-end'));
});

test('a missing item triggers one redraw that names only those items, and the better redraw is used', async () => {
  const { runConvertCheck } = await api;
  const first = pic('first'), second = pic('second');
  const r = reader({ answers: { [first.data]: { missing: ['혈류 화살표 2개'], leftover: ['허공에 뜬 지시선'] }, [second.data]: { missing: [], leftover: [] } } });
  const fixes = [], phases = [];
  const out = await runConvertCheck({ readText: r.readText, sourceData: src, generateFirst: async () => first, redraw: async fix => { fixes.push(fix); return second; },
    onPhase: (name, info) => phases.push([name, info]) });
  assert.equal(out.picture, second); assert.equal(out.check.status, 'fixed'); assert.deepEqual(out.check.differences, []);
  assert.equal(fixes.length, 1); assert.match(fixes[0], /혈류 화살표 2개/); assert.match(fixes[0], /허공에 뜬 지시선/);
  const fix = phases.find(([n]) => n === 'convertFix');
  assert.equal(fix[1].count, 2); assert.deepEqual(fix[1].missing, ['혈류 화살표 2개']);
  assert.deepEqual(phases.map(([n]) => n), ['convertCheck', 'convertFix', 'convertRecheck']);
});

test('a worse redraw keeps the first picture and reports the first differences', async () => {
  const { runConvertCheck } = await api;
  const first = pic('first'), second = pic('second');
  const r = reader({ answers: { [first.data]: { missing: ['확대 그림'], leftover: [] }, [second.data]: { missing: ['확대 그림', '띠 5개'], leftover: ['글자'] } } });
  const out = await runConvertCheck({ readText: r.readText, sourceData: src, generateFirst: async () => first, redraw: async () => second });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'issues');
  assert.deepEqual(out.check.differences, [{ kind: 'missing', text: '확대 그림' }]);
});

test('a still-different redraw is used and its remaining differences are carried for display', async () => {
  const { runConvertCheck } = await api;
  const first = pic('first'), second = pic('second');
  const r = reader({ answers: { [first.data]: { missing: ['a', 'b'], leftover: [] }, [second.data]: { missing: ['b'], leftover: [] } } });
  const out = await runConvertCheck({ readText: r.readText, sourceData: src, generateFirst: async () => first, redraw: async () => second });
  assert.equal(out.picture, second); assert.equal(out.check.status, 'issues'); assert.deepEqual(out.check.differences, [{ kind: 'missing', text: 'b' }]);
});

test('a failed redraw, a different shape, a failed list or a failed check never fail the conversion', async () => {
  const { runConvertCheck } = await api;
  const first = pic('first'), second = pic('second');
  const bad = { [first.data]: { missing: ['a'], leftover: [] } };
  let out = await runConvertCheck({ readText: reader({ answers: bad }).readText, sourceData: src, generateFirst: async () => first, redraw: async () => { throw new Error('draw down'); } });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'issues'); assert.match(out.check.reason, /다시 그리기/);
  out = await runConvertCheck({ readText: reader({ answers: bad }).readText, sourceData: src, generateFirst: async () => first, redraw: async () => second,
    frameOf: async d => d === first.data ? { width: 100, height: 100 } : { width: 150, height: 100 } });
  assert.equal(out.picture, first); assert.match(out.check.reason, /크기/);
  out = await runConvertCheck({ readText: reader({ fail: { list: true } }).readText, sourceData: src, generateFirst: async () => first, redraw: async () => second });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'skipped');
  out = await runConvertCheck({ readText: reader({ fail: { check: true } }).readText, sourceData: src, generateFirst: async () => first, redraw: async () => second });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'skipped');
  out = await runConvertCheck({ readText: reader({ answers: { [first.data]: 'not json' } }).readText, sourceData: src, generateFirst: async () => first, redraw: async () => second });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'skipped');
  out = await runConvertCheck({ readText: null, sourceData: src, generateFirst: async () => first, redraw: async () => second });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'skipped');
});

test('a slow check is cut off by its limit and the first picture is kept', async () => {
  const { runConvertCheck } = await api;
  const first = pic('first');
  const readText = async p => isList(p) ? { text: '- a' } : new Promise(() => {});
  const out = await runConvertCheck({ readText, sourceData: src, generateFirst: async () => first, redraw: async () => pic('x'), limits: { listMs: 1000, checkMs: 20, maxItems: 6 } });
  assert.equal(out.picture, first); assert.equal(out.check.status, 'skipped'); assert.match(out.check.reason, /응답 없음/);
});

test('cancel stops the check instead of being swallowed', async () => {
  const { runConvertCheck } = await api;
  const controller = new AbortController();
  const readText = async p => { if (isCheck(p)) { controller.abort(); return new Promise(() => {}); } return { text: '- a' }; };
  await assert.rejects(runConvertCheck({ readText, sourceData: src, signal: controller.signal, generateFirst: async () => pic('first'), redraw: async () => pic('x') }), e => e.name === 'AbortError');
});

test('the exam check keeps empty label frames and zoom circles as expected, the textbook check removes them', async () => {
  const { convertListPrompt, convertCheckPrompt } = await api;
  assert.match(convertListPrompt('exam'), /글자가 들어 있던 네모·원 틀/); assert.match(convertCheckPrompt('- a', 'exam'), /빈 틀·확대 원·화살표·회색 면은 남아 있어야 정상/);
  assert.doesNotMatch(convertCheckPrompt('- a', 'exam'), /확대 표시 원·잇는 선, 그림 사이 순서 화살표, 배경 판\./);
  assert.match(convertCheckPrompt('- a', 'general'), /확대 표시 원·잇는 선/);
});

test('parseConvertCheck reads fenced JSON and trims long lists', async () => {
  const { parseConvertCheck } = await api;
  assert.deepEqual(parseConvertCheck('```json\n{"missing":[" a ","b"],"leftover":[]}\n```'), { missing: ['a', 'b'], leftover: [] });
  assert.equal(parseConvertCheck('no'), null);
  assert.equal(parseConvertCheck('{"missing":[1,2,3,4,5,6,7,8]}').missing.length, 6);
});

// 실제 실행 모듈 연결: 라벨 삭제(교과서) 기본 경로에서 목록 대조가 돌고, 결과에 convertCheck가 실린다.
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
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';
function runOptions({ readText, generate }) {
  return { source: { data: png, name: 'source' }, selection: { model: 'chosen', effort: 'high' }, artboard: { w: 100, h: 100 },
    workflow: { imageKind: 'general', labelResult: 'remove' }, queue: false, fallback: false, readText,
    observer: { blankPlan: async () => ({ version: 4, frozen: true, labels: [], excludedLabels: [], relationGroups: [], sourceBindings: [] }),
      analyze: async () => { throw new Error('no'); }, review: async () => { throw new Error('no'); } },
    raster: { generate } };
}

test('the textbook remove path draws two pictures at once and keeps the cleaner one (dual mode, no redraw)', async () => {
  const run = await loadRun();
  const texts = [], phases = []; let n = 0, checks = 0;
  const pngs = ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==', png];
  const readText = async p => {
    if (isList(p)) return { text: '- 혈류 화살표 2개' };
    checks++; return { text: JSON.stringify(p.attachments[1] === png && checks ? { missing: [], leftover: [] } : { missing: ['혈류 화살표 2개'], leftover: [] }) };
  };
  const options = runOptions({ readText, generate: async payload => { texts.push(payload.text); n++; return { src: png, imageToolCalls: 1, rendererPrompt: 'r' + n }; } });
  options.onPhase = (name, info) => phases.push([name, info]);
  const result = await run.executeImageLabelRun(options);
  assert.equal(texts.length, 2); assert.ok(texts.every(t => /^첨부한 교과서 그림을 편집해서/.test(t)) && texts.every(t => !/바로잡고/.test(t)));
  assert.equal(result.accepted, true); assert.equal(result.convertCheck.mode, 'dual'); assert.equal(result.convertCheck.candidates, 2);
  assert.equal(result.metrics.convertCheck.redrawn, false);
  assert.ok(phases.some(([name, info]) => name === 'convertCheck' && info.candidates === 2));
});

test('an exam redraw keeps drawing once (check is textbook-only after the 11-21 measurement)', async () => {
  const run = await loadRun();
  const texts = [], reads = [];
  const options = runOptions({ readText: async p => { reads.push(p); return { text: '- a' }; }, generate: async payload => { texts.push(payload.text); return { src: png, imageToolCalls: 1, rendererPrompt: 'r' }; } });
  options.workflow = { imageKind: 'exam', labelResult: 'remove' };
  const result = await run.executeImageLabelRun(options);
  assert.equal(texts.length, 1); assert.equal(reads.filter(p => isList(p) || isCheck(p)).length, 0); assert.equal(result.convertCheck, undefined);
});

test('without a text reader the conversion draws once exactly as before', async () => {
  const run = await loadRun();
  const texts = [];
  const result = await run.executeImageLabelRun(runOptions({ readText: undefined, generate: async payload => { texts.push(payload.text); return { src: png, imageToolCalls: 1, rendererPrompt: 'r' }; } }));
  assert.equal(texts.length, 1); assert.equal(result.convertCheck, undefined); assert.equal(result.metrics.convertCheck, undefined);
});

test('dual: two pictures are drawn at once, both checked, and the cleaner one is chosen without a redraw', async () => {
  const { runConvertCheckDual } = await api;
  const a = pic('a'), b = pic('b'); const starts = [];
  const r = reader({ answers: { [a.data]: { missing: ['x'], leftover: [] }, [b.data]: { missing: [], leftover: [] } } });
  const out = await runConvertCheckDual({ readText: r.readText, sourceData: src, generate: async i => { starts.push(i); await new Promise(f => setTimeout(f, 5)); return i ? b : a; } });
  assert.deepEqual(starts, [0, 1]); assert.equal(out.picture, b); assert.equal(out.check.status, 'pass'); assert.equal(out.check.candidates, 2);
  assert.equal(r.calls.filter(isCheck).length, 2); assert.equal(out.check.redrawn, false);
});

test('dual: when both differ the one with fewer differences is kept and its differences are carried', async () => {
  const { runConvertCheckDual } = await api;
  const a = pic('a'), b = pic('b');
  const r = reader({ answers: { [a.data]: { missing: ['x', 'y'], leftover: [] }, [b.data]: { missing: ['y'], leftover: [] } } });
  const out = await runConvertCheckDual({ readText: r.readText, sourceData: src, generate: async i => i ? b : a });
  assert.equal(out.picture, b); assert.equal(out.check.status, 'issues'); assert.deepEqual(out.check.differences, [{ kind: 'missing', text: 'y' }]);
});

test('dual: a failed or very late second picture never blocks the first', async () => {
  const { runConvertCheckDual } = await api;
  const a = pic('a');
  let out = await runConvertCheckDual({ readText: reader().readText, sourceData: src, generate: async i => { if (i) throw new Error('down'); return a; } });
  assert.equal(out.picture, a); assert.equal(out.check.candidates, 1);
  out = await runConvertCheckDual({ readText: reader().readText, sourceData: src, lateMs: 20, generate: async i => i ? new Promise(() => {}) : a });
  assert.equal(out.picture, a); assert.match(out.check.reason, /늦어/);
  await assert.rejects(runConvertCheckDual({ readText: reader().readText, sourceData: src, generate: async () => { throw new Error('both down'); } }), /both down/);
});
