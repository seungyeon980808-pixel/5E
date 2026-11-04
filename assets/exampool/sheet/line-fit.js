// 윗줄부터 자간 맞춤(10-22 조판 기준 C-5, 설계 typeset-standard-design-1022.md 2·9절).
// 어절 단위로 줄을 나누면 양쪽 정렬이 남는 폭을 띄어쓰기에 몰아 준다. 교사가 하듯 윗줄부터:
//  1) 띄어쓰기가 넓게 벌어진 줄(남는 폭 > 6%)은 자간을 조금씩 줄여(하한 low) 다음 어절을 끌어올리고, 안 되면 자간을 넓혀(상한 high) 글자 사이로 채운다.
//  2) 끝줄이 너무 짧으면(폭 < shortLastLine%) 바로 윗줄을 줄여 끌어올리거나, 넓혀 한 어절을 더 내려보낸다.
//  3) 맞춘 뒤 넓은 줄이 늘거나 줄 수가 늘면 그 문단은 되돌린다.
// 엔진 성질: 줄 범위에 자간을 주면 그 줄부터 아래만 다시 나뉜다(윗줄 불변) → 윗줄부터 차례로 맞춘다. 자간은 정수 %.
// 건너뜀: 머리(「n. 」「ㄱ. 」「① 」「(가) 」 — 내어쓰기 선이 머리 폭으로 걸려 있음), 수식·그림이 든 문단, 표 칸(〈보기〉·표는 미리 줄을 나눠 넣음).
const J = v => typeof v === 'string' ? JSON.parse(v) : v;
const HEAD = /^(?:\d{1,3}\.|[ㄱ-ㅎ]\.|[①-⑳]|\([가-하]\)|서술형\s*\d+\.)[  ]/;
const WIDE = 0.06;

// school(11-02 학교 양식): 수식이 든 문단도 맞추고(applyCharFormat·getLineInfo는 수식을 한 칸으로 같게 셈, 실측), 줄 오른쪽 끝은 쪽 여백이 아니라
// 그 문단의 양쪽 정렬 줄 끝으로 잰다(여러 단·그림 옆으로 좁힌 문단). 수능 틀은 예전 그대로.
export function fitQuestionLines(doc, { low = -10, high = 0, shortLastLine = 15, base = -5, section = 0, trace = null, school = false } = {}) {
  // 내어쓰기·어울림을 건 뒤에는 줄 배치 정보가 옛것이라(getLineInfo가 한 줄로 답함) 먼저 다시 계산한다.
  doc.reflowLinesegs?.();
  const page = J(doc.getPageDef(0)), colRight = (page.width - page.marginRight) / 75;
  const result = { paragraphs: 0, changed: 0, reverted: 0, ops: 0 };
  const count = doc.getParagraphCount(section);
  for (let para = 0; para < count; para++) {
    const fit = fitOne(doc, section, para, { colRight, low, high, shortLastLine, base, school, trace: !!trace });
    trace?.push({ para, ...fit });
    if (fit.skip) continue;
    result.paragraphs++; result.ops += fit.ops;
    if (fit.reverted) result.reverted++; else if (fit.changed) result.changed++;
  }
  return result;
}

// 한 문단만(한글 창에서 글을 고친 뒤, 10-22 O1). from: 이 글자 위치가 든 줄부터 아래로만 맞춘다(윗줄은 그대로라 덜 흔들림).
export function fitQuestionParagraph(doc, section, para, { low = -10, high = 0, shortLastLine = 15, base = -5, from = 0, school = false } = {}) {
  const page = J(doc.getPageDef(0)), colRight = (page.width - page.marginRight) / 75;
  return fitOne(doc, section, para, { colRight, low, high, shortLastLine, base, from, school });
}

