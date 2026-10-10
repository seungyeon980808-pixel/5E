const test = require('node:test');
const assert = require('node:assert/strict');
const formula = import('../js/formula.js?v=1.7.0-four-session-integration');
const state = import('../js/state.js?v=1.7.0-four-session-integration');

test('script spans identify canonical UTF-16 payloads including nested and grouped scripts', async () => {
  const { getFormulaScriptSpans } = await formula;
  const source = '😀 m_{B_i} + m_C^2';
  const spans = getFormulaScriptSpans(source);
  assert.deepEqual(spans, [
    { start: 6, end: 9, kind: 'sub', text: 'B_i' },
    { start: 8, end: 9, kind: 'sub', text: 'i' },
    { start: 15, end: 16, kind: 'sub', text: 'C' },
    { start: 17, end: 18, kind: 'sup', text: '2' },
  ]);
  assert.deepEqual(getFormulaScriptSpans('m_ + m_{} + m_{B'), [{ start: 2, end: 3, kind: 'sub', text: ' ' }]);
  assert.deepEqual(getFormulaScriptSpans('m_B_C'), [{ start: 2, end: 3, kind: 'sub', text: 'B' }]);
});

test('script styles accept only exact parsed payload ranges and reject conflicting duplicates', async () => {
  const { normalizeFormulaScriptStyles } = await formula;
  const source = 'm_{B} + m_C^k';
  const valid = { start: 3, end: 4, kind: 'sub', role: 'name' };
  const selected = { start: 12, end: 13, kind: 'sup', role: 'quantity' };
  assert.deepEqual(normalizeFormulaScriptStyles(source, [valid, selected,
    { ...valid, start: 2 }, { ...valid, end: 5 }, { ...valid, kind: 'sup' },
    { ...valid, role: 'css-font' }, { ...valid, start: NaN }, { ...valid, end: Infinity },
  ]), [valid, selected]);
  assert.deepEqual(normalizeFormulaScriptStyles(source, [valid, valid]), [valid]);
  assert.deepEqual(normalizeFormulaScriptStyles(source, [valid, { ...valid, role: 'quantity' }, selected]), [selected]);
  assert.deepEqual(normalizeFormulaScriptStyles(source, Array(65).fill(valid)), []);
  assert.deepEqual(normalizeFormulaScriptStyles('m_{B', [{ start: 3, end: 4, kind: 'sub', role: 'name' }]), []);
});

// Lightweight DOM/canvas instrumentation uses the production parser, policy and
// layout. Different normal/italic advances catch measurement/render mismatches.
function installDocument() {
  const context = { font: '', measureText(text) {
    const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 1);
    return { width: text.length * size * (this.font.startsWith('italic ') ? 0.61 : 0.49) };
  } };
  class Element {
    constructor(tag) { this.tagName = tag; this.attributes = {}; this.children = []; this.dataset = {}; this.value = ''; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    appendChild(child) { this.children.push(child); return child; }
    set textContent(value) { this.value = String(value); this.children = []; }
    get textContent() { return this.value + this.children.map(child => child.textContent).join(''); }
    querySelectorAll(tag) {
      return this.children.flatMap(child => child.tagName ? [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)] : []);
    }
  }
  const previous = globalThis.document;
  globalThis.document = {
    createElement: tag => tag === 'canvas' ? { getContext: () => context } : new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    createTextNode: value => ({ textContent: String(value) }),
  };
  return () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; };
}

test('selected scripts change shared render and measurement without changing legacy formulas', async () => {
  const { renderFormula, measureFormula, getFormulaScriptSpans } = await formula;
  const { EQUATION_FONT_FAMILY } = await state;
  const restore = installDocument();
  try {
    const source = 'm_B + m_C';
    const scriptStyles = [{ start: 2, end: 3, kind: 'sub', role: 'name' }];
    const common = { source, x: 0, y: 0, fontSize: 10, fontFamily: EQUATION_FONT_FAMILY, halo: false };
    const legacy = renderFormula(common);
    const selected = renderFormula({ ...common, scriptStyles });
    const byText = (svg, text) => svg.querySelectorAll('text').filter(node => node.textContent === text);
    assert.equal(byText(legacy, 'B')[0].getAttribute('font-style'), 'italic');
    assert.equal(byText(legacy, 'C')[0].getAttribute('font-style'), 'italic');
    assert.equal(byText(selected, 'B')[0].getAttribute('font-style'), 'normal');
    assert.equal(byText(selected, 'C')[0].getAttribute('font-style'), 'italic');
    assert.ok(byText(selected, 'm').every(node => node.getAttribute('font-style') === 'italic'));

    const hint = { family: EQUATION_FONT_FAMILY, style: 'italic', weight: 'normal' };
    const legacyMetrics = measureFormula(source, 10, hint);
    const selectedMetrics = measureFormula(source, 10, { ...hint, scriptStyles });
    assert.ok(selectedMetrics.w < legacyMetrics.w);
    assert.equal(Number(selected.children[0].getAttribute('width')), selectedMetrics.w);
    const invalidStyles = [{ start: 1, end: 3, kind: 'sub', role: 'name' }];
    assert.deepEqual(measureFormula(source, 10, { ...hint, scriptStyles: invalidStyles }), legacyMetrics);
    assert.deepEqual(renderFormula({ ...common, scriptStyles: invalidStyles }).querySelectorAll('text').map(node => node.attributes),
      legacy.querySelectorAll('text').map(node => node.attributes));

    const nestedSource = 'm_{B_i}';
    const nested = renderFormula({ ...common, source: nestedSource, scriptStyles: getFormulaScriptSpans(nestedSource)
      .map(span => ({ ...span, role: span.text === 'i' ? 'quantity' : 'name' })) });
    assert.equal(byText(nested, 'B')[0].getAttribute('font-style'), 'normal');
    assert.equal(byText(nested, 'i')[0].getAttribute('font-style'), 'italic');

    const upright = renderFormula({ ...common, source: 'q_B^k', forceUpright: true,
      scriptStyles: [{ start: 4, end: 5, kind: 'sup', role: 'quantity' }] });
    assert.equal(byText(upright, 'q')[0].getAttribute('font-style'), 'normal');
    assert.equal(byText(upright, 'B')[0].getAttribute('font-style'), 'normal');
    assert.equal(byText(upright, 'k')[0].getAttribute('font-style'), 'italic');
  } finally { restore(); }
});
