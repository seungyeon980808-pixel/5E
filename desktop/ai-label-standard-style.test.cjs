const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function nativeDefaults() {
  const state = await import('../js/state.js');
  const source = fs.readFileSync(require.resolve('../js/tools/click-placement.js'), 'utf8');
  const start = source.indexOf('function makeLabelerDraft(');
  const end = source.indexOf('\nfunction handleLabelerClick(', start);
  const context = vm.createContext({
    DEFAULT_TEXT_FONT: state.DEFAULT_TEXT_FONT,
    DEFAULT_TEXT_SIZE_MM: state.DEFAULT_TEXT_SIZE_MM,
    DEFAULT_STROKE_WIDTH: 0.2,
    applyNewObjectStyleDefaults: object => object,
  });
  vm.runInContext(source.slice(start, end), context);
  return { state, object: context.makeLabelerDraft({ x: 10, y: 10 }, { x: 20, y: 20 }) };
}

const label = {
  id: 'organ', text: '기관명', sourceKind: 'reference', sourceRef: 1, scope: 'general',
  mode: 'text', contentMode: 'plain', anchor: { x: 0.5, y: 0.5 }, position: { x: 0.5, y: 0.5 },
  typography: { role: 'text', bounds: { x: 0.4, y: 0.4, w: 0.2, h: 0.02 } },
};

test('AI labels use the actual labeler tool size and font regardless of source bbox or image size', async () => {
  const { createEditableImageLabelObjects } = await import('../js/ai-editable-image-labels.js');
  const { object: manual } = await nativeDefaults();
  for (const role of ['text', 'name', 'symbol']) {
    for (const size of [30, 100]) {
      for (const height of [0.02, 0.08, 0.16]) {
        const input = { ...label, typography: { role, bounds: { ...label.typography.bounds, h: height } } };
        const object = createEditableImageLabelObjects({
          labels: [input], image: { id: 'image', x: 0, y: 0, w: size, h: size }, idFactory: () => 'label',
        })[0];
        assert.equal(object.fontSize, manual.labelSize);
        assert.equal(object.fontFamily, manual.fontFamily);
        assert.equal(object.strokeWidth, manual.strokeWidth);
        assert.deepEqual(object.aiLabelSourceBounds, input.typography.bounds);
      }
    }
  }
});

test('source cosmetic fonts and weights remain observation data rather than AI display overrides', async () => {
  const { createEditableImageLabelObjects } = await import('../js/ai-editable-image-labels.js');
  const { object: manual } = await nativeDefaults();
  const typography = { ...label.typography, font: 'Arial', fontWeight: 'bold', italic: true, lineHeight: 2, letterSpacing: 0.2 };
  const object = createEditableImageLabelObjects({
    labels: [{ ...label, typography }], image: { id: 'image', x: 0, y: 0, w: 100, h: 100 }, idFactory: () => 'label',
  })[0];
  assert.equal(object.fontFamily, manual.fontFamily);
  assert.equal(object.fontWeight, 'normal');
  assert.equal(object.italic, false);
  assert.equal(object.letterSpacing, undefined);
  assert.equal(object.labelLineHeight, undefined);
  assert.equal(typography.font, 'Arial');
});

test('source endpoint radius does not scale the standard native endpoint while route identity is retained', async () => {
  const { createEditableImageLabelObjects } = await import('../js/ai-editable-image-labels.js');
  const route = { kind: 'straight', attachment: 'label', start: { x: 0.5, y: 0.5 },
    target: { x: 0.3, y: 0.3 }, controls: [], end: 'circle', endRadius: 0.02 };
  const object = createEditableImageLabelObjects({
    labels: [{ ...label, mode: 'leader', anchor: route.target, leaderRoutes: [route] }],
    image: { id: 'image', x: 0, y: 0, w: 100, h: 100 }, idFactory: () => 'label',
  })[0];
  assert.equal(object.leaderRoutes[0].endRadius, undefined);
  assert.equal(object.leaderRoutes[0].end, 'circle');
  assert.deepEqual(object.leaderRoutes[0].target, { x: 30, y: 30 });
  assert.equal(route.endRadius, 0.02);
});

test('formula quantities and chemical subscripts retain their existing semantic presentation', async () => {
  const { createEditableImageLabelObjects } = await import('../js/ai-editable-image-labels.js');
  const { state } = await nativeDefaults();
  const objects = createEditableImageLabelObjects({
    labels: [
      { ...label, text: 'm_B', contentMode: 'formula', typography: { ...label.typography, role: 'quantity',
        scriptStyles: [{ start: 2, end: 3, kind: 'sub', role: 'name' }] } },
      { ...label, id: 'chemical', text: 'CO_2', contentMode: 'formula', typography: { ...label.typography, role: 'chemical' } },
    ],
    image: { id: 'image', x: 0, y: 0, w: 100, h: 100 }, idFactory: () => 'label',
  });
  assert.equal(objects[0].fontFamily, state.EQUATION_FONT_FAMILY);
  assert.equal(objects[0].italic, true);
  assert.equal(objects[0].rawSource, 'm_B');
  assert.equal(objects[0].labelScriptStyles[0].role, 'name');
  assert.equal(objects[1].rawSource, 'CO_2');
  assert.equal(objects[1].italic, false);
  assert.equal(objects[1].formulaUpright, true);
});

test('name runs render in the saved Gothic font rather than silently switching to Myeongjo', async () => {
  const { createEditableImageLabelObjects } = await import('../js/ai-editable-image-labels.js');
  const { measureLabelTypography } = await import('../js/ai-label-typography.js');
  const { state } = await nativeDefaults();
  for (const mode of ['text', 'leader']) {
    const text = '전류 센서';
    const object = createEditableImageLabelObjects({ labels: [{ ...label, text, mode,
      typography: { ...label.typography, role: 'name', runs: [{ text, role: 'name', contentMode: 'plain' }] } }],
      image: { id: 'image', x: 0, y: 0, w: 100, h: 100 }, idFactory: () => 'label' })[0];
    assert.equal(object.fontFamily, state.DEFAULT_TEXT_FONT);
    assert.equal(object.labelFontOverride, true);
    for (const run of measureLabelTypography(object).lines.flatMap(line => line.runs)) {
      assert.equal(run.font.fontFamily, state.DEFAULT_TEXT_FONT);
    }
    // Saved objects from before the explicit override flag follow their stored font too.
    delete object.labelFontOverride;
    assert.equal(measureLabelTypography(object).lines[0].runs[0].font.fontFamily, state.DEFAULT_TEXT_FONT);
    object.fontFamily = 'Arial, sans-serif';
    assert.equal(measureLabelTypography(object).lines[0].runs[0].font.fontFamily, object.fontFamily);
  }
});
