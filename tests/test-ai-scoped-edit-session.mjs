import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';
import { createScopedEditSession, confirmScopedEditSession, prepareScopedEditProposal,
  acceptScopedEditProposal } from '../js/ai-scoped-edit-session.js';

function fixture() {
  const sourcePng = encodeTestRgbaPng({ width: 1, height: 1, data: Uint8Array.of(1, 2, 3, 4) });
  const candidatePng = encodeTestRgbaPng({ width: 1, height: 1, data: Uint8Array.of(9, 8, 7, 6) });
  const current = { taskId: 'task-a', candidateId: 'image-a', epoch: 1, selectionRevision: 1, sourcePng };
  return {
    current,
    candidatePng,
    getCurrent: () => current,
    options: {
      ...current,
      rectangles: [{ x0: 0, y0: 0, x1: 1, y1: 1, coordinateSpace: 'selected-result-pixels' }],
    },
  };
}

test('acceptance rejects live source state backed by concurrently mutable shared memory', async () => {
  const f = fixture();
  const session = await createScopedEditSession(f.options);
  confirmScopedEditSession(session, f.getCurrent);
  const proposal = await prepareScopedEditProposal(session, f.candidatePng, f.getCurrent);
  const sharedSource = new Uint8Array(new SharedArrayBuffer(f.current.sourcePng.length));
  sharedSource.set(f.current.sourcePng);
  f.current.sourcePng = sharedSource;
  assert.throws(() => acceptScopedEditProposal(session, proposal, f.getCurrent), /source bytes changed/);
});
