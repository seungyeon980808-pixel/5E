import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScopedPngEdit, encodeScopedPng } from '../js/ai-scoped-edit-png.js';
import { compositeRgbaWithinMask } from '../js/ai-scoped-edit.js';
import { createScopedEditSession, confirmScopedEditSession, prepareScopedEditProposal,
  acceptScopedEditProposal, invalidateScopedEditSession } from '../js/ai-scoped-edit-session.js';
import { runScopedPanelEdit } from '../js/ai-panel.js';
import { encodeTestRgbaPng, decodeTestPng } from './helpers/box-edit-png-fixture.mjs';

function fixture() {
  const width = 48, height = 32, data = new Uint8Array(width * height * 4).fill(255);
  const source = { width, height, data };
  const paint = (x, y, rgba) => data.set(rgba, (y * width + x) * 4);
  // Asymmetric stationary linework outside the editable rectangle, on both axes.
  for (let y = 3; y < 9; y++) for (let x = 3; x < 11; x++) paint(x, y, [0, 0, 0, 255]);
  for (let y = 22; y < 28; y++) for (let x = 35; x < 42; x++) paint(x, y, [60, 60, 60, 255]);
  paint(1, 29, [100, 20, 80, 0]); // Hidden RGB must also survive exactly.
  const rectangles = [{ x0: 16, y0: 12, x1: 30, y1: 25 }];
  return { source, rectangles, sourcePng: encodeTestRgbaPng(source, 4) };
}
function maskFor(source, rectangles) {
  const mask = new Uint8Array(source.width * source.height);
  for (const r of rectangles) for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) mask[y * source.width + x] = 1;
  return mask;
}
function candidateFor(source, width = source.width, height = source.height, transform = (x, y) => [x, y]) {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [sx, sy] = transform(x, y);
    if (sx >= 0 && sx < source.width && sy >= 0 && sy < source.height) {
      data.set(source.data.subarray((sy * source.width + sx) * 4, (sy * source.width + sx) * 4 + 4), (y * width + x) * 4);
    }
  }
  data.set([12, 34, 56, 99], (15 * width + 20) * 4);
  return { width, height, data };
}
function assertComposite(source, candidate, mask, png) {
  // Independent zlib PNG decoder and independent pixel selection oracle.
  const result = decodeTestPng(png);
  assert.equal(result.width, source.width); assert.equal(result.height, source.height);
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const i = y * source.width + x, s = i * 4;
    const expected = mask[i] ? candidate.data.subarray((y * candidate.width + x) * 4, (y * candidate.width + x) * 4 + 4) : source.data.subarray(s, s + 4);
    assert.deepEqual(result.data.subarray(s, s + 4), expected, `RGBA at ${x},${y}`);
  }
}
const codeIs = code => error => error.code === code;

