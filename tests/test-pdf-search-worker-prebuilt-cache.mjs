// 11-12: 라이브러리가 두 문서 묶음으로 번갈아 검색해도 일꾼이 미리 만든 색인을 지우지 않아, 열쇠만 받아 다시 쓴다
// (전에는 안 쓰는 색인을 바로 지워 검색마다 33MB를 다시 받았다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchWorkerController } from '../js/pdf-library/search-worker.js';

const source = (key, id) => ({ key, documents: [{ id, pageCount: 1 }], index: { schemaVersion: 'pdf-search-index-v1', entries: [] } });
const keyOnly = (key, id) => ({ key, documents: [{ id, pageCount: 1 }] });

test('alternating prebuilt sources are reused by key without a full resend', () => {
  const worker = createSearchWorkerController();
  worker.handle({ type: 'replace', documents: [], prebuilt: [source('a', 'doc-a')] });
  worker.handle({ type: 'replace', documents: [], prebuilt: [source('b', 'doc-b')] });
  assert.doesNotThrow(() => worker.handle({ type: 'replace', documents: [], prebuilt: [keyOnly('a', 'doc-a')] }));
  assert.doesNotThrow(() => worker.handle({ type: 'replace', documents: [], prebuilt: [keyOnly('b', 'doc-b')] }));
});

test('only a few recent prebuilt sources are kept; an evicted key asks for a full resend', () => {
  const worker = createSearchWorkerController();
  for (const key of ['a', 'b', 'c', 'd']) worker.handle({ type: 'replace', documents: [], prebuilt: [source(key, 'doc-' + key)] });
  assert.throws(() => worker.handle({ type: 'replace', documents: [], prebuilt: [keyOnly('a', 'doc-a')] }), /PREBUILT_MISSING/);
  assert.doesNotThrow(() => worker.handle({ type: 'replace', documents: [], prebuilt: [keyOnly('d', 'doc-d')] }));
});
