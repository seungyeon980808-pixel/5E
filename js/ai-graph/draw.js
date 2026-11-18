// 그림으로 만드는 그래프(1.8.0 옵션 엔진) ④ 그리기 — 브라우저(5E 렌더러) 안의 숨은 판에서.
// image_generator는 playwright로 page.html을 열어 스크린숏했다. 여기서는
//   1) 숨은 판([data-ai-graph-stage])에 KaTeX 글자를 실제로 놓아 크기를 재고(layout.js가 자리 결정),
//   2) 놓인 글자의 글자 조각(텍스트 노드)·분수선 위치를 읽어
//   3) 같은 도형·글자를 SVG 문자열과 canvas PNG로 다시 그린다(스크린숏 없음, 캔버스 오염 없음).
// KaTeX는 vendor/katex(0.16.11, MIT)를 이 엔진에서만 불러 쓴다. 글꼴 이름은 FEGKaTeX_*로 바꿔(MathLive와 안 섞임)
// 보통·기울임은 5E fonts/의 Latin Modern(lmroman10)이다. 한글은 5E 그림 글자와 같은 돋움 계열.
import { STY, HANGUL, layoutGraph, labelOverlaps, boxHit } from './layout.js?v=1.7.0-four-session-integration';

const S = 12;              // 판 위 px/mm(원본 page.html과 같음)
const DEFAULT_PX_PER_MM = 24; // PNG 해상도(원본: S=12 × 기기 배율 2)
const KATEX_JS = new URL('../../vendor/katex/katex.min.js', import.meta.url).href;
const STAGE_CSS = new URL('../../assets/ai-graph/graph-stage.css', import.meta.url).href;

let assetsPromise = null;
let katexLib = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src; el.async = true; el.dataset.aiGraph = 'katex';
    el.onload = () => resolve(); el.onerror = () => reject(new Error('KaTeX를 불러오지 못했습니다.'));
    document.head.appendChild(el);
  });
}
function loadCss(href) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('link[data-ai-graph="stage-css"]');
    if (existing) { resolve(existing); return; }
    const el = document.createElement('link');
    el.rel = 'stylesheet'; el.href = href; el.dataset.aiGraph = 'stage-css';
    el.onload = () => resolve(el); el.onerror = () => reject(new Error('그래프 판 스타일을 불러오지 못했습니다.'));
    document.head.appendChild(el);
  });
}

// KaTeX·판 스타일·글꼴을 한 번만 불러온다. KaTeX를 못 불러오면 글자를 수식 없이 그대로 쓴다(실패로 끝내지 않음).
export function ensureGraphAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const warnings = [];
      try { await loadCss(STAGE_CSS); } catch (e) { warnings.push(e.message); }
      if (!globalThis.katex) { try { await loadScript(KATEX_JS); } catch (e) { warnings.push(e.message); } }
      katexLib = globalThis.katex || null;
      try {
        await Promise.all(['normal 400 20px FEGKaTeX_Main', 'italic 400 20px FEGKaTeX_Math', 'normal 400 20px FEGKaTeX_Size1', 'normal 400 20px FEGKaTeX_AMS'].map((f) => document.fonts.load(f)));
      } catch (e) { warnings.push('글꼴: ' + e.message); }
      return { katex: !!katexLib, warnings };
    })();
  }
  return assetsPromise;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function texHtml(x) {
  if (katexLib) return katexLib.renderToString(x, { throwOnError: false, output: 'html' });
  return `<span class="ag-plain">${esc(x.replace(/\\mathrm\{([^}]*)\}/g, '$1').replace(/\\displaystyle\s*/g, '').replace(/[{}]/g, ''))}</span>`;
}

