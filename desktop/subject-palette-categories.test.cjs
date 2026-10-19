// 과목 팔레트: 숨기지 않은 오브젝트는 어느 과목 파트의 cats에든 들어 있어야 팔레트에 보인다.
// (templates.js 주석의 함정 — 카테고리 이름이 파트 cats와 글자까지 같아야 한다. 현대물리학 파트에 cats가 없어
//  에너지 준위·스펙트럼이 검색으로만 나오던 일을 막는다.)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');

test('숨기지 않은 오브젝트의 카테고리는 모두 과목 파트에 있다', () => {
  const subjects = read('subject-objects.js');
  const partCats = new Set([...subjects.matchAll(/cats:\s*\[([^\]]*)\]/g)]
    .flatMap(match => [...match[1].matchAll(/"([^"]+)"/g)].map(name => name[1])));
  const templates = read('templates.js');
  const block = templates.slice(templates.indexOf('export const TEMPLATES = {'), templates.indexOf('export function instantiate('));
  const missing = [];
  let checked = 0;
  for (const line of block.split('\n')) {
    const entry = line.match(/^\s*([a-z0-9_]+):\s*\{\s*kind:\s*"(\w+)",\s*category:\s*"([^"]+)"(,\s*hidden:\s*true)?/);
    if (!entry) continue;
    const [, id, , category, hidden] = entry;
    if (hidden || category === '공통' || category === '함수') continue;
    checked += 1;
    if (!partCats.has(category)) missing.push(`${id}(${category})`);
  }
  assert.ok(partCats.has('현대물리학'), '현대물리학 파트에 cats가 있어야 한다');
  assert.ok(checked > 100, `오브젝트 줄을 충분히 읽어야 한다(${checked})`);
  assert.deepEqual(missing, []);
});
