import { EXAM_STYLE } from './exam-style.js?v=1.7.0-four-session-integration';

const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const positive = n => Number.isFinite(n) && n > 0;

// Rebuild scientific geometry from the new plan while keeping the user's
// presentation edits. An explicitly changed plan style wins over its baseline.
// request(교사의 수정 요청 글)를 주면, 요청이 실제로 말한 스타일만 바꾼다. 모델이 굵기·화살 길이 숫자를 조금 다르게
// 다시 적어도(0.357→0.35, 화살 1.45배) 요청에 없으면 이전 값을 지킨다. request가 없으면 예전처럼 계획의 값을 따른다.
const STYLE_WORDS={stroke:/굵|두께|얇게|두껍|선\s*폭/,arrow:/화살/,marker:/점\s*크기|마커|표시점|점을\s*(크|작)/,font:/글자|글씨|폰트|활자/};
export function preserveDescriptionPresentation(objects, plan, previous, request) {
  const asked=key=>request===undefined||STYLE_WORDS[key].test(String(request));
  const plane = objects.find(o=>o.type==='coordplane');
  const oldPlane = previous?.objects?.find(o=>o.type==='coordplane');
  if (!plane || !oldPlane?.graphStyle?.descriptionLayout) return;
  for (const key of ['labelScale','arrowScale','arrowWidthScale','strokeScale']) {
    if (positive(oldPlane.graphStyle[key])) plane.graphStyle[key]=oldPlane.graphStyle[key];
  }
  const oldStyle=previous.plan?.style || {}, style=plan.style || {};
  if (asked('font') && positive(style.fontSizePx) && style.fontSizePx !== oldStyle.fontSizePx) {
    plane.graphStyle.labelScale *= style.fontSizePx/(positive(oldStyle.fontSizePx) ? oldStyle.fontSizePx : 26);
  }
  if (asked('arrow') && positive(plan.frame?.arrowLength) && plan.frame.arrowLength !== previous.plan?.frame?.arrowLength) {
    plane.graphStyle.arrowScale = plan.frame.arrowLength/EXAM_STYLE.arrowLength;
  }
  plane.axisLabelScale=plane.tickLabelScale=plane.graphStyle.labelScale;
  if (style.labelWeight === oldStyle.labelWeight) plane.labelWeight=oldPlane.labelWeight;
  for (const axis of ['x','y']) {
    const upper=axis.toUpperCase();
    if (equal(plan.axes[axis]?.titlePosition,previous.plan?.axes?.[axis]?.titlePosition)) {
      for (const key of [`label${upper}Pos`,`label${upper}Offset`,`label${upper}Anchor`]) {
        if (oldPlane[key] !== undefined) plane[key]=structuredClone(oldPlane[key]);
      }
    }
    if (equal(plan.axes[axis]?.ticks,previous.plan?.axes?.[axis]?.ticks) && oldPlane[`tickOff${upper}`]) {
      plane[`tickOff${upper}`]=structuredClone(oldPlane[`tickOff${upper}`]);
    }
  }
  for (const series of objects.filter(o=>o.type==='funcgraph')) {
    const id=series.reconstruction?.seriesId;
    const next=plan.series.find(s=>s.id===id);
    const baseline=previous.plan?.series?.find(s=>s.id===id);
    const old=previous.objects.find(o=>o.type==='funcgraph' && o.reconstruction?.seriesId===id);
    if (!next || !baseline || !old) continue;
    if (old.styleOverrides) series.styleOverrides=structuredClone(old.styleOverrides);
    for (const key of ['strokeWidth','markerSize','markerStrokeWidth']) {
      if (asked(key==='strokeWidth'?'stroke':'marker') && positive(next[key]) && next[key] !== baseline[key]) {
        (series.styleOverrides ||= {})[key]={value:next[key],width:plane.w};
      }
    }
    if (equal(next.lineStyle,baseline.lineStyle) && equal(next.dashLength,baseline.dashLength) && equal(next.dashGap,baseline.dashGap) && old.customStyleWidth) {
      for(const key of ['dashLength','dashGap','dashPattern','customStyleWidth']) if(old[key]!==undefined)series[key]=structuredClone(old[key]);
    }
  }
}
