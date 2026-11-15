// 5E_hwp 문항 사이 빈칸 커서(11-15 사용자: 「프레임은 그대로, 빈칸을 누르면 커서가 보이고 엔터를 누르면 알아서 쭉쭉 내려가게」).
// 문항 사이 빈칸은 빈 문단이 아니라 문단 간격이라, 누르면 엔진이 커서를 아래 문항 첫 줄 한가운데로 옮겨 엔터가 그 문장을 쪼갰다(11-15 실측).
// - 빈칸(한 단 안에서 앞 줄 아래 ~ 다음 줄 위, 표·그림·글줄 위가 아님)을 누르면: 엔진에 넘기지 않고 그 자리에 커서만 그린다. 문서는 그대로.
// - 그 상태에서 엔터: 앞 문단 바로 뒤에 빈 줄 하나를 넣고(⌘Z 한 번으로 되돌림) 커서를 그 줄로 — 그다음부터는 평소처럼 쓰고 엔터로 계속 내려간다.
// - 엔터 전 글자 입력은 받지 않는다(표 옆에 붙어 겹치던 문제). 한글은 엔터 뒤에 친다(사용자 결정 「엔터를 치고 나서야 한글 입력이 되게」).
// - Esc·다른 곳 누르기·굴리기는 커서만 지운다.
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const MIN_GAP = 6; // px — 이보다 좁은 줄 사이는 빈칸으로 보지 않는다

