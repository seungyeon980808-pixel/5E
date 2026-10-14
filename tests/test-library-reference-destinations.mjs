import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceDestinations } from '../js/library/reference-destinations.js';

test('mixed destinations preserve source indices and split only graph inputs', () => {
  assert.deepEqual(referenceDestinations(4, { groups: [[1, 0], [3, 2]], groupKinds: ['image', 'graph'] }), [
    { kind: 'image', indices: [1, 0] }, { kind: 'graph', indices: [3] }, { kind: 'graph', indices: [2] },
  ]);
});
test('legacy image grouping stays intact while graph imports are always individual', () => {
  assert.deepEqual(referenceDestinations(2, { placement: 'together' }), [{ kind: 'image', indices: [0, 1] }]);
  assert.deepEqual(referenceDestinations(2, { placement: 'together', conversionKind: 'graph' }), [
    { kind: 'graph', indices: [0] }, { kind: 'graph', indices: [1] },
  ]);
});
test('invalid or conflicting destination plans fail before any source import', () => {
  for (const options of [
    { groups: [[0]], groupKinds: [] }, { groups: [[0]], groupKinds: ['unknown'] },
    { groups: [[2]] }, { groups: [[0, 0]] }, { groups: [[]] },
    { groups: [[0], [0]], groupKinds: ['image', 'graph'] },
  ]) assert.throws(() => referenceDestinations(2, options));
  assert.throws(() => referenceDestinations(11, { placement: 'together' }), /최대 10개/);
  assert.equal(referenceDestinations(11, { placement: 'together', conversionKind: 'graph' }).length, 11);
});
