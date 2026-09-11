import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskBridge } from '../js/ai-task-workspaces.js';

test('concurrent task bridges isolate events, sends and cancellation', async () => {
  const listeners = []; const calls = [];
  const base = {send: async p => calls.push(p), interrupt: async p => calls.push(p), onEvent: f => listeners.push(f)};
  const a = createTaskBridge(base, 'a'); const b = createTaskBridge(base, 'b');
  const received = [[], []]; a.onEvent(e => received[0].push(e)); b.onEvent(e => received[1].push(e));
  await Promise.all([a.send({text:'A'}), b.send({text:'B'})]); await a.interrupt();
  for (const f of listeners) { f({clientScope:'b', value:'B'}); f({clientScope:'a', value:'A'}); }
  assert.deepEqual(calls, [{text:'A',clientScope:'a'},{text:'B',clientScope:'b'},{clientScope:'a'}]);
  assert.deepEqual(received.map(items => items.map(i => i.value)), [['A'], ['B']]);
});
test('legacy workspace accepts unscoped events but a new workspace does not', () => {
  const listeners=[]; const base={onState:f=>listeners.push(f)}; const received=[];
  createTaskBridge(base, '').onState(e=>received.push('legacy'));
  createTaskBridge(base, 'other').onState(e=>received.push('other'));
  listeners.forEach(f=>f({state:'running'})); assert.deepEqual(received,['legacy']);
});
