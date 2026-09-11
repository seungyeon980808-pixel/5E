import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../js/ai-workbench.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('  function cardFit(card) {'), source.indexOf('\n  function fitCardStage(card)'));
function fit({ multiple = false, result = true, generated = true } = {}) {
  const image = { naturalWidth: 600, naturalHeight: 800 };
  const stage = { querySelector: () => image };
  const card = { clientWidth: 700, clientHeight: 400, children: [stage], querySelector: () => stage, classList: { contains: () => generated } };
  return new Function('panel', 'results', 'getComputedStyle', `${body}; return cardFit;`)(
    { dataset: { aiResultView: multiple ? 'multiple' : 'single' } },
    { classList: { contains: () => result } },
    () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', gap: '0' }),
  )(card);
}
test('single generated result fills width beyond available height without distorting ratio', () => {
  const result = fit();
  assert.equal(result.height * result.ratio, 700);
  assert(result.height > 400);
});
test('multiple results and source comparison retain whole-image fit', () => {
  for (const options of [{ multiple: true }, { result: false }, { generated: false }]) {
    const result = fit(options);
    assert.equal(result.height, 400);
    assert.equal(result.height * result.ratio, 300);
  }
});
