import assert from 'node:assert/strict';
import test from 'node:test';
import { readPageTextContent } from '../js/pdf-library/pdf-text-content.js';
test('text extraction reads a stream without async iteration and releases its reader', async () => {
  let released = false;
  const chunks = [{items:[{str:'자석'}],styles:{f:{}},lang:'ko'}, {items:[{str:'힘'}],styles:{}}];
  const page = { streamTextContent: () => ({getReader: () => ({read: async () => chunks.length ? {value:chunks.shift(),done:false} : {done:true},releaseLock: () => {released=true;}})}) };
  const result = await readPageTextContent(page);
  assert.deepEqual(result.items.map(i=>i.str), ['자석','힘']);
  assert.equal(result.lang,'ko'); assert.equal(released,true);
});