function fitOne(doc, section, para, { colRight, low, high, shortLastLine, base, from = 0, school = false, trace = false }) {
  const length = doc.getParagraphLength(section, para);
  if (length < 8) return { skip: 'short' };
  let controls = []; try { controls = J(doc.getControlTextPositions(section, para)) || []; } catch {}
  if (controls.length && !school) return { skip: 'controls', n: controls.length };
  const props = J(doc.getParaPropertiesAt(section, para));
  if (!['justify', 'distribute'].includes(String(props.alignment).toLowerCase())) return { skip: 'align:' + props.alignment };
  if (school) { const edge = justifiedEdge(doc, section, para); if (!edge) return { skip: 'edge' }; colRight = edge; }
  const text = doc.getTextRange(section, para, 0, length), head = (text.match(HEAD)?.[0].length) || 0;
  const args = { length, head, colRight, low, high, shortLastLine, base, alignment: props.alignment, from, trace };
  const res = { head, ...fitParagraph(doc, section, para, args) };
  // 수능 기준 ⑤(11-02 사용자 승인, 실측 ~/Work/2026-11-02_5e-omo-인계/kice-analysis): 수능 양끝맞춤 줄의 띄어쓰기는 0.26~0.46em이고, 좁은 줄에서는 어절 안에서도 끊는다.
  // 학교 양식에서 어절 단위로 맞춘 뒤에도 띄어쓰기가 GAP_EM 넘게 벌어진 줄이 남으면 이 문단만 한글 줄 나눔을 「글자」로 바꿔 다시 맞춘다. 줄이 늘거나 더 고르지 않으면 되돌린다.
  if (school && props.koreanBreakUnit === 0) {
    const g0 = gapLines(doc, section, para);
    if (g0.widest > GAP_EM) {
      const keep = spacingsOf(doc, section, para, length, base);
      doc.applyParaFormat(section, para, '{"koreanBreakUnit":1}');
      const again = fitParagraph(doc, section, para, { ...args, from: 0 }), g1 = gapLines(doc, section, para);
      // 어절 안 끊김은 수능에서도 드물다(약 4%). 1.2em 넘게 심하게 벌어진 문단만 끊김 수를 따지지 않고, 그 아래는 한 번까지만 받는다(11-02 사용자 결정 「나 안 1.2em」 — 611문항에서 어절 안 끊김 4.66%, 수능 4.3~4.6%).
      const mid = midBreaks(doc, section, para, length);
      // 분수 든 줄이 둘로 갈라지면 줄 수는 같아도 문단이 높아진다(set17#19) — 높아지면 되돌린다.
      if (g1.n > g0.n || g1.h > g0.h + 0.5 || g1.widest >= g0.widest || (g0.widest <= GAP_SEVERE && mid > 1)) { doc.applyParaFormat(section, para, '{"koreanBreakUnit":0}'); putSpacings(doc, section, para, keep); res.charBreak = 'reverted'; }
      else { res.charBreak = true; res.changed = true; res.ops += again.ops; }
      res.gapEm = [+g0.widest.toFixed(2), +g1.widest.toFixed(2)]; res.midBreaks = mid;
    }
  }
  return res;
}
const GAP_EM = 0.6, GAP_SEVERE = 1.2;
// 어절 가운데에서 나뉜 줄 수(줄 끝 글자와 다음 줄 첫 글자가 모두 빈칸이 아님).
function midBreaks(doc, sec, para, length) {
  const text = String(doc.getTextRange(sec, para, 0, length)); let off = 0, n = 0;
  for (let k = 0; k < 400 && off < length; k++) { const li = J(doc.getLineInfo(sec, para, off)); if (li.charEnd <= off) break; if (li.charEnd < length && /\S/.test(text[li.charEnd - 1] || ' ') && /\S/.test(text[li.charEnd] || ' ')) n++; off = li.charEnd; }
  return n;
}
// 문단의 줄 수·높이(px)와, 끝줄을 뺀 줄들에서 가장 넓은 띄어쓰기(글자 크기 대비 em). 줄 첫머리 빈칸·줄 끝 빈칸은 뺀다.
function gapLines(doc, sec, para) {
  const lines = new Map();
  for (let p = 0; p < doc.pageCount(); p++) for (const r of J(doc.getPageTextLayout(p)).runs || []) {
    if (r.secIdx !== sec || r.paraIdx !== para || r.cellPath?.length) continue;
    const key = p * 1e6 + Math.round(r.y * 2); (lines.get(key) ?? lines.set(key, []).get(key)).push(r);
  }
  const keys = [...lines.keys()].sort((a, b) => a - b); let widest = 0, h = 0;
  const pages = new Map(); for (const key of keys) for (const r of lines.get(key)) { const p = Math.floor(key / 1e6), b = pages.get(p) ?? [Infinity, -Infinity]; pages.set(p, [Math.min(b[0], r.y), Math.max(b[1], r.y + r.h)]); }
  for (const [t, b] of pages.values()) h += b - t;
  for (const key of keys.slice(0, -1)) {
    const runs = lines.get(key).sort((a, b) => a.x - b.x);
    runs.forEach((r, ri) => { const t = [...String(r.text || '')], cx = r.charX || [];
      t.forEach((c, i) => { if (c !== ' ' || (ri === 0 && i === 0) || (ri === runs.length - 1 && i === t.length - 1) || !(r.fontSize > 0) || i + 1 >= cx.length) return; widest = Math.max(widest, (cx[i + 1] - cx[i]) / r.fontSize); }); });
  }
  return { n: keys.length, widest, h };
}
const spacingsOf = (doc, sec, para, length, base) => { const out = []; for (let k = 0; k < length; k++) { try { out.push(J(doc.getCharPropertiesAt(sec, para, k)).spacings?.[0] ?? base); } catch { out.push(base); } } return out; };
const putSpacings = (doc, sec, para, sp) => { let s0 = 0; for (let k = 1; k <= sp.length; k++) if (k === sp.length || sp[k] !== sp[s0]) { doc.applyCharFormat(sec, para, s0, k, JSON.stringify({ spacings: Array(7).fill(sp[s0]) })); s0 = k; } };

