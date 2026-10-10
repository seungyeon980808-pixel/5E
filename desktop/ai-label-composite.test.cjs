const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../js/ai-label-composite.js');
test('mechanical clear still requires visual review; overlap and uncertainty cannot pass', async () => {
  const { assessLabelCompositeMeasurements: check } = await modulePromise;
  const box = { x: .1, y: .1, w: .2, h: .1 };
  assert.equal(check([{ id: 'a', actual: box, planned: box }]).status, 'mechanical-checks-clear');
  assert.equal(check([{ id: 'a', actual: box, planned: box }]).visualReviewRequired, true);
  assert.equal(check([{ id: 'a', actual: box, planned: box }, { id: 'b', actual: box, planned: box }]).status, 'needs-attention');
  assert.equal(check([], { uncertainties: ['target uncertain'] }).status, 'needs-attention');
});
test('clipping and missing bounds still block; source appearance deviations are diagnostic only', async () => {
  const { assessLabelCompositeMeasurements: check } = await modulePromise;
  const result = check([{ id: 'clip', actual: { x: -.1, y: 0, w: .2, h: .1 } }, { id: 'drift', actual: { x: .5, y: .5, w: .2, h: .1 }, planned: { x: .1, y: .1, w: .1, h: .1 } }]);
  assert.deepEqual(result.issues.map(i => i.code), ['clipped-label', 'missing-source-bounds']);
  assert.equal(result.diagnostics[0].code, 'source-bounds-deviation');
  assert.equal(result.status, 'needs-attention');
  const restyled = check([{ id: 'restyled', actual: { x: .5, y: .5, w: .2, h: .1 }, planned: { x: .1, y: .1, w: .1, h: .1 } }]);
  assert.equal(restyled.status, 'mechanical-checks-clear');
  assert.equal(restyled.visualReviewRequired, true);
  assert.equal(restyled.diagnostics.length, 1);
});
test('composite rejects external URLs, SVG, bad artboards and aborted owners before DOM access', async () => {
  const { createEditableLabelComposite: create } = await modulePromise;
  for (const candidateDataUrl of ['https://example.com/image.png', 'data:image/svg+xml;base64,AAAA']) await assert.rejects(create({ plan: { labels: [] }, candidateDataUrl }), /bounded raster/);
  await assert.rejects(create({ plan: { labels: [] }, candidateDataUrl: 'data:image/png;base64,AAAA', artboard: { w: 0, h: 10 } }), /artboard/);
  const c = new AbortController(); c.abort(); await assert.rejects(create({ signal: c.signal }), { name: 'AbortError' });
});

test('pending review is not factual uncertainty; unresolved typography is', async () => {
 const { assessLabelCompositeMeasurements: check } = await modulePromise;
 assert.equal(check([], {reviewRequired:true}).status, 'mechanical-checks-clear');
 assert.equal(check([], {labels:[{typographyReviewRequired:true}]}).status, 'needs-attention');
 assert.equal(check([], {excludedLabels:[{scope:'unsupported'}]}).status, 'needs-attention');
});
test('oversized PNG is rejected before browser decoder allocation', async () => {
 const {createEditableLabelComposite:create}=await modulePromise;
 const header=Buffer.alloc(33);header.set([137,80,78,71,13,10,26,10]);header.write('IHDR',12);header.writeUInt32BE(100000,16);header.writeUInt32BE(100000,20);
 await assert.rejects(create({plan:{labels:[]},candidateDataUrl:'data:image/png;base64,'+header.toString('base64'),artboard:{w:210,h:297}}), /pixel limit/);
});
