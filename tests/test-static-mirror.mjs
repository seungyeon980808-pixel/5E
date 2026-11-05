// 11-05: 「5E 제공」 자료팩은 빠른 주소(정적 파일)에서 먼저 받고, 없거나 실패하면 게이트웨이로 넘어간다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticMirrorFetcher, staticMirrorPath, STATIC_MIRROR_BASE } from '../js/pdf-library/static-mirror.js';

const ROOT = 'https://gateway.example/v1/google-drive/folders/abc/public/';
const ok = (body) => new Response(body, { status: 200 });

test('only the pack metadata and past-exam PDFs are mirrored', () => {
  assert.equal(staticMirrorPath('pack.json'), 'pack.json');
  assert.equal(staticMirrorPath('search-index.json'), 'search-index.json');
  assert.equal(staticMirrorPath('기출문제/물리1/p1_2027_06.pdf'), '기출문제/물리1/p1_2027_06.pdf');
  assert.equal(staticMirrorPath('학력평가/물리1/x.pdf'), '학력평가/물리1/x.pdf');
  assert.equal(staticMirrorPath('교과서/교과서_중2.pdf'), '');
  assert.equal(staticMirrorPath('기출문제/기출확장_국영수사탐/a.pdf'), '');
});

test('mirrored files come from the static host; others and failures fall back to the gateway', async () => {
  const seen = [];
  const fetcher = async (url) => { seen.push(url); if (url.startsWith(STATIC_MIRROR_BASE) && url.includes('p1_2027_06')) return ok('static'); if (url.startsWith(STATIC_MIRROR_BASE)) return new Response('', { status: 404 }); return ok('gateway'); };
  const f = createStaticMirrorFetcher(ROOT, { fetcher });
  assert.equal(await (await f(ROOT + encodeURIComponent('기출문제') + '/' + encodeURIComponent('물리1') + '/p1_2027_06.pdf')).text(), 'static');
  assert.equal(await (await f(ROOT + 'catalog.json')).text(), 'gateway', 'a 404 on the static host falls back');
  assert.equal(await (await f(ROOT + encodeURIComponent('교과서') + '/a.pdf')).text(), 'gateway');
  assert.equal(await (await f('https://other.example/pack.json')).text(), 'gateway', 'other folders are untouched');
  assert.ok(seen.includes(STATIC_MIRROR_BASE + encodeURIComponent('기출문제') + '/' + encodeURIComponent('물리1') + '/p1_2027_06.pdf'));
});

test('the search index is joined from its parts', async () => {
  const fetcher = async (url) => {
    if (url === STATIC_MIRROR_BASE + 'search-index.json.parts.json') return ok(JSON.stringify({ parts: 2 }));
    if (url === STATIC_MIRROR_BASE + 'search-index.json.part0') return ok('{"a":');
    if (url === STATIC_MIRROR_BASE + 'search-index.json.part1') return ok('1}');
    return ok('gateway');
  };
  const f = createStaticMirrorFetcher(ROOT, { fetcher });
  assert.deepEqual(await (await f(ROOT + 'search-index.json')).json(), { a: 1 });
});
