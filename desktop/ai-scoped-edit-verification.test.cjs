const test = require('node:test');
const assert = require('node:assert/strict');
const api = Promise.all([
  import('../js/ai-scoped-edit-verification.js'),
  import('../tests/helpers/box-edit-png-fixture.mjs'),
]);

function image(width = 180, height = 130) {
  return { width, height, data: new Uint8Array(width * height * 4).fill(255) };
}
function pixel(im, x, y, color = [0, 0, 0, 255]) {
  im.data.set(color, (y * im.width + x) * 4);
}
function fill(im, x0, y0, x1, y1, color = [0, 0, 0, 255]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixel(im, x, y, color);
}
function target(im, x, y, width = 31, distorted = false) {
  fill(im, x, y, x + width, y + 3);
  fill(im, x + width - 3, y, x + width, y + 12);
  if (distorted) fill(im, x + 12, y + 3, x + 15, y + 12);
}
function outline(im, cx, cy, dx, dy = dx, kind = 'circle') {
  const rx = (dx - 1) / 2, ry = (dy - 1) / 2;
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      const outer = kind === 'rectangle'
        ? Math.max(Math.abs(x - cx) / rx, Math.abs(y - cy) / ry) <= 1
        : ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
      const inner = kind === 'rectangle'
        ? Math.abs(x - cx) < rx - 2 && Math.abs(y - cy) < ry - 2
        : ((x - cx) / (rx - 2)) ** 2 + ((y - cy) / (ry - 2)) ** 2 < 1;
      if (outer && !inner) pixel(im, x, y);
    }
  }
}
function composite(source, raw, boxes, origin) {
  const final = { ...source, data: new Uint8Array(source.data) };
  for (const b of boxes) for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
    const rx = x - origin.x, ry = y - origin.y;
    if (rx >= 0 && ry >= 0 && rx < raw.width && ry < raw.height) {
      final.data.set(raw.data.subarray((ry * raw.width + rx) * 4, (ry * raw.width + rx) * 4 + 4),
        (y * final.width + x) * 4);
    }
  }
  return final;
}
async function evaluate(source, raw, check, box, options = {}) {
  const [{ evaluateScopedEditPrecision }, codec] = await api;
  const origin = options.origin || { x: 0, y: 0 }, rectangles = [box];
  const final = options.final || composite(source, raw, rectangles, origin);
  return evaluateScopedEditPrecision({
    sourcePng: codec.encodeTestRgbaPng(source, 4),
    rawPng: codec.encodeTestRgbaPng(raw, 1),
    finalPng: codec.encodeTestRgbaPng(final, 3),
    rectangles, checks: [check], origin,
  });
}
const box = { x0: 15, y0: 15, x1: 165, y1: 115 };
const moveCheck = { box: 0, kind: 'move', dx: 50, dy: 8,
  search: { x0: 10, y0: 10, x1: 170, y1: 120 } };
const circleCheck = { box: 0, kind: 'circles', diameter: 41,
  centers: [{ x: 95, y: 60 }], search: { x0: 10, y0: 10, x1: 170, y1: 120 } };
const gapCheck = { box: 0, kind: 'disconnect', gap: 30,
  search: { x0: 20, y0: 40, x1: 160, y1: 80 } };

