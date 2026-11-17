// 5E 수식 입력(11-13, 시안 eq-editor-1113): 글 속 수식 띠 · 미니 도우미 · 큰 편집기 · 빠른 단추 10칸.
// 저장은 글 그대로 `$LaTeX$`. 한글 수식으로 쳐도 띠를 닫을 때 LaTeX로 바꿔 둔다.
// 쓰는 곳: 아이디어 판 메모 · 문항 카드 글 칸 · 조판 바로 입력(라벨러는 쓰지 않음).
import { toLatex, latexToHwp, hwpToLatex, detectSyntax } from './hwp-latex.js?v=1.7.0-four-session-integration';
import { TABS } from './palette.js?v=1.7.0-four-session-integration';

const BASE = new URL('../../vendor/mathlive/', import.meta.url).href;
let mlPromise = null, ML = null;
export function loadMath(doc = document) {
  addCss(doc, BASE + 'mathlive-static.css'); addCss(doc, BASE + 'mathlive-fonts.css'); addStyle(doc);
  if (!mlPromise) mlPromise = import(BASE + 'mathlive.min.mjs').then(m => { m.MathfieldElement.fontsDirectory = BASE + 'fonts/'; m.MathfieldElement.soundsDirectory = null; ML = m; return m; });
  return mlPromise;
}
const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function renderTex(tex) { try { return ML ? ML.convertLatexToMarkup(tex) : E(tex); } catch { return E(tex); } }
function addCss(doc, href) { if ([...doc.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === href)) return; const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l); }

// ── 글 ↔ 화면 ──
const MATH_RE = /\$([^$\n]+)\$/g;
export function hasMath(text) { MATH_RE.lastIndex = 0; return MATH_RE.test(String(text || '')); }
const chipHtml = tex => `<span class="eq-chip" contenteditable="false" data-tex="${E(tex)}" title="눌러서 고치기">${renderTex(tex)}</span>`;
export function mathToHtml(text) { let out = '', last = 0; const s = String(text || ''); MATH_RE.lastIndex = 0; let m; while ((m = MATH_RE.exec(s))) { out += E(s.slice(last, m.index)) + chipHtml(m[1]); last = m.index + m[0].length; } return out + E(s.slice(last)); }
export function htmlToMath(el) {
  let out = '';
  const walk = (n, top) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out += c.data.replace(/\u200b/g, '').replace(/\u00a0/g, ' '); continue; }
      if (c.nodeType !== 1) continue;
      if (c.classList.contains('eq-chip')) { out += '$' + c.dataset.tex + '$'; continue; }
      if (c.classList.contains('eq-band')) { const src = c.textContent.replace(/\u200b/g, '').trim(); if (src) out += '$' + toLatex(src) + '$'; continue; }
      if (c.tagName === 'BR') { out += '\n'; continue; }
      const block = /^(DIV|P)$/.test(c.tagName); if (block && out && !out.endsWith('\n')) out += '\n';
      walk(c, false);
    }
  };
  walk(el, true); return out.replace(/\n+$/, '');
}
// 메모·목록에서 보여 주기만 할 때: 글은 그대로, $…$만 그려진 수식
export function renderMathInto(el, text) { el.innerHTML = mathToHtml(text); if (!ML && hasMath(text)) loadMath(el.ownerDocument).then(() => { el.innerHTML = mathToHtml(text); }); }

