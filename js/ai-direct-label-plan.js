// 11-10: 원본 그림 한 장을 AI에 보내 글자 묶음 목록을 받는 텍스트 전용 호출의 순수 로직.
// 브라우저·DOM 의존이 없어 Node 테스트에서 바로 돌린다. 캔버스 삽입은 createEditableImageLabelObjects가 한다.

export const LABEL_READ_PROMPT = `최우선 규칙: 글자는 그림에 보이는 그대로 옮긴다. 「스타이로폼」을 「스티로폼」으로 고치지 않는 것처럼, 맞춤법·띄어쓰기·외래어 표기를 절대 바꾸지 않는다.
이 시험 그림 속 글자 묶음을 모두 찾아 JSON 배열로만 답해. 다른 말은 쓰지 마.
각 항목: {"text": 원래 글자 그대로(첨자는 ₁ ² 같은 유니코드, 원문자는 ㉠ ⓐ처럼), "kind": "ko"(한글) | "en"(위치·사물 이름인 영어 대문자·소문자, 예: A, p) | "qty"(물리량 기호, 예: ρ₁, v, m) | "math"(숫자·단위·화학식, 예: 0.5 m, 22°C, H₂O(s)), "x","y","w","h": 글자만 감싸는 상자(그림 왼쪽 위 기준 0~1 비율), "leader": 이 글자에서 나가 다른 물체를 가리키는 지시선이 있으면 {"x1","y1": 글자 쪽 끝, "x2","y2": 가리키는 쪽 끝}(0~1 비율), 없으면 null}.
길이·각도를 나타내는 치수선이나 각도 호는 지시선이 아니다.`;

export const DIRECT_LABEL_KINDS = Object.freeze(['ko', 'en', 'qty', 'math']);
export const DIRECT_LABEL_MAX_ITEMS = 128;
const MAX_TEXT = 80;
const CHEMICAL_RE = /[A-Z][a-z]?[₀-₉]|\((s|l|g|aq)\)/;
const BARE_NUMBER_RE = /^[+−-]?\d+(?:[.,]\d+)*$/;

const clamp01 = value => Math.min(1, Math.max(0, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function normalizeLeader(value) {
  if (!value || typeof value !== 'object') return null;
  const keys = ['x1', 'y1', 'x2', 'y2'];
  if (!keys.every(key => finite(value[key]))) return null;
  return { x1: clamp01(value.x1), y1: clamp01(value.y1), x2: clamp01(value.x2), y2: clamp01(value.y2) };
}

// AI 답에서 JSON 배열을 꺼낸다. ```json 울타리와 앞뒤 군말을 견딘다. 못 읽으면 [].
export function parseLabelRead(text) {
  if (typeof text !== 'string') return [];
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('[');
  const end = unfenced.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let raw;
  try { raw = JSON.parse(unfenced.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const items = [];
  for (const value of raw) {
    if (items.length >= DIRECT_LABEL_MAX_ITEMS) break;
    if (!value || typeof value !== 'object') continue;
    const label = typeof value.text === 'string' ? value.text : '';
    if (!label.trim() || label.length > MAX_TEXT) continue;
    if (!DIRECT_LABEL_KINDS.includes(value.kind)) continue;
    if (!['x', 'y', 'w', 'h'].every(key => finite(value[key]))) continue;
    const x = clamp01(value.x), y = clamp01(value.y);
    const w = Math.min(clamp01(value.w), 1 - x), h = Math.min(clamp01(value.h), 1 - y);
    if (!(w > 0) || !(h > 0)) continue;
    items.push({ text: label, kind: value.kind, x, y, w, h, leader: normalizeLeader(value.leader) });
  }
  return items;
}

// 종류 → 라벨 글자 역할(LABEL_TYPOGRAPHY_ROLES, js/ai-label-typography.js).
export function directLabelRole(item) {
  if (item.kind === 'ko') return 'text';
  if (item.kind === 'en') return 'name';
  if (item.kind === 'qty') return 'quantity';
  if (CHEMICAL_RE.test(item.text)) return 'chemical';
  if (BARE_NUMBER_RE.test(item.text.trim())) return 'number';
  return 'unit';
}

// 읽은 항목 → createEditableImageLabelObjects 입력({ labels }). 좌표는 원본 그림 0~1 비율 그대로.
export function labelReadToEditablePlan(items) {
  const labels = (Array.isArray(items) ? items : []).slice(0, DIRECT_LABEL_MAX_ITEMS).map((item, index) => {
    const position = { x: item.x + item.w / 2, y: item.y + item.h / 2 };
    const leader = item.leader;
    return {
      id: 'L' + index,
      scope: 'general',
      contentMode: 'text',
      mode: leader ? 'leader' : 'text',
      text: item.text,
      position,
      anchor: leader ? { x: leader.x2, y: leader.y2 } : position,
      typography: { role: directLabelRole(item), bounds: { x: item.x, y: item.y, w: item.w, h: item.h } },
      // 11-10: 라벨마다 자기 원본 글자 상자 높이로 글자 크기를 정한다(상자 높이 × 0.85 ≈ 글자 높이, 그림 높이 비율).
      // sizeFromBox: 넣을 때 1.8~8mm로 자른다(createEditableImageLabelObjects).
      measuredSize: labelBoxFontRatio(item),
      sizeFromBox: true,
    };
  });
  return { labels };
}

export const LABEL_BOX_FONT_RATIO = 0.85;
// 글자 상자 높이(그림 높이 비율, 여러 줄이면 한 줄 높이) × 0.85. 상자 높이가 없으면 null.
export function labelBoxFontRatio(item) {
  const h = Number(item?.h ?? item?.typography?.bounds?.h);
  if (!(h > 0)) return null;
  const lines = Math.max(1, String(item?.text ?? item?.label?.text ?? '').split('\n').length);
  return (h / lines) * LABEL_BOX_FONT_RATIO;
}

// 라벨 글자 높이(mm): 읽은 상자 높이의 중앙값 × 그림 높이, 1.8~8mm로 자른다(ai-label-composite.js와 같은 범위).
// 읽은 항목이 없거나 그림 높이가 잘못되면 null(호출부 기본값 사용).
export function labelSizeMm(items, imageHeightMm) {
  if (!Array.isArray(items) || !items.length || !(imageHeightMm > 0)) return null;
  const heights = items.map(item => item.h).filter(finite).sort((a, b) => a - b);
  if (!heights.length) return null;
  const mid = Math.floor(heights.length / 2);
  const median = heights.length % 2 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2;
  return Math.min(8, Math.max(1.8, median * imageHeightMm));
}