// 글자 하나를 한글 런과 수식 런으로 나눠 그린다. role: 'axis'(괄호=단위 바로 선 글자) | 'name'(이름 바로 선 글자) | 'value'
export function labelHtml(src, role) {
  const lines = String(src ?? '').split(/\n|\\\\/);
  if (lines.length > 1) return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:0.15em">${lines.map((l) => `<div>${labelHtml1(l, role)}</div>`).join('')}</div>`;
  return labelHtml1(src, role);
}
function labelHtml1(src, role) {
  let s = String(src ?? '').replace(/\\;/g, ' ').replace(/−/g, '-').trim();
  let unit = '';
  if (role === 'axis') { const m = /\(([^()]*)\)\s*$/.exec(s); if (m) { unit = m[1]; s = s.slice(0, m.index).trim(); } }
  const parts = []; let cur = '', isKo = null;
  for (const ch of s) { const k = HANGUL.test(ch) || (ch === ' ' && isKo); if (isKo !== null && k !== isKo) { parts.push([isKo, cur]); cur = ''; } isKo = k; cur += ch; }
  if (cur) parts.push([isKo, cur]);
  const tex = (t) => {
    let x = t.trim(); if (!x) return '';
    if (role === 'name') x = x.replace(/([A-Za-z]+)/g, '\\mathrm{$1}');
    if (role !== 'name') x = x.replace(/(\\[A-Za-z]+)|([A-Za-z]{2,})/g, (m, cmd, word) => (cmd ? cmd : `\\mathrm{${word}}`));
    if (/\\frac/.test(x)) x = '\\displaystyle ' + x;
    return texHtml(x.replace(/-/g, '−').replace(/−/g, '-'));
  };
  const koEm = STY.koMm / STY.mathMm;
  let html = parts.map(([ko, t]) => (ko ? `<span class="ko" style="font-size:${koEm}em">${esc(t).replace(/ /g, '&nbsp;')}</span>` : tex(t))).join('');
  if (unit) html += HANGUL.test(unit) ? `<span class="ko" style="font-size:${koEm}em">(${esc(unit).replace(/ /g, '&nbsp;')})</span>` : texHtml(`(\\mathrm{${unit.replace(/%/g, '\\%')}})`);
  return html;
}

function createStage() {
  const root = document.createElement('div');
  root.setAttribute('data-ai-graph-stage', '');
  root.setAttribute('aria-hidden', 'true');
  // 스타일 파일을 못 불러온 경우에도 화면에 보이지 않게
  root.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
  root.innerHTML = '<div class="ag-measure"></div><div class="ag-board"></div>';
  document.body.appendChild(root);
  return { root, measureEl: root.firstChild, board: root.lastChild };
}

// 글자 상자 높이 규칙: 수식 글자(Latin Modern)는 글꼴 자체 줄 상자(약 1.41em)가 실제 글자보다 훨씬 커서 그대로 쓰면
// 글자들이 서로 멀리 밀린다. 원본(image_generator page.html)은 글꼴이 다 받아지기 전에 재서 사실상 Times 줄 상자(위 0.891em·
// 아래 0.216em)로 자리를 정했다 → 같은 높이 규칙을 써서 원본과 같은 자리를 얻는다. 한글(.ko)은 실제 줄 상자 그대로.
const MATH_ASCENT_EM = 0.891, MATH_DESCENT_EM = 0.216;

