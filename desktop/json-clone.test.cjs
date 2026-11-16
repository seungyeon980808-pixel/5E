// jsonClone은 JSON.parse(JSON.stringify(x))와 같은 결과를 내고, 글자열은 같은 값을 함께 쓴다(되돌리기 기록의 큰 그림 data URL).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'js', 'json-clone.js')).href);

test('jsonClone은 JSON 왕복과 같은 결과를 낸다', async () => {
  const { jsonClone } = await load();
  const samples = [
    [{ id: 'a', type: 'rect', x: 1.5, y: -2, w: 3, h: 4, label: undefined, fn() {}, nan: NaN, inf: -Infinity, nested: { p: [1, undefined, () => 1, null, 'x'], deep: { z: true } } }],
    { kind: 'document', objects: [], guides: [{ id: 'g', axis: 'x', position: 0 }], artboard: { w: 90, h: 60 }, layers: [{ id: 1, visible: true }] },
    [new Date(0), { when: new Date(86400000) }, [[], {}], 0, -0, '', false],
    null, 3, 'text', [undefined],
  ];
  for (const value of samples) assert.deepEqual(jsonClone(value), JSON.parse(JSON.stringify(value)));
  assert.equal(jsonClone(undefined), undefined);
  assert.throws(() => jsonClone({ big: 1n }), TypeError);
});

test('jsonClone은 새 객체를 만들고 글자열은 그대로 함께 쓴다', async () => {
  const { jsonClone } = await load();
  const src = 'data:image/png;base64,' + 'A'.repeat(4096);
  const objects = [{ id: 'img', type: 'image', src, cutouts: [{ x: 1 }] }];
  const copy = jsonClone(objects);
  assert.notEqual(copy, objects); assert.notEqual(copy[0], objects[0]); assert.notEqual(copy[0].cutouts, objects[0].cutouts);
  assert.equal(copy[0].src, src);
  copy[0].cutouts[0].x = 9; assert.equal(objects[0].cutouts[0].x, 1, '고쳐도 원본은 그대로');
});