test('all eight 1px right/bottom crop or extension combinations preserve original canvas and exact mask pixels', async () => {
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
    if (!dx && !dy) continue;
    const f = fixture(), mask = maskFor(f.source, f.rectangles);
    const candidate = candidateFor(f.source, f.source.width + dx, f.source.height + dy);
    const raw = encodeTestRgbaPng(candidate, 3), sourceBefore = f.sourcePng.slice(), rawBefore = raw.slice();
    const result = await applyScopedPngEdit(f.sourcePng, raw, mask);
    assert.equal(result.geometry.kind, 'verified-border-only'); assert.equal(result.outsideUnchanged, true);
    assert.equal(result.changedPixelCount, 1);
    assertComposite(f.source, candidate, mask, result.png);
    assert.deepEqual(f.sourcePng, sourceBefore); assert.deepEqual(raw, rawBefore);
  }
});
test('overlapping boxes use their union and preserve hidden RGB and alpha outside', async () => {
  const f = fixture(), mask = maskFor(f.source, [...f.rectangles, {x0: 18, y0: 14, x1: 33, y1: 26}]);
  const candidate = candidateFor(f.source, 47, 31);
  candidate.data.set([220, 99, 12, 0], (24 * 47 + 32) * 4);
  const result = await applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidate), mask);
  assert.equal(result.changedPixelCount, 2); assertComposite(f.source, candidate, mask, result.png);
});
test('any missing allowed pixel on either border is blocked', async () => {
  for (const [width, height, rect] of [[47, 32, {x0: 47,y0: 0,x1: 48,y1: 1}], [48, 31, {x0: 0,y0: 31,x1: 1,y1: 32}]]) {
    const f = fixture(), mask = maskFor(f.source, [...f.rectangles, rect]);
    await assert.rejects(applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidateFor(f.source, width, height)), mask), codeIs('SCOPED_EDIT_MISSING_ALLOWED_PIXELS'));
  }
});
test('a 1px translation in each direction is rejected rather than automatically registered', async () => {
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const f = fixture(), candidate = candidateFor(f.source, 47, 31, (x,y) => [x+dx,y+dy]);
    await assert.rejects(applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidate), maskFor(f.source, f.rectangles)), codeIs('SCOPED_EDIT_ALIGNMENT_UNCONFIRMED'));
  }
});
test('resampled geometry is rejected even though dimensions differ by only one pixel', async () => {
  const f = fixture(), candidate = candidateFor(f.source, 47, 31, (x,y) => [Math.round(x*48/47),Math.round(y*32/31)]);
  await assert.rejects(applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidate), maskFor(f.source, f.rectangles)), codeIs('SCOPED_EDIT_ALIGNMENT_UNCONFIRMED'));
});
test('a single outside RGBA channel change, including invisible RGB, makes alignment inconclusive', async () => {
  for (const [x,y,channel] of [[0,0,3],[1,29,0],[3,3,2]]) {
    const f = fixture(), candidate = candidateFor(f.source, 47, 32);
    candidate.data[(y*47+x)*4+channel] ^= 1;
    await assert.rejects(applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidate), maskFor(f.source, f.rectangles)), codeIs('SCOPED_EDIT_ALIGNMENT_UNCONFIRMED'));
  }
});
test('flat or fully transparent backgrounds cannot establish border alignment', async () => {
  for (const alpha of [0,255]) {
    const f = fixture(); f.source.data.fill(255);
    for (let i = 3; i < f.source.data.length; i += 4) f.source.data[i] = alpha;
    const candidate = candidateFor(f.source, 47, 32);
    await assert.rejects(applyScopedPngEdit(encodeTestRgbaPng(f.source), encodeTestRgbaPng(candidate), maskFor(f.source, f.rectangles)), codeIs('SCOPED_EDIT_ALIGNMENT_UNCONFIRMED'));
  }
});
test('differences exceeding one pixel and invalid masks still fail closed', async () => {
  const f = fixture(), mask = maskFor(f.source, f.rectangles);
  for (const [width,height] of [[46,32],[48,34]]) {
    await assert.rejects(applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidateFor(f.source,width,height)), mask), codeIs('SCOPED_EDIT_DIMENSIONS'));
  }
  mask[0] = 2;
  await assert.rejects(applyScopedPngEdit(f.sourcePng, encodeTestRgbaPng(candidateFor(f.source,47,32)), mask), /binary|0 or 1/i);
});
test('metadata incompatibility is rejected before border adaptation', async () => {
  const f = fixture(), profiled = await encodeScopedPng(f.source, {metadata:[{type:'sRGB',data:Uint8Array.of(0)}]});
  await assert.rejects(applyScopedPngEdit(profiled, encodeTestRgbaPng(candidateFor(f.source,47,32)), maskFor(f.source,f.rectangles)), /color-profile/);
});
test('same-size behavior and generic strict compositor remain unchanged', async () => {
  const f = fixture(), mask = maskFor(f.source,f.rectangles), candidate = candidateFor(f.source);
  candidate.data[0] = 123; // Same-size raw outside edits are still discarded by composition.
  const result = await applyScopedPngEdit(f.sourcePng,encodeTestRgbaPng(candidate),mask);
  assert.equal(result.geometry.kind,'same-size'); assertComposite(f.source,candidate,mask,result.png);
  assert.throws(()=>compositeRgbaWithinMask(f.source,candidateFor(f.source,47,32),mask),/dimensions/);
});
test('candidate and mask mutations after invocation do not affect adaptation', async () => {
  const f = fixture(), mask = maskFor(f.source,f.rectangles), candidate = candidateFor(f.source,47,32), raw = encodeTestRgbaPng(candidate);
  const pending = applyScopedPngEdit(f.sourcePng,raw,mask);
  raw.fill(0); mask.fill(1);
  assertComposite(f.source,candidate,maskFor(f.source,f.rectangles),(await pending).png);
});
test('adapted session remains immutable, single-use and invalidated while processing', async () => {
  const f = fixture(), candidate = encodeTestRgbaPng(candidateFor(f.source,47,32));
  const current = {taskId:'t',candidateId:'c',epoch:1,selectionRevision:0,sourcePng:f.sourcePng};
  const options = {...current,rectangles:f.rectangles.map(r=>({...r,coordinateSpace:'selected-result-pixels'}))};
  const session = await createScopedEditSession(options); confirmScopedEditSession(session,()=>current);
  const proposal = await prepareScopedEditProposal(session,candidate,()=>current);
  assert.equal(proposal.geometry.kind,'verified-border-only'); assert(Object.isFrozen(proposal.geometry));
  assert.throws(()=>{proposal.geometry.kind='same-size';},TypeError);
  const bytes = acceptScopedEditProposal(session,proposal,()=>current);
  assert.equal(decodeTestPng(bytes).width,48);
  assert.throws(()=>acceptScopedEditProposal(session,proposal,()=>current),/unconsumed/);
  const cancelled = await createScopedEditSession(options); confirmScopedEditSession(cancelled,()=>current);
  const pending = prepareScopedEditProposal(cancelled,candidate,()=>current);
  invalidateScopedEditSession(cancelled); await assert.rejects(pending,/invalid/);
});
test('panel adapted candidate requires review; cancellation and late or stale state never register', async () => {
  for (const mode of ['accept','cancel-review','late-cancel','stale-review']) {
    const f = fixture(), candidate = candidateFor(f.source,47,32), calls = [];
    let cancelled = false, accepted;
    const current = {taskId:'t',candidateId:'c',epoch:1,selectionRevision:0,sourcePng:f.sourcePng};
    const options = {getCurrent:()=>{if(cancelled)throw new DOMException('Cancelled','AbortError');return current;},
      comments:[{type:'area',imageId:'c',x:100*16/48,y:100*12/32,w:100*14/48,h:100*13/32}],
      confirmBounds:async()=>true,
      generate:async()=>{calls.push('generate');if(mode==='late-cancel')cancelled=true;return encodeTestRgbaPng(candidate);},
      review:async p=>{calls.push('review');assert.equal(p.geometry.kind,'verified-border-only');if(mode==='stale-review')current.epoch++;return mode!=='cancel-review';},
      register:async bytes=>{calls.push('register');accepted=bytes;}};
    if(['late-cancel','stale-review'].includes(mode)) await assert.rejects(runScopedPanelEdit(options),/Cancelled|Stale/);
    else assert.equal(await runScopedPanelEdit(options),mode==='accept');
    if(mode==='accept') assertComposite(f.source,candidate,maskFor(f.source,f.rectangles),accepted);
    else assert.equal(accepted,undefined);
    if(mode==='late-cancel')assert.equal(calls.includes('review'),false);
  }
});
