// 11-21 사용자 확정(타협 불가): 수치+단위는 숫자·단위 모두 정자, 일반 물리량 기호만 기울임, 계수 붙은 기호는 기호만 기울임.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptLabelRuns } from '../js/ai-label-typography.js';

const roles = (t, r = 'text') => scriptLabelRuns(t, r).map((x) => `${x.role}:${x.text}`);

test('수치+단위는 통째로 정자(unit) — 묶음 단위 포함', () => {
  for (const t of ['3m', '60kg', '2s', '10N', '30°', '25°C', '5m/s', '9.8m/s²', '1g/cm³']) assert.deepEqual(roles(t), [`unit:${t}`], t);
  // 그림이 띄어 그렸어도 붙여 찍는다(11-21 확정: 숫자와 단위는 붙여 씀)
  for (const [t, want] of [['2 m', '2m'], ['60 kg', '60kg'], ['25 °C', '25°C'], ['0.1 M', '0.1M']]) assert.deepEqual(roles(t), [`unit:${want}`], t);
});
test('일반 물리량 기호·계수 붙은 기호는 기호만 기울임', () => {
  assert.deepEqual(roles('2h', 'quantity'), ['number:2', 'quantity:h']);
  assert.deepEqual(roles('v₀', 'quantity'), ['quantity:v', 'number:₀']);
  assert.deepEqual(roles('θ', 'quantity'), ['quantity:θ']);
});
test('물체 이름은 정자', () => { assert.deepEqual(roles('A'), ['name:A']); });
