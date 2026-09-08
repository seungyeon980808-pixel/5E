import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createScopedEditComparison, decodeScopedEditComparison } from '../js/ai-scoped-edit-comparison.js';
import { encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

function png(width, height, data) { return encodeTestRgbaPng({ width, height, data: Uint8Array.from(data) }); }

test('comparison mask reports exact RGBA changes, including hidden RGB under alpha zero', async () => {
  const original = png(2, 1, [10, 20, 30, 0, 40, 50, 60, 255]);
  const preview = png(2, 1, [99, 20, 30, 0, 40, 50, 60, 255]);
  const comparison = await decodeScopedEditComparison(original, preview);
  assert.equal(comparison.changedPixelCount, 1);
  assert.deepEqual([...comparison.mask], [1, 0]);
  assert.deepEqual(comparison.changedBounds, { x0: 0, y0: 0, x1: 1, y1: 1 });
});

test('comparison snapshots never mutate either original or verified proposal PNG bytes', async () => {
  const original = png(1, 1, [1, 2, 3, 4]);
  const preview = png(1, 1, [5, 6, 7, 8]);
  const originalBefore = original.slice();
  const previewBefore = preview.slice();
  await decodeScopedEditComparison(original, preview);
  assert.deepEqual(original, originalBefore);
  assert.deepEqual(preview, previewBefore);
});

test('comparison fails closed when decoded PNG dimensions differ', async () => {
  await assert.rejects(
    decodeScopedEditComparison(png(2, 1, new Uint8Array(8)), png(1, 1, new Uint8Array(4))),
    /dimensions to match exactly/,
  );
});

class MockElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.style = {}; this.attributes = {}; this.listeners = {}; }
  set width(value) { this._width = value; if (this.tagName === 'canvas') this.imageData = null; }
  get width() { return this._width; }
  set height(value) { this._height = value; if (this.tagName === 'canvas') this.imageData = null; }
  get height() { return this._height; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  getContext() { return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData: image => { this.imageData = image; } }; }
}
function allNodes(node) { return [node, ...node.children.flatMap(allNodes)]; }

test('comparison DOM is a three-pane review-only layout with a separate mask canvas', async () => {
  const priorDocument = globalThis.document;
  globalThis.document = { createElement: tag => new MockElement(tag) };
  try {
    const root = await createScopedEditComparison(png(1, 1, [1, 2, 3, 4]), png(1, 1, [9, 2, 3, 4]));
    const nodes = allNodes(root);
    assert.equal(root.attributes['data-ai-scoped-edit-comparison'], '');
    assert.equal(nodes.filter(node => node.tagName === 'img').length, 2);
    assert.equal(nodes.filter(node => node.tagName === 'canvas').length, 1);
    assert.equal(nodes.find(node => node.tagName === 'canvas').imageData?.data[3], 255, 'Canvas dimensions must not clear the rendered change mask');
    assert.match(nodes.map(node => node.textContent || '').join(' '), /원본.*수정 후.*실제 변경 마스크/);
    root.dispose();
  } finally { globalThis.document = priorDocument; }
});

test('panel review wires immutable source snapshot to content DOM without treating preview as acceptance', async () => {
  const source = await readFile(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  assert.match(source, /const originalPng = scopedPngBytes\(item\.data\)/);
  assert.match(source, /createScopedEditComparison\(originalPng, proposal\.previewPng\)/);
  assert.match(source, /\{ content: comparison, accept: '적용' \}/);
  assert.doesNotMatch(source, /review: async proposal =>[\s\S]{0,700}acceptScopedEditProposal/);
});

test('fit and shared zoom change only CSS dimensions, preserving the mask bitmap', async () => {
  const priorDocument = globalThis.document;
  globalThis.document = { createElement: tag => new MockElement(tag) };
  try {
    const root = await createScopedEditComparison(png(20, 10, new Uint8Array(800)), png(20, 10, new Uint8Array(800).fill(199)));
    const nodes = allNodes(root), slider = nodes.find(n => n.tagName === 'input');
    const canvas = nodes.find(n => n.tagName === 'canvas');
    const bitmap = canvas.imageData;
    slider.value = '400'; slider.listeners.input();
    for (const node of nodes.filter(n => n.tagName === 'img' || n.tagName === 'canvas')) assert.equal(node.style.width, '80px');
    for (const node of nodes.filter(n => n.className === 'ai-scoped-edit-comparison-viewport')) node.clientWidth = 5;
    nodes.find(n => n.tagName === 'button' && n.textContent === '전체 맞춤').listeners.click();
    assert.equal(slider.value, '25'); assert.equal(canvas.style.width, '5px');
    assert.equal(canvas.imageData, bitmap); assert.equal(canvas.imageData.data[3], 255);
    root.dispose();
  } finally { globalThis.document = priorDocument; }
});