export function installGapCaret(bridge, { status = () => {} } = {}) {
  const doc = bridge.editor?.element?.contentDocument; if (!doc) return () => {};
  const win = doc.defaultView;
  let gap = null, caret = null, tip = null, tipTimer = 0;
  const style = doc.createElement('style');
  style.textContent = `.e5-gap-caret{position:fixed;width:1.5px;background:#111;z-index:40;pointer-events:none;animation:e5gap 1s steps(1) infinite}
    @keyframes e5gap{50%{opacity:0}}
    .e5-gap-tip{position:fixed;z-index:41;pointer-events:none;background:#161b22;color:#e6edf3;font:12px/1.4 -apple-system,"Apple SD Gothic Neo",sans-serif;padding:5px 9px;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap}`;
  doc.head.append(style);

  const raw = () => bridge.wasm.borrowDocumentHandle();
  function clear() { gap = null; caret?.remove(); caret = null; tip?.remove(); tip = null; clearTimeout(tipTimer); }

  // 누른 자리가 빈칸인지: 그 쪽의 글줄·표·그림 중 같은 단의 것만 보고, 누른 높이를 덮는 것이 없고 위아래 사이가 MIN_GAP 이상이면 빈칸.
  function hit(event) {
    const input = bridge.input; if (!input || event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return null;
    const content = input.container?.querySelector('#scroll-content');
    if (!content?.contains(event.target) || event.target.closest('button,input,textarea,select,a,[contenteditable="true"],[role="button"],[role="menu"],[role="dialog"],.table-object-layer')) return null;
    let point; try { point = input.pagePointFromClientPoint(event.clientX, event.clientY); } catch { return null; }
    if (!point) return null;
    const { pageIdx: page, pageX: x, pageY: y } = point, d = raw();
    const pd = parse(d.getPageDef(page)), W = pd.width / 75, mL = pd.marginLeft / 75, mR = pd.marginRight / 75;
    const top = (pd.marginTop + pd.marginHeader) / 75, bottom = (pd.height - pd.marginBottom - pd.marginFooter) / 75;
    if (x < mL || x > W - mR || y < top || y > bottom) return null;
    const cols = Math.max(1, (parse(d.getPageInfo(page)).columns || []).length || 1), colW = (W - mL - mR) / cols, col = Math.min(cols - 1, Math.floor((x - mL) / colW));
    const inCol = b => { const c = b.x + (b.w || 0) / 2; return Math.min(cols - 1, Math.max(0, Math.floor((c - mL) / colW))) === col; };
    const boxes = [];
    for (const r of parse(d.getPageTextLayout(page)).runs || []) if (!(r.cellPath || []).length && Number.isFinite(r.y) && (r.secIdx ?? 0) === 0) boxes.push({ p: r.paraIdx, x: r.x, w: r.w || 1, top: r.y, bottom: r.y + (r.h || r.fontSize || 12) });
    for (const c of parse(d.getPageControlLayout(page)).controls || []) if (!(c.cellPath || []).length && Number.isFinite(c.y) && (c.secIdx ?? 0) === 0 && c.plane !== 1) boxes.push({ p: c.paraIdx, x: c.x, w: c.w, top: c.y, bottom: c.y + c.h, ctl: true });
    const mine = boxes.filter(inCol);
    if (mine.some(b => b.top - 1 <= y && y <= b.bottom + 1)) return null; // 글줄·표·그림 위 — 엔진에 맡긴다
    const above = mine.filter(b => b.bottom < y).sort((a, b) => b.bottom - a.bottom)[0];
    const below = mine.filter(b => b.top > y).sort((a, b) => a.top - b.top)[0];
    if (!above || !Number.isInteger(above.p)) return null;
    if (below && below.top - above.bottom < MIN_GAP) return null;
    // 앞 문단 = 누른 자리 바로 위에서 끝나는 줄·개체의 문단.
    return { page, x, y, col, para: above.p, lineH: 15 };
  }

  function draw(event, g) {
    caret?.remove(); caret = doc.createElement('div'); caret.className = 'e5-gap-caret';
    const zoom = bridge.input?.viewportManager?.getZoom?.() || 1, h = Math.max(10, g.lineH * zoom);
    caret.style.left = `${event.clientX}px`; caret.style.top = `${event.clientY - h / 2}px`; caret.style.height = `${h}px`;
    doc.body.append(caret);
  }
  function hint(text) {
    if (!caret) return; tip?.remove(); tip = doc.createElement('div'); tip.className = 'e5-gap-tip'; tip.textContent = text;
    const r = caret.getBoundingClientRect(); tip.style.left = `${r.left + 8}px`; tip.style.top = `${r.bottom + 6}px`; doc.body.append(tip);
    clearTimeout(tipTimer); tipTimer = setTimeout(() => { tip?.remove(); tip = null; }, 1800);
  }

  function onDown(event) {
    const g = hit(event);
    if (!g) { if (gap) clear(); return; }
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    gap = g; draw(event, g);
    // 엔진 글쇠 칸에서 초점을 빼 둔다 — 엔터 전 글자·한글 조합이 엔진(아래 문항 줄)으로 들어가지 않게.
    try { doc.activeElement?.blur?.(); } catch {}
    try { doc.body.tabIndex = -1; doc.body.focus({ preventScroll: true }); } catch {}
  }
  const swallow = event => { if (gap && caret) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); } };

  function newLine() {
    const g = gap; if (!g) return;
    try {
      bridge.transaction('gap-line', input => {
        const d = raw(), at = g.para + 1;
        d.insertParagraph(0, at);
        // 빈 줄은 앞쪽 글 문단(발문 등)의 문단 모양을 따르되 위아래 간격·나누기는 없앤다.
        let src = g.para; for (let i = g.para; i >= Math.max(0, g.para - 12); i--) { if (d.getParagraphLength(0, i) > 0) { src = i; break; } }
        try { const pp = parse(d.getParaPropertiesAt(0, src, 0));
          d.applyParaFormat(0, at, JSON.stringify({ alignment: pp.alignment, lineSpacingType: pp.lineSpacingType, lineSpacing: pp.lineSpacing, marginLeft: 0, marginRight: 0, indent: 0, spacingBefore: 0, spacingAfter: 0, keepWithNext: false, pageBreakBefore: false })); } catch {}
        // 글자 모양도 앞 글 문단 첫 글자와 같게(빈 문단은 기본 글자 모양이라 다른 글씨체로 써졌다). 빈 범위에 걸어 두면 이어 치는 글이 따른다.
        try { const cp = parse(d.getCharPropertiesAt(0, src, 0)), keep = {};
          for (const k of ['fontName', 'fontNames', 'fontSize', 'ratio', 'spacing', 'textColor', 'bold', 'italic']) if (cp[k] !== undefined) keep[k] = cp[k];
          d.insertText(0, at, 0, '\u200b'); d.applyCharFormat(0, at, 0, 1, JSON.stringify(keep)); d.deleteText(0, at, 0, 1); } catch {}
        d.reflowLinesegs?.();
        input.cursor.moveTo({ sectionIndex: 0, paragraphIndex: at, charOffset: 0 });
        return true;
      });
    } catch (error) { status(`빈 줄을 넣지 못했습니다: ${error.message}`, true); clear(); return; }
    clear();
    try { bridge.focus?.(); } catch {}
    try { const ta = doc.querySelector('textarea'); ta?.focus({ preventScroll: true }); } catch {}
  }

  function onKey(event) {
    if (!gap) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); clear(); return; }
    if (event.key === 'Enter' && !event.isComposing && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); newLine(); return; }
    if (event.metaKey || event.ctrlKey) return; // ⌘Z 등은 그대로(커서만 지움)
    if (event.key.length === 1 || event.key === 'Process' || event.keyCode === 229 || event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); hint('엔터를 누르면 여기에 새 줄이 생깁니다'); return; }
    if (/^Arrow|^Page|^Home$|^End$|^Tab$/.test(event.key)) clear();
  }

  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('mousedown', swallow, true);
  doc.addEventListener('mouseup', swallow, true);
  doc.addEventListener('click', swallow, true);
  doc.addEventListener('keydown', onKey, true);
  const scrollOff = () => { if (gap) clear(); };
  win.addEventListener('wheel', scrollOff, { passive: true, capture: true });
  win.addEventListener('blur', () => { tip?.remove(); tip = null; });
  return () => { clear(); style.remove(); doc.removeEventListener('pointerdown', onDown, true); doc.removeEventListener('mousedown', swallow, true); doc.removeEventListener('mouseup', swallow, true); doc.removeEventListener('click', swallow, true); doc.removeEventListener('keydown', onKey, true); win.removeEventListener('wheel', scrollOff, true); };
}
