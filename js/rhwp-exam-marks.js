// 보이지 않는 조판 표시(조판 부호, 10-22 시안 exampool-1022 17번). ExamPool 조판 칸과 5E_hwp가 함께 쓴다.
// - 고정 띄어쓰기(nbsp U+00A0, 한글 고정폭 빈칸 U+2007, 좁은 고정 빈칸 U+202F): 글자 사이에 얇고 큰 빨간 V.
// - 내어쓰기 기준점: 둘째 줄이 생긴 문단에만, 둘째 줄 시작 x에 1px 초록 세로선 + 위 작은 삼각형.
// rhwp 화면(캔버스)은 건드리지 않고 편집기 문서 위에 투명한 층을 하나 얹는다. 화면에만 보이고 인쇄·HWPX·한글로 보내기에는 나가지 않는다.
// 위치는 rhwp 조판 글자 정보(getPageTextLayout: 글자마다 charX)에서 읽고, 스크롤·확대·글 고침마다 다시 그린다.
const NS = 'http://www.w3.org/2000/svg';
export const MARKS_KEY = '5e.typeset.marks';
export const FIXED_SPACE = /[   ]/;
const RED = '#da3633', GREEN = 'rgba(46,160,67,.8)';

export function marksEnabled() { try { return localStorage.getItem(MARKS_KEY) !== 'off'; } catch { return true; } }
export function setMarksEnabled(on) {
  try { if (on) localStorage.removeItem(MARKS_KEY); else localStorage.setItem(MARKS_KEY, 'off'); } catch {}
  window.dispatchEvent(new CustomEvent('5e:typeset-marks', { detail: { on } }));
  // 같은 출처의 다른 문서(ExamPool iframe ↔ 바깥 5E_hwp)에도 알린다.
  try { window.top?.dispatchEvent(new CustomEvent('5e:typeset-marks', { detail: { on } })); } catch {}
  for (const frame of document.querySelectorAll('iframe')) { try { frame.contentWindow?.dispatchEvent(new CustomEvent('5e:typeset-marks', { detail: { on } })); } catch {} }
}

// 쪽 하나의 부호 자리(쪽 좌표, 확대 1). 순수 함수 — 검사에서 그대로 쓴다.
export function marksForRuns(runs) {
  const spaces = [], indents = [], paras = new Map();
  for (const r of runs || []) {
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) continue;
    const text = String(r.text || ''), xs = Array.isArray(r.charX) ? r.charX : null;
    [...text].forEach((ch, i) => {
      if (!FIXED_SPACE.test(ch)) return;
      const a = xs?.[i] ?? (r.w * i) / Math.max(1, text.length), b = xs?.[i + 1] ?? (r.w * (i + 1)) / Math.max(1, text.length);
      spaces.push({ x: r.x + (a + b) / 2, y: r.y, h: r.h, size: r.fontSize || r.h });
    });
    const key = `${r.secIdx}:${r.paraIdx}:${JSON.stringify(r.cellPath || [])}`;
    let p = paras.get(key); if (!p) paras.set(key, p = []);
    p.push(r);
  }
  for (const runs of paras.values()) {
    // 줄 = 높이가 반 이상 겹치는 글자 조각들(크기가 다른 글자·괄호가 섞여도 한 줄로).
    const lines = [];
    for (const r of [...runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const line = lines.find(l => Math.min(l.b, r.y + r.h) - Math.max(l.y, r.y) > Math.min(l.b - l.y, r.h) * 0.5);
      if (line) Object.assign(line, { x: Math.min(line.x, r.x), r: Math.max(line.r, r.x + r.w), y: Math.min(line.y, r.y), b: Math.max(line.b, r.y + r.h) });
      else lines.push({ x: r.x, r: r.x + r.w, y: r.y, b: r.y + r.h });
    }
    lines.sort((a, b) => a.y - b.y);
    // 글자 정보에는 표가 든 문단 번호가 없어, 다른 표의 같은 칸 번호가 한 문단으로 섞인다 → 줄 사이가 줄 높이보다 크게 벌어지면 다른 문단.
    const groups = [];
    for (const line of lines) { const g = groups.at(-1), prev = g?.at(-1); if (prev && line.y - prev.b <= (prev.b - prev.y) * 1.2) g.push(line); else groups.push([line]); }
    for (const group of groups) indentOf(group);
  }
  function indentOf(lines) {
    if (lines.length < 2) return;
    const [first, second] = lines, rest = lines.slice(1);
    // 내어쓰기: 둘째 줄부터 모두 같은 x에서 시작하고 첫 줄보다 안쪽. 가운데 정렬(줄 가운데가 같음)은 빼고.
    if (second.x <= first.x + 0.5 || rest.some(l => Math.abs(l.x - second.x) > 0.5)) return;
    if (Math.abs((first.x + first.r) / 2 - (second.x + second.r) / 2) <= 1.5) return;
    indents.push({ x: second.x, top: first.y, bottom: lines.at(-1).b });
  }
  return { spaces, indents };
}

