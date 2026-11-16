import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {MONTH,shortTitle,norm,splitWords,pastScore} from '../assets/exampool/sheet/past-search.js';
// 기출 목록 검색 순수 함수(리팩토링으로 card-editor.js에서 나옴) — 동작이 그대로인지 지킨다.
test('past search helpers keep the exam-library rules', () => {
  assert.equal(MONTH[11], '수능');
  assert.equal(shortTitle(2027, 6, '물리학Ⅱ', 2), '물리2 27년 6평 2번');
  assert.equal(shortTitle(2026, 11, '생명과학Ⅰ', 19), '생명1 26년 수능 19번');
  for (const month of [3, 4, 5, 7, 10]) {
    assert.equal(MONTH[month], `${month}월 학평`);
    assert.equal(shortTitle(2027, month, '물리학Ⅰ', 1), `물리1 27년 ${month}월 학평 1번`);
  }
  assert.equal(norm('ＡＢ c'), 'ab c');
  assert.deepEqual(splitWords(' 자석,질량 #운동량 '), ['자석', '질량', '운동량']);
  const item = { title: '2027학년도 6월 모평 물리학Ⅱ 2번', short: '물리2 27년 6평 2번', tags: ['행성운동'], text: '위성이 행성의 중력에 의해' };
  assert.equal(pastScore(item, ['행성운동']), 5);
  assert.equal(pastScore(item, ['물리2']), 8);
  assert.equal(pastScore(item, ['중력']), 1);
});

// OmO 작성 · 학평은 명시적으로 고를 때만 내려받고, 고른 월·과목과 원문이 일치한다.
test('학평은 선택한 뒤에만 읽고 월별 검색과 원문 연결을 보존한다', async t => {
  const paths = [];
  const fixture = {
    'index.json': { subjects: [['p1', '물리학Ⅰ', 1]], files: { 'p1_2027_06.pdf': '기출문제/물리1/p1_2027_06.pdf' }, cards: 'https://example.test/{id}.webp' },
    'p1.json': [['p1_2027_06_01', 2027, 6, 1, 1, [10, 20, 100, 200], 'p1_2027_06.pdf', [], [], 1, null, '모평 전자기파']],
    'hakpyeong/index.json': { subjects: [['p1', '물리학Ⅰ', 2]], cards: 'https://raw.githubusercontent.com/seungyeon980808-pixel/exam-search/main/cards/{id}.webp', files: { 'p1_2027_03.pdf': '학력평가/물리1/문제/p1_2027_03.pdf', 'p1_2027_10.pdf': '학력평가/물리1/문제/p1_2027_10.pdf' } },
    'hakpyeong/p1.json.gz': [
      ['p1_2027_03_01', 2027, 3, 1, 1, [11, 22, 101, 202], 'p1_2027_03.pdf', [], [], 1, null, '학평 전자기파', [[20, 40, 90, 150]]],
      ['p1_2027_10_02', 2027, 10, 2, 1, [13, 24, 103, 204], 'p1_2027_10.pdf', [], [], 1, null, '학평 빛'],
    ],
  };
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname.split('/convert/data/')[1];
    paths.push(path);
    const body=JSON.stringify(fixture[path]);
    return new Response(path.endsWith('.gz')&&body?gzipSync(body):body, { status: fixture[path] ? 200 : 404 });
  });
  const { loadPastQuestions } = await import('../assets/exampool/sheet/past-data.js?학평-지연');
  const initial = await loadPastQuestions();
  assert.deepEqual(initial.items.map(item => item.id), ['p1_2027_06_01']);
  assert.equal(paths.some(path => path.startsWith('hakpyeong/')), false);
  const march = await loadPastQuestions(['p1'], '3');
  assert.deepEqual(march.items.map(item => item.id), ['p1_2027_03_01']);
  assert.equal(march.items[0].publicPath, '학력평가/물리1/문제/p1_2027_03.pdf');
  assert.deepEqual(march.items[0].box, [11, 22, 101, 202]);
  assert.deepEqual(march.items[0].nativeImageBoxes, [[20, 40, 90, 150]]);
  assert.equal(march.items[0].card, 'https://raw.githubusercontent.com/seungyeon980808-pixel/exam-search/main/cards/p1_2027_03_01.webp');
  const all = await loadPastQuestions([], 'all');
  assert.deepEqual(new Set(all.items.map(item => item.id)), new Set(['p1_2027_06_01', 'p1_2027_03_01', 'p1_2027_10_02']));
});

test('학평 파일을 받지 못한 뒤 다시 고르면 재시도한다', async t => {
  let available = false;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname.endsWith('/index.json')) return new Response(JSON.stringify({ subjects: [['p1', '물리학Ⅰ', 1]], cards: 'https://example.test/{id}.webp', files: { 'p1_2027_03.pdf': '학력평가/물리1/문제/p1_2027_03.pdf' } }));
    return new Response(gzipSync(JSON.stringify([['p1_2027_03_01', 2027, 3, 1, 1, [10, 20, 100, 200], 'p1_2027_03.pdf', [], [], 0, null, '빛']])), { status: available ? 200 : 503 });
  });
  const { loadPastQuestions } = await import('../assets/exampool/sheet/past-data.js?학평-재시도');
  await assert.rejects(loadPastQuestions(['p1'], 'hakpyeong'), /기출 목록/);
  available = true;
  assert.equal((await loadPastQuestions(['p1'], 'hakpyeong')).items[0].text, '빛');
});
