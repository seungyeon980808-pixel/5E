const test = require('node:test');
const assert = require('node:assert/strict');

function fixture() {
  const width = 20, height = 20;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([240, 240, 240, 255], i * 4);
  const glyph = [[11, 7], [11, 8], [11, 9], [11, 10], [10, 10], [9, 10]];
  for (const [x, y] of glyph) data.set([20, 20, 20, 255], (y * width + x) * 4);
  const bounds = { x: 0.25, y: 0.25, w: 0.35, h: 0.4 };
  const label = { id: 'glyph', text: 'L', sourceKind: 'reference', sourceRef: 1, scope: 'general',
    mode: 'text', contentMode: 'plain', position: { x: 0.425, y: 0.45 }, anchor: { x: 0.425, y: 0.45 },
    typography: { role: 'symbol', bounds } };
  const plan = { version: 4, labels: [label], frozen: true,
    inkSearchRegions: [{ id: 'search', labelId: 'glyph', sourceRef: 1, ownership: 'confirmed', component: 'text',
      bounds, background: [240, 240, 240, 255], backgroundMode: 'sample-flat' }] };
  return { width, height, data, plan, glyph };
}

test('closed exterior background measurement removes complete edge-touching glyphs without widening the mask', async () => {
  const { removeExamLabelPixels } = await import('../js/ai-exam-label-removal.js');
  const f = fixture(), before = f.data.slice();
  const result = removeExamLabelPixels({ ...f, workflow: { imageKind: 'exam', labelResult: 'restore-editable' } });
  assert.equal(result.report.status, 'complete');
  assert.deepEqual(result.report.removedLabelIds, ['glyph']);
  assert.equal(result.report.changedPixels, f.glyph.length);
  const glyphPixels = new Set(f.glyph.map(([x, y]) => y * f.width + x));
  for (let i = 0; i < f.width * f.height; i++) {
    assert.deepEqual(Array.from(result.data.slice(i * 4, i * 4 + 4)),
      glyphPixels.has(i) ? [240, 240, 240, 255] : Array.from(before.slice(i * 4, i * 4 + 4)));
  }
});

test('an edge-touching glyph connected to outside structure remains entirely unchanged', async () => {
  const { removeExamLabelPixels } = await import('../js/ai-exam-label-removal.js');
  const f = fixture();
  f.data.set([20, 20, 20, 255], (8 * f.width + 12) * 4);
  const before = f.data.slice();
  const result = removeExamLabelPixels({ ...f, workflow: { imageKind: 'exam', labelResult: 'restore-editable' } });
  assert.deepEqual(result.report.removedLabelIds, []);
  assert.equal(result.report.changedPixels, 0);
  assert.deepEqual(result.data, before);
});

// 11-09: OCR 후보 상자가 그림 맨 아래 줄까지 닿아도(손 X선 「A: X선」) 가장자리에서 1px 안으로 재서 글자를 지운다.
test('a sample-flat text search touching the image edge is measured one pixel inside and removes the complete glyph', async () => {
  const { removeExamLabelPixels } = await import('../js/ai-exam-label-removal.js');
  const f = fixture(), before = f.data.slice();
  f.plan.inkSearchRegions[0].bounds = { x: 0.4, y: 0.3, w: 0.25, h: 0.7 };
  const result = removeExamLabelPixels({ ...f, workflow: { imageKind: 'exam', labelResult: 'restore-editable' } });
  assert.deepEqual(result.report.removedLabelIds, ['glyph']);
  assert.equal(result.report.changedPixels, f.glyph.length);
  const glyphPixels = new Set(f.glyph.map(([x, y]) => y * f.width + x));
  for (let i = 0; i < f.width * f.height; i++) if (!glyphPixels.has(i)) assert.deepEqual(Array.from(result.data.slice(i * 4, i * 4 + 4)), Array.from(before.slice(i * 4, i * 4 + 4)));
});

test('ink on the excluded image-edge row keeps an edge-touching text search unchanged', async () => {
  const { removeExamLabelPixels } = await import('../js/ai-exam-label-removal.js');
  const f = fixture();
  f.plan.inkSearchRegions[0].bounds = { x: 0.4, y: 0.3, w: 0.25, h: 0.7 };
  f.data.set([20, 20, 20, 255], (19 * f.width + 10) * 4);
  const before = f.data.slice();
  const result = removeExamLabelPixels({ ...f, workflow: { imageKind: 'exam', labelResult: 'restore-editable' } });
  assert.deepEqual(result.report.removedLabelIds, []);
  assert.equal(result.report.changedPixels, 0);
  assert.deepEqual(result.data, before);
});

test('unknown self and cross-source geometry edges defer independently while bounded objects and valid edges survive', async () => {
  const { normalizeSourceGeometry } = await import('../js/ai-label-source-geometry.js');
  const object = (id, sourceRef) => ({ id, sourceRef, description: 'fixture',
    bounds: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, relations: [] });
  const a = object('a', 1), b = object('b', 1), c = object('c', 2);
  a.relations = ['missing', 'a', 'c', 'b'].map(target => ({ target, kind: 'connect' }));
  const result = normalizeSourceGeometry({ version: 1, objects: [a, b, c] }, 2);
  assert.deepEqual(result.objects.map(o => o.id), ['a', 'b', 'c']);
  assert.deepEqual(result.objects[0].relations, [{ target: 'b', kind: 'connect' }]);
  assert.deepEqual(result.quarantinedRelations.map(r => r.target), ['missing', 'a', 'c']);
  assert.ok(result.quarantinedRelations.every(r => r.deletionAuthority === false));
  assert.deepEqual(result.objects[0].bounds, a.bounds);
});
