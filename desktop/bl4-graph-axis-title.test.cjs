// B18(1.7.1): AI 그래프 복원 축 이름이 「주기주기(일)」처럼 낱말이 두 번 들어가면 한 번만 남긴다.
// 단위 중복만 지우던 것을 낱말 중복까지 넓힌다. 뜻이 다른 이름(「가가호호」 같은 정상 낱말)은 건드리지 않게
// 축 title과 같은 낱말이 연달아 두 번 나올 때만 줄인다.
const test = require('node:test');
const assert = require('node:assert/strict');

const plan = (x) => ({
  schema: '5e.graph-reconstruction/v1',
  source: { id: 'bl4', hash: 'bl4-axis-title', width: 600, height: 400, plotBox: { x: 20, y: 20, w: 500, h: 300 } },
  axes: {
    x: { scale: 'linear', min: 0, max: 40, step: 10, ticks: [], ...x },
    y: { scale: 'linear', title: '절대등급', unit: '', min: -6, max: -2, step: 1, ticks: [] },
  },
  series: [{ id: 'a', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: 0, y: -2 }, { x: 40, y: -6 }] }],
  annotations: [], review: [],
});
const opts = { box: { x: 10, y: 20, w: 100, h: 80 }, layerId: 'main' };

test('복원 축 이름: 같은 낱말이 연달아 두 번 들어가면 한 번만', async () => {
  const { buildNativeGraph } = await import('../js/graph/native-graph.js');
  const cases = [
    [{ title: '주기', unit: '일', displayTitle: '주기주기(일)' }, '주기(일)'],
    [{ title: '주기', unit: '일', displayTitle: '주기 주기 (일)' }, '주기 (일)'],
    [{ title: '주기주기', unit: '일' }, '주기 (일)'],
    [{ title: '주기', unit: '일', displayTitle: '주기(일)(일)' }, '주기(일)'],
    [{ title: '주기', unit: '일' }, '주기 (일)'],
    [{ title: '시간', unit: 's', displayTitle: '시간(s)' }, '시간(s)'],
    [{ title: '가가호호', unit: '' }, '가가호호'],
  ];
  for (const [axis, expected] of cases) {
    const built = buildNativeGraph(plan(axis), opts);
    assert.equal(built.ok, true, built.error);
    assert.equal(built.objects[0].labelX, expected, JSON.stringify(axis));
  }
});

test('설명으로 만든 그래프 축 이름도 같은 낱말 반복을 줄인다', async () => {
  const { descriptionAxisTitle } = await import('../js/graph/description-layout.js');
  assert.equal(descriptionAxisTitle({ title: '주기주기', unit: '일' }, 'x'), '주기(일)');
  assert.equal(descriptionAxisTitle({ title: '주기', displayTitle: '주기주기', unit: '일' }, 'x'), '주기(일)');
  assert.equal(descriptionAxisTitle({ title: '속력', unit: 'm/s' }, 'x'), '속력(m/s)');
  assert.equal(descriptionAxisTitle({ title: 'V_C', unit: 'V' }, 'x'), 'V_C(V)');
  assert.equal(descriptionAxisTitle({ title: '낙하 거리', unit: 'm' }), '낙하\n거리\n(m)');
});
