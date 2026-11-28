// 실험(11-22 변환 갈래, 선택 옵션 — 앱에 아직 연결하지 않음): 기출 그림 「로컬 먼저」 지우기(화면 없는 조각).
// 밤샘 실험 결과: 기출을 그림 AI로 통째 다시 그리면 글자 옆 선(빛 화살표·확대 원 잇는 선·치수선·층 회색)을 함께 지우는 일이 잦았다(16장 중 7장).
// 그래서 글자 읽기(이미 하는 호출)의 상자·지시선으로 원본 픽셀에서 글자·지시선만 지우고,
//  - 글자 상자 안에 진한 점이 문턱(기본 50%) 넘게 남거나(글자가 선에 붙어 못 지움)
//  - 지우지 못한 지시선이 있으면(글자 쪽 끝에서 선이 더 이어지는 것 = 지시선이 아닌 확대 잇는 선 등은 뺌)
// 그때만 그림 AI 다시 그리기를 하라고 알린다(needsRedraw). 그림 AI를 안 부르면 장당 크레딧이 글자 읽기 한 번 값만 든다.
import { snapReadItemsToGlyphInk, eraseBoxOf } from './ai-generated-label-snap.js?v=1.7.0-four-session-integration';
import { eraseLabelsAndLeaders } from './ai-label-leader-erase.js?v=1.7.0-four-session-integration';

export const EXAM_LOCAL_FIRST_DEFAULTS = Object.freeze({ threshold: 0.5, traceOptions: Object.freeze({ allowTargetBlob: true, allowTextBlob: true }), dark: 140 });

const lumaAt = (rgba, i) => rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;

/**
 * rgba는 제자리에서 지워진다(불투명 흰 바탕 그림).
 * @param {object[]} readItems parseLabelRead 결과(0~1 상자, leader)
 * @returns {{ items: object[], leaders: object[], residual: {text,r}[], maxResidual: number, keptLeaders: string[], needsRedraw: boolean, reason: string|null }}
 */
export function examLocalFirstErase(rgba, W, H, readItems = [], options = {}) {
  const o = { ...EXAM_LOCAL_FIRST_DEFAULTS, ...options };
  const before = new Uint8ClampedArray(rgba); // 사본(Buffer.slice는 같은 메모리를 봄)
  const snapped = snapReadItemsToGlyphInk(before, W, H, readItems);
  const boxes = snapped.map(item => ({ ...item, ...eraseBoxOf(item) }));
  const erased = eraseLabelsAndLeaders(rgba, W, H, boxes, o.traceOptions);
  const residual = boxes.map(it => {
    const x0 = Math.max(0, Math.floor((it.x - it.w * 0.1) * W)), x1 = Math.min(W, Math.ceil((it.x + it.w * 1.1) * W));
    const y0 = Math.max(0, Math.floor((it.y - it.h * 0.1) * H)), y1 = Math.min(H, Math.ceil((it.y + it.h * 1.1) * H));
    let a = 0, b = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * W + x) * 4; if (lumaAt(before, i) < o.dark) a++; if (lumaAt(rgba, i) < o.dark) b++; }
    return { text: it.text, r: a ? b / a : 0 };
  });
  const maxResidual = Math.max(0, ...residual.map(r => r.r));
  const keptLeaders = erased.leaders.filter(l => l.status === 'kept' && l.reason !== 'continues-at-text').map(l => l.text);
  const needsRedraw = maxResidual > o.threshold || keptLeaders.length > 0;
  const reason = maxResidual > o.threshold ? `글자 남음 ${residual.filter(r => r.r > o.threshold).map(r => r.text).join(', ')}` : keptLeaders.length ? `지시선 남음 ${keptLeaders.join(', ')}` : null;
  return { items: erased.items, leaders: erased.leaders, residual, maxResidual, keptLeaders, needsRedraw, reason };
}
