// 5E 수식 입력 — 문항 카드 글 칸(textarea·input)용(11-13).
// 칸은 그대로 일반 글 칸(`$LaTeX$` 글)으로 두고, 그 위에
//   · 고칠 때: 커서가 $…$ 안에 있으면 그 구간을 파란 띠로 칠하고(뒤판 겹치기), 아래에 미니 도우미
//   · 안 고칠 때: 수식이 든 칸은 그려진 모양으로 보이고, 누르면 다시 글 칸
// 키: $ 열기·닫기(설정으로 끔), ⌘E 열기·닫기·고른 글을 수식으로, ⌘⇧E 큰 편집기, ⌘1~⌘0 빠른 단추, Esc·Enter·→(끝) 빠져나오기,
//     빈 구조 백스페이스 한 번에 통째로, 단추로 넣은 것은 ⌘Z 한 번에 통째로(execCommand insertText).
import { toLatex, detectSyntax } from './hwp-latex.js?v=1113';
import { loadMath, renderTex, mathToHtml, hasMath, slots, KEYS, dollarOn, openMathEditor, slotText, slotShow, slotName, EMPTY_STRUCT, MOD } from './eq-input.js?v=1113';

const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 커서 둘레의 $…$ 구간: {a: 여는 $ 위치, b: 닫는 $ 위치(없으면 -1)} 또는 null
export function regionAt(text, pos) {
  const ds = []; for (let i = 0; i < text.length; i++) if (text[i] === '$' && text[i - 1] !== '\\') ds.push(i);
  for (let k = 0; k < ds.length; k += 2) { const a = ds[k], b = ds[k + 1] ?? -1; if (pos > a && (b < 0 || pos <= b)) return { a, b }; }
  return null;
}