for (const [name, dx, dy, width, distorted, expected] of [
  ['valid', 50, 8, 31, false, 'pass'],
  ['inclusive x/y tolerance', 53, 10, 31, false, 'pass'],
  ['negative tolerance boundary', 47, 6, 31, false, 'pass'],
  ['x exceeds tolerance', 54, 8, 31, false, 'fail'],
  ['y exceeds tolerance', 50, 11, 31, false, 'fail'],
  ['no-op', 0, 0, 31, false, 'fail'],
  ['shortened', 50, 8, 19, false, 'fail'],
  ['lengthened', 50, 8, 40, false, 'fail'],
  ['interior distorted', 50, 8, 31, true, 'fail'],
]) {
  test(`move ${name} uses complete PNG target geometry`, async () => {
    const source = image(), raw = image(); target(source, 30, 45); target(raw, 30 + dx, 45 + dy, width, distorted);
    const report = await evaluate(source, raw, moveCheck, box);
    assert.equal(report.status, expected);
    assert.equal(report.checks[0].metrics.dx, dx);
    assert.equal(report.checks[0].metrics.dy, dy);
    assert.equal(report.outsideRgbaChanged, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  });
}

test('move measures complete RAW before permission clipping', async () => {
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 80, 53);
  const report = await evaluate(source, raw, moveCheck, { ...box, x1: 109 });
  assert.equal(report.status, 'fail');
  assert.equal(report.checks[0].metrics.clipped, true);
  assert.equal(report.checks[0].metrics.rawSize[0], 31);
});
test('visible antialiased source connects dark fragments without changing displacement thresholds',async()=>{
  const source=image(),raw=image();
  fill(source,30,45,41,47);fill(source,41,45,51,47,[175,175,175,255]);fill(source,51,45,61,47);
  fill(raw,80,53,91,55);fill(raw,91,53,101,55,[175,175,175,255]);fill(raw,101,53,111,55);
  const report=await evaluate(source,raw,moveCheck,box);
  assert.equal(report.status,'pass');
  assert.equal(report.checks[0].metrics.dx,50);assert.equal(report.checks[0].metrics.dy,8);
  fill(raw,94,48,97,53,[175,175,175,255]);
  const distorted=await evaluate(source,raw,moveCheck,box);
  assert.equal(distorted.status,'fail');assert.ok(distorted.checks[0].metrics.addedContour>0);
});
for (const scenario of ['empty', 'multiple', 'source-border', 'raw-border']) {
  test(`move ${scenario} detection is uncertain and cannot correct`, async () => {
    const source = image(), raw = image();
    if (scenario !== 'empty') target(source, scenario === 'source-border' ? 10 : 30, 45);
    target(raw, scenario === 'raw-border' ? 149 : 80, 53);
    if (scenario === 'multiple') target(source, 80, 80);
    const report = await evaluate(source, raw, moveCheck, box);
    assert.equal(report.status, 'uncertain');
    const [{ scopedEditCorrectionFeedback }] = await api;
    assert.equal(scopedEditCorrectionFeedback(report), '');
  });
}
for (const [name, cx, cy, diameter, dy, kind, expected] of [
  ['valid circle', 95, 60, 41, 41, 'circle', 'pass'],
  ['center tolerance', 100, 65, 41, 41, 'circle', 'pass'],
  ['center beyond tolerance', 101, 60, 41, 41, 'circle', 'fail'],
  ['diameter upper tolerance', 95, 60, 51, 51, 'circle', 'pass'],
  ['diameter lower tolerance', 95, 60, 31, 31, 'circle', 'pass'],
  ['diameter beyond tolerance', 95, 60, 53, 53, 'circle', 'fail'],
  ['ellipse within bounding-size tolerance', 95, 60, 41, 31, 'circle', 'fail'],
  ['rectangle matching bounds', 95, 60, 41, 41, 'rectangle', 'fail'],
]) {
  test(`${name} is checked as a ring, not a bounding box`, async () => {
    const source = image(), raw = image(); outline(raw, cx, cy, diameter, dy, kind);
    const report = await evaluate(source, raw, circleCheck, box);
    assert.equal(report.status, expected);
    assert.equal(report.checks[0].metrics.found, 1);
  });
}
test('circle exact additional count rejects no-op and extra objects', async () => {
  for (const extra of [0, 2]) {
    const source = image(), raw = image();
    if (extra) { outline(raw, 95, 60, 41); outline(raw, 40, 60, 31); }
    const report = await evaluate(source, raw, circleCheck, box);
    assert.equal(report.status, 'fail');
    assert.equal(report.checks[0].metrics.found, extra);
  }
});
for (const dx of [150, 203, 236, 262]) {
  test(`audit-scale move measures full ${dx}px translation beyond permission-sized search`, async () => {
    const source = image(1800, 1100), raw = image(1800, 1100);
    fill(source, 866, 900, 1281, 903); fill(source, 1278, 900, 1281, 954);
    fill(raw, 866 + dx, 900, 1281 + dx, 903); fill(raw, 1278 + dx, 900, 1281 + dx, 954);
    const permission = { x0: 809, y0: 887, x1: 1434, y1: 978 };
    const report = await evaluate(source, raw, { box: 0, kind: 'move', dx: 150, dy: 0, search: permission }, permission);
    assert.equal(report.status, dx === 150 ? 'pass' : 'fail');
    assert.equal(report.checks[0].metrics.dx, dx);
    assert.deepEqual(report.checks[0].metrics.rawSize, [415, 54]);
    assert.equal(report.checks[0].metrics.clipped, dx !== 150);
  });
}
test('expanded RAW move search cannot silently select among competing targets', async () => {
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 80, 53); target(raw, 125, 53);
  const report = await evaluate(source, raw, moveCheck, box);
  assert.equal(report.status, 'uncertain');
});
test('move retaining the source while adding a translated copy is uncertain', async () => {
  const source = image(); target(source, 30, 45);
  const raw = { ...source, data: new Uint8Array(source.data) }; target(raw, 80, 53);
  assert.equal((await evaluate(source, raw, moveCheck, box)).status, 'uncertain');
});
test('circle matching is independent of expected center order', async () => {
  const source = image(), raw = image();
  outline(raw, 45, 60, 31); outline(raw, 120, 60, 31);
  const report = await evaluate(source, raw, { ...circleCheck, diameter: 31,
    centers: [{ x: 120, y: 60 }, { x: 45, y: 60 }] }, box);
  assert.equal(report.status, 'pass');
});
test('existing source rings are preserved, not counted as additions', async () => {
  const source = image(); outline(source, 40, 60, 31);
  const raw = { ...source, data: new Uint8Array(source.data) }; outline(raw, 95, 60, 41);
  const report = await evaluate(source, raw, circleCheck, box);
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].metrics.found, 1);
  const noop = await evaluate(source, source, circleCheck, box);
  assert.equal(noop.status, 'fail');
  assert.equal(noop.checks[0].metrics.found, 0);
});
test('modified or erased source circle makes addition uncertain', async () => {
  const source = image(), raw = image(); outline(source, 40, 60, 31); outline(raw, 95, 60, 41);
  const report = await evaluate(source, raw, circleCheck, box);
  assert.equal(report.status, 'uncertain');
});
test('discarded RAW source-object edits outside permission do not invalidate circle additions', async () => {
  const source = image(), raw = image(); outline(source, 40, 60, 31);
  outline(raw, 35, 60, 25, 25, 'rectangle'); outline(raw, 95, 60, 41);
  const permission = { x0: 70, y0: 15, x1: 165, y1: 115 };
  const report = await evaluate(source, raw, circleCheck, permission);
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].metrics.found, 1);
  assert.equal(report.outsideRgbaChanged, 0);
});
test('circle existing outside and inside permission is preserved in final despite discarded RAW changes', async () => {
  const source = image(); outline(source, 65, 60, 31);
  const raw = { ...source, data: new Uint8Array(source.data) };
  fill(raw, 40, 40, 70, 80, [255, 255, 255, 255]); outline(raw, 120, 60, 31);
  const permission = { x0: 70, y0: 15, x1: 165, y1: 115 };
  const report = await evaluate(source, raw, { ...circleCheck, diameter: 31, centers: [{ x: 120, y: 60 }] }, permission);
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].metrics.found, 1);
});
test('complete RAW circle outside permission fails before final-mask cropping', async () => {
  const source = image(), raw = image(); outline(raw, 91, 60, 41);
  const narrow = { x0: 74, y0: 15, x1: 165, y1: 115 };
  const report = await evaluate(source, raw, circleCheck, narrow);
  assert.equal(report.status, 'fail');
  assert.equal(report.checks[0].metrics.added[0].clipped, true);
  assert.deepEqual(report.checks[0].metrics.added[0].diameter, [41, 41]);
});
test('expanded RAW ring search measures a complete circle beyond the explicit search boundary', async () => {
  const source = image(), raw = image(); outline(raw, 88, 60, 41);
  const permission = { x0: 74, y0: 15, x1: 165, y1: 115 };
  const report = await evaluate(source, raw, { ...circleCheck, search: permission }, permission);
  assert.equal(report.status, 'fail');
  assert.equal(report.checks[0].metrics.added[0].clipped, true);
  assert.deepEqual(report.checks[0].metrics.added[0].diameter, [41, 41]);
});
for (const scenario of ['open', 'filled', 'search-border', 'tiny']) {
  test(`ambiguous ${scenario} circle never passes or triggers correction`, async () => {
    const source = image(), raw = image();
    if (scenario === 'filled') fill(raw, 75, 40, 116, 81);
    else outline(raw, scenario === 'search-border' ? 30 : 95, 60, scenario === 'tiny' ? 5 : 41);
    if (scenario === 'open') fill(raw, 92, 39, 99, 45, [255, 255, 255, 255]);
    const report = await evaluate(source, raw, circleCheck, box);
    assert.notEqual(report.status, 'pass');
    const [{ scopedEditCorrectionFeedback }] = await api;
    if (report.status === 'uncertain') assert.equal(scopedEditCorrectionFeedback(report), '');
  });
}
for (const [name, gap, expected] of [
  ['valid', 30, 'pass'], ['lower tolerance', 20, 'pass'], ['upper tolerance', 40, 'pass'],
  ['below tolerance', 19, 'fail'], ['above tolerance', 41, 'fail'], ['no-op', 0, 'fail'],
  ['whole wire erased', 140, 'fail'],
]) {
  test(`disconnect ${name} preserves the horizontal source path`, async () => {
    const source = image(); fill(source, 20, 55, 160, 58);
    const raw = { ...source, data: new Uint8Array(source.data) };
    const start = gap === 140 ? 20 : 75;
    fill(raw, start, 55, start + gap, 58, [255, 255, 255, 255]);
    const report = await evaluate(source, raw, gapCheck, box);
    assert.equal(report.status, expected);
    assert.equal(report.checks[0].metrics.gapWidth, gap);
  });
}
test('disconnect two-outline wire is measured as one horizontal gap', async () => {
  const source = image(); fill(source, 20, 52, 160, 54); fill(source, 20, 61, 160, 63);
  const raw = { ...source, data: new Uint8Array(source.data) };
  fill(raw, 75, 50, 105, 65, [255, 255, 255, 255]);
  const report = await evaluate(source, raw, gapCheck, box);
  assert.equal(report.status, 'pass');
  assert.equal(report.checks[0].metrics.gapWidth, 30);
});
test('a visible gray wire column is not a second gap, but an actually erased column is',async()=>{
  const source=image();fill(source,20,55,160,58);
  const raw={...source,data:new Uint8Array(source.data)};
  fill(raw,75,55,105,58,[255,255,255,255]);
  fill(raw,35,55,36,58,[180,180,180,255]);
  const visible=await evaluate(source,raw,gapCheck,box);
  assert.equal(visible.status,'pass');
  assert.equal(visible.checks[0].metrics.gapWidth,30);
  fill(raw,70,47,73,55,[180,180,180,255]);
  assert.equal((await evaluate(source,raw,gapCheck,box)).status,'fail');
  fill(raw,70,47,73,55,[255,255,255,255]);
  fill(raw,35,55,36,58,[255,255,255,255]);
  const extraGap=await evaluate(source,raw,gapCheck,box);
  assert.equal(extraGap.status,'fail');
});
test('curved open U-contours support a measured gap without accepting source background as a gap',async()=>{
  const source=image();
  for(const shift of [0,7]){
    fill(source,40+shift,40,43+shift,85-shift);
    fill(source,40+shift,82-shift,140-shift,85-shift);
    fill(source,137-shift,40,140-shift,85-shift);
  }
  const search={x0:25,y0:35,x1:155,y1:100},check={...gapCheck,search};
  const unchanged=await evaluate(source,source,check,box);
  assert.equal(unchanged.status,'fail');
  assert.equal(unchanged.checks[0].metrics.gapWidth,0);
  const raw={...source,data:new Uint8Array(source.data)};
  fill(raw,75,70,105,90,[255,255,255,255]);
  const report=await evaluate(source,raw,check,box);
  assert.equal(report.status,'pass');assert.equal(report.checks[0].metrics.gapWidth,30);
  fill(raw,40,40,43,70,[255,255,255,255]);
  assert.equal((await evaluate(source,raw,check,box)).status,'fail');
});
test('disconnect search outside permission does not grant permission to erase there', async () => {
  const source = image(); fill(source, 20, 55, 160, 58);
  for (const start of [75, 35]) {
    const raw = { ...source, data: new Uint8Array(source.data) };
    fill(raw, start, 55, start + 30, 58, [255, 255, 255, 255]);
    const permission = { x0: 50, y0: 40, x1: 140, y1: 80 };
    const report = await evaluate(source, raw, gapCheck, permission);
    assert.equal(report.status, start === 75 ? 'pass' : 'fail');
    assert.equal(report.checks[0].metrics.clipped, start !== 75);
  }
});
for (const scenario of ['terminal-mark', 'remaining-contour-erased', 'multiple-gaps', 'edge-erasure']) {
  test(`disconnect rejects ${scenario} despite a plausible gap`, async () => {
    const source = image(); fill(source, 20, 55, 160, 58);
    const raw = { ...source, data: new Uint8Array(source.data) };
    fill(raw, 75, 55, 105, 58, [255, 255, 255, 255]);
    if (scenario === 'terminal-mark') fill(raw, 72, 48, 75, 63);
    if (scenario === 'remaining-contour-erased') {
      // Keep column occupancy while erasing one of two separated outlines.
      fill(source, 20, 65, 160, 67); fill(raw, 20, 65, 160, 67);
      fill(raw, 75, 65, 105, 67, [255, 255, 255, 255]);
      fill(raw, 25, 65, 60, 67, [255, 255, 255, 255]);
    }
    if (scenario === 'multiple-gaps') fill(raw, 125, 55, 130, 58, [255, 255, 255, 255]);
    if (scenario === 'edge-erasure') fill(raw, 20, 55, 35, 58, [255, 255, 255, 255]);
    const report = await evaluate(source, raw, gapCheck, box);
    assert.equal(report.status, 'fail');
    if (scenario === 'terminal-mark') assert.ok(report.checks[0].metrics.contourPixelsBeyond2px > 0);
    if (scenario === 'remaining-contour-erased') assert.ok(report.checks[0].metrics.missingPathPixels > 0);
  });
}
test('nonhorizontal and ambiguous source connections are uncertain', async () => {
  for (const variant of ['empty', 'interrupted', 'vertical', 'branched']) {
    const source = image();
    if (variant !== 'empty') fill(source, 20, 55, 160, 58);
    if (variant === 'interrupted') fill(source, 90, 55, 100, 58, [255, 255, 255, 255]);
    if (variant === 'vertical') fill(source, 40, 40, 43, 80);
    if (variant === 'branched') fill(source, 80, 45, 83, 55);
    const report = await evaluate(source, source, gapCheck, box);
    assert.equal(report.status, 'uncertain');
    assert.equal(report.checks[0].metrics.unsupportedSource, true);
    assert.deepEqual(report.checks[0].metrics.sourceSearch, gapCheck.search);
  }
});

