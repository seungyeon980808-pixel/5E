import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptedCropResult, aiActionRecords, materializeLibraryAction } from '../js/unified-library-ui.js';

test('general AI materialization retains accepted pixels and provenance across files and pages', async () => {
  const acceptedAssets = new Map();
  const selectedRecords = new Map();
  for (const [documentId, pageNumber] of [['a', 1], ['a', 2], ['b', 1]]) {
    const canonical = { id: `${documentId}:${pageNumber}`, kind: 'page', provenance: { provider: 'pdf', documentId, pageNumber } };
    const result = acceptedCropResult(canonical, [0.1, 0.2, 0.3, 0.4], 1);
    const materialized = { dataUrl: `data:image/png;base64,${documentId}${pageNumber}`, source: { ...result.provenance } };
    acceptedAssets.set(result.id, { result, materialized });
    selectedRecords.set(result.id, result);
  }
  const provider = { materialize() { throw new Error('PDF result provenance is unavailable'); } };
  const records = aiActionRecords(selectedRecords, new Set(selectedRecords.keys()), null);
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.equal(await materializeLibraryAction(record, provider, { acceptedAssets }), acceptedAssets.get(record.id).materialized);
  }
  const first = records[0];
  await assert.rejects(materializeLibraryAction({ ...first, provenance: { ...first.provenance, pageNumber: 99 } }, provider, { acceptedAssets }), /provenance is unavailable/);
  await assert.rejects(materializeLibraryAction({ ...first, provenance: { ...first.provenance, rect: [0, 0, 1, 1] } }, provider, { acceptedAssets }), /provenance is unavailable/);
  acceptedAssets.delete(first.id);
  await assert.rejects(materializeLibraryAction(first, provider, { acceptedAssets }), /provenance is unavailable/);
});