export function attachMathFields(root, { selector }) {
  const doc = root.ownerDocument, win = doc.defaultView; loadMath(doc);
  let field = null, help = null, back = null;
  const isField = t => t && t.matches?.(selector);
  const region = () => field ? regionAt(field.value, field.selectionStart) : null;
  const set = (a, b = a) => field.setSelectionRange(a, b);
  const insert = t => { field.focus(); doc.execCommand('insertText', false, t); };// 되돌리기 한 번에 통째로
  function ensureHelp() {
    if (help) return help;
    help = doc.createElement('div'); help.className = 'eq-help'; help.hidden = true;
    help.innerHTML = `<div class="eq-prev"></div><div class="eq-row"></div><div class="eq-hf"><span class="eq-kind"></span><span class="eq-sp"></span><span class="eq-key">${MOD}1~${MOD}0 · $·→·Esc 끝</span><button type="button" class="eq-b" data-big title="큰 편집기 · ${MOD}⇧E">⋯ 큰 편집기</button></div>`;
    doc.body.appendChild(help);
    help.addEventListener('mousedown', e => e.preventDefault());
    help.addEventListener('click', e => { const k = e.target.closest('[data-q]'); if (k) { insertSlot(+k.dataset.q); return; } if (e.target.closest('[data-big]')) openBig(); });
    drawRow(); return help;
  }
  function drawRow() { if (!help) return; help.querySelector('.eq-row').innerHTML = slots().map((x, i) => `<button type="button" class="eq-k" data-q="${i}" title="${E(slotName(x))} · ${MOD}${KEYS[i]} — ${MOD}Z 한 번에 지워짐"${x ? '' : ' disabled'}><span class="eq-n">${KEYS[i]}</span>${x ? renderTex(slotShow(x[0])) : ''}</button>`).join(''); }
  // 뒤판(띠 칠하기): 칸과 같은 글꼴·여백·줄바꿈으로 글을 다시 그리고, $…$ 구간만 파랗게
  const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'textIndent', 'wordBreak', 'overflowWrap', 'tabSize', 'textAlign'];
  function mirror(el) { const m = doc.createElement('div'), cs = win.getComputedStyle(el); for (const k of COPY) m.style[k] = cs[k]; m.style.whiteSpace = el.tagName === 'INPUT' ? 'pre' : 'pre-wrap'; m.style.borderColor = 'transparent'; m.style.borderStyle = 'solid'; return m; }
  function paintBack(r) {
    if (!field || !r) { back?.remove(); back = null; if (field) field.classList.remove('eq-live'); return; }
    const host = field.parentElement; if (win.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (!back || back.parentElement !== host) { back?.remove(); back = mirror(field); back.className = 'eq-back-paint'; host.insertBefore(back, field); }
    const v = field.value, b = r.b < 0 ? v.length : r.b + 1;
    back.innerHTML = E(v.slice(0, r.a)) + '<mark class="eq-mark">' + E(v.slice(r.a, b)) + '</mark>' + E(v.slice(b)) + '​';
    Object.assign(back.style, { position: 'absolute', left: field.offsetLeft + 'px', top: field.offsetTop + 'px', width: field.offsetWidth + 'px', height: field.offsetHeight + 'px', overflow: 'hidden', pointerEvents: 'none', color: 'transparent', margin: '0' });
    back.scrollTop = field.scrollTop; back.scrollLeft = field.scrollLeft; field.classList.add('eq-live');
  }
  function caretRect(pos) {
    const m = mirror(field); Object.assign(m.style, { position: 'fixed', visibility: 'hidden', left: '0', top: '0', width: field.offsetWidth + 'px' });
    m.textContent = field.value.slice(0, pos); const sp = doc.createElement('span'); sp.textContent = '​'; m.appendChild(sp); doc.body.appendChild(m);
    const f = field.getBoundingClientRect(), s = sp.getBoundingClientRect(); m.remove();
    return { left: f.left + s.left - field.scrollLeft, top: f.top + s.top - field.scrollTop, bottom: f.top + s.bottom - field.scrollTop };
  }
  function refresh() {
    const r = region(); paintBack(r);
    if (!r) { if (help) help.hidden = true; return; }
    ensureHelp(); const v = field.value, src = v.slice(r.a + 1, r.b < 0 ? v.length : r.b), kind = detectSyntax(src);
    help.querySelector('.eq-kind').textContent = !src.trim() ? '한글 수식 · LaTeX 둘 다' : kind === 'hwp' ? '한글 수식' : kind === 'latex' ? 'LaTeX' : '한글 수식 · LaTeX 같음';
    help.querySelector('.eq-prev').innerHTML = src.trim() ? renderTex(toLatex(src)) : '<span class="eq-empty">수식을 치면 여기에 그려집니다</span>';
    const c = caretRect(r.a), w = help.offsetWidth || 428, h = help.offsetHeight || 150; help.hidden = false;
    let left = Math.max(8, Math.min(c.left - 12, win.innerWidth - w - 8)), top = c.bottom + 10; if (top + h > win.innerHeight - 8) top = Math.max(8, c.top - h - 10);
    help.style.left = left + 'px'; help.style.top = top + 'px'; help.style.setProperty('--ar', Math.max(12, c.left - left + 8) + 'px');
  }
  // 띠를 닫을 때: 한글 수식으로 쳤으면 LaTeX로 바꿔 둔다(저장은 LaTeX 하나)
  function close(r = region()) {
    if (!r) return; const v = field.value; let b = r.b;
    if (b < 0) { set(v.length); insert('$'); b = field.value.length - 1; }
    const src = field.value.slice(r.a + 1, b);
    if (!src.trim()) { set(r.a, b + 1); insert(''); refresh(); return; }// 빈 띠는 지움
    const tex = toLatex(src); if (tex !== src) { set(r.a + 1, b); insert(tex); b = r.a + 1 + tex.length; }
    set(b + 1); refresh();
  }
  function open() { const s = field.selectionStart, e = field.selectionEnd; if (e > s) { const t = field.value.slice(s, e); insert('$' + t + '$'); set(s + 1 + t.length); } else { insert('$$'); set(s + 1); } refresh(); }
  function insertSlot(i) { const x = slots()[i], r = region(); if (!x || !r) return; const t = slotText(x[0]); const pos = field.selectionStart; insert(t); const first = t.indexOf('{}'); if (first >= 0) set(pos + first + 1); refresh(); const k = help?.querySelector(`[data-q="${i}"]`); k?.classList.add('flash'); setTimeout(() => k?.classList.remove('flash'), 260); }
  async function openBig() {
    const r = region(); if (!r) return; const f = field, v = f.value, b = r.b < 0 ? v.length : r.b, src = v.slice(r.a + 1, b), rect = f.getBoundingClientRect(); if (help) help.hidden = true;
    const tex = await openMathEditor(doc, { tex: toLatex(src), anchor: caretRect(r.a) });
    f.focus(); field = f; if (tex == null) { set(b); refresh(); return; }
    set(r.a, r.b < 0 ? v.length : r.b + 1); insert('$' + tex + '$'); refresh();
  }
  root.addEventListener('beforeinput', e => {
    if (!isField(e.target)) return; field = e.target;
    if (e.inputType === 'insertText' && e.data === '$') { const r = region(); if (r) { e.preventDefault(); close(r); return; } if (dollarOn()) { e.preventDefault(); open(); } }
  });
  root.addEventListener('keydown', e => {
    if (!isField(e.target)) return; field = e.target; const m = e.metaKey || e.ctrlKey;
    if (m && !e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) { if (!region()) open(); openBig(); return; } if (region()) close(); else open(); return; }
    const r = region(); if (!r) return;
    if (m && !e.altKey && KEYS.includes(e.key)) { e.preventDefault(); e.stopPropagation(); insertSlot(KEYS.indexOf(e.key)); return; }
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); close(r); return; }
    const s = field.selectionStart, end = field.selectionEnd;
    if (e.key === 'ArrowRight' && s === end && r.b >= 0 && s === r.b) { e.preventDefault(); close(r); return; }
    if (e.key === 'Backspace' && s === end) {
      if (s === r.a + 1 && r.b === s) { e.preventDefault(); set(r.a, r.b + 1); insert(''); refresh(); return; }// 빈 $$
      const mm = field.value.slice(r.a + 1, s).match(EMPTY_STRUCT); if (mm) { e.preventDefault(); set(s - mm[0].length, s); insert(''); refresh(); }
    }
  }, true);
  const onMove = e => { if (isField(e.target)) { field = e.target; requestAnimationFrame(refresh); } };
  root.addEventListener('input', onMove); root.addEventListener('keyup', onMove); root.addEventListener('mouseup', onMove); root.addEventListener('scroll', () => field && refresh(), true);
  root.addEventListener('focusin', e => { if (!isField(e.target)) return; field = e.target; showView(field, false); requestAnimationFrame(refresh); });
  root.addEventListener('focusout', e => { if (!isField(e.target)) return; const f = e.target; setTimeout(() => { if (doc.activeElement === f || doc.querySelector('.eq-back')) return; if (field === f) { const r = regionAt(f.value, f.selectionStart); if (r && r.b < 0) { field = f; close(r); } paintBack(null); if (help) help.hidden = true; } showView(f, true); }, 0); });
  // 안 고칠 때: 수식이 든 칸은 그려진 모양으로
  function showView(f, on) {
    let v = f.previousElementSibling?.classList?.contains('eq-fview') ? f.previousElementSibling : null;
    if (!on || !hasMath(f.value)) { v?.remove(); f.classList.remove('eq-hide'); return; }
    if (!v) { v = doc.createElement('div'); v.className = 'eq-fview'; v.tabIndex = -1; v.title = '눌러서 고치기'; f.before(v); v.addEventListener('mousedown', ev => { ev.preventDefault(); v.remove(); f.classList.remove('eq-hide'); f.focus(); const n = f.value.length; f.setSelectionRange(n, n); }); }
    v.innerHTML = mathToHtml(f.value).replace(/\n/g, '<br>'); f.classList.add('eq-hide');
    const cs = win.getComputedStyle(f); for (const k of ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'color']) v.style[k] = cs[k];
  }
  function decorate() { root.querySelectorAll(selector).forEach(f => { if (f !== doc.activeElement) showView(f, true); }); }
  loadMath(doc).then(() => { drawRow(); decorate(); });
  addFieldStyle(doc);
  return { decorate, refresh };
}
function addFieldStyle(doc) {
  if (doc.getElementById('eq-field-style')) return; const st = doc.createElement('style'); st.id = 'eq-field-style'; st.textContent = `
.eq-back-paint{z-index:0;white-space:pre-wrap}.eq-mark{background:rgba(107,164,248,.18);box-shadow:inset 0 0 0 1px rgba(107,164,248,.55);border-radius:3px;color:transparent}
textarea.eq-live,input.eq-live{position:relative;z-index:1;background:transparent!important}
.eq-hide{display:none!important}
.eq-fview{cursor:text;min-height:30px;white-space:pre-wrap;border-radius:5px;overflow-wrap:anywhere}.eq-fview:hover{background:var(--ds-doc-hover,#f6f8fa)}
.eq-fview .eq-chip{cursor:text}
`; doc.head.appendChild(st);
}