// ── 빠른 단추 10칸 ──
export { slotText, slotShow, slotName, EMPTY_STRUCT, MOD };
export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const SLOT_DEF = [['\\frac{#?}{#?}', '분수'], ['\\sqrt{#?}', '제곱근'], ['#@^{#?}', '위첨자'], ['#@_{#?}', '아래첨자'], ['\\vec{#?}', '벡터'], ['\\int_{#?}^{#?}', '적분'], ['\\sum_{#?}^{#?}', '시그마'], ['\\lim_{#?}', '극한'], ['\\Delta', '델타'], ['\\theta', '세타']];
const LS = { get(k, d) { try { const v = localStorage.getItem('5e-eq-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('5e-eq-' + k, JSON.stringify(v)); } catch {} } };
export const slots = () => { const s = LS.get('slots', null); return Array.isArray(s) && s.length === 10 ? s : SLOT_DEF.map(x => [...x]); };
const saveSlots = s => LS.set('slots', s);
export const dollarOn = () => LS.get('dollar', true) !== false;
const slotShow = t => t.replace(/\\text\{#\?\}/g, '\\text{가}').replace(/#\?/g, '\\square').replace(/#@/g, 'x');
const slotText = t => t.replace(/#@/g, '').replace(/#\?/g, '');
const slotName = x => x ? (x[1] || x[0].replace(/\\/g, '')) : '';
const EMPTY_STRUCT = /(\\frac\{\}\{\}|\\sqrt\{\}|\\sqrt\[\]\{\}|\^\{\}|_\{\}|_\{\}\^\{\}|\\vec\{\}|\\overline\{\}|\\int_\{\}\^\{\}|\\sum_\{\}\^\{\}|\\prod_\{\}\^\{\}|\\lim_\{\})$/;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl+';

// ── 글 속 수식 띠 ──
export function attachMathInput(host, { onChange } = {}) {
  const doc = host.ownerDocument, win = doc.defaultView; loadMath(doc);
  let band = null, help = null;
  const sel = () => win.getSelection();
  const caretTo = (node, off) => { const r = doc.createRange(), s = sel(); r.setStart(node, off); r.collapse(true); s.removeAllRanges(); s.addRange(r); };
  const srcOf = b => b.textContent.replace(/\u200b/g, '');
  const inBand = () => band && band.contains(sel().anchorNode);
  function ensureHelp() {
    if (help) return help;
    help = doc.createElement('div'); help.className = 'eq-help'; help.hidden = true;
    help.innerHTML = `<div class="eq-prev"></div><div class="eq-row"></div><div class="eq-hf"><span class="eq-kind"></span><span class="eq-sp"></span><span class="eq-key">${MOD}1~${MOD}0 · $·→·Esc 끝</span><button type="button" class="eq-b" data-big title="큰 편집기 · ${MOD}⇧E">⋯ 큰 편집기</button></div>`;
    doc.body.appendChild(help);
    help.addEventListener('mousedown', e => e.preventDefault());
    help.addEventListener('click', e => { const k = e.target.closest('[data-q]'); if (k) { insertSlot(+k.dataset.q); return; } if (e.target.closest('[data-big]')) openBig(); });
    drawRow(); return help;
  }
  function drawRow() { if (!help) return; const S = slots(); help.querySelector('.eq-row').innerHTML = S.map((x, i) => `<button type="button" class="eq-k" data-q="${i}" title="${E(slotName(x))} · ${MOD}${KEYS[i]} — ${MOD}Z 한 번에 지워짐"${x ? '' : ' disabled'}><span class="eq-n">${KEYS[i]}</span>${x ? renderTex(slotShow(x[0])) : ''}</button>`).join(''); }
  function place() {
    if (!band || !help) return; const r = band.getBoundingClientRect(); help.hidden = false;
    const w = help.offsetWidth || 428, h = help.offsetHeight || 150; let left = Math.max(8, Math.min(r.left - 12, win.innerWidth - w - 8)), top = r.bottom + 10;
    if (top + h > win.innerHeight - 8) top = Math.max(8, r.top - h - 10);
    help.style.left = left + 'px'; help.style.top = top + 'px'; help.style.setProperty('--ar', Math.max(12, r.left - left + 8) + 'px');
  }
  function refresh() {
    if (!band) return; ensureHelp(); const src = srcOf(band), kind = detectSyntax(src);
    help.querySelector('.eq-kind').textContent = !src.trim() ? '한글 수식 · LaTeX 둘 다' : kind === 'hwp' ? '한글 수식' : kind === 'latex' ? 'LaTeX' : '한글 수식 · LaTeX 같음';
    help.querySelector('.eq-prev').innerHTML = src.trim() ? renderTex(toLatex(src)) : '<span class="eq-empty">수식을 치면 여기에 그려집니다</span>';
    place();
  }
  function startBand(src = '') {
    const s = sel(); if (!s.rangeCount || !host.contains(s.anchorNode)) return;
    const r = s.getRangeAt(0); r.deleteContents(); band = doc.createElement('span'); band.className = 'eq-band'; band.textContent = '\u200b' + src;
    r.insertNode(band); caretTo(band.firstChild, band.firstChild.length); refresh();
  }
  function endBand() {
    if (!band) return; const src = srcOf(band).trim(), b = band; band = null; if (help) help.hidden = true;
    if (!src) { const t = doc.createTextNode(''); b.replaceWith(t); caretTo(t, 0); onChange?.(); return; }
    const tex = toLatex(src), c = doc.createElement('span'); c.className = 'eq-chip'; c.contentEditable = 'false'; c.dataset.tex = tex; c.dataset.src = src; c.title = '눌러서 고치기'; c.innerHTML = renderTex(tex);
    b.replaceWith(c); const sp = doc.createTextNode('\u00a0'); c.after(sp); caretTo(sp, 1); onChange?.();
  }
  function editChip(c) { if (band) endBand(); const src = c.dataset.src || c.dataset.tex; const b = doc.createElement('span'); b.className = 'eq-band'; b.textContent = '\u200b' + src; c.replaceWith(b); band = b; host.focus(); caretTo(b.firstChild, b.firstChild.length); refresh(); }
  function insertSlot(i) {
    const x = slots()[i]; if (!x || !band) return; const t = slotText(x[0]); if (!inBand()) caretTo(band.firstChild, band.firstChild.length);
    doc.execCommand('insertText', false, t);// 되돌리기 한 번에 통째로
    const node = band.firstChild, pos = sel().anchorOffset, first = t.indexOf('{}'); if (first >= 0) caretTo(node, pos - t.length + first + 1);
    refresh(); const k = help?.querySelector(`[data-q="${i}"]`); k?.classList.add('flash'); setTimeout(() => k?.classList.remove('flash'), 260);
  }
  async function openBig() {
    if (!band) return; const b = band, src = srcOf(b), r = b.getBoundingClientRect();
    if (help) help.hidden = true;
    const tex = await openMathEditor(doc, { tex: toLatex(src), anchor: r });
    if (tex == null) { if (b.isConnected) { band = b; host.focus(); caretTo(b.firstChild, b.firstChild.length); refresh(); } return; }
    if (b.isConnected) { b.textContent = '\u200b' + tex; band = b; endBand(); }
  }
  const onBefore = e => {
    if (e.inputType === 'insertText' && e.data === '$' && (dollarOn() || inBand())) { e.preventDefault(); if (inBand()) endBand(); else startBand(); return; }
    if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') { const t = e.dataTransfer?.getData('text/plain'); if (t != null) { e.preventDefault(); doc.execCommand('insertText', false, t); } }
  };
  const onKey = e => {
    const m = e.metaKey || e.ctrlKey;
    if (m && !e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) { if (!band) startBand(); openBig(); return; } if (band) { endBand(); return; } const t = sel().toString(); startBand(t.trim() ? t : ''); return; }
    if (!band || !inBand()) return;
    if (m && !e.altKey && KEYS.includes(e.key)) { e.preventDefault(); e.stopPropagation(); insertSlot(KEYS.indexOf(e.key)); return; }
    const s = sel();
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); endBand(); return; }
    if (e.key === 'ArrowRight' && s.isCollapsed && s.anchorNode === band.firstChild && s.anchorOffset >= band.firstChild.length) { e.preventDefault(); endBand(); return; }
    if (e.key === 'Backspace' && s.isCollapsed && s.anchorNode === band.firstChild) {// 빈 구조는 백스페이스 한 번에 통째로
      const t = band.firstChild, o = s.anchorOffset, m2 = t.data.slice(0, o).match(EMPTY_STRUCT);
      if (m2) { e.preventDefault(); const r = doc.createRange(); r.setStart(t, o - m2[0].length); r.setEnd(t, o); s.removeAllRanges(); s.addRange(r); doc.execCommand('delete'); refresh(); }
    }
  };
  const onInput = () => { if (band && !host.contains(band)) { band = null; if (help) help.hidden = true; } refresh(); onChange?.(); };
  const onClick = e => { const c = e.target.closest?.('.eq-chip'); if (c && host.contains(c) && host.isContentEditable) { e.preventDefault(); editChip(c); } };
  const onSel = () => { if (band && !band.contains(sel().anchorNode) && !(help && help.contains(doc.activeElement))) { const b = band; setTimeout(() => { if (band === b && !b.contains(sel().anchorNode)) endBand(); }, 0); } };
  const onScroll = () => place();
  host.addEventListener('beforeinput', onBefore); host.addEventListener('keydown', onKey, true); host.addEventListener('input', onInput); host.addEventListener('click', onClick);
  doc.addEventListener('selectionchange', onSel); win.addEventListener('resize', onScroll); doc.addEventListener('scroll', onScroll, true);
  loadMath(doc).then(() => { drawRow(); host.querySelectorAll('.eq-chip').forEach(c => { c.innerHTML = renderTex(c.dataset.tex); }); refresh(); });
  return {
    endBand, isOpen: () => !!band,
    detach() { endBand(); host.removeEventListener('beforeinput', onBefore); host.removeEventListener('keydown', onKey, true); host.removeEventListener('input', onInput); host.removeEventListener('click', onClick); doc.removeEventListener('selectionchange', onSel); win.removeEventListener('resize', onScroll); doc.removeEventListener('scroll', onScroll, true); help?.remove(); help = null; },
  };
}

// ── 큰 편집기 ──
export async function openMathEditor(doc, { tex = '', anchor = null } = {}) {
  const m = await loadMath(doc), win = doc.defaultView;
  return new Promise(resolve => {
    const back = doc.createElement('div'); back.className = 'eq-back';
    const box = doc.createElement('div'); box.className = 'eq-big'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '수식 편집기');
    box.innerHTML = `<div class="eq-bh"><b>수식</b><span class="eq-sp"></span><button type="button" class="eq-ib" data-gear title="수식 입력 설정 — 빠른 단추 10칸">${GEAR}</button><button type="button" class="eq-ib" data-close title="닫기 · Esc">${XICO}</button></div>
      <div class="eq-view"><div class="eq-mfslot"></div>
        <div class="eq-src"><label>한글 수식</label><textarea data-hwp spellcheck="false" placeholder="예: 1 over 2 mv^2"></textarea></div>
        <div class="eq-src"><label>LaTeX</label><textarea data-tex spellcheck="false" placeholder="예: \\frac{1}{2}mv^2"></textarea></div><div class="eq-err"></div></div>
      <div class="eq-slotset" hidden><div class="eq-ssh"><b>빠른 단추 10칸</b><span>미니 도우미에 나오고, 입력기가 켜져 있을 때 ${MOD}1~${MOD}0로 넣습니다</span></div><div class="eq-ssgrid"></div>
        <div class="eq-ssf"><span class="eq-tip">아래 단추 판에서 끌어다 놓거나 단추를 오른쪽 클릭 · 칸 위 ×로 비우기</span><span class="eq-sp"></span><button type="button" class="eq-b" data-save title="지금 흰 칸의 수식을 통째로 한 칸에">지금 수식 저장</button><button type="button" class="eq-b" data-reset>기본값</button></div>
        <label class="eq-opt"><input type="checkbox" data-dollar> <b>$</b>로 수식 띠 열기 <span>(끄면 ${MOD}E로만 엶)</span></label></div>
      <div class="eq-tabs"></div><div class="eq-pal"></div>
      <div class="eq-bf"><span class="eq-sp"></span><button type="button" class="eq-b soft" data-put>넣기<kbd>${MOD}↩</kbd></button></div>`;
    back.appendChild(box); doc.body.appendChild(back);
    const $ = s => box.querySelector(s);
    const mf = new m.MathfieldElement(); mf.className = 'eq-mf'; mf.mathVirtualKeyboardPolicy = 'manual'; mf.smartFence = true; $('.eq-mfslot').replaceWith(mf);
    try { mf.menuItems = []; } catch {}
    let lock = false;
    const sync = from => { if (lock) return; lock = true; let t;
      if (from === 'hwp') { t = hwpToLatex($('[data-hwp]').value); mf.value = t; } else if (from === 'tex') { t = $('[data-tex]').value; mf.value = t; } else t = mf.value;
      if (from !== 'hwp') $('[data-hwp]').value = latexToHwp(t); if (from !== 'tex') $('[data-tex]').value = t;
      $('.eq-err').textContent = from !== 'mf' && t.trim() && !mf.value.trim() ? '이 부분을 알아보지 못했습니다 — 그대로 두고 계속 치거나 위 흰 칸에서 고쳐 주세요.' : ''; lock = false; };
    mf.value = tex; sync('mf');
    mf.addEventListener('input', () => sync('mf')); $('[data-hwp]').addEventListener('input', () => sync('hwp')); $('[data-tex]').addEventListener('input', () => sync('tex'));
    // 단추 판
    let tab = Object.keys(TABS)[0];
    const drawTabs = () => { $('.eq-tabs').innerHTML = Object.keys(TABS).map(k => `<button type="button" class="${k === tab ? 'on' : ''}" data-t="${k}">${k}</button>`).join('');
      $('.eq-pal').innerHTML = TABS[tab].map(([t, tip]) => `<button type="button" class="eq-k" draggable="true" data-ins="${encodeURIComponent(t)}" data-tip="${E(tip || '')}" title="${E(tip || t.replace(/\\/g, ''))} · 끌어서 빠른 단추 칸에 · 오른쪽 클릭">${renderTex(slotShow(t))}</button>`).join(''); };
    $('.eq-tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; drawTabs(); } });
    $('.eq-pal').addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (!b) return; mf.focus(); mf.executeCommand(['insert', decodeURIComponent(b.dataset.ins), { selectionMode: 'placeholder', focus: true }]); });
    drawTabs();
    // 빠른 단추 설정
    let S = slots(), pick = false;
    const drawSlots = () => { $('.eq-ssgrid').innerHTML = S.map((x, i) => `<div class="eq-slot${x ? '' : ' empty'}${pick ? ' pick' : ''}" data-slot="${i}" title="${E(slotName(x))} · ${MOD}${KEYS[i]}"><span class="eq-n">${MOD}${KEYS[i]}</span>${x ? renderTex(slotShow(x[0])) : ''}${x ? `<button type="button" class="eq-x" data-clear="${i}" aria-label="비우기">×</button>` : ''}</div>`).join(''); };
    const setSlot = (i, v) => { S[i] = v; saveSlots(S); drawSlots(); };
    $('[data-gear]').onclick = () => { const p = $('.eq-slotset'); p.hidden = !p.hidden; $('[data-gear]').classList.toggle('on', !p.hidden); drawSlots(); };
    $('[data-dollar]').checked = dollarOn(); $('[data-dollar]').onchange = e => LS.set('dollar', e.target.checked);
    $('.eq-pal').addEventListener('dragstart', e => { const b = e.target.closest('[data-ins]'); if (!b) return; e.dataTransfer.setData('text/x-5e-eq', JSON.stringify([decodeURIComponent(b.dataset.ins), b.dataset.tip || ''])); });
    const grid = $('.eq-ssgrid');
    grid.addEventListener('dragover', e => { const s = e.target.closest('.eq-slot'); if (!s) return; e.preventDefault(); grid.querySelectorAll('.over').forEach(x => x !== s && x.classList.remove('over')); s.classList.add('over'); });
    grid.addEventListener('dragleave', e => { const s = e.target.closest('.eq-slot'); if (s && !s.contains(e.relatedTarget)) s.classList.remove('over'); });
    grid.addEventListener('drop', e => { const s = e.target.closest('.eq-slot'); if (!s) return; e.preventDefault(); try { setSlot(+s.dataset.slot, JSON.parse(e.dataTransfer.getData('text/x-5e-eq'))); } catch {} });
    grid.addEventListener('click', e => { const c = e.target.closest('[data-clear]'); if (c) { setSlot(+c.dataset.clear, null); return; } const s = e.target.closest('.eq-slot'); if (s && pick) { pick = false; setSlot(+s.dataset.slot, [mf.value, '저장한 수식']); } });
    $('[data-save]').onclick = () => { if (!mf.value.trim()) return; pick = true; drawSlots(); };
    $('[data-reset]').onclick = () => { S = SLOT_DEF.map(x => [...x]); saveSlots(S); drawSlots(); };
    $('.eq-pal').addEventListener('contextmenu', e => { const b = e.target.closest('[data-ins]'); if (!b) return; e.preventDefault(); doc.querySelector('.eq-ctx')?.remove();
      const menu = doc.createElement('div'); menu.className = 'eq-ctx'; menu.innerHTML = '<b>빠른 단추 칸에 넣기</b>' + KEYS.map((k, i) => `<button type="button" data-to="${i}">${MOD}${k}</button>`).join(''); doc.body.appendChild(menu);
      const w = menu.offsetWidth, h = menu.offsetHeight; menu.style.left = Math.min(e.clientX, win.innerWidth - w - 8) + 'px'; menu.style.top = (e.clientY + h + 8 > win.innerHeight ? e.clientY - h - 4 : e.clientY) + 'px';
      menu.onclick = ev => { const t = ev.target.closest('[data-to]'); if (!t) return; setSlot(+t.dataset.to, [decodeURIComponent(b.dataset.ins), b.dataset.tip || '']); menu.remove(); };
      setTimeout(() => win.addEventListener('pointerdown', ev => { if (!menu.contains(ev.target)) menu.remove(); }, { once: true }), 0); });
    // 자리: 띠 아래(없으면 가운데)
    const r = anchor; const W = Math.min(600, win.innerWidth - 24);
    box.style.width = W + 'px';
    requestAnimationFrame(() => { const H = box.offsetHeight; let left = r ? Math.max(12, Math.min(r.left - 20, win.innerWidth - W - 12)) : (win.innerWidth - W) / 2; let top = r ? r.bottom + 10 : Math.max(20, (win.innerHeight - H) / 3); if (top + H > win.innerHeight - 12) top = Math.max(12, (r ? r.top : win.innerHeight) - H - 10); box.style.left = left + 'px'; box.style.top = top + 'px'; mf.focus(); });
    const done = v => { win.removeEventListener('keydown', key, true); back.remove(); doc.querySelector('.eq-ctx')?.remove(); resolve(v); };
    const key = e => { const mm = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); return; }
      if (mm && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(mf.value); return; }
      if (mm && !e.altKey && KEYS.includes(e.key)) { const x = S[KEYS.indexOf(e.key)]; if (x) { e.preventDefault(); e.stopPropagation(); mf.focus(); mf.executeCommand(['insert', x[0], { selectionMode: 'placeholder', focus: true }]); } } };
    win.addEventListener('keydown', key, true);
    $('[data-put]').onclick = () => done(mf.value); $('[data-close]').onclick = () => done(null);
    back.addEventListener('pointerdown', e => { if (e.target === back) done(mf.value); });// 바깥 누르면 넣고 닫기(친 것을 잃지 않게)
  });
}
const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
const XICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function addStyle(doc) {
  if (doc.getElementById('eq-style')) return; const st = doc.createElement('style'); st.id = 'eq-style'; st.textContent = `
.eq-band{background:rgba(107,164,248,.16);box-shadow:inset 0 0 0 1px rgba(107,164,248,.55);border-radius:4px;padding:1px 3px;margin:0 1px;font:12.5px ui-monospace,"SF Mono",Menlo,monospace;color:#cfe1ff;white-space:pre-wrap}
.eq-chip{display:inline-block;padding:0 2px;margin:0 1px;border-radius:4px;cursor:pointer;transition:background .2s cubic-bezier(.32,.72,0,1);vertical-align:baseline}
[contenteditable] .eq-chip:hover{background:rgba(107,164,248,.14);box-shadow:inset 0 0 0 1px rgba(107,164,248,.4)}
.eq-chip .ML__latex{font-size:1.08em}
.eq-help{position:fixed;z-index:9500;width:428px;border-radius:10px;background:#0d1117;color:#e6edf3;box-shadow:0 0 0 1px #30363d,0 16px 40px rgba(0,0,0,.55);font:12px -apple-system,"Apple SD Gothic Neo",sans-serif;animation:eq-pop .22s cubic-bezier(.32,.72,0,1)}
.eq-help[hidden]{display:none}
.eq-help::before{content:"";position:absolute;left:var(--ar,24px);top:-6px;width:10px;height:10px;background:#0d1117;transform:rotate(45deg);box-shadow:-1px -1px 0 0 #30363d}
@keyframes eq-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
.eq-prev{min-height:50px;margin:10px 10px 6px;padding:8px 12px;border-radius:8px;background:#fff;color:#1d1d1f;display:flex;align-items:center;font-size:20px;overflow-x:auto}
.eq-empty{color:#9aa3ad;font-size:12.5px;font-family:-apple-system,sans-serif}
.eq-row{display:flex;gap:3px;padding:0 10px 8px}
.eq-k{position:relative;min-width:38px;height:34px;padding:2px 4px;border:0;border-radius:7px;background:#141a22;box-shadow:inset 0 0 0 1px #21262d;color:#e6edf3;display:grid;place-items:center;cursor:pointer;overflow:hidden;transition:background .18s cubic-bezier(.32,.72,0,1),box-shadow .18s}
.eq-k:hover{background:#1b2330;box-shadow:inset 0 0 0 1px #3a4a62}.eq-k:disabled{opacity:.35;cursor:default}.eq-k.flash{background:#152137;box-shadow:inset 0 0 0 1px #6ba4f8}
.eq-k .ML__latex{font-size:12.5px}.eq-n{position:absolute;left:3px;top:1px;font:600 8.5px -apple-system,sans-serif;color:#7d8590}
.eq-hf{display:flex;align-items:center;gap:6px;padding:7px 10px;border-top:1px solid #21262d;color:#7d8590;font-size:11.5px}.eq-sp{flex:1}.eq-key{font-size:11px}
.eq-b{height:26px;padding:0 10px;border-radius:7px;border:1px solid #2a3442;background:#141a22;color:#b1bac4;font:11.5px -apple-system,sans-serif;display:inline-flex;align-items:center;gap:5px;cursor:pointer;transition:background .2s cubic-bezier(.32,.72,0,1)}
.eq-b:hover{background:#1b2330;color:#e6edf3}.eq-b.soft{height:32px;padding:0 13px;font-size:12.5px;border-color:#6ba4f8;background:#152137;color:#cfe1ff}.eq-b kbd{font:11px -apple-system,sans-serif;color:#8fb6ee;margin-left:4px}
.eq-back{position:fixed;inset:0;z-index:9600}
.eq-big{position:fixed;border-radius:12px;background:#0d1117;color:#e6edf3;box-shadow:0 0 0 1px #30363d,0 24px 60px rgba(0,0,0,.55);font:13px -apple-system,"Apple SD Gothic Neo",sans-serif;animation:eq-pop .3s cubic-bezier(.32,.72,0,1);max-height:calc(100vh - 24px);display:flex;flex-direction:column}
.eq-bh{display:flex;align-items:center;gap:6px;height:42px;padding:0 8px 0 14px;border-bottom:1px solid #21262d;flex:none}
.eq-ib{width:28px;height:28px;border:0;border-radius:7px;background:none;color:#b1bac4;display:grid;place-items:center;cursor:pointer}.eq-ib:hover,.eq-ib.on{background:#152137;color:#cfe1ff}.eq-ib svg{width:16px;height:16px}
.eq-view{padding:12px 14px 4px;flex:none}
.eq-mf{display:block;width:100%;min-height:70px;padding:10px 14px;border-radius:9px;background:#fff;color:#1d1d1f;font-size:26px;border:0;outline:none;--caret-color:#2f6fd6;--selection-background-color:#dbe8ff}
.eq-mf::part(virtual-keyboard-toggle),.eq-mf::part(menu-toggle){display:none}
.eq-src{display:flex;gap:8px;margin-top:8px}.eq-src label{flex:none;width:58px;font-size:11.5px;color:#7d8590;padding-top:9px}
.eq-src textarea{flex:1;height:36px;resize:none;border-radius:8px;border:1px solid #30363d;background:#0a0d12;color:#e6edf3;font:13px/1.4 ui-monospace,"SF Mono",Menlo,monospace;padding:8px 10px;outline:none}.eq-src textarea:focus{border-color:#4b6fa8}
.eq-err{min-height:16px;margin:4px 0 0 66px;font-size:11.5px;color:#d9a35a}
.eq-tabs{display:flex;gap:1px;padding:0 10px;border-top:1px solid #21262d;border-bottom:1px solid #21262d;overflow-x:auto;scrollbar-width:none;flex:none}
.eq-tabs button{height:32px;padding:0 7px;border:0;border-bottom:2px solid transparent;background:none;color:#7d8590;font:12px -apple-system,sans-serif;cursor:pointer;white-space:nowrap}.eq-tabs button.on{color:#e6edf3;border-bottom-color:#6ba4f8}
.eq-pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:3px;padding:8px 14px;max-height:170px;overflow-y:auto;align-content:start}
.eq-pal .eq-k{height:auto;min-height:38px}.eq-pal .eq-k:has(.ML__mtable),.eq-pal .eq-k:has(.ML__array){grid-column:span 2}
.eq-bf{display:flex;align-items:center;padding:10px 14px;border-top:1px solid #21262d;flex:none}
.eq-slotset{padding:10px 14px 12px;border-top:1px solid #21262d;background:#0b0f15;flex:none}.eq-slotset[hidden]{display:none}
.eq-ssh{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}.eq-ssh b{font-size:12.5px}.eq-ssh span{font-size:11px;color:#7d8590}
.eq-ssgrid{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}
.eq-slot{position:relative;height:42px;border-radius:7px;background:#141a22;box-shadow:inset 0 0 0 1px #21262d;display:grid;place-items:center;overflow:hidden}
.eq-slot .ML__latex{font-size:12px}.eq-slot.empty{background:transparent;box-shadow:inset 0 0 0 1px #30363d}.eq-slot.over{box-shadow:inset 0 0 0 1.5px #6ba4f8;background:#152137}.eq-slot.pick{box-shadow:inset 0 0 0 1.5px #e3b341;cursor:pointer}
.eq-x{position:absolute;right:2px;top:1px;width:15px;height:15px;border:0;border-radius:8px;background:rgba(13,17,23,.8);color:#fff;font-size:10px;line-height:15px;cursor:pointer;opacity:0;transition:opacity .15s}.eq-slot:hover .eq-x{opacity:1}
.eq-ssf{display:flex;align-items:center;gap:6px;margin-top:8px}.eq-tip{font-size:11px;color:#7d8590}
.eq-opt{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:#b1bac4}.eq-opt span{color:#7d8590;font-size:11px}
.eq-ctx{position:fixed;z-index:9700;padding:4px;border-radius:9px;background:#0d1117;box-shadow:0 0 0 1px #30363d,0 12px 30px rgba(0,0,0,.5);display:grid;grid-template-columns:repeat(5,auto);gap:2px;font:12px -apple-system,sans-serif}
.eq-ctx b{grid-column:1/-1;font-size:11px;color:#7d8590;padding:2px 6px 4px;font-weight:500}.eq-ctx button{height:26px;padding:0 9px;border:0;border-radius:6px;background:none;color:#e6edf3;cursor:pointer}.eq-ctx button:hover{background:#1b2330}
`; doc.head.appendChild(st);
}
