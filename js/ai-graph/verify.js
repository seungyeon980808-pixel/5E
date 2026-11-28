// 그림으로 만드는 그래프(1.8.0 옵션 엔진) ② 값 검사 ③ 다듬기.
// image_generator graphdraw/plan.cjs(E1 확정 계약 docs/5e-경계.md 6절)의 planFacts·verifyPlan·prepare와 같은 이름·모양. DOM을 쓰지 않는다.
import { curveYs, fixTick, parseJson, isPlan, isAbort } from './plan.js?v=1.7.0-four-session-integration';

// 설계 값 검사 지시문의 '실제 계산값' 줄들(AI 없음)
export function planFacts(p) {
  const at = (x) => curveYs(p, x).map((y) => +y.toFixed(4));
  return [
    ...(p.marks || []).map((m) => `점 ${m.name || '(이름 없음)'} (${m.x}, ${m.y}): 그 x에서 곡선 값 ${JSON.stringify(at(+m.x))}`),
    ...(p.xTicks || []).map((t) => `가로 눈금 ${t.label}(x=${t.value}): 곡선 값 ${JSON.stringify(at(+t.value))}`),
    ...(p.guides || []).map((g) => `보조선 점 (${g.x}, ${g.y}): 곡선 값 ${JSON.stringify(at(+g.x))}`),
  ];
}

export function verifyPrompt(request, keyValues, p) {
  return `그래프 설계 JSON을 검사한다. 아래 '실제 계산값'은 설계의 곡선 식을 컴퓨터로 계산한 것이다. 요청과 정확해야 할 값에 비추어 곡선 식·점 위치·눈금·보조선·곡선 이름 개수가 맞는지 따지고, 틀린 곳이 있으면 고친 설계 JSON 전체를, 맞으면 {"ok":true}만 답한다(설명 금지).
요청: ${request}
정확해야 할 값: ${keyValues || '(없음)'}
설계: ${JSON.stringify(p)}
실제 계산값:
${planFacts(p).join('\n') || '(없음)'}`;
}

// ② 설계 값 검사(AI): 고친 설계가 설계 모양(isPlan)일 때만 바꾼다. AI가 실패하거나 엉뚱한 답이면 앞 설계(changed:false, error).
// 취소는 그대로 올린다.
export async function verifyPlan(readText, request, keyValues, p) {
  let r;
  try { r = await readText(verifyPrompt(request, keyValues, p)); }
  catch (e) { if (isAbort(e)) throw e; return { plan: p, changed: false, error: e?.message || String(e) }; }
  let j = null;
  try { j = parseJson(r); } catch (e) { return { plan: p, changed: false, error: '검사 응답이 JSON이 아님' }; }
  return j && !j.ok && isPlan(j) ? { plan: j, changed: true } : { plan: p, changed: false };
}

// ③ 그리기 전 정리(AI 없음): 눈금 글자·핵심 값 표시, 마지막 눈금 뒤 여유, 곡선 위에 있지 않은 보조선 버림. 원본을 바꾸지 않음.
export function prepare(p0, keyValues) {
  const p = JSON.parse(JSON.stringify(p0));
  delete p.collisions;
  const clean = (s) => String(s ?? '').replace(/\\;/g, ' ');
  p.labelX = clean(p.labelX); p.labelY = clean(p.labelY);
  // 핵심 값 맞추기: 빼기 부호(− U+2212, fixTick이 바꿈)·더하기 부호·아래첨자 밑줄 차이로 핵심 눈금(예: −70)을 놓치지 않게 같은 꼴로 비교(E8)
  const keyForm = (s) => String(s).replace(/\\frac|[{}\\\s_]/g, '').replace(/[−–]/g, '-').replace(/^\+/, '');
  const keys = String(keyValues || p.keyText || '').split(/[,，、;\n]/).map(keyForm).filter(Boolean);
  const keyJoined = keys.join(',');
  for (const k of ['xTicks', 'yTicks']) {
    p[k] = (p[k] || []).filter((t) => Number.isFinite(+t.value) && Math.abs(+t.value) > 1e-9).map((t) => ({ ...t, value: +t.value, label: fixTick(t.label) }));
    p[k].forEach((t) => { const bare = keyForm(t.label); t.key = !!bare && (keys.includes(bare) || (bare.length > 1 && keyJoined.includes(bare))); });
  }
  const room = (ax, mn, mx) => {
    const vs = (p[ax] || []).map((t) => t.value);
    const top = Math.max(...vs, -Infinity);
    if (Number.isFinite(top)) { const span = p[mx] - p[mn]; if (p[mx] < top + span * 0.1) p[mx] = top + span * 0.12; }
  };
  room('xTicks', 'xMin', 'xMax'); room('yTicks', 'yMin', 'yMax');
  const span = (p.yMax - p.yMin) || 1;
  p.guides = (p.guides || []).filter((g) => Number.isFinite(+g.x) && Number.isFinite(+g.y))
    .filter((g) => { const ys = curveYs(p, +g.x); return !ys.length || ys.some((y) => Math.abs(y - g.y) < span * 0.03); });
  return p;
}
