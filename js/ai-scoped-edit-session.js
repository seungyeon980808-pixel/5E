import { rectangleToBinaryMask } from './ai-scoped-edit.js';
import { decodeScopedPng, applyScopedPngEdit } from './ai-scoped-edit-png.js';

// Private byte snapshots must never be exposed as writable views.
const sessions = new WeakMap();
const proposals = new WeakMap();
const byteCopy = (value, label) => {
  if (!(value instanceof Uint8Array) || !value.length
    || (typeof SharedArrayBuffer !== 'undefined' && value.buffer instanceof SharedArrayBuffer)) {
    throw new TypeError(`${label} must be a nonempty, non-shared Uint8Array.`);
  }
  return new Uint8Array(value);
};
const sameBytes = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array
  && a.length === b.length && a.every((v, i) => v === b[i]);
function identity(value) {
  if (!value || typeof value.taskId !== 'string' || !value.taskId
    || typeof value.candidateId !== 'string' || !value.candidateId
    || !Number.isSafeInteger(value.epoch) || value.epoch < 0
    || !Number.isSafeInteger(value.selectionRevision) || value.selectionRevision < 0) {
    throw new TypeError('Task, candidate, epoch and selection revision are required.');
  }
  return Object.freeze({ taskId: value.taskId, candidateId: value.candidateId,
    epoch: value.epoch, selectionRevision: value.selectionRevision });
}
function stateOf(session) {
  const state = sessions.get(session);
  if (!state || state.phase === 'invalidated') throw new Error('Scoped session is invalid.');
  return state;
}
function checkCurrent(session, getCurrent) {
  const state = stateOf(session);
  if (typeof getCurrent !== 'function') throw new TypeError('Current-state reader is required.');
  const current = getCurrent();
  const live = identity(current);
  for (const key of Object.keys(state.identity)) {
    if (live[key] !== state.identity[key]) throw new Error(`Stale scoped edit: ${key} changed.`);
  }
  if (!sameBytes(state.source, current.sourcePng)) throw new Error('Stale scoped edit: source bytes changed.');
  return state;
}

/** Rectangles are already user-visible integer, half-open ORIGINAL PNG pixel bounds.
 * Percentages, point comments and reference-image coordinates are deliberately not inferred here.
 */
export async function createScopedEditSession(options) {
  const capturedIdentity = identity(options);
  const source = byteCopy(options.sourcePng, 'sourcePng');
  if (!Array.isArray(options.rectangles) || !options.rectangles.length) {
    throw new TypeError('At least one explicit pixel rectangle is required.');
  }
  // Capture before the first await so live comment mutations cannot leak into this request.
  const rectangles = options.rectangles.map(rect => {
    if (!rect || rect.coordinateSpace !== 'selected-result-pixels') {
      throw new TypeError('Only selected-result-pixels rectangles are accepted.');
    }
    return Object.freeze({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1,
      coordinateSpace: 'selected-result-pixels' });
  });
  const decoded = await decodeScopedPng(source);
  const mask = new Uint8Array(decoded.width * decoded.height);
  for (const rect of rectangles) {
    const part = rectangleToBinaryMask(decoded.width, decoded.height, rect);
    for (let i = 0; i < mask.length; i++) if (part[i]) mask[i] = 1;
  }
  const session = Object.freeze({ ...capturedIdentity, width: decoded.width, height: decoded.height,
    rectangles: Object.freeze(rectangles), allowedPixelCount: mask.reduce((a, v) => a + v, 0) });
  sessions.set(session, { identity: capturedIdentity, source, mask, phase: 'awaiting-confirmation' });
  return session;
}

export function confirmScopedEditSession(session, getCurrent) {
  const state = checkCurrent(session, getCurrent);
  if (state.phase !== 'awaiting-confirmation') throw new Error('Scope can only be confirmed once.');
  state.phase = 'confirmed';
}

/** Produces only a review proposal. It does not register, save, insert or replace any user image. */
export async function prepareScopedEditProposal(session, candidatePng, getCurrent) {
  const state = checkCurrent(session, getCurrent);
  if (state.phase !== 'confirmed') throw new Error('Confirm the allowed scope before preparing a proposal.');
  const candidate = byteCopy(candidatePng, 'candidatePng');
  const result = await applyScopedPngEdit(state.source, candidate, state.mask);
  const checked = checkCurrent(session, getCurrent);
  if (checked.phase !== 'confirmed') throw new Error('Scoped session changed while processing.');
  const png = byteCopy(result.png, 'result PNG');
  const proposal = Object.freeze({
    width: result.width, height: result.height, outsideUnchanged: result.outsideUnchanged,
    changedPixelCount: result.changedPixelCount,
    changedBounds: result.changedBounds ? Object.freeze({ ...result.changedBounds }) : null,
    removedMetadata: Object.freeze([...(result.removedMetadata || [])]),
    metadataDisposition: result.metadataDisposition || null,
    get previewPng() { return new Uint8Array(png); },
  });
  proposals.set(proposal, { owner: session, png, consumed: false });
  return proposal;
}

/** This is the only path that releases application bytes after explicit user acceptance. */
export function acceptScopedEditProposal(session, proposal, getCurrent) {
  const state = checkCurrent(session, getCurrent);
  const pending = proposals.get(proposal);
  if (state.phase !== 'confirmed' || !pending || pending.owner !== session || pending.consumed) {
    throw new Error('No unconsumed proposal belongs to this confirmed scope.');
  }
  pending.consumed = true;
  state.phase = 'accepted';
  return new Uint8Array(pending.png);
}
export function discardScopedEditProposal(session, proposal) {
  stateOf(session);
  const pending = proposals.get(proposal);
  if (!pending || pending.owner !== session || pending.consumed) throw new Error('Proposal is unavailable.');
  pending.consumed = true;
}
export function invalidateScopedEditSession(session) {
  const state = sessions.get(session);
  if (state) state.phase = 'invalidated';
}