// 글자 요소 안의 텍스트 조각: 글자·글꼴·화면 좌표(px)·자리 상자(위 규칙)
function textRuns(el) {
  const out = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue;
    if (!text || !text.replace(/[\s\u00a0\u200b]/g, '')) continue;
    const parent = node.parentElement;
    if (parent.closest('.katex-mathml')) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none') continue; // 판 전체가 visibility:hidden이므로 그것으로는 거르지 않음
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const sizePx = parseFloat(cs.fontSize);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${sizePx}px ${cs.fontFamily}`;
    const baseline = r.top + fontAscent(font, text);
    const ko = !!parent.closest('.ko');
    const box = ko ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      : { left: r.left, right: r.right, top: baseline - MATH_ASCENT_EM * sizePx, bottom: baseline + MATH_DESCENT_EM * sizePx };
    out.push({ text, cs, sizePx, font, rect: r, baseline, box });
  }
  return out;
}
// 분수선·윗줄 같은 선(테두리)
function borderRules(el) {
  const out = [];
  for (const e of el.querySelectorAll('*')) {
    const cs = getComputedStyle(e);
    for (const side of ['Bottom', 'Top']) {
      const bw = parseFloat(cs[`border${side}Width`]);
      if (!(bw > 0) || cs[`border${side}Style`] !== 'solid') continue;
      const r = e.getBoundingClientRect(); if (!r.width) continue;
      const y = side === 'Bottom' ? r.bottom - bw : r.top;
      out.push({ left: r.left, right: r.right, top: y, bottom: y + bw });
    }
  }
  return out;
}
function unionBox(boxes) {
  const u = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const b of boxes) { u.left = Math.min(u.left, b.left); u.top = Math.min(u.top, b.top); u.right = Math.max(u.right, b.right); u.bottom = Math.max(u.bottom, b.bottom); }
  return Number.isFinite(u.left) ? u : null;
}

function makeMeasure(measureEl) {
  return (html, mm) => {
    measureEl.innerHTML = `<div class="lb" style="font-size:${mm * S}px">${html}</div>`;
    const el = measureEl.firstChild, r = el.getBoundingClientRect();
    const svgs = [...el.querySelectorAll('svg')].map((x) => x.getBoundingClientRect()).filter((b) => b.width && b.height);
    const u = unionBox([...textRuns(el).map((t) => t.box), ...borderRules(el), ...svgs]) || { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    return { w: Math.max(u.right - u.left, r.width) / S, h: (u.bottom - u.top) / S, dx: Math.min(u.left - r.left, 0) / S, dy: (u.top - r.top) / S };
  };
}

let ascentCtx = null;
function fontAscent(font, text) {
  ascentCtx = ascentCtx || document.createElement('canvas').getContext('2d');
  ascentCtx.font = font;
  const m = ascentCtx.measureText(text || 'M');
  return Number.isFinite(m.fontBoundingBoxAscent) ? m.fontBoundingBoxAscent : m.actualBoundingBoxAscent;
}

// 놓인 글자 요소에서 글자 조각(텍스트 노드)·선(분수선 등)·작은 SVG(근호 등)를 판 기준 mm 좌표로 읽는다.
function extractLabel(el, boardRect, bounds) {
  const toMm = (px, axis) => (axis === 'x' ? bounds.x : bounds.y) + px / S;
  const runs = [], rules = [], glyphs = [];
  const ink = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const grow = (r) => { ink.x0 = Math.min(ink.x0, r.left); ink.y0 = Math.min(ink.y0, r.top); ink.x1 = Math.max(ink.x1, r.right); ink.y1 = Math.max(ink.y1, r.bottom); };
  for (const t of textRuns(el)) {
    grow(t.box);
    runs.push({
      text: t.text, family: t.cs.fontFamily, style: t.cs.fontStyle, weight: t.cs.fontWeight, sizeMm: t.sizePx / S,
      x: toMm(t.rect.left - boardRect.left, 'x'), baseline: toMm(t.baseline - boardRect.top, 'y'),
      w: t.rect.width / S, font: t.font,
    });
  }
  for (const q of borderRules(el)) {
    grow(q);
    rules.push({ x: toMm(q.left - boardRect.left, 'x'), y: toMm(q.top - boardRect.top, 'y'), w: (q.right - q.left) / S, h: (q.bottom - q.top) / S });
  }
  for (const svg of el.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect(); if (!r.width || !r.height) continue;
    grow(r);
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.removeAttribute('style');
    glyphs.push({ x: toMm(r.left - boardRect.left, 'x'), y: toMm(r.top - boardRect.top, 'y'), w: r.width / S, h: r.height / S, markup: clone.outerHTML });
  }
  // 실제로 그려진 글자 조각 전체 상자(mm) — 겹침 확인용
  const inkBox = Number.isFinite(ink.x0) ? { x: toMm(ink.x0 - boardRect.left, 'x'), y: toMm(ink.y0 - boardRect.top, 'y'), w: (ink.x1 - ink.x0) / S, h: (ink.y1 - ink.y0) / S } : null;
  return { runs, rules, glyphs, inkBox };
}

const num = (v) => +(+v).toFixed(4);

function shapeToSvg(s) {
  const dash = s.dash ? ` stroke-dasharray="${s.dash.join(' ')}"` : '';
  if (s.type === 'line') return `<line data-role="${s.role}" x1="${num(s.x1)}" y1="${num(s.y1)}" x2="${num(s.x2)}" y2="${num(s.y2)}" stroke="#000" stroke-width="${s.w}"${dash} stroke-linecap="butt"/>`;
  if (s.type === 'arrow') { const P = (q) => `${num(q[0])},${num(q[1])}`; return `<path data-role="${s.role}" d="M${P(s.tip)} L${P(s.b1)} Q${P(s.n)} ${P(s.n)} L${P(s.b2)} Z" fill="#000"/>`; }
  if (s.type === 'polyline') return `<polyline data-role="${s.role}" points="${s.pts.map((q) => `${num(q[0])},${num(q[1])}`).join(' ')}" fill="none" stroke="#000" stroke-width="${s.w}" stroke-linejoin="round"${dash}/>`;
  if (s.type === 'circle') return `<circle data-role="${s.role}" cx="${num(s.cx)}" cy="${num(s.cy)}" r="${s.r}" fill="${s.fill}" stroke="#000" stroke-width="${s.w}"/>`;
  return '';
}

function labelToSvg(l) {
  const parts = l.runs.map((r) => `<text x="${num(r.x)}" y="${num(r.baseline)}" font-family="${esc(r.family)}" font-size="${num(r.sizeMm)}" font-style="${r.style}" font-weight="${r.weight}" xml:space="preserve">${esc(r.text)}</text>`);
  for (const q of l.rules) parts.push(`<rect x="${num(q.x)}" y="${num(q.y)}" width="${num(q.w)}" height="${num(q.h)}" fill="#000"/>`);
  for (const g of l.glyphs) parts.push(g.markup.replace(/^<svg\b/, `<svg x="${num(g.x)}" y="${num(g.y)}" width="${num(g.w)}" height="${num(g.h)}"`));
  return `<g data-label-kind="${l.kind}" data-label="${esc(l.src)}"${l.axis ? ` data-axis="${l.axis}"` : ''}>${parts.join('')}</g>`;
}

// 쓴 FEGKaTeX 글꼴을 SVG 안에 data URL로 넣는다(SVG 한 장만으로 같은 모양). 한글 돋움은 시스템 글꼴이라 넣지 않음.
const fontDataCache = new Map();
async function fontFaceCss(families) {
  const rules = [];
  const sheets = [...document.styleSheets].filter((s) => { try { return s.ownerNode?.dataset?.aiGraph === 'stage-css' && s.cssRules; } catch { return false; } });
  for (const sheet of sheets) {
    for (const rule of sheet.cssRules) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim();
      if (!families.has(fam)) continue;
      const m = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue('src'));
      if (!m) continue;
      const url = new URL(m[1], sheet.href || location.href).href;
      try {
        if (!fontDataCache.has(url)) {
          const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
          let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          fontDataCache.set(url, 'data:font/woff2;base64,' + btoa(bin));
        }
        rules.push(`@font-face{font-family:${fam};font-style:${rule.style.getPropertyValue('font-style') || 'normal'};font-weight:${rule.style.getPropertyValue('font-weight') || '400'};src:url(${fontDataCache.get(url)}) format("woff2")}`);
      } catch { /* 글꼴을 못 넣으면 이름만 남김 */ }
    }
  }
  return rules.join('');
}

function svgImage(markup, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = () => reject(new Error('svg glyph'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup.replace(/^<svg\b/, `<svg width="${w}" height="${h}"`));
  });
}

async function paintPng(shapes, labels, bounds, pxPerMm) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(bounds.w * pxPerMm); canvas.height = Math.ceil(bounds.h * pxPerMm);
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(pxPerMm, 0, 0, pxPerMm, -bounds.x * pxPerMm, -bounds.y * pxPerMm);
  g.strokeStyle = '#000'; g.fillStyle = '#000';
  for (const s of shapes) {
    g.setLineDash(s.dash || []);
    if (s.type === 'line') { g.lineWidth = s.w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke(); }
    else if (s.type === 'arrow') { g.beginPath(); g.moveTo(...s.tip); g.lineTo(...s.b1); g.quadraticCurveTo(s.n[0], s.n[1], s.n[0], s.n[1]); g.lineTo(...s.b2); g.closePath(); g.fillStyle = '#000'; g.fill(); }
    else if (s.type === 'polyline') { g.lineWidth = s.w; g.lineJoin = 'round'; g.lineCap = 'butt'; g.beginPath(); s.pts.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
    else if (s.type === 'circle') { g.setLineDash([]); g.beginPath(); g.arc(s.cx, s.cy, s.r, 0, Math.PI * 2); g.fillStyle = s.fill; g.fill(); g.lineWidth = s.w; g.stroke(); g.fillStyle = '#000'; }
  }
  g.setLineDash([]);
  const skipped = [];
  for (const l of labels) {
    for (const r of l.runs) {
      // 캔버스 글자는 px로 그린 뒤 mm 변환을 되돌린다(아주 작은 글자 크기 반올림을 피함)
      g.save(); g.translate(r.x, r.baseline); g.scale(1 / S, 1 / S);
      g.font = r.font; g.textBaseline = 'alphabetic'; g.fillStyle = '#000';
      g.fillText(r.text, 0, 0); g.restore();
    }
    for (const q of l.rules) g.fillRect(q.x, q.y, q.w, q.h);
    for (const gl of l.glyphs) {
      try { const img = await svgImage(gl.markup, gl.w * pxPerMm, gl.h * pxPerMm); g.drawImage(img, gl.x, gl.y, gl.w, gl.h); }
      catch { skipped.push(l.src); }
    }
  }
  let png;
  try { png = canvas.toDataURL('image/png'); }
  catch {
    // 근호 같은 SVG 조각 때문에 캔버스가 오염되면 그 조각 없이 다시 그린다
    return paintPng(shapes, labels.map((l) => ({ ...l, glyphs: [] })), bounds, pxPerMm);
  }
  return { png, width: canvas.width, height: canvas.height, skipped };
}

// prepare()를 거친 설계를 그린다. 돌려주는 것: { svg, png, collisions:{n,list}, parts, size:{wMm,hMm,wPx,hPx}, boxes, warnings }
export async function drawGraph(p, { pxPerMm = DEFAULT_PX_PER_MM, embedFonts = true, keepStage = false } = {}) {
  const assets = await ensureGraphAssets();
  const stage = createStage();
  try {
    const measure = makeMeasure(stage.measureEl);
    const lay = layoutGraph(p, { measure, labelHtml });
    const { bounds } = lay;
    // 글자를 판에 실제로 놓는다(원본 page.html과 같은 자리 계산)
    stage.board.style.width = bounds.w * S + 'px'; stage.board.style.height = bounds.h * S + 'px';
    stage.board.innerHTML = lay.labels.map((l) => `<div class="lb" style="font-size:${l.mm * S}px;left:${(l.at.x - l.m.dx - bounds.x) * S}px;top:${(l.at.y - l.m.dy - bounds.y) * S}px">${l.html}</div>`).join('');
    try { await document.fonts.ready; } catch { /* 글꼴 대기 실패는 그대로 진행 */ }
    const boardRect = stage.board.getBoundingClientRect();
    const els = [...stage.board.children];
    const labels = lay.labels.map((l, i) => ({ ...l, ...extractLabel(els[i], boardRect, bounds) }));
    // 실제로 그려진 글자 조각 상자(mm)로 겹침을 다시 잰다(자리 계산과 별개 확인): 글자끼리, 글자와 화살촉
    const boxes = labels.map((l) => ({ ...(l.inkBox || { x: l.at.x, y: l.at.y, w: l.m.w, h: l.m.h }), kind: l.kind, src: l.src }));
    const overlaps = labelOverlaps(boxes).map(([a, b]) => `${boxes[a].src}↔${boxes[b].src}`);
    for (const bx of boxes) for (const a of lay.arrowBoxes) if (boxHit(bx, a, 0)) overlaps.push(`${bx.src}↔화살촉(${a.role})`);
    const families = new Set(labels.flatMap((l) => l.runs.map((r) => r.family.split(',')[0].replace(/["']/g, '').trim())).filter((f) => f.startsWith('FEGKaTeX_')));
    const faces = embedFonts ? await fontFaceCss(families) : '';
    const b = bounds;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(b.w)}mm" height="${num(b.h)}mm" viewBox="${num(b.x)} ${num(b.y)} ${num(b.w)} ${num(b.h)}" data-engine="ai-graph-picture">`
      + (faces ? `<style>${faces}</style>` : '')
      + `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" fill="#fff"/>`
      + `<g data-layer="shapes">${lay.shapes.map(shapeToSvg).join('')}</g>`
      + `<g data-layer="labels">${labels.map(labelToSvg).join('')}</g></svg>`;
    const raster = await paintPng(lay.shapes, labels, bounds, pxPerMm);
    const list = [...lay.report.filter((r) => r.startsWith('겹침')), ...overlaps.map((o) => '글자 겹침 ' + o)];
    return {
      svg, png: raster.png,
      collisions: { n: lay.n + overlaps.length, list, notes: lay.report.filter((r) => !r.startsWith('겹침')) },
      parts: { ...lay.parts, axisLabels: labels.filter((l) => l.kind === 'axis').map((l) => l.src), runs: labels.reduce((n, l) => n + l.runs.length, 0) },
      size: { wMm: b.w, hMm: b.h, wPx: raster.width, hPx: raster.height },
      boxes, arrowBoxes: lay.arrowBoxes,
      placements: lay.labels.map((l) => ({ src: l.src, kind: l.kind, axis: l.axis || null, at: l.at, m: l.m, cost: l.cost })),
      warnings: [...assets.warnings, ...raster.skipped.map((s) => `근호 등 조각을 PNG에 못 그림: ${s}`)],
      katex: assets.katex,
    };
  } finally {
    if (!keepStage) stage.root.remove();
  }
}
