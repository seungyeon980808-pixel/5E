// 5E 수식 입력 — 문항 카드 글 칸용(11-13, 11-13 밤 칩 방식으로 바꿈 · 시안 exam-fixes-1113 C).
// 예전에는 글 칸(textarea)을 누르면 칸 전체가 `$…$` 원문으로 풀렸다. 이제 아이디어 판 메모와 같은 칩 방식:
//   · 글은 그려진 그대로 두고, 누른 수식 칩만 원문 띠로 열린다(eq-input.js attachMathInput).
//   · 원래 글 칸(textarea·input)은 숨겨 두고 저장 통로로만 쓴다 — 고칠 때마다 `$LaTeX$` 글을 그 칸에 넣고 input 이벤트를 보내
//     카드의 기존 저장·되돌리기·완성도 계산이 그대로 돈다. 칸을 다시 그려도 띠는 칩 칸 안에 살아 있어 「치다가 꺼짐」이 없다.
// 키: $ 열기·닫기(설정으로 끔), ⌘E 열기·닫기·고른 글을 수식으로, ⌘⇧E 큰 편집기, ⌘1~⌘0 빠른 단추, Esc·Enter·→(끝) 빠져나오기.
import { loadMath, mathToHtml, htmlToMath, attachMathInput } from './eq-input.js?v=1.7.0-four-session-integration';

// 커서 둘레의 $…$ 구간: {a: 여는 $ 위치, b: 닫는 $ 위치(없으면 -1)} 또는 null
export function regionAt(text, pos) {
  const ds = []; for (let i = 0; i < text.length; i++) if (text[i] === '$' && text[i - 1] !== '\\') ds.push(i);
  for (let k = 0; k < ds.length; k += 2) { const a = ds[k], b = ds[k + 1] ?? -1; if (pos > a && (b < 0 || pos <= b)) return { a, b }; }
  return null;
}

// 글 칸 모양을 그대로 옮긴다(글꼴·여백·테두리·바탕). 폭은 칸이 놓인 자리를 따른다.
const COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'textAlign',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'boxSizing',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'gridColumn', 'gridRow'];

export function attachMathFields(root, { selector }) {
  const doc = root.ownerDocument, win = doc.defaultView; loadMath(doc); addFieldStyle(doc);
  const caretEnd = el => { const r = doc.createRange(), s = win.getSelection(); r.selectNodeContents(el); r.collapse(false); s.removeAllRanges(); s.addRange(r); };
  function bind(f) {
    if (f._eqce?.isConnected || f.disabled || f.readOnly) return;
    const one = f.tagName === 'INPUT', cs = win.getComputedStyle(f), ce = doc.createElement('div');
    ce.className = 'eq-ce' + (one ? ' eq-one' : '');
    ce.contentEditable = 'plaintext-only'; if (ce.contentEditable !== 'plaintext-only') ce.contentEditable = 'true';
    ce.spellcheck = false; ce.setAttribute('role', 'textbox'); if (!one) ce.setAttribute('aria-multiline', 'true');
    ce.dataset.ph = f.placeholder || ''; ce.setAttribute('aria-label', f.getAttribute('aria-label') || f.placeholder || '');
    if (f.title) ce.title = f.title;
    for (const k of COPY) ce.style[k] = cs[k];
    ce.style.minHeight = Math.max(parseFloat(cs.minHeight) || 0, one ? f.offsetHeight : 0) + 'px';
    if (one && f.style.width) ce.style.width = f.style.width;
    ce.innerHTML = mathToHtml(f.value); ce._last = f.value;
    f.after(ce); f.classList.add('eq-hide'); f._eqce = ce; ce._field = f;
    const ctl = attachMathInput(ce, { onChange: push });
    function push() {
      let v = htmlToMath(ce); if (one) v = v.replace(/\n/g, ' ');
      if (!ce.querySelector('.eq-chip,.eq-band') && !ce.textContent.replace(/​/g, '').length && ce.innerHTML) ce.innerHTML = '';
      if (v === f.value) return; f.value = v; ce._last = v; f.dispatchEvent(new Event('input', { bubbles: true }));
    }
    ce.addEventListener('input', push);
    // 11-22: 덮어씌운 글 칸이 <label> 안(선지 줄: 정답 라디오 + 글)에 있으면, 글 칸을 누를 때 label 기본 동작이 첫 컨트롤(정답 라디오)로
    // 넘어가 정답이 조용히 바뀌고 커서도 안 들어갔다. label 동작만 막고(커서 놓기는 mousedown에서 이미 됨) 글 칸에 초점을 준다.
    ce.addEventListener('click', e => { if (!ce.closest('label')) return; e.preventDefault(); if (doc.activeElement !== ce) ce.focus(); });
    // 줄 칸·한 줄 칸에서 Enter는 원래 칸의 동작(다음 줄로)으로 — 띠를 닫는 Enter는 이미 막혀 있다(defaultPrevented)
    ce.addEventListener('keydown', e => {
      if (e.isComposing || e.defaultPrevented || e.key !== 'Enter' || e.shiftKey || ctl.isOpen()) return;
      if (one || f.dataset.cvline !== undefined) { e.preventDefault(); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); }
    });
    // 원래 칸으로 오는 초점(다시 그린 뒤 되돌리기·다음 줄로 넘기기)은 칩 칸으로
    f.addEventListener('focus', () => { if (doc.activeElement !== ce) { ce.focus({ preventScroll: true }); caretEnd(ce); } });
  }
  function sync(f) { const ce = f?._eqce; if (!ce || doc.activeElement === ce || ce.contains(doc.activeElement)) return; if (f.value !== ce._last) { ce.innerHTML = mathToHtml(f.value); ce._last = f.value; } }
  function decorate() { root.querySelectorAll(selector).forEach(f => { bind(f); sync(f); }); }
  function refresh() { root.querySelectorAll(selector).forEach(sync); }
  loadMath(doc).then(decorate);
  return { decorate, refresh, sync, fieldOf: el => el?.closest?.('.eq-ce')?._field || null };
}
function addFieldStyle(doc) {
  if (doc.getElementById('eq-field-style')) return; const st = doc.createElement('style'); st.id = 'eq-field-style'; st.textContent = `
.eq-hide{display:none!important}
.eq-ce{display:block;outline:0;white-space:pre-wrap;overflow-wrap:anywhere;cursor:text;min-width:0}
.eq-ce.eq-one{display:flex;align-items:center;flex-wrap:wrap}
.eq-ce:empty::before{content:attr(data-ph);color:#9aa3ad;pointer-events:none}
.eq-ce:focus{border-color:var(--go-line,#2f6fd6)!important;background-color:#f6f9ff!important}
.eq-ce .eq-band{color:#1f4fa8;background:rgba(47,111,214,.10);box-shadow:inset 0 0 0 1px rgba(47,111,214,.45)}
`; doc.head.appendChild(st);
}
