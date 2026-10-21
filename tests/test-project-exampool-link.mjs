// 5E_exam 문항과 이어진 그림 페이지(meta.exampoolLink)는 저장·불러오기 뒤에도 연결이 남아야 한다.
// 예전에는 불러올 때마다 지워져, 「5E 원본 편집」이 옛 원본으로 pool_ 페이지를 하나 더 만들었다(M44, 10-21).
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrate } from '../js/project-io.js';

const project = meta => ({ version: 1, pages: [{ id: 'pool_a', name: '그림', objects: [], guides: [], meta }], activePageId: 'pool_a' });

test('migrate keeps a valid exampoolLink', () => {
  const link = { questionId: '3f2b0c1e-8d7a-4f61-9a0b-2c4d5e6f7a8b', assetId: 'q12_fig_1' };
  const page = migrate(project({ number: '3', exampoolLink: link })).pages[0];
  assert.deepEqual(page.meta.exampoolLink, link);
});
test('migrate drops malformed exampoolLink values', () => {
  for (const bad of [{ questionId: '', assetId: 'a' }, { questionId: 'x', assetId: 'a b' }, { questionId: '<x>', assetId: 'a' }, 'x', null]) {
    assert.equal(migrate(project({ exampoolLink: bad })).pages[0].meta.exampoolLink, undefined);
  }
});