export function installExamMarks(bridge, { onToggle } = {}) {
  let layer = null, svg = null, frame = 0, cacheKey = '', cache = new Map(), on = marksEnabled(), disposed = false;
  const doc = () => bridge?.editor?.element?.contentDocument;
  const input = () => bridge?.input;
  function ensureLayer() {
    const d = doc(); if (!d?.body) return null;
    if (layer?.isConnected && layer.ownerDocument === d) return layer;
    layer = d.createElement('div'); layer.className = 'rhwp-exam-marks'; layer.setAttribute('aria-hidden', 'true');
    layer.dataset.examMarks = '';
    Object.assign(layer.style, { position: 'fixed', pointerEvents: 'none', overflow: 'hidden', zIndex: '6', left: '0', top: '0', width: '0', height: '0' });
    svg = d.createElementNS(NS, 'svg'); Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible' });
    layer.append(svg); d.body.append(layer);
    return layer;
  }
  function pageMarks(handle, page) {
    const key = `${bridge.generation}:${bridge.revision}`;
    if (key !== cacheKey) { cacheKey = key; cache = new Map(); }
    if (!cache.has(page)) { let runs = []; try { runs = JSON.parse(handle.getPageTextLayout(page)).runs || []; } catch {} cache.set(page, marksForRuns(runs)); }
    return cache.get(page);
  }
  function draw() {
    frame = 0;
    if (disposed) return;
    const box = ensureLayer(); if (!box) return;
    svg.replaceChildren();
    const inp = input(), manager = inp?.viewportManager, virtual = inp?.virtualScroll, container = inp?.container;
    if (!on || !manager || !virtual || !container?.getClientRects().length) { box.hidden = true; return; }
    let handle; try { handle = bridge.wasm.borrowDocumentHandle(); } catch { box.hidden = true; return; }
    const rect = container.getBoundingClientRect();
    Object.assign(box.style, { left: `${rect.left + container.clientLeft}px`, top: `${rect.top + container.clientTop}px`, width: `${container.clientWidth}px`, height: `${container.clientHeight}px` });
    box.hidden = false;
    const zoom = manager.getZoom(), sx = manager.getScrollX(), sy = manager.getScrollY();
    const total = Math.max(manager.getViewportSize().width, virtual.getTotalWidth()), count = handle.pageCount?.() ?? bridge.wasm.pageCount ?? 0;
    const h = container.clientHeight, parts = [];
    for (let page = 0; page < count; page++) {
      const top = virtual.getPageOffset(page) - sy, height = virtual.getPageHeight(page);
      if (top > h) break; if (top + height < 0) continue;
      const left = virtual.getPageLeftResolved(page, total) - sx, X = v => left + v * zoom, Y = v => top + v * zoom;
      const { spaces, indents } = pageMarks(handle, page);
      for (const s of spaces) {
        const w = s.size * 0.62 * zoom, vh = s.size * 0.6 * zoom, cx = X(s.x), base = Y(s.y + s.h) - s.h * 0.12 * zoom, stroke = Math.max(0.6, s.size * zoom * 0.7 / 12);
        parts.push(`<path d="M${cx - w / 2} ${base - vh}L${cx} ${base}L${cx + w / 2} ${base - vh}" fill="none" stroke="${RED}" stroke-width="${stroke.toFixed(2)}" stroke-linejoin="round" data-mark="space"/>`);
      }
      for (const i of indents) {
        const x = Math.round(X(i.x)) + .5, y1 = Y(i.top), y2 = Y(i.bottom);
        parts.push(`<path d="M${x} ${y1}V${y2}" stroke="${GREEN}" stroke-width="1" data-mark="indent"/><path d="M${x - 3} ${y1 - 3}L${x + 3} ${y1 - 3}L${x} ${y1}Z" fill="${GREEN}"/>`);
      }
    }
    svg.setAttribute('width', String(container.clientWidth)); svg.setAttribute('height', String(container.clientHeight));
    svg.innerHTML = parts.join('');
  }
  const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };
  const bus = bridge?.deps?.eventBus;
  for (const event of ['document-changed', 'document-layout-refreshed', 'document-mutated', 'document-swapped', 'zoom-changed', 'zoom-raster-ready', 'viewport-scroll', 'viewport-resize', 'page-view-settings-changed']) bus?.on?.(event, schedule);
  const scrollHost = () => input()?.container;
  let hooked = null;
  const hookScroll = () => { const c = scrollHost(); if (c && c !== hooked) { hooked?.removeEventListener('scroll', schedule); c.addEventListener('scroll', schedule, { passive: true }); hooked = c; } };
  const toggle = event => { on = event.detail?.on ?? marksEnabled(); onToggle?.(on); schedule(); };
  window.addEventListener('5e:typeset-marks', toggle);
  const resize = () => schedule(); window.addEventListener('resize', resize);
  const tick = setInterval(() => { hookScroll(); }, 1000);
  hookScroll(); schedule();
  return {
    redraw: schedule,
    get on() { return on; },
    set(value) { on = !!value; setMarksEnabled(on); onToggle?.(on); schedule(); },
    dispose() { disposed = true; clearInterval(tick); window.removeEventListener('5e:typeset-marks', toggle); window.removeEventListener('resize', resize); hooked?.removeEventListener('scroll', schedule); layer?.remove(); },
  };
}

// 켜고 끄는 단추(기본 켜짐). 조판 칸·도구 줄에 같은 모양으로 넣는다.
export const MARKS_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6.5 5 11.5 7.5 6.5" stroke="#da3633"/><path d="M11.5 3.5v9" stroke="rgba(46,160,67,.9)"/><path d="M9.8 3.5h3.4" stroke="rgba(46,160,67,.9)"/></svg>';
export function marksButtonHtml(className = '') {
  const on = marksEnabled();
  return `<button type="button" class="${className}" data-exam-marks aria-pressed="${on}" title="조판 부호 — 고정 띄어쓰기(빨간 V)·내어쓰기 기준점(초록 선)을 화면에만 표시합니다. 인쇄·HWPX에는 나가지 않습니다.">${MARKS_ICON}<span>조판 부호</span></button>`;
}
