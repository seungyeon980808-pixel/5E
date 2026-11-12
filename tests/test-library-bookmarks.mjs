// 11-12: 라이브러리 별표(북마크) — 문항·쪽·파일 단위를 따로, 겹쳐도 되고, 위계 줄(파일 › 쪽 › 문항)을 만든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkLevel, bookmarkPath, isBookmarked, loadBookmarks, removeBookmark, toggleBookmark } from '../js/library/bookmarks.js';

const memory = () => { const map = new Map(); return { getItem: (k) => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) }; };
const question = { id: 'q1', kind: 'crop', cropType: 'question', title: '물리1 26년 9평 5번', metadata: { itemNumber: 5 }, provenance: { pageNumber: 1, documentId: 'd1', displayName: 'p1_2026_09.pdf' } };
const page = { id: 'pdf:d1:page:3', kind: 'pdf', title: 'p1_2026_09.pdf · 3쪽', provenance: { pageNumber: 3, documentId: 'd1' } };
const file = { id: 'pdf:d1', kind: 'pdf', title: 'p1_2026_09.pdf', provenance: { pageNumber: 1, documentId: 'd1' } };

test('levels: question, page, file', () => {
  assert.equal(bookmarkLevel(question), 'question');
  assert.equal(bookmarkLevel(page), 'page');
  assert.equal(bookmarkLevel(file), 'file');
  assert.equal(bookmarkLevel({ id: 'i', kind: 'image', title: 'a.png' }), 'file');
});

test('the same material can be bookmarked at several levels, newest first, and removed', () => {
  const storage = memory();
  assert.equal(toggleBookmark(file, { storage, now: 1 }).on, true);
  assert.equal(toggleBookmark(page, { storage, now: 2 }).on, true);
  assert.equal(toggleBookmark(question, { storage, now: 3 }).on, true);
  assert.deepEqual(loadBookmarks(storage).map((mark) => mark.level), ['question', 'page', 'file']);
  assert.equal(isBookmarked(page, storage), true);
  assert.equal(toggleBookmark(page, { storage }).on, false);
  assert.equal(isBookmarked(page, storage), false);
  assert.equal(removeBookmark('file:pdf:d1', storage), true);
  assert.deepEqual(loadBookmarks(storage).map((mark) => mark.key), ['question:q1']);
});

test('path shows the hierarchy with readable names', () => {
  const storage = memory();
  toggleBookmark(question, { storage }); toggleBookmark(page, { storage }); toggleBookmark(file, { storage });
  const byLevel = Object.fromEntries(loadBookmarks(storage).map((mark) => [mark.level, bookmarkPath(mark)]));
  assert.equal(byLevel.question, '물리1 26년 9평 › 1쪽 › 5번');
  assert.equal(byLevel.page, 'p1_2026_09 › 3쪽');
  assert.equal(byLevel.file, 'p1_2026_09');
});
