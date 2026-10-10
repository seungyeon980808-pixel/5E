import { attachLeaderRoutesToLabel, leaderRoutePoints } from './ai-label-leaders.js?v=1.7.0-four-session-integration';
import { hasLabelTypography, labelTypographyAngle, measureLabelTypography } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { estimateLabelBlock } from './render/labels.js?v=1.7.0-four-session-integration';
import { measureFormula } from './formula.js?v=1.7.0-four-session-integration';
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM } from './state.js?v=1.7.0-four-session-integration';

// One native layout drives leader rendering/export, selection, picking and
// handles. No source bbox or persisted route coordinate is rewritten here.
export function deriveLabelLeaderGeometry(obj) {
  const center = obj.p2 || obj.p1 || { x: 0, y: 0 };
  const size = hasLabelTypography(obj)
    ? obj.fontSize || obj.labelSize || DEFAULT_TEXT_SIZE_MM
    : obj.labelSize || DEFAULT_TEXT_SIZE_MM;
  const semantic = hasLabelTypography(obj) ? measureLabelTypography(obj, size) : null;
  const formulaSource = obj.contentMode === 'formula' ? (obj.source || obj.rawSource || '') : '';
  const formulaFont = formulaSource ? { family: obj.fontFamily || DEFAULT_TEXT_FONT,
    weight: obj.fontWeight || 'normal', style: obj.italic === true ? 'italic' : 'normal' } : null;
  const formula = !semantic && formulaSource ? measureFormula(formulaSource, size, formulaFont) : null;
  const estimated = !semantic && !formula ? estimateLabelBlock(obj.text, size, 0) : null;
  const w = semantic?.w ?? formula?.w ?? estimated.hw * 2;
  const h = semantic?.h ?? formula?.h ?? estimated.hh * 2;
  const rotation = semantic ? labelTypographyAngle(obj) : 0;
  const angle = rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const polygon = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([x, y]) => ({ x: center.x + x * c - y * s, y: center.y + x * s + y * c }));
  const box = points => {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  };
  const label = { center: { ...center }, w, h, rotation, polygon, bounds: box(polygon) };
  const gap = Number.isFinite(obj.labelGap) && obj.labelGap >= 0 ? obj.labelGap : 0;
  const routes = attachLeaderRoutesToLabel(obj.leaderRoutes, { ...label, gap });
  const points = [...polygon, ...leaderRoutePoints(routes)];
  for (const route of routes) {
    if (route.end !== 'circle') continue;
    const radius = route.endRadius || Math.max(.8, (obj.strokeWidth || .2) * 4) * .55;
    points.push({ x: route.target.x - radius, y: route.target.y - radius },
      { x: route.target.x + radius, y: route.target.y + radius });
  }
  return { routes, label, bounds: box(points), size, semantic, formula, formulaSource, formulaFont };
}

export function pointInLabelerBlock(label, point, tolerance = 0) {
  const angle = label.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const dx = point.x - label.center.x, dy = point.y - label.center.y;
  return Math.abs(c * dx + s * dy) <= label.w / 2 + tolerance
    && Math.abs(-s * dx + c * dy) <= label.h / 2 + tolerance;
}
