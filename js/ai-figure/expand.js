// 그림 엔진(1.8.0) 구체화: 교사의 짧은 요청 → 평가원 관례로 빈칸을 채운 그림 요청(장면별). 지어내지 않고, 모르는 값은 기호로.
// 원본 image_generator pipeline/expand.cjs. AI가 답을 못 주거나 JSON이 깨져도 실패로 끝내지 않고 원래 요청 한 장면으로 이어 간다.
import { expandPrompt, expandPromptWithSearch } from './prompt.js';
import { tryParseJson } from './retrieve.js';

/** AI 응답 글 → 구체화 결과(장면이 없으면 원래 요청 하나). */
export function normalizeExpanded(parsed, request) {
  const j = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
  const scenes = Array.isArray(j.scenes) ? j.scenes.map((s) => String(s ?? '').trim()).filter(Boolean) : [];
  return {
    type: typeof j.type === 'string' ? j.type : '',
    graph: j.graph === true,
    scenes: scenes.length ? scenes : [request],
    keyValues: typeof j.keyValues === 'string' ? j.keyValues : '',
    notes: typeof j.notes === 'string' ? j.notes : '',
  };
}

// 11-22: 「A와 B를 나란히/비교해 그려」가 두 장면(두 장)으로 나뉘었다(생명 시험 b09 발효 비교·b19 힐·루벤 실험).
// 교사 요청이 한 그림에 함께 그리라는 말이면, AI가 장면을 나눠 답해도 한 장면으로 합쳐 한 장 안에 나란히 그린다.
const TOGETHER = /나란히|한\s*(장|그림|화면|판)\s*(에|안|으로)|양옆|좌우로|두\s*줄로|위아래로/u;
// 11-22 사용자: 「(도식) 다섯 개를 한번에 그려」가 한 장(다섯 칸)으로 합쳐졌다 — 「한번에·한꺼번에·모두·각각·따로」는 여러 장을 한 번에 그려 달라는 말.
// 이런 말이 있으면 교사가 「한 장에·나란히」라고 따로 쓰지 않은 한 합치지 않는다.
const MANY = /(\d+|두|세|네|다섯|여섯|일곱|여덟|아홉|열|여러)\s*(개|장|가지|컷)\s*(를|을|씩|다|모두)?\s*(한\s*번에|한꺼번에|모두|다|전부|각각|따로)|각각\s*(따로|한\s*장)|따로\s*따로|장씩/u;
const EXPLICIT_ONE = /한\s*(장|그림|판)\s*(에|안|으로)|나란히/u;
const ROWS = /두\s*줄|세\s*줄|위아래|윗줄|아랫줄/u;
const COMPARE = /비교(해|하여|하는|되게|할\s*수\s*있게)?\s*(서\s*)?(그려|그리|그림|나타내|보이)|비교\s*그림/u;
const PANEL_NAMES = /\([가나다라]\)/u;
/** 교사 요청이 「한 장 안에 나란히」인가. (가)(나)로 따로 그린 그림을 말하면 「비교」만으로는 합치지 않는다. */
export function wantsSideBySide(request) {
  const t = String(request || '');
  if (MANY.test(t) && !EXPLICIT_ONE.test(t)) return false;
  return TOGETHER.test(t) || (COMPARE.test(t) && !PANEL_NAMES.test(t));
}
const SIDE_NAMES = { 2: ['왼쪽', '오른쪽'], 3: ['왼쪽', '가운데', '오른쪽'] };
const ROW_NAMES = { 2: ['윗줄', '아랫줄'], 3: ['윗줄', '가운데 줄', '아랫줄'] };
/** 여러 장면 요청 → 한 장 안에 나란히 그리는 한 장면 요청. 교사가 두 줄·위아래라고 했으면 위에서 아래로. */
export function mergeSideBySide(scenes, request = '') {
  if (!Array.isArray(scenes) || scenes.length < 2) return scenes;
  const rows = ROWS.test(String(request || ''));
  const names = (rows ? ROW_NAMES : SIDE_NAMES)[scenes.length] || scenes.map((_, i) => `${i + 1}번째(${rows ? '위' : '왼쪽'}부터)`);
  return [`한 장의 그림 안에 다음 ${scenes.length}부분을 ${rows ? '위에서 아래로' : '왼쪽에서 오른쪽으로'} 나란히 그린다. 두 그림으로 나누지 않는다. 모든 부분은 같은 배율·선 굵기·글꼴로 그리고, 부분 사이에 테두리나 (가)(나) 같은 이름표를 넣지 않는다.\n`
    + scenes.map((s, i) => `${names[i]}: ${s}`).join('\n')];
}

/**
 * @param {{ request: string, subject?: string, context?: string, taxonomy: { types: string[] }, readText: (prompt: string) => Promise<string> }} args
 */
export async function expand({ request, subject = '', context = '', conversation = '', taxonomy, readText, withSearch = false, fix = {} }) {
  const text = await readText((withSearch ? expandPromptWithSearch : expandPrompt)({ request, subject, context, conversation, types: taxonomy?.types || [], fix }));
  const parsed = tryParseJson(text);
  const out = normalizeExpanded(parsed, request);
  // 실험(R6): 구체화가 낸 검색 조건(분류 AI 대신). 없으면 null → 엔진이 분류 AI로 돌아간다.
  if (withSearch && parsed && typeof parsed === 'object') {
    const types = [...new Set([parsed.type, ...(Array.isArray(parsed.types) ? parsed.types : [])].filter((t) => typeof t === 'string' && t))].slice(0, 3);
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map(String).filter(Boolean).slice(0, 8) : [];
    if (types.length || keywords.length) out.search = { subject: typeof parsed.subject === 'string' ? parsed.subject : subject, types, keywords, fromExpand: true };
  }
  if (out.scenes.length > 1 && wantsSideBySide(request)) return { ...out, scenes: mergeSideBySide(out.scenes, request), merged: true };
  return out;
}