for (const origin of [{ x: 10, y: 10 }, { x: -12, y: -9 }]) {
  test(`RAW origin (${origin.x},${origin.y}) maps cropped/padded actual PNG pixels at scale one`, async () => {
    const source = image(), originalRaw = image(); target(source, 30, 45); target(originalRaw, 80, 53);
    const raw = image(180 - origin.x, 130 - origin.y);
    for (let y = 0; y < raw.height; y++) for (let x = 0; x < raw.width; x++) {
      const sx = x + origin.x, sy = y + origin.y;
      if (sx >= 0 && sy >= 0 && sx < originalRaw.width && sy < originalRaw.height) {
        pixel(raw, x, y, originalRaw.data.subarray((sy * originalRaw.width + sx) * 4, (sy * originalRaw.width + sx) * 4 + 4));
      }
    }
    const report = await evaluate(source, raw, moveCheck, box, { origin });
    assert.equal(report.status, 'pass');
    assert.deepEqual(report.checks[0].metrics.rawBounds, { x0: 80, y0: 53, x1: 111, y1: 65 });
  });
}
test('missing RAW search coverage is uncertain rather than empty geometry', async () => {
  const source = image(), raw = image(110, 100); target(source, 30, 45); target(raw, 80, 53);
  const report = await evaluate(source, raw, moveCheck, box);
  assert.equal(report.status, 'uncertain');
});
test('hidden outside RGBA differences fail even when visible geometry passes', async () => {
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 80, 53);
  pixel(source, 2, 2, [13, 29, 41, 0]);
  const final = composite(source, raw, [box], { x: 0, y: 0 });
  pixel(final, 2, 2, [14, 29, 41, 0]);
  const report = await evaluate(source, raw, moveCheck, box, { final });
  assert.equal(report.checks[0].status, 'pass');
  assert.equal(report.status, 'fail');
  assert.equal(report.outsideRgbaChanged, 1);
  const [{ scopedEditCorrectionFeedback }] = await api;
  assert.equal(scopedEditCorrectionFeedback(report), '');
});
test('RAW success cannot certify an unchanged or different final PNG', async () => {
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 80, 53);
  const report = await evaluate(source, raw, moveCheck, box, { final: source });
  assert.equal(report.status, 'fail');
  assert.ok(report.composedRgbaChanged > 0);
  const [{ scopedEditCorrectionFeedback }] = await api;
  assert.equal(scopedEditCorrectionFeedback(report), '');
});
test('correction feedback carries numeric expectations and measured values only for measurable failure', async () => {
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 90, 53);
  const report = await evaluate(source, raw, moveCheck, box);
  const [{ scopedEditCorrectionFeedback }] = await api;
  const feedback = JSON.parse(scopedEditCorrectionFeedback(report));
  assert.equal(feedback.expected.dx, 50);
  assert.equal(feedback.expected.dy, 8);
  assert.equal(feedback.measured.dx, 60);
  assert.equal(feedback.box, 0);
  assert.equal(scopedEditCorrectionFeedback({ ...report, status: 'pass' }), '');
  assert.equal(scopedEditCorrectionFeedback({ ...report, status: 'uncertain' }), '');
  assert.equal(scopedEditCorrectionFeedback(null), '');
});
test('mixed measurable fail and uncertain report cannot authorize correction', async () => {
  const [{ scopedEditCorrectionFeedback }] = await api;
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 90, 53);
  const report = await evaluate(source, raw, moveCheck, box);
  const mixed = { ...report, checks: [...report.checks,
    { box: 1, kind: 'move', status: 'uncertain', metrics: {}, reasons: [], feedback: '' }] };
  assert.equal(scopedEditCorrectionFeedback(mixed), '');
  assert.equal(scopedEditCorrectionFeedback({ ...mixed, checks: [...report.checks, { status: 'unknown' }] }), '');
  assert.equal(scopedEditCorrectionFeedback({ ...mixed, checks: [...report.checks, null] }), '');
  assert.equal(scopedEditCorrectionFeedback({ ...mixed, checks: [{ ...report.checks[0], feedback: '' }] }), '');
});
test('validation enforces explicit per-box specs and returns independent copies', async () => {
  const [{ validateScopedEditChecks }] = await api;
  const input = structuredClone(circleCheck);
  const valid = validateScopedEditChecks([input], { width: 180, height: 130, rectangles: [box] });
  input.centers[0].x = 0; input.search.x0 = 0;
  assert.equal(valid[0].centers[0].x, 95);
  assert.equal(valid[0].search.x0, 10);
  for (const checks of [[], [moveCheck, moveCheck], [{ ...moveCheck, box: -1 }],
    [{ ...moveCheck, box: 1 }], [{ ...moveCheck, box: 0.5 }], [{ ...moveCheck, kind: 'prose' }],
    [{ ...moveCheck, search: undefined }], [{ ...moveCheck, search: { ...moveCheck.search, x0: 10.1 } }],
    [{ ...moveCheck, search: { ...moveCheck.search, x1: 181 } }],
    [{ ...moveCheck, search: { ...moveCheck.search, x1: 10 } }],
    [{ ...moveCheck, dx: NaN }], [{ ...moveCheck, dx: '50' }],
    [{ ...moveCheck, dy: undefined }], [{ ...moveCheck, dx: 0, dy: 0 }],
    [{ ...circleCheck, diameter: 0 }], [{ ...circleCheck, centers: [] }],
    [{ ...circleCheck, centers: [{ x: 20, y: 20 }] }],
    [{ ...circleCheck, centers: [{ x: Infinity, y: 60 }] }],
    [{ ...circleCheck, centers: [circleCheck.centers[0], circleCheck.centers[0]] }],
    [{ ...gapCheck, gap: 0 }], [{ ...gapCheck, gap: Infinity }],
    [{ ...gapCheck, gap: 150 }]]) {
    assert.throws(() => validateScopedEditChecks(checks, { width: 180, height: 130, rectangles: [box] }));
  }
  assert.throws(() => validateScopedEditChecks([moveCheck], { width: 0, height: 130, rectangles: [box] }));
  assert.throws(() => validateScopedEditChecks([moveCheck], { width: 180, height: 130, rectangles: [{ ...box, y0: -1 }] }));
  assert.throws(() => validateScopedEditChecks([moveCheck, moveCheck], { width: 180, height: 130, rectangles: [box, box] }));
});
test('PNG inputs reject shared memory, invalid bytes, dimensions and fractional origins', async () => {
  const [{ evaluateScopedEditPrecision }, codec] = await api;
  const source = image(), bytes = codec.encodeTestRgbaPng(source);
  const options = { sourcePng: bytes, rawPng: bytes, finalPng: bytes, rectangles: [box], checks: [moveCheck] };
  await assert.rejects(evaluateScopedEditPrecision({ ...options, sourcePng: new Uint8Array(new SharedArrayBuffer(bytes.length)) }));
  await assert.rejects(evaluateScopedEditPrecision({ ...options, rawPng: new Uint8Array([0, 1, 2]) }));
  await assert.rejects(evaluateScopedEditPrecision({ ...options, finalPng: codec.encodeTestRgbaPng(image(179, 130)) }));
  await assert.rejects(evaluateScopedEditPrecision({ ...options, origin: { x: 0.5, y: 0 } }));
});
test('async verification captures all input bytes, checks and permissions before yielding', async () => {
  const [{ evaluateScopedEditPrecision }, codec] = await api;
  const source = image(), raw = image(); target(source, 30, 45); target(raw, 80, 53);
  const sourcePng = codec.encodeTestRgbaPng(source), rawPng = codec.encodeTestRgbaPng(raw);
  const finalPng = codec.encodeTestRgbaPng(composite(source, raw, [box], { x: 0, y: 0 }));
  const rectangles = [{ ...box }], checks = [structuredClone(moveCheck)], origin = { x: 0, y: 0 };
  const pending = evaluateScopedEditPrecision({ sourcePng, rawPng, finalPng, rectangles, checks, origin });
  sourcePng.fill(0); rawPng.fill(0); finalPng.fill(0);
  rectangles[0].x0 = 0; checks[0].dx = 0; origin.x = 99;
  assert.equal((await pending).status, 'pass');
});
