// JSON.parse(JSON.stringify(x))와 같은 결과를 내되, 글자열은 복사하지 않고 같은 것을 함께 쓴다.
// 그림(data URL, 수 MB)이 든 오브젝트를 되돌리기 기록에 담을 때마다 글자열을 통째로 문자열화·재해석하던 비용과
// 메모리를 없앤다(글자열은 바뀌지 않는 값이라 함께 써도 안전하다).
// 규칙은 JSON과 같다: undefined·함수·심볼 값은 객체에서 빠지고 배열에서는 null, NaN·Infinity는 null,
// toJSON이 있는 값(Date 등)은 그 결과를 쓴다.
export function jsonClone(value) {
  const out = cloneValue(value, true);
  return out === OMIT ? undefined : out;
}

const OMIT = Symbol("omit");

function cloneValue(value, top = false) {
  if (value === null) return null;
  switch (typeof value) {
    case "string": case "boolean": return value;
    case "number": return Number.isFinite(value) ? value + 0 : null; // -0도 JSON처럼 0
    case "undefined": case "function": case "symbol": return OMIT;
    case "bigint": throw new TypeError("Do not know how to serialize a BigInt");
  }
  if (typeof value.toJSON === "function") return JSON.parse(JSON.stringify(value));
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    for (let i = 0; i < value.length; i++) { const v = cloneValue(value[i]); out[i] = v === OMIT ? null : v; }
    return out;
  }
  if (value instanceof Number || value instanceof String || value instanceof Boolean) return JSON.parse(JSON.stringify(value));
  const out = {};
  for (const key of Object.keys(value)) { const v = cloneValue(value[key]); if (v !== OMIT) out[key] = v; }
  return out;
}
