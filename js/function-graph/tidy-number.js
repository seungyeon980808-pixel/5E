/* 11-07 G6: AI가 복원·생성한 그래프 식의 숫자는 소수 둘째 자리로 정리해서 넣는다.
 * 보이는 식 = 그려지는 식. 0.1보다 작은 0 아닌 수는 유효숫자 두 자리로 남겨 0이 되지 않게 한다.
 * 예: 0.2513274 → 0.25, 2.50 → 2.5, 0.0123456 → 0.012, -0.004567 → -0.0046.
 * 지수 표기(1e-7 등)는 식 해석기가 읽지 못하므로 늘 소수로 풀어 쓴다. */
const plain = text => {
  if (!/[eE]/.test(text)) return text;
  const [mantissa, exponent] = text.toLowerCase().split('e'), negative = mantissa.startsWith('-');
  const [whole, fraction = ''] = (negative ? mantissa.slice(1) : mantissa).split('.');
  const digits = whole + fraction, place = whole.length + Number(exponent);
  const body = place <= 0 ? '0.' + '0'.repeat(-place) + digits
    : place >= digits.length ? digits + '0'.repeat(place - digits.length)
    : digits.slice(0, place) + '.' + digits.slice(place);
  return (negative ? '-' : '') + body;
};

export function tidyGraphValue(value) {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;
  // 교과서 파동처럼 일부러 1/8 단위로 맞춘 값(0.125·0.375 등)은 그대로 둔다 — 반올림하면 오히려 다른 곡선이 된다.
  if (Math.abs(value * 8 - Math.round(value * 8)) < 1e-9) return Math.round(value * 8) / 8;
  const rounded = Math.abs(value) < 0.1 ? Number(value.toPrecision(2)) : Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : Number(rounded.toPrecision(15));
}

// 둘째 자리로 줄인 식이 원본 검사를 통과하지 못하면, 부르는 쪽이 이 함수를 써서 원래 정밀도로 한 번 더 맞춘다.
let precise = false;
export function withPreciseGraphNumbers(fn) {
  const previous = precise; precise = true;
  try { return fn(); } finally { precise = previous; }
}
export const preciseGraphNumbers = () => precise;

export function tidyGraphNumber(value) {
  if (!Number.isFinite(value)) throw Error('Nonfinite coefficient');
  return plain(String(tidyGraphValue(value)));
}

// 이미 만든 식 글자 속 소수만 둘째 자리로 바꾼다(정수·이름은 그대로). 바꾼 식은 부르는 쪽이 같은 검사를 다시 통과시킨 뒤에만 쓴다.
export function tidyExpressionNumbers(expression) {
  return String(expression).replace(/\d+\.\d+/g, text => tidyGraphNumber(Number(text)));
}
