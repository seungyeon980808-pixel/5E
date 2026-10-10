const test = require('node:test');
const assert = require('node:assert/strict');
const typography = import('../js/ai-label-typography.js?v=1.7.0-four-session-integration');

test('semantic editing preserves unchanged phase styles and promotes newly typed formula syntax', async () => {
  const { reconcileLabelTypography } = await typography;
  const obj = { type: 'text', text: 'B(g)', labelRuns: [
    { text: 'B(', role: 'chemical', contentMode: 'plain' },
    { text: 'g', role: 'quantity', contentMode: 'plain' },
    { text: ')', role: 'unit', contentMode: 'plain' },
  ] };
  const replaced = reconcileLabelTypography(obj, 'C(g)', { start: 0, end: 4 });
  assert.deepEqual(replaced.labelRuns.map(r => [r.text, r.role]), [['C(', 'chemical'], ['g', 'quantity'], [')', 'unit']]);
  const formula = reconcileLabelTypography(obj, 'B_2(g)', { start: 1, end: 1 });
  assert.equal(formula.labelRuns[0].text, 'B_2(');
  assert.equal(formula.labelRuns[0].contentMode, 'formula');
  assert.equal(formula.labelRuns[1].role, 'quantity');
});

test('precise edit ranges retain the correct styles among repeated characters', async () => {
  const { reconcileLabelTypography } = await typography;
  const obj = { text: 'AAA', labelRuns: ['name', 'chemical', 'quantity'].map(role => ({ text: 'A', role, contentMode: 'plain' })) };
  const result = reconcileLabelTypography(obj, 'AA', { start: 1, end: 2 });
  assert.deepEqual(result.labelRuns.map(r => r.role), ['name', 'quantity']);
  assert.equal(result.labelRuns.map(r => r.text).join(''), 'AA');
});

test('script selections survive payload edits and shifts but cannot attach to removed syntax', async () => {
  const { reconcileLabelTypography, normalizeLabelTypography } = await typography;
  const obj = { type: 'formula', source: 'm_B + m_C', labelScriptStyles: [{ start: 2, end: 3, kind: 'sub', role: 'name' }] };
  assert.deepEqual(reconcileLabelTypography(obj, 'm_D + m_C').labelScriptStyles, obj.labelScriptStyles);
  assert.deepEqual(reconcileLabelTypography(obj, '2m_B + m_C').labelScriptStyles, [{ start: 3, end: 4, kind: 'sub', role: 'name' }]);
  assert.equal(reconcileLabelTypography(obj, 'mB + m_C').labelScriptStyles, undefined);
  const invalid = normalizeLabelTypography({ role: 'quantity', scriptStyles: [{ start: 0, end: 1, kind: 'sub', role: 'name' }] }, { text: 'm_B' });
  assert.equal(invalid.review, true);
  assert.deepEqual(invalid.typography.scriptStyles, []);
});

test('source presentation accepts registry names and rejects CSS, unsafe spacing and unsupported formula tracking', async () => {
  const { normalizeLabelTypography, nativePresentationForLabelTypography } = await typography;
  const source = { role: 'text', font: 'Noto Sans KR', fontWeight: 'bold', italic: false, letterSpacing: -0.01, lineHeight: 1.4 };
  const normalized = normalizeLabelTypography(source, { text: '설명 제목', contentMode: 'plain' });
  assert.equal(normalized.review, false);
  const native = nativePresentationForLabelTypography(normalized.typography);
  assert.match(native.fontFamily, /Noto Sans KR/);
  assert.equal(native.fontWeight, 'bold'); assert.equal(native.labelLineHeight, 1.4);
  assert.equal(native.letterSpacing, -0.01); assert.equal(native.labelFontOverride, true);
  for (const bad of [{ font: 'evil' }, { fontFamily: 'url(x)' }, { fontWeight: 700 }, { italic: 'true' }, { letterSpacing: '0.1' }, { letterSpacing: -1 }, { lineHeight: 0 }]) {
    assert.equal(normalizeLabelTypography({ role: 'text', ...bad }, { text: 'A' }).review, true);
  }
  const formula = normalizeLabelTypography({ role: 'quantity', letterSpacing: 0.1 }, { text: 'm_B', contentMode: 'formula' });
  assert.equal(formula.review, true); assert.equal(formula.typography.letterSpacing, undefined);
});

test('tracking and explicit baselines scale with size while semantic roles survive font selection', async () => {
  const { measureLabelTypography, nativePresentationForLabelTypography } = await typography;
  const obj = { type: 'text', text: 'AB\nCD', ...nativePresentationForLabelTypography({ role: 'text', font: 'Arial', fontWeight: 'bold', letterSpacing: 0.1, lineHeight: 1.6 }) };
  const normal = measureLabelTypography({ ...obj, letterSpacing: 0 }, 2), tracked = measureLabelTypography(obj, 2), large = measureLabelTypography(obj, 4);
  assert.ok(Math.abs(tracked.w - normal.w - 0.4) < 1e-9);
  assert.ok(Math.abs(tracked.lines[1].baseline - tracked.lines[0].baseline - 3.2) < 1e-9);
  assert.equal(large.w, tracked.w * 2); assert.equal(large.h, tracked.h * 2);
  const mixed = measureLabelTypography({ ...obj, text: '이름m', labelRuns: [{ text: '이름', role: 'text', contentMode: 'plain' }, { text: 'm', role: 'quantity', contentMode: 'plain' }] });
  assert.equal(mixed.lines[0].runs[0].font.fontFamily, obj.fontFamily);
  assert.equal(mixed.lines[0].runs[1].font.italic, true);
  assert.equal(mixed.lines[0].runs[1].font.fontWeight, 'bold');
});

test('explicit ordinary mixed-run italic survives while scientific roles retain their policy', async () => {
  const {nativePresentationForLabelTypography,measureLabelTypography}=await typography;
  for (const italic of [true,false]) {
    const object={text:'라벨A x',contentMode:'plain',...nativePresentationForLabelTypography({role:'text',italic}),labelRuns:[{text:'라벨',role:'text',contentMode:'plain'},{text:'A ',role:'name',contentMode:'plain'},{text:'x',role:'quantity',contentMode:'plain'}]};
    const runs=measureLabelTypography(object,2).lines[0].runs;
    assert.equal(runs.find(r=>r.text==='라벨').font.italic,italic);
    assert.equal(runs.find(r=>r.text==='A ').font.italic,italic);
    assert.equal(runs.find(r=>r.text==='x').font.italic,true);
    assert.equal(JSON.parse(JSON.stringify(object)).labelItalicOverride,true);
  }
});
