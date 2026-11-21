// 그림 엔진(1.8.0) 라벨 힌트: 교사가 요청 글에 적은 라벨(기호·이름·값)을 뽑는다.
// 생성 결과에 labelHints로 실어 두면 화면이 「확정하고 라벨 살리기」(라벨 복원)의 글자 읽기 지시에 넘겨 잘못 읽기를 줄인다(시안 태그 29).
// AI를 부르지 않는 순수 함수. 놓친 라벨은 복원이 그림에서 읽으므로, 여기서는 「요청에 적힌 것」만 확실하게 뽑는다.

// 그림 라벨이 아닌 영문 낱말(도구·형식 이름 등).
const STOP = new Set(['AI', 'PNG', 'JPG', 'JPEG', 'SVG', 'PDF', 'GIF', 'UI', 'ID', 'OK', 'KICE', 'HWP', 'hwp', 'png', 'pdf', 'gpt', 'GPT', 'Luna', 'Sol', 'vs']);

// 따옴표 안 짧은 글은 그대로 라벨(‘6m’, 「㉠」, "n_A").
const QUOTED = /[‘'"“「『]([^‘’'"“”「」『』\n]{1,8})[’'"”」』]/gu;

// 한 토큰: 값+단위(2 m/s, 30°, 4 kg) → 원문자(㉠) → 기호(숫자 앞붙이 + 영문 1~2자 또는 그리스 1자 + 아래첨자·프라임).
const UNIT = '(?:m\\/s²|m\\/s\\^2|m\\/s|km\\/h|kg|cm|mm|km|°C|°|%)';
const TOKEN = new RegExp([
  `\\d+(?:\\.\\d+)?\\s?${UNIT}(?![A-Za-z])`,
  '[㉠-㉭]',
  '\\d*(?:\\.\\d+)?(?:[A-Za-z]{1,2}|[α-ωΑ-Ω])(?:_(?:\\{[^}\\s]{1,6}\\}|[0-9A-Za-z]+|[가-힣]+)|[₀-₉ₐ-ₜ]+)?′?\'?',
].join('|'), 'gu');

const isLatin = (ch) => /[A-Za-z0-9.]/u.test(ch || '');

function tokensOf(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN)) {
    const tok = m[0].trim();
    const before = text[m.index - 1];
    const after = text[m.index + m[0].length];
    // 더 긴 영문 낱말·단위(m/s의 m, s)의 일부는 라벨이 아니다.
    if (isLatin(before) || before === '/' || isLatin(after) || after === '/') continue;
    if (/^\d+(?:\.\d+)?$/u.test(tok)) continue;
    if (STOP.has(tok)) continue;
    // 한글 아래첨자 뒤에 붙은 조사(n_유리와 → n_유리)
    out.push(tok.replace(/(_[가-힣]{2,})(?:은|는|이|가|을|를|와|과|의|에|인|로|도|만)$/u, '$1'));
  }
  return out;
}

/**
 * 요청 글에 적힌 라벨 목록(나온 차례, 겹침 없음).
 * 예: 「A에는 m, B에는 2m을 표시」 → ['A', 'm', 'B', '2m'], 「경사각 θ」 → ['θ'].
 * @param {string} text
 * @returns {string[]}
 */
export function labelHintsFromRequest(text) {
  const s = String(text ?? '').normalize('NFC');
  if (!s.trim()) return [];
  const found = [];
  // 따옴표 글은 먼저 꺼내고 그 자리는 비워 같은 글을 두 번 세지 않게 한다(자리를 지켜 차례는 유지).
  const quoted = [];
  const rest = s.replace(QUOTED, (all, inner, offset) => {
    const v = inner.trim();
    if (v && !/\s/u.test(v)) quoted.push({ at: offset, v });
    return ' '.repeat(all.length);
  });
  for (const q of quoted) found.push({ at: q.at, v: q.v });
  let cursor = 0;
  for (const tok of tokensOf(rest)) {
    const at = rest.indexOf(tok, cursor);
    cursor = at >= 0 ? at + tok.length : cursor;
    found.push({ at: at >= 0 ? at : Infinity, v: tok });
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set();
  const list = [];
  for (const { v } of found) {
    if (seen.has(v)) continue;
    seen.add(v);
    list.push(v);
  }
  return list;
}

const REMOVE_VERB = /(지워|지우|빼|없애|삭제|제거|안 보이게|숨겨)/u;

/**
 * 고친 그림의 라벨 힌트: 처음 요청의 라벨에서 고치기 지시가 지우라는 것은 빼고, 넣으라는 것은 더한다.
 * 예: (원래 ['A','T','m'], 「T 라벨만 지워」) → ['A','m'].
 */
export function labelHintsAfterEdit(originalRequest, instruction) {
  const base = labelHintsFromRequest(originalRequest);
  const named = labelHintsFromRequest(instruction);
  if (!named.length) return base;
  if (REMOVE_VERB.test(String(instruction ?? ''))) return base.filter((v) => !named.includes(v));
  return [...base, ...named.filter((v) => !base.includes(v))];
}
