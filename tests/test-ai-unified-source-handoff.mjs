import assert from 'node:assert/strict';
import test from 'node:test';

import { createUnifiedAiSourceConsumer } from '../js/ai-panel.js';
import { openPdfReferencePicker, registerPdfReferencePicker } from '../js/pdf-library/reference-picker.js';

test('Given the AI library entry, when unified selection completes, then it opens once with only the AI consumer', async () => {
  const calls = [];
  const added = [];
  const statuses = [];
  const unregister = registerPdfReferencePicker(async options => {
    calls.push(options);
    options.onAdd({ name: 'cropped', data: 'data:image/png;base64,EXACT', sourceKind: 'pdf-library', source: { rect: [0, 0, 1, 1] } });
    options.onStatus('selected', 'ok');
  });
  const consumer = createUnifiedAiSourceConsumer({
    addReferencesAsTasks: references => added.push(references),
    setStatus: (...args) => statuses.push(args),
  });

  await openPdfReferencePicker(consumer);
  unregister();

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['onAdd', 'onAddMany', 'onStatus']);
  assert.deepEqual(added, [[{ name: 'cropped', data: 'data:image/png;base64,EXACT', sourceKind: 'pdf-library', source: { rect: [0, 0, 1, 1] } }]]);
  assert.deepEqual(statuses, [['selected', 'ok']]);
});

 test('multiple cropped references retain order and the selected workspace placement', () => {
 const calls = [];
 const consumer = createUnifiedAiSourceConsumer({ addReferencesAsTasks: (...args) => calls.push(args), setStatus() {} });
 const references = [{ name: 'first', data: 'a' }, { name: 'second', data: 'b' }];
 consumer.onAddMany(references, { placement: 'together' });
 assert.deepEqual(calls, [[references, { placement: 'together' }]]);
 });
