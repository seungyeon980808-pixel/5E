// 그림으로 만드는 그래프(1.8.0 옵션 엔진) ① 설계: 요청 → AI가 그래프 설계 JSON.
// image_generator pipeline/graph5e.cjs의 plan·conventionsFor·fixTick·curveYs·fixLabels를 옮겼다(open() 옛 5E 렌더는 뺌).
// AI는 주입받는다: ai.readText({ model, text, attachments, signal }) → { text } 또는 문자열.
// 이 파일은 DOM을 쓰지 않는다(node 단위 검사 가능).
import { compileExpr } from './expr.js?v=1.7.0-four-session-integration';

export const SUBJECT_NAMES = ['물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ', '물리학Ⅱ', '화학Ⅱ', '생명과학Ⅱ', '지구과학Ⅱ'];

// 코드 펜스·앞뒤 글이 섞인 AI 응답에서 JSON 하나를 꺼낸다(image_generator lib.cjs parseJson과 같음).
export function parseJson(text) {
  const t = String(text ?? '').replace(/```(json)?/g, '');
  const s = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? 1e9 : i; }));
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (s >= 1e9 || e < s) throw new Error('AI 응답에 JSON이 없습니다.');
  return JSON.parse(t.slice(s, e + 1));
}

export function abortError() {
  const error = new Error('AI 작업이 취소되었습니다.');
  error.name = 'AbortError'; error.code = 'ABORTED';
  return error;
}
export function throwIfAborted(signal) { if (signal?.aborted) throw abortError(); }

// 글 AI 부르기 + 다시 시도(계약 7절: textTries번). 취소는 다시 시도하지 않고 그대로 올린다.
export const isAbort = (e) => !!e && (e.name === 'AbortError' || e.code === 'ABORTED' || e.code === 'DIRECT_ABORTED');
export function makeReadText(ai, { model, signal, tries = 3 } = {}) {
  if (!ai || typeof ai.readText !== 'function') throw new Error('그래프 엔진에 AI 연결(ai.readText)이 없습니다.');
  return async (text, attachments = []) => {
    let last = null;
    for (let a = 1; a <= Math.max(1, tries); a++) {
      throwIfAborted(signal);
      try { const r = await ai.readText({ model, text, attachments, signal }); return typeof r === 'string' ? r : String(r?.text ?? ''); }
      catch (error) { if (isAbort(error) || signal?.aborted) throw isAbort(error) ? error : abortError(); last = error; }
    }
    throw last || new Error('AI 응답을 받지 못했습니다.');
  };
}

// 과목별 평가원 그래프 관례(assets/ai-graph/conventions.json): 요청에 낱말이 맞는 종류 2개까지 설계 지시문에 붙인다.
export function conventionsFor(request, conv) {
  if (!conv || typeof conv !== 'object') return '';
  const text = String(request ?? '');
  const hits = [];
  for (const [subj, list] of Object.entries(conv)) {
    for (const c of Array.isArray(list) ? list : []) {
      const n = (c.keywords || []).filter((k) => k && text.includes(k)).length;
      if (n) hits.push({ n, subj, c });
    }
  }
  hits.sort((a, b) => b.n - a.n);
  return hits.slice(0, 2).map((h) => `[평가원 관례: ${h.subj} ${h.c.name}]\n${h.c.rules}`).join('\n');
}

// image_generator graph5e.cjs plan()의 지시문 그대로.
export function planPrompt(request, keyValues, conventions = null) {
  const conv = conventionsFor(request, conventions);
  return `아래 그래프 요청을 5E 그래프 생성기용 설계 JSON 하나로만 바꾼다(설명 금지). 수학 좌표는 기준량을 1로 둔 무차원 값(예: t0=1, d=1, v0=1)으로 쓴다.
{"xMin":0,"xMax":숫자(마지막 눈금보다 조금 크게),"yMin":숫자,"yMax":숫자,
 "labelX":"가로축 이름(예: 시간, 반응 시간(s)) — 단위가 있으면 괄호로 붙이고 변수 기호는 넣지 않음","labelY":"세로축 이름(예: 위치, 농도(M))",
 "xTicks":[{"value":1,"label":"t_0"}],"yTicks":[{"value":4,"label":"4d"}],   // 아래첨자는 _ , 원점 0은 넣지 않음
 "series":[{"expr":"x에 대한 식(예: 4-0.5*(x-1)^2, 꺾은선은 points 사용)","points":null 또는 [[x,y],...],"domain":[시작,끝],"dashed":false,"thin":false,"smooth":false,"label":"A","labelAt":[x,y]}],   // thin=true는 등밀도선·등온선·기준선 같은 가는 보조선
 "xReverse":false,"yReverse":false,"xLog":false,"yLog":false,   // H-R도처럼 왼쪽이 큰 값이면 xReverse, 수심·지하 깊이처럼 아래로 갈수록 커지면 yReverse(가로축이 위로 감), 광도처럼 10배씩이면 yLog(값은 실제 값으로)
 "marks":[{"x":34,"y":4,"name":"A","style":"filled"}],   // 그래프 위의 점: filled(검은 점) | open(빈 원) | none(점 없이 이름만), name은 점 이름(없으면 "")
 "lineLabels":[{"text":"σ_t=26","x":35,"y":12}],   // 보조선 옆 작은 값 표시가 필요할 때만
 "guides":[{"x":1,"y":4}],   // 꼭짓점·교점 등에서 두 축으로 내리는 점선
 "notes":"가정한 점 한 줄"}
규칙: 곡선은 요청에 적힌 구간만 그리고(정의역), 곡선 끝이 서로 얽히거나 축 밖으로 나가지 않게 끝점을 정한다. 곡선 이름(label)은 곡선 바로 곁의 빈 자리에 둔다. 평가원 그래프처럼 눈금은 필요한 값만. 축 범위는 곡선·점이 있는 구간에 맞춘다: 자료가 0에서 멀면(예: 염분 33.5~36.5, 온도 300~400 K) xMin·yMin을 0이 아닌 값으로 두고 그 값도 눈금으로 넣는다(원점 0은 그때 표시하지 않는다). H-R도는 xReverse:true·yLog:true로 하고 주계열은 thin이 아닌 굵은 띠 대신 굵은 곡선 하나(series)로, 별은 marks로. 막전위·혈당·호르몬 농도·증기 압력처럼 자연스러운 곡선을 points로 줄 때는 smooth:true(꺾은선은 속도-시간처럼 실제로 꺾일 때만). 요청에 나온 점(수괴 A, 상태 P 등)은 marks로, 등밀도선처럼 여러 개의 보조선은 thin:true series로. 곡선 이름은 A, B, (가)처럼 짧은 이름만 — 「역학적 에너지 4E_0」 같은 설명·값은 곡선 이름에 넣지 않는다(값은 눈금으로). 분수 값은 \\frac{t_0}{2}처럼 쓴다. 축 이름은 띄어쓰기를 지켜 짧게(예: 중력 퍼텐셜 에너지). 곡선이 가로축 아래로 내려가 눈금 글자를 가로지르지 않게 범위를 정한다. 최댓값·점근선 같은 기준 높이는 굵은 곡선(series)으로 그리지 말고 guides나 눈금으로만 나타낸다(요청에 그 선을 그리라고 할 때만 series).
${conv ? conv + '\n' : ''}요청: ${request}
정확해야 할 값: ${keyValues || '(없음)'}`;
}

// 설계가 그릴 수 있는 모양인지(계약: 축 범위 숫자, 곡선 하나 이상)
export function isPlan(p) {
  return !!p && typeof p === 'object' && !Array.isArray(p) && ['xMin', 'xMax', 'yMin', 'yMax'].every((k) => Number.isFinite(+p[k])) && Array.isArray(p.series) && p.series.length > 0;
}

// ① 설계(AI). 응답이 설계 모양이 아니면 한 번 더 묻고, 그래도 아니면 code 'GRAPH_PLAN' 오류(계약 6절).
export async function plan(readText, request, keyValues = '', { conventions = null, tries = 2 } = {}) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try { last = parseJson(await readText(planPrompt(request, keyValues, conventions))); }
    catch (error) { if (isAbort(error)) throw error; if (error instanceof SyntaxError || /JSON/.test(error?.message || '')) { last = null; continue; } throw error; }
    if (isPlan(last)) return last;
  }
  const e = new Error('그래프 설계를 받지 못했습니다(응답이 설계 JSON이 아님).'); e.code = 'GRAPH_PLAN'; e.raw = last; throw e;
}

// 4사이클: 눈금 글자 고치기 — a/b는 가로 분수로, 대문자+아래첨자 하나(E_0)는 점 이름으로 오인돼 바로 서므로 {E}_0로 감싸 기울임 유지
export function fixTick(t) {
  let s = String(t ?? '').replace(/−/g, '-').trim();
  const neg = s.startsWith('-') ? (s = s.slice(1).trim(), '−') : '';
  const m = /^(.+?)\s*\/\s*(\d+)$/.exec(s);
  if (m && !/\\frac/.test(s)) s = `\\frac{${m[1]}}{${m[2]}}`;
  s = s.replace(/^([A-Z])(_\{?\d+\}?)$/, '{$1}$2');
  return neg + s;
}

// 설계의 곡선들이 x에서 갖는 y 값(꺾은선은 선분 보간, 식은 정의역 안에서만).
export function curveYs(p, x) {
  const ys = [];
  for (const s of p.series || []) {
    if (s.points && s.points.length > 1) {
      for (let i = 0; i + 1 < s.points.length; i++) {
        const [a, b] = [s.points[i], s.points[i + 1]];
        if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) ys.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
        else if (a[0] === x) ys.push(a[1]);
      }
    } else if (s.expr) {
      const d = s.domain || [p.xMin, p.xMax];
      if (x < d[0] - 1e-9 || x > d[1] + 1e-9) continue;
      try { ys.push(compileExpr(s.expr)(x)); } catch { /* 해석할 수 없는 식은 건너뜀 */ }
    }
  }
  return ys.filter(Number.isFinite);
}

// 옛 5E 그래프 객체 렌더용 글자 정리(원본 그대로). 그림 엔진 흐름에서는 prepare()를 쓰고 이것은 쓰지 않는다.
export function fixLabels(p) {
  const span = (p.yMax - p.yMin) || 1;
  p.guides = (p.guides || []).filter((g) => { if (!Number.isFinite(+g.x) || !Number.isFinite(+g.y)) return false; const ys = curveYs(p, +g.x); return !ys.length || ys.some((y) => Math.abs(y - g.y) < span * 0.03); });
  const room = (ax, mn, mx) => {
    const vs = (p[ax] || []).map((t) => +t.value).filter(Number.isFinite);
    const curvesMax = Math.max(...(p.series || []).flatMap((s) => (s.points ? s.points.map((q) => (ax === 'xTicks' ? q[0] : q[1])) : [])), -Infinity);
    const top = Math.max(...vs, ax === 'xTicks' ? -Infinity : curvesMax);
    if (Number.isFinite(top)) { const sp = p[mx] - p[mn]; if (p[mx] < top + sp * 0.18) p[mx] = top + sp * 0.2; }
  };
  room('xTicks', 'xMin', 'xMax'); room('yTicks', 'yMin', 'yMax');
  for (const k of ['xTicks', 'yTicks']) { p[k] = (p[k] || []).filter((t) => Math.abs(Number(t.value)) > 1e-9); p[k].forEach((t) => { t.label = fixTick(t.label); }); }
  // 축 이름 띄어쓰기: 5E 라벨러가 한글 사이 공백을 먹으므로 \; 로 바꿔 넣는다
  for (const k of ['labelX', 'labelY']) if (p[k] && !/\\;/.test(p[k])) p[k] = String(p[k]).trim().replace(/\s+/g, '\\;');
  return p;
}
