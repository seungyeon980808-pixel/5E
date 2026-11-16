// 라이브러리 목록이 스크롤·그림 칸 변화 때 문서 전체 스타일을 다시 계산하지 않게 지키는 정적 검사(2026-10-19 밤 성능 점검).
// :has(...[hidden]...)를 넓은 조상(body·라이브러리 창·결과 칸)에 걸면, 목록 안 어느 요소의 hidden이 바뀌어도 그 조상 아래 전체가 다시 계산된다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = file => fs.readFileSync(new URL(`../css/${file}`, import.meta.url), 'utf8');

test('library overlay state is mirrored into attributes instead of broad :has()', () => {
  const lib = css('unified-library.css');
  assert.doesNotMatch(lib, /\.unified-library-overlay:has\(/, 'overlay-level :has() re-styles the whole library on every thumbnail change');
  assert.doesNotMatch(lib, /\.unilib-results:has\(/);
  assert.doesNotMatch(lib, /\.unilib:has\(/);
  assert.match(lib, /\[data-crop-open="true"\]::after/);
  const ui = fs.readFileSync(new URL('../js/unified-library-ui.js', import.meta.url), 'utf8');
  assert.match(ui, /cropTrayOpen/); assert.match(ui, /cropOpen/);
});

test('body-level :has() only looks at direct children', () => {
  for (const file of fs.readdirSync(new URL('../css/', import.meta.url)).filter(f => f.endsWith('.css'))) {
    for (const m of css(file).matchAll(/(?<![\w-])body:has\(\s*([^)]*)\)/g)) assert.match(m[1], /^>/, `${file}: body:has(${m[1]}) must use a child combinator`);
  }
});

test('loading motion and range fill do not rewrite unchanged values', () => {
  const motion = fs.readFileSync(new URL('../js/loading/activity-visibility.js', import.meta.url), 'utf8');
  assert.match(motion, /if \(node\.dataset\.loadingMotion !== motion\)/);
  assert.match(motion, /if \(!all && !entry\.dirty && entry\.running === running\) continue;/);
  const range = fs.readFileSync(new URL('../js/range-fill.js', import.meta.url), 'utf8');
  assert.match(range, /getPropertyValue\('--ds-range-p'\) !== fill/);
  assert.match(range, /touchesRange/);
});
