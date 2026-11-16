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

test('11-09: lone lowercase or Greek symbols the AI calls chemical are italic quantities; real formulas stay chemical', async () => {
  const { scriptLabelRuns, presentationRoleFor } = await typography;
  // 11-09 라벨 안정화(글씨체 표 2-1): 물리량 글자는 기울임, 아래 첨자 숫자는 수식 정체.
  for (const text of ['t₁', 't₂', 'ε', 'v₀']) assert.deepEqual(scriptLabelRuns(text, 'chemical', [{ text, role: 'chemical' }]).map(r => [r.text, r.role]), text.length > 1 ? [[text[0], 'quantity'], [text.slice(1), 'number']] : [[text, 'quantity']]);
  assert.deepEqual(scriptLabelRuns('NaOH', 'chemical', [{ text: 'NaOH', role: 'chemical' }]).map(r => r.role), ['chemical']);
  assert.equal(presentationRoleFor('chemical', 'ε_A'), 'quantity');
  assert.equal(presentationRoleFor('chemical', 't_1'), 'quantity');
  assert.equal(presentationRoleFor('chemical', 'H_2O'), 'chemical');
  assert.equal(presentationRoleFor('chemical', 'e^-'), 'chemical');
});

// 11-09 라벨 안정화(규칙 6, 글씨체 표 2-1): 물리량 라벨 안의 숫자·아래 첨자·단위는 수식 정체, 변수 글자만 기울임.
// 한글에 바로 붙은 영어(X선)는 한글 줄, 로마 숫자(영역 Ⅰ)는 영어 이름.
test('numbers, subscript digits and units inside quantity labels stay upright; only the variable letters are italic', async () => {
  const { scriptLabelRuns } = await typography;
  const runs = (text, role) => scriptLabelRuns(text, role, []).filter(r => r.text.trim()).map(r => [r.text.trim(), r.role]);
  assert.deepEqual(runs('2 M, 100 mL', 'quantity'), [['2', 'number'], ['M', 'unit'], [',', 'number'], ['100', 'number'], ['mL', 'unit']]);
  assert.deepEqual(runs('a M, 100 mL', 'quantity'), [['a', 'quantity'], ['M', 'unit'], [',', 'number'], ['100', 'number'], ['mL', 'unit']]);
  assert.deepEqual(runs('h₁ mm', 'quantity'), [['h', 'quantity'], ['₁', 'number'], ['mm', 'unit']]);
  assert.deepEqual(runs('15h', 'quantity'), [['15', 'number'], ['h', 'quantity']]);
  assert.deepEqual(runs('2d', 'text'), [['2', 'number'], ['d', 'quantity']]);
  assert.deepEqual(runs('ρ₁', 'quantity'), [['ρ', 'quantity'], ['₁', 'number']]);
  assert.deepEqual(runs('10 cm', 'text'), [['10 cm', 'unit']]);
  assert.deepEqual(runs('NaOH', 'chemical'), [['NaOH', 'chemical']]);
  assert.deepEqual(runs('A: X선', 'text'), [['A:', 'name'], ['X선', 'text']]);
  assert.deepEqual(runs('영역 Ⅰ', 'text'), [['영역', 'text'], ['Ⅰ', 'name']]);
});