// 양쪽 정렬 문단에서 끝줄을 뺀 줄들의 오른쪽 끝 = 그 문단이 쓰는 오른쪽 끝(단·그림 옆 여백 반영). 두 줄 미만이면 모름.
function justifiedEdge(doc, sec, para) {
  const lines = new Map();
  for (let p = 0; p < doc.pageCount(); p++) for (const r of J(doc.getPageTextLayout(p)).runs || []) {
    if (r.secIdx !== sec || r.paraIdx !== para || r.cellPath?.length || !String(r.text || '').trim()) continue;
    const key = `${p}:${Math.round(r.y * 2)}`; lines.set(key, Math.max(lines.get(key) ?? -Infinity, r.x + r.w));
  }
  const ends = [...lines.values()]; if (ends.length < 2) return null;
  ends.pop(); return Math.max(...ends);
}
function fitParagraph(doc, sec, para, { length, head, colRight, low, high, shortLastLine, base, alignment, from: startAt = 0, trace = false }) {
  let ops = 0;
  // 11-03: 자간을 바꾸지 않았으면 줄 폭(widths — 정렬을 두 번 바꿔 다시 흘림)은 같으므로 앞서 잰 값을 다시 쓴다. 결과는 같고 계산만 준다.
  let measured = null;
  const set = (s, e, v) => { if (e <= s) return; measured = null; doc.applyCharFormat(sec, para, s, e, JSON.stringify({ spacings: Array(7).fill(v) })); ops++; };
  const lineAt = off => J(doc.getLineInfo(sec, para, off));
  const lines = () => { const out = []; let off = 0; for (let k = 0; k < 400 && off < length; k++) { const li = lineAt(off); out.push([li.charStart, li.charEnd]); if (li.charEnd <= off) break; off = li.charEnd; } return out; };
  // 줄마다 왼쪽 정렬일 때의 실제 글 끝(끝 공백 뺌)과 시작 → 남는 폭 비율
  const widths = () => measured ||= measure();
  const measure = () => {
    doc.applyParaFormat(sec, para, '{"alignment":"left"}');
    const by = new Map();
    try {
      for (let p = 0; p < doc.pageCount(); p++) for (const r of J(doc.getPageTextLayout(p)).runs || []) {
        if (r.secIdx !== sec || r.paraIdx !== para || r.cellPath?.length) continue;
        const key = `${p}:${Math.round(r.y * 2)}`, t = String(r.text || ''), xs = r.charX || [];
        let end = r.x + r.w; if (/\s$/.test(t) && xs.length > 1) { let k = t.length; while (k > 0 && /\s/.test(t[k - 1])) k--; end = r.x + (xs[k] ?? r.w); }
        const cur = by.get(key); by.set(key, cur ? { x: Math.min(cur.x, r.x), end: Math.max(cur.end, end), y: cur.y } : { x: r.x, end, y: p * 1e5 + r.y });
      }
    } finally { doc.applyParaFormat(sec, para, JSON.stringify({ alignment })); }
    return [...by.values()].sort((a, b) => a.y - b.y).map(l => ({ slack: (colRight - l.end) / Math.max(1, colRight - l.x), ratio: (l.end - l.x) / Math.max(1, colRight - l.x) }));
  };
  const stats = () => { const L = lines(), W = widths(); return { n: L.length, wide: W.slice(0, -1).filter(w => w.slack > WIDE).length, last: W.at(-1)?.ratio ?? 1 }; };
  const before = stats();
  if (before.n < 2) return { ops, changed: false, before };
  // 되돌릴 때를 위해 글자마다 지금 자간을 기억한다(이미 맞춰 둔 윗줄을 기준 값으로 덮지 않게).
  const original = []; for (let k = head; k < length; k++) { try { original.push(J(doc.getCharPropertiesAt(sec, para, k)).spacings?.[0] ?? base); } catch { original.push(base); } }
  const restore = () => { let s0 = head; for (let k = head + 1; k <= length; k++) if (k === length || original[k - head] !== original[s0 - head]) { set(s0, k, original[s0 - head]); s0 = k; } };
  const from = s => Math.max(s, head);
  let changed = false;
  // 1) 윗줄부터
  let off = startAt ? lineAt(Math.min(startAt, length - 1)).charStart : 0;
  for (let k = 0; k < 60; k++) {
    const li = lineAt(off); if (li.charEnd >= length) break;
    const s = li.charStart, e = li.charEnd, W = widths()[li.lineIndex];
    if (W && W.slack > WIDE) {
      let done = false;
      // 11-03: 가장 좁힌 자간(low)으로도 다음 어절이 안 올라오면 그 사이 값도 안 올라온다 — 넷을 다 해 보지 않고 넘어간다(결과 같음, 조판 해시로 확인).
      let reach = true;
      if (low < base - 1) { set(from(s), e, low); reach = lineAt(s).charEnd > e; }
      if (reach) for (let v = base - 1; v >= low; v--) {
        set(from(s), e, v);
        const n = lineAt(s);
        if (n.charEnd > e) { set(from(s), n.charEnd, v); done = true; changed = true; break; }
      }
      if (!done) {
        set(from(s), e, base); let best = base;
        for (let v = base + 1; v <= high; v++) { set(from(s), e, v); if (lineAt(s).charEnd !== e) break; best = v; }
        set(from(s), e, best); if (best !== base) changed = true;
      }
    }
    off = lineAt(s).charEnd;
  }
  // 2) 짧은 끝줄
  let st = stats();
  if (st.n > 1 && st.last * 100 < shortLastLine) {
    const L = lines(), [s, e] = L[L.length - 2], cur = J(doc.getCharPropertiesAt(sec, para, Math.max(s, head))).spacings?.[0] ?? base;
    let ok = false;
    for (let v = cur - 1; v >= low; v--) { set(from(s), e, v); if (lines().length < L.length) { set(from(s), length, v); ok = true; changed = true; break; } }
    if (!ok) {
      set(from(s), e, cur);
      for (let v = cur + 1; v <= high; v++) { set(from(s), e, v); const L2 = lines(); if (L2.at(-1)[1] - L2.at(-1)[0] > L.at(-1)[1] - L.at(-1)[0]) { ok = true; changed = true; break; } }
      if (!ok) set(from(s), e, cur);
    }
  }
  // 3) 나빠졌으면 되돌림
  if (changed) {
    const after = stats();
    if (after.n > before.n || after.wide > before.wide) { restore(); return { ops, changed: false, reverted: true, before, after }; }
    return { ops, changed, before, after };
  }
  return { ops, changed, before, ...(trace ? { slack: widths().map(w => +w.slack.toFixed(3)) } : {}) };
}
