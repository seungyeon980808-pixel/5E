import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handSelectedCanvasImageToAi,
  selectedCanvasImageSnapshot,
} from '../js/ai-canvas-handoff.js';
import { createCanvas } from '@napi-rs/canvas';
import { applyImageCutouts } from '../js/image-cutout.js';

function harness(object = { id: 'image-1', type: 'image', src: 'data:image/png;base64,SOURCE', cutouts: [] }) {
  const page = { id: 'page-1', objects: [object] };
  const value = { activePageId: page.id, pages: [page], objects: page.objects, selectedIds: [object.id] };
  const subscribers = new Set();
  return {
    value,
    state: {
      get: () => value,
      subscribe(callback) { subscribers.add(callback); return () => subscribers.delete(callback); },
    },
    change(mutator) { mutator(value); subscribers.forEach(callback => callback(value)); },
  };
}

test('Given one ordinary selected image, when capture completes, then one exact snapshot opens without generation', async () => {
  const fixture = harness({ id: 'image-1', type: 'image', src: 'data:image/png;base64,SOURCE', cutouts: [{ type: 'rect', x: 0, y: 0, w: 0.5, h: 1 }] });
  const opened = [];
  const rendered = [];

  const result = await handSelectedCanvasImageToAi(fixture.state, {
    renderImage: async image => { rendered.push(image); return 'data:image/png;base64,VISIBLE_CUTOUT_PIXELS'; },
    openPanel: options => opened.push(options),
  });

  assert.equal(result.status, 'opened');
  assert.deepEqual(rendered[0].cutouts, [{ type: 'rect', x: 0, y: 0, w: 0.5, h: 1 }]);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].references.length, 1);
  assert.equal(opened[0].references[0].dataUrl, 'data:image/png;base64,VISIBLE_CUTOUT_PIXELS');
  assert.equal(opened[0].startGeneration, false);
});

test('Given a linked AI image, when its entry opens, then the existing task is reopened without capture or duplication', async () => {
  const fixture = harness({ id: 'image-1', type: 'image', src: 'data:image/png;base64,SOURCE', aiTaskId: 'task-7', aiCandidateId: 'candidate-2' });
  let captures = 0;
  const opened = [];

  const result = await handSelectedCanvasImageToAi(fixture.state, {
    renderImage: async () => { captures += 1; return 'data:image/png;base64,UNUSED'; },
    openPanel: options => opened.push(options),
  });

  assert.equal(result.status, 'linked');
  assert.equal(captures, 0);
  assert.deepEqual(opened, [undefined]);
});

test('Given no ordinary selected image, when the entry opens, then the existing empty AI panel behavior is preserved', async () => {
  const fixture = harness();
  fixture.value.selectedIds = [];
  const opened = [];

  const result = await handSelectedCanvasImageToAi(fixture.state, {
    renderImage: async () => 'data:image/png;base64,UNUSED',
    openPanel: options => opened.push(options),
  });

  assert.equal(result.status, 'empty');
  assert.deepEqual(opened, [undefined]);
});

test('Given capture in flight, when selection, page, document, or selected image changes, then stale pixels never open', async () => {
  for (const mutate of [
    value => { value.selectedIds = []; },
    value => { value.activePageId = 'page-2'; },
    value => { value.pages = [{ id: 'replacement', objects: [] }]; },
    value => { value.objects[0].src = 'data:image/png;base64,CHANGED'; },
  ]) {
    const fixture = harness();
    let finishCapture;
    const capture = new Promise(resolve => { finishCapture = resolve; });
    const opened = [];
    const pending = handSelectedCanvasImageToAi(fixture.state, {
      renderImage: () => capture,
      openPanel: options => opened.push(options),
    });
    fixture.change(mutate);
    finishCapture('data:image/png;base64,STALE');

    const result = await pending;
    assert.equal(result.status, 'stale');
    assert.equal(opened.length, 0);
  }
});

test('Given malformed state or rejected rendering, when snapshotting, then the caller receives a visible-safe error and no handoff', async () => {
  assert.equal(selectedCanvasImageSnapshot({ selectedIds: null, objects: null }), null);
  const fixture = harness();
  const errors = [];
  const opened = [];
  const result = await handSelectedCanvasImageToAi(fixture.state, {
    renderImage: async () => { throw new Error('decode rejected'); },
    openPanel: options => opened.push(options),
    reportError: error => errors.push(error.message),
  });
  assert.equal(result.status, 'error');
  assert.deepEqual(errors, ['decode rejected']);
  assert.equal(opened.length, 0);
});

test('Given cut-tool poly and outside-poly geometry, when rasterized, then the snapshot alpha matches the visible halves', () => {
  const rasterize = cutout => {
    const canvas = createCanvas(4, 4);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 4, 4);
    applyImageCutouts(context, [cutout], 4, 4);
    return [...context.getImageData(0, 0, 4, 4).data].filter((_value, index) => index % 4 === 3);
  };
  const left = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, { x: 0, y: 1 }];

  assert.deepEqual(rasterize({ type: 'poly', points: left }), [0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
  assert.deepEqual(rasterize({ type: 'outside-poly', points: left }), [255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0]);
});
