import { EXAM_STYLE } from './exam-style.js?v=1.7.0-four-session-integration';

const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const positive = n => Number.isFinite(n) && n > 0;

// Rebuild scientific geometry from the new plan while keeping the user's
// presentation edits. An explicitly changed plan style wins over its baseline.
export function preserveDescriptionPresentation(objects, plan, previous) {
  const plane = objects.find(o=>o.type==='coordplane');
  const oldPlane = previous?.objects?.find(o=>o.type==='coordplane');
  if (!plane || !oldPlane?.graphStyle?.descriptionLayout) return;
  for (const key of ['labelScale','arrowScale','arrowWidthScale','strokeScale']) {
    if (positive(oldPlane.graphStyle[key])) plane.graphStyle[key]=oldPlane.graphStyle[key];
  }
  const oldStyle=previous.plan?.style || {}, style=plan.style || {};
  if (positive(style.fontSizePx) && style.fontSizePx !== oldStyle.fontSizePx) {
    plane.graphStyle.labelScale *= style.fontSizePx/(positive(oldStyle.fontSizePx) ? oldStyle.fontSizePx : 26);
  }
  if (positive(plan.frame?.arrowLength) && plan.frame.arrowLength !== previous.plan?.frame?.arrowLength) {
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
      if (positive(next[key]) && next[key] !== baseline[key]) {
        (series.styleOverrides ||= {})[key]={value:next[key],width:plane.w};
      }
    }
    if (equal(next.lineStyle,baseline.lineStyle) && equal(next.dashLength,baseline.dashLength) && equal(next.dashGap,baseline.dashGap) && old.customStyleWidth) {
      for(const key of ['dashLength','dashGap','dashPattern','customStyleWidth']) if(old[key]!==undefined)series[key]=structuredClone(old[key]);
    }
  }
}
