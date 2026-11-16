/* Direct manipulation for the added highlight regions only. Modal drafts own
 * all changes; the existing graph inputs, drawing modes and canvas stay intact. */
import { worldFromMath, mathFromWorld, planeAsY2 } from '../function-graph/coords.js?v=1.7.0-four-session-integration';
import { buildRegionGeometry, normalizedToMath } from './graph-features.js?v=1.7.0-four-session-integration';
import { registerEscapeLayer } from '../escape-layers.js?v=1.7.0-four-session-integration';

const NS = 'http://www.w3.org/2000/svg';
export function createRegionPreviewEditor(api) {
  let active = null, drag = null;
  const node = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  function finish(cancel = false) {
    if (!drag) return;
    const d = drag; drag = null;
    d.host.removeEventListener('pointermove', d.move);
    d.host.removeEventListener('pointerup', d.up);
    d.host.removeEventListener('pointercancel', d.cancel);
    d.host.removeEventListener('lostpointercapture', d.cancel);
    window.removeEventListener('keydown', d.key, true);
    d.disposeEscape?.();
    if (d.host.hasPointerCapture?.(d.pointerId)) d.host.releasePointerCapture(d.pointerId);
    if (cancel) { for (const key of Object.keys(d.spec)) delete d.spec[key]; Object.assign(d.spec, d.before); }
    api.onChange();
  }
  function render(svg, plane, series, enabled) {
    if (!enabled || !(api.getCfg()?.regions || []).includes(active)) return;
    const spec = active, p = spec.axis === 'y2' ? planeAsY2(plane) : plane;
    const geometry = buildRegionGeometry(spec, plane, series);
    if (!geometry.ok) return;
    const normalized = spec.coordinateSpace === 'normalized';
    const toWorld = q => { const m = normalized ? normalizedToMath(p,q) : q; return worldFromMath(p,m.x,m.y); };
    const fromWorld = q => normalized ? { x: (q.x-p.x)/p.w, y: 1-(q.y-p.y)/p.h } : mathFromWorld(p, q.x, q.y);
    const bounds = { xMin: normalized ? 0 : p.xMin, xMax: normalized ? 1 : p.xMax, yMin: normalized ? 0 : p.yMin, yMax: normalized ? 1 : p.yMax };
    const source = plane.reconstruction?.source, box = source?.plotBox;
    if (normalized && ['rect','polygon'].includes(spec.kind) && box?.w > 0 && box?.h > 0 && source?.width > 0 && source?.height > 0) {
      Object.assign(bounds, { xMin: -box.x/box.w, xMax: (source.width-box.x)/box.w,
        yMin: 1-(source.height-box.y)/box.h, yMax: 1+box.y/box.h });
    }
    const middle = fromWorld({ x: p.x+p.w/2, y: p.y+p.h/2 });
    const points = geometry.points.map(q => `${q.x},${q.y}`).join(' ');
    const overlay = node('g', { 'data-region-editor': spec.id || 'region' });
    overlay.append(node('polygon', { points, fill: 'none', stroke: 'var(--accent)', 'stroke-width': '.25', 'stroke-dasharray': '.7 .5', 'pointer-events': 'none' }));
    const handles = [];
    if (['x-band','between'].includes(spec.kind)) handles.push({ x: spec.from, y: middle.y, xKey: 'from' }, { x: spec.to, y: middle.y, xKey: 'to' });
    else if (spec.kind === 'y-band') handles.push({ x: middle.x, y: spec.from, yKey: 'from' }, { x: middle.x, y: spec.to, yKey: 'to' });
    else if (spec.kind === 'rect') {
      for (const xKey of ['xMin','xMax']) for (const yKey of ['yMin','yMax']) handles.push({ x: spec[xKey], y: spec[yKey], xKey, yKey });
    } else if (spec.kind === 'polygon') spec.points.forEach((q, index) => handles.push({ ...q, index }));
    const clientPoint = e => {
      const current = drag?.host.querySelector('.gm-preview-svg') || svg;
      const matrix = current.getScreenCTM(); if (!matrix) return null;
      const q = current.createSVGPoint(); q.x = e.clientX; q.y = e.clientY;
      return fromWorld(q.matrixTransform(matrix.inverse()));
    };
    const apply = (h, q) => {
      if (!q) return;
      const candidate = structuredClone(spec), clamp = (v,a,b) => Math.max(a,Math.min(b,v));
      const x = clamp(q.x,bounds.xMin,bounds.xMax), y = clamp(q.y,bounds.yMin,bounds.yMax);
      if (h.index !== undefined) candidate.points[h.index] = { x, y };
      else { if (h.xKey) candidate[h.xKey] = x; if (h.yKey) candidate[h.yKey] = y; }
      // The same geometry validator used by insertion checks log/y2 bounds,
      // crossings and reversed intervals. An invalid drag keeps the last shape.
      if (!buildRegionGeometry(candidate, plane, series).ok) return;
      Object.assign(spec, candidate); api.onChange();
    };
    handles.forEach((h, index) => {
      const w = toWorld(h), el = node('circle', { cx: w.x, cy: w.y, r: '.85', fill: 'white', stroke: 'var(--accent)', 'stroke-width': '.3', tabindex: '0', role: 'button', 'aria-label': `영역 조절점 ${index+1}`, 'data-region-handle': index });
      el.style.cursor = h.xKey && !h.yKey ? 'ew-resize' : h.yKey && !h.xKey ? 'ns-resize' : 'move';
      el.style.touchAction = 'none';
      // Suppress compatibility mouse events so original point-placement modes
      // never interpret a region handle as a new curve point.
      el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
      el.addEventListener('pointerdown', e => {
        if (drag || e.button !== 0 || e.isPrimary === false) return;
        e.preventDefault(); e.stopPropagation();
        const host = svg.parentElement; if (!host) return;
        const before = structuredClone(spec), pointerId = e.pointerId;
        const move = ev => { if (ev.pointerId === pointerId) apply(h,clientPoint(ev)); };
        const up = ev => { if (ev.pointerId === pointerId) finish(); };
        const cancel = ev => { if (ev.pointerId === pointerId) finish(true); };
        const key = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); } };
        drag = { host, spec, before, pointerId, move, up, cancel, key };
        // Use the app's existing Escape router while a drag owns this dialog.
        // Remove the temporary callback on finish so normal modal closing stays intact.
        const modal = host.closest('[role="dialog"]');
        if (modal) drag.disposeEscape = registerEscapeLayer(modal, () => finish(true));
        host.addEventListener('pointermove', move); host.addEventListener('pointerup', up);
        host.addEventListener('pointercancel', cancel); host.addEventListener('lostpointercapture', cancel);
        window.addEventListener('keydown', key, true); host.setPointerCapture(pointerId);
      });
      el.addEventListener('keydown', e => {
        const delta = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,1], ArrowDown: [0,-1] }[e.key];
        if (!delta) return;
        e.preventDefault(); e.stopPropagation();
        const step = (e.shiftKey ? .01 : .002), q = fromWorld({ x:w.x+delta[0]*p.w*step, y:w.y-delta[1]*p.h*step });
        const host = svg.parentElement; apply(h,q);
        host?.querySelector(`[data-region-handle="${index}"]`)?.focus();
      });
      overlay.append(el);
    });
    svg.append(overlay);
  }
  return { render, select: spec => { finish(true); active = active === spec ? null : spec; }, isSelected: spec => active === spec,
    cancel: () => finish(true) };
}
