// 간격 보기·조절(10-22 조판 기준 C-4, 시안 typeset-standard.html ②) + 「조판 기준 ▾」 메뉴.
// 상세 조판 머리 줄의 「간격 보기」를 켜면, 엔진이 그린 실제 문단·표·그림 위치와 조판 계획의 글 조각 주인(지문·자료·발문·〈보기〉·선지)으로
// 요소 사이에 초록 띠, 단 양옆 여백에 보라 띠를 그린다. 띠를 누르면 값을 고르는 작은 창이 뜬다.
// 구조 잠금이 켜져 있으면 보기만 되고, 풀면 0.5mm씩(0~20mm) 바꾼다. 적용 범위: 「이 문항만」(블록 간격·발문/선지 앞 간격) 또는 「조판 기준에」.
// 값을 바꾸면 엔진 문단 간격을 직접 고치지 않고 문항(또는 기준) 값을 바꾼 뒤 문항 조판을 다시 만든다(1/75 함정 회피, 저장 조판과 일치).
import {nativeRuns} from './live-patch.js';
import {KICE_STANDARD,KICE_ID,gapRole,exportStandard,importStandard} from './typeset-standard.js';
import {KINDS} from './model.js';
import {unitGapPositions} from '../../../js/rhwp-exam-science-text.js?v=1022-unit';

const MM_PER_PX = 25.4 / 96;
const NAME = { ask: '발문', choices: '선지', text: '지문', figure: '자료', table: '자료', group: '자료', bogi: '〈보기〉', steps: '과정', dialogue: '대화' };
const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const flat = v => String(v ?? '').replace(/\s+/g, '');
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;

// 문항 조판 문서에서 맨 바깥 요소(지문·자료·발문·〈보기〉·선지)의 세로 자리를 고른다. 순수 계산이라 검사에서 그대로 쓴다.
export function questionElements(doc, q, segments) {
  if (!doc || !q) return [];
  const blocks = new Map(q.blocks.map(b => [b.id, b]));
  const top = id => { let b = blocks.get(id); while (b?.parent && blocks.get(b.parent)) b = blocks.get(b.parent); return b || null; };
  const ownerElement = o => {
    if (!o) return null;
    if (o.kind === 'ask') return 'ask';
    if (o.kind === 'choice') return 'choices';
    const id = o.kind === 'line' ? o.block : o.kind === 'cell' || o.kind === 'note' ? o.table : o.id;
    const b = top(id); return b ? b.id : null;
  };
  // 문단(맨 바깥) → 그 안 글(칸 글 포함)
  const texts = new Map();
  for (const r of nativeRuns(doc)) { const p = r.path ? r.parent : r.para; texts.set(p, (texts.get(p) || '') + flat(r.text)); }
  // 글 조각은 문서 순서대로 나온다 → 앞 조각을 찾은 문단부터 앞으로만 찾는다(짧은 칸 글 「실험」이 뒤 발문 「표의 실험 결과」를 차지하지 않게).
  const owner = new Map(), order = [...texts.keys()].sort((a, b) => a - b);
  let cursor = 0;
  for (const s of segments || []) {
    const el = ownerElement(s.owner), key = flat(s.wrapped ?? s.value).slice(0, 12);
    if (!el || key.length < 2) continue;
    const p = order.find(x => x >= cursor && texts.get(x).includes(key));
    if (p === undefined) continue;
    cursor = p; if (!owner.has(p)) owner.set(p, el);
  }
  // 문단 상자(쪽 좌표 px): 맨 바깥 글 줄 + 맨 바깥 표·그림
  const box = new Map(), grow = (p, y, b) => { const c = box.get(p); box.set(p, c ? { y: Math.min(c.y, y), b: Math.max(c.b, b) } : { y, b }); };
  let pages = 0, paraCount = Infinity; try { pages = doc.pageCount(); paraCount = doc.getParagraphCount(0); } catch {}
  for (let page = 0; page < Math.min(pages, 1); page++) {
    for (const r of parse(doc.getPageTextLayout(page)).runs || []) if (!r.cellPath?.length && r.secIdx === 0 && String(r.text || '').trim()) grow(r.paraIdx, r.y, r.y + r.h);
    // 표 안에 든 표가 칸 경로 없이 엉뚱한 문단 번호로 보고될 때가 있다(rhwp 0.8.7) → 다른 맨 바깥 표·그림 안에 완전히 들어가면 뺀다.
    const ctl = (parse(doc.getPageControlLayout(page)).controls || []).filter(c => !c.cellPath?.length && c.secIdx === 0 && c.paraIdx < paraCount && [c.x, c.y, c.w, c.h].every(Number.isFinite));
    const inside = (c, o) => o !== c && o.x <= c.x + .5 && o.y <= c.y + .5 && o.x + o.w >= c.x + c.w - .5 && o.y + o.h >= c.y + c.h - .5 && o.w * o.h > c.w * c.h;
    for (const c of ctl) if (!ctl.some(o => inside(c, o))) grow(c.paraIdx, c.y, c.y + c.h);
  }
  const out = [];
  let last = null;
  for (const p of [...box.keys()].sort((a, b) => a - b)) {
    const el = owner.get(p) ?? last?.id ?? null, b = box.get(p);
    if (last && last.id === el) { last.top = Math.min(last.top, b.y); last.bottom = Math.max(last.bottom, b.b); continue; }
    last = { id: el, top: b.y, bottom: b.b, paras: [p] }; out.push(last);
  }
  return out.filter(e => e.id);
}

export const elementName = (q, id) => id === 'ask' || id === 'choices' ? NAME[id] : NAME[q.blocks.find(b => b.id === id)?.kind] || KINDS[q.blocks.find(b => b.id === id)?.kind] || '구성';
// 띠: 이웃한 두 요소 사이. 고칠 수 있는 값은 아래쪽 요소 앞 간격.
export function gapBands(q, elements, standard = KICE_STANDARD) {
  const bands = [];
  for (let i = 1; i < elements.length; i++) {
    const a = elements[i - 1], b = elements[i];
    if (b.top - a.bottom < -1) continue;
    const block = b.id !== 'ask' && b.id !== 'choices' ? q.blocks.find(x => x.id === b.id) : null;
    const target = b.id === 'ask' ? { kind: 'ask' } : b.id === 'choices' ? { kind: 'choices' } : block ? { kind: 'block', id: block.id, role: gapRole(block.kind) } : null;
    if (!target) continue;
    const own = target.kind === 'ask' ? q.askGap : target.kind === 'choices' ? q.choicesGap : block.gap;
    const stdKey = target.kind === 'block' ? target.role : target.kind;
    bands.push({ key: `${a.id}>${b.id}`, from: elementName(q, a.id), to: elementName(q, b.id), top: a.bottom, bottom: Math.max(a.bottom, b.top),
      measured: Math.max(0, (b.top - a.bottom) * MM_PER_PX), target, own, standardValue: standard.gaps?.[stdKey] ?? 0, value: own ?? standard.gaps?.[stdKey] ?? 0, stdKey });
  }
  return bands;
}

// 〈보기〉 상자 안쪽 여백 띠(10-22 O3): 마지막 줄 아래(bogiPadBottom)와 좌우(bogiPadSide). 조판 기준 값만(문항별 값은 없음).
export function bogiPadBands(doc, q, elements, standard = KICE_STANDARD) {
  const out = []; let ctl = [], runs = [];
  try { ctl = (parse(doc.getPageControlLayout(0)).controls || []).filter(c => !c.cellPath?.length && c.type === 'table'); runs = (parse(doc.getPageTextLayout(0)).runs || []).filter(r => r.cellPath?.length && String(r.text || '').trim()); } catch { return out; }
  for (const el of elements) {
    const block = q.blocks.find(b => b.id === el.id); if (block?.kind !== 'bogi') continue;
    const box = ctl.filter(c => c.y >= el.top - 1 && c.y + c.h <= el.bottom + 1).sort((a, b) => b.w * b.h - a.w * a.h)[0]; if (!box) continue;
    const inner = runs.filter(r => r.y >= box.y && r.y + r.h <= box.y + box.h + 1 && r.x >= box.x - 1 && r.x + r.w <= box.x + box.w + 1 && !/보\s*기/.test(r.text));
    if (!inner.length) continue;
    const left = Math.min(...inner.map(r => r.x)), right = Math.max(...inner.map(r => r.x + r.w)), last = Math.max(...inner.map(r => r.y + r.h));
    const mk = (key, name, rect) => ({ key: `${key}:${block.id}`, from: '〈보기〉', to: name, ...rect, target: { kind: 'bogiPad', id: block.id }, stdKey: key, own: undefined, value: standard.gaps?.[key] ?? 0, standardValue: standard.gaps?.[key] ?? 0 });
    out.push(mk('bogiPadBottom', '아래 안쪽', { top: last, bottom: box.y + box.h, x0: box.x, x1: box.x + box.w, measured: Math.max(0, (box.y + box.h - last) * MM_PER_PX) }));
    out.push(mk('bogiPadSide', '좌우 안쪽', { top: box.y + 8, bottom: box.y + box.h - 2, x0: box.x, x1: left, measured: Math.max(0, (left - box.x) * MM_PER_PX), side: true }));
  }
  return out;
}

export function attachGapView({ bridge, host, panel, context, onGap, onStandard, onStandards }) {
  const doc = host.ownerDocument, controls = panel.querySelector('.typeset-view-controls'), lockButton = panel.querySelector('#typeset-lock');
  // 머리 줄: 「조판 기준 · 이름 ▾」 · 「간격 보기」 — 「이 문항 | 시험지 전체」 바로 뒤
  const stdButton = doc.createElement('button'); stdButton.type = 'button'; stdButton.className = 'ts-std'; stdButton.dataset.tsStd = '';
  stdButton.setAttribute('aria-haspopup', 'menu'); stdButton.setAttribute('aria-expanded', 'false'); stdButton.title = '조판 기준 고르기 · 저장 · 내보내기/가져오기';
  const gapButton = doc.createElement('button'); gapButton.type = 'button'; gapButton.className = 'ts-gaps'; gapButton.dataset.tsGaps = ''; gapButton.setAttribute('aria-pressed', 'false');
  gapButton.textContent = '간격 보기'; gapButton.title = '요소 사이 간격(초록)·단 여백(보라)을 보고, 구조 잠금을 풀면 0.5mm씩 바꿉니다';
  // 머리 줄은 「이 문항 | 시험지 전체 · 상세 조판 · 조판 부호 · 구조 잠금」으로 이미 차서, 바로 아래 줄(글자·문단·내어쓰기) 오른쪽 끝에 둔다.
  // 숫자·단위 띄어쓰기 점검(10-22 O4): 평가원 표기 「10 m」「2 kg」에서 빠진 곳을 세어 보여 주기만 한다(고치지 않음).
  const unitChip = doc.createElement('span'); unitChip.className = 'ts-unit-chip'; unitChip.hidden = true; unitChip.tabIndex = 0; unitChip.setAttribute('role', 'status');
  let unitKey = '';
  function syncUnits() {
    let d; try { d = bridge.wasm.borrowDocumentHandle(); } catch { unitChip.hidden = true; return; }
    const key = `${bridge.generation}:${bridge.revision}`; if (key === unitKey) return; unitKey = key;
    // 문단·표 칸 글을 문서 순서대로(nativeRuns) 읽어 5E_hwp 점검과 같은 규칙을 쓴다.
    let list = []; try { list = nativeRuns(d).map(r => ({ text: String(r.text || ''), at: unitGapPositions(r.text || '') })).filter(x => x.at.length); } catch {}
    const count = list.reduce((n, x) => n + x.at.length, 0);
    unitChip.hidden = !count; if (!count) return;
    unitChip.textContent = `숫자·단위 ${count}곳`;
    unitChip.title = '평가원 표기는 숫자와 단위 사이를 띄어 씁니다(예: 10 m, 2 kg).\n' + list.slice(0, 6).map(x => '· ' + x.at.map(o => x.text.slice(Math.max(0, o - 4), o + 3)).join(' / ')).join('\n');
  }
  const context2 = panel.querySelector('#typeset-context'), tail = doc.createElement('span'); tail.className = 'ts-std-tail'; tail.append(unitChip, stdButton, gapButton);
  (context2 || controls)?.append(tail);

  const layer = doc.createElement('div'); layer.className = 'ts-gap-layer'; layer.hidden = true; layer.setAttribute('aria-label', '간격 띠');
  host.append(layer);
  const pop = doc.createElement('div'); pop.className = 'ts-gap-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', '간격 조절');
  panel.append(pop);
  const menu = doc.createElement('div'); menu.className = 'ts-std-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
  panel.append(menu);
  let on = false, selected = '', bands = [], scope = 'q';
  try { on = localStorage.getItem('5e.typeset.gaps') === 'on'; } catch {}
  const locked = () => lockButton?.getAttribute('aria-pressed') !== 'false';

  // 머리 줄이 좁아 이름만 보이고(예: 「수능 틀 ▾」), 「조판 기준」은 도움말·읽기 이름에 둔다.
  function syncStd() { const { standard } = context(), name = standard?.name || '수능 틀'; stdButton.innerHTML = `<b>${E(name)}</b> ▾`; stdButton.title = `조판 기준: ${name} — 고르기 · 저장 · 내보내기/가져오기`; stdButton.setAttribute('aria-label', `조판 기준 ${name}`); }
  function draw() {
    syncStd(); gapButton.setAttribute('aria-pressed', String(on)); if (context().ready) syncUnits();
    layer.replaceChildren(); layer.hidden = true;
    const ctx = context();
    if (!on || !ctx.ready || !ctx.q || !host.getClientRects().length) { pop.hidden = true; return; }
    let d; try { d = bridge.wasm.borrowDocumentHandle(); } catch { return; }
    const placement = bridge.pagePlacement(0), viewport = bridge.figureViewport(); if (!placement || !viewport) return;
    const rect = host.getBoundingClientRect();
    Object.assign(layer.style, { left: `${viewport.x - rect.left}px`, top: `${viewport.y - rect.top}px`, width: `${viewport.w}px`, height: `${viewport.h}px` });
    const page = parse(d.getPageDef(0)), mL = page.marginLeft / 75, mR = page.marginRight / 75, W = page.width / 75;
    const pt = (x, y) => { const p = bridge.parentPoint(placement.x + x * placement.scale, placement.y + y * placement.scale); return { x: p.x - viewport.x, y: p.y - viewport.y, s: placement.scale * p.scaleX }; };
    const elements = questionElements(d, ctx.q, ctx.owners?.texts);
    bands = [...gapBands(ctx.q, elements, ctx.standard || KICE_STANDARD), ...bogiPadBands(d, ctx.q, elements, ctx.standard || KICE_STANDARD)];
    const last = elements.at(-1);
    if (last) for (const [x0, x1, side] of [[0, mL, 'left'], [W - mR, W, 'right']]) {
      const a = pt(x0, page.marginTop / 75), b = pt(x1, last.bottom);
      const m = doc.createElement('span'); m.className = 'ts-gap-margin'; m.dataset.side = side; m.title = `단 여백 ${((x1 - x0) * MM_PER_PX).toFixed(1)}mm`;
      Object.assign(m.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${b.x - a.x}px`, height: `${b.y - a.y}px` }); layer.append(m);
    }
    for (const band of bands) {
      const a = pt(band.x0 ?? mL, band.top), b = pt(band.x1 ?? (W - mR), band.bottom), h = Math.max(6, b.y - a.y);
      const el = doc.createElement('button'); el.type = 'button'; el.className = 'ts-gap-band' + (band.target.kind === 'bogiPad' ? ' inner' : ''); el.dataset.gapKey = band.key;
      el.setAttribute('aria-pressed', String(band.key === selected));
      el.setAttribute('aria-label', `${band.from} ↕ ${band.to} ${band.measured.toFixed(1)}mm`);
      Object.assign(el.style, { left: `${a.x}px`, top: `${band.side ? a.y : a.y + (b.y - a.y) / 2 - h / 2}px`, width: `${Math.max(4, b.x - a.x)}px`, height: `${band.side ? Math.max(6, b.y - a.y) : h}px` });
      el.innerHTML = band.side ? '' : `<span>${E(band.from)} ${band.target.kind === 'bogiPad' ? '' : '↕ '}${E(band.to)} ${band.measured.toFixed(1)}mm${band.own !== undefined ? ' · 이 문항' : ''}</span>`;
      layer.append(el);
    }
    layer.hidden = false;
    if (selected) showPop(); else pop.hidden = true;
  }
  function showPop() {
    const band = bands.find(b => b.key === selected); if (!band) { pop.hidden = true; return; }
    const ctx = context(), std = ctx.standard || KICE_STANDARD, lockedNow = locked();
    pop.innerHTML = `<div class="ts-gap-head"><b>${E(band.from)} ↕ ${E(band.to)}</b><button type="button" data-gap-close aria-label="닫기">×</button></div>
      <p class="ts-gap-now">보이는 간격 ${band.measured.toFixed(1)}mm · 더한 간격 ${band.value.toFixed(1)}mm${band.own !== undefined ? '(이 문항)' : `(기준 「${E(std.name)}」)`}</p>
      ${lockedNow ? '<p class="ts-gap-lock">구조 잠금 중 · 간격·여백은 잠금을 풀고 바꾸세요. 글자와 자간은 그대로 고칠 수 있습니다.</p>' : `
      <div class="ts-gap-step"><button type="button" data-gap-step="-0.5" aria-label="0.5mm 줄이기" ${band.value <= 0 ? 'disabled' : ''}>−</button><output>${band.value.toFixed(1)}mm</output><button type="button" data-gap-step="0.5" aria-label="0.5mm 늘리기" ${band.value >= 20 ? 'disabled' : ''}>＋</button><small>0.5mm씩 · 0~20mm</small></div>
      ${band.target.kind === 'bogiPad' ? `<p class="ts-gap-note">〈보기〉 안쪽 여백은 조판 기준 「${E(std.name)}」에 바뀝니다(이 기준을 쓰는 모든 문항).</p>` : `<label><input type="radio" name="ts-gap-scope" value="q" ${scope === 'q' ? 'checked' : ''}> 이 문항만</label>
      <label><input type="radio" name="ts-gap-scope" value="std" ${scope === 'std' ? 'checked' : ''}> 조판 기준 「${E(std.name)}」에</label>`}
      ${std.id === KICE_ID ? '<p class="ts-gap-note">「수능 틀」은 바꿀 수 없는 기본 기준이라, 처음 바꾸면 「수능 틀 (내 설정)」으로 복제해 이 문항에 씁니다.</p>' : ''}
      ${band.own !== undefined ? '<button type="button" class="ts-gap-reset" data-gap-reset>기준 값으로 되돌리기</button>' : ''}`}`;
    pop.hidden = false;
    const r = layer.querySelector(`[data-gap-key="${CSS.escape(band.key)}"]`)?.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    if (r) { pop.style.top = `${Math.min(pr.height - pop.offsetHeight - 8, Math.max(8, r.bottom - pr.top + 6))}px`; pop.style.right = '12px'; }
  }
  layer.addEventListener('click', e => { const b = e.target.closest('[data-gap-key]'); if (!b) return; selected = selected === b.dataset.gapKey ? '' : b.dataset.gapKey; draw(); });
  pop.addEventListener('change', e => { if (e.target.name === 'ts-gap-scope') scope = e.target.value; });
  pop.addEventListener('click', e => {
    if (e.target.closest('[data-gap-close]')) { selected = ''; draw(); return; }
    const band = bands.find(b => b.key === selected); if (!band || locked()) return;
    const step = e.target.closest('[data-gap-step]');
    if (step) { const next = Math.min(20, Math.max(0, Math.round((band.value + Number(step.dataset.gapStep)) * 2) / 2)); onGap?.(band.target, next, band.target.kind === 'bogiPad' ? 'std' : scope, band.stdKey); return; }
    if (e.target.closest('[data-gap-reset]')) onGap?.(band.target, undefined, 'q', band.stdKey);
  });
  gapButton.addEventListener('click', () => { on = !on; selected = ''; try { localStorage.setItem('5e.typeset.gaps', on ? 'on' : 'off'); } catch {} draw(); });

  // 조판 기준 메뉴
  function openMenu() {
    const { standard, standards = [] } = context(), current = standard?.id || KICE_ID;
    const item = (id, name) => `<button type="button" role="menuitemradio" aria-checked="${id === current}" data-std-pick="${E(id)}">${E(name)}</button>`;
    menu.innerHTML = `${item(KICE_ID, '수능 틀')}${standards.map(s => item(s.id, s.name)).join('')}<hr>
      <button type="button" role="menuitem" data-std-save>지금 기준을 새 이름으로 저장…</button>
      <button type="button" role="menuitem" data-std-export>기준 파일로 내보내기</button>
      <button type="button" role="menuitem" data-std-import>기준 파일 가져오기…</button>
      <button type="button" role="menuitem" data-std-school>학교 양식(한글 파일)에서 만들기…</button>
      <form class="ts-std-name" hidden><input aria-label="새 기준 이름" placeholder="예: ○○고 2학기 기말" maxlength="40"><button type="submit">저장</button></form>
      <input type="file" accept=".json,application/json" hidden data-std-file>`;
    menu.hidden = false; stdButton.setAttribute('aria-expanded', 'true');
    const r = stdButton.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    menu.style.left = `${r.left - pr.left}px`; menu.style.top = `${r.bottom - pr.top + 4}px`;
  }
  const closeMenu = () => { menu.hidden = true; stdButton.setAttribute('aria-expanded', 'false'); };
  stdButton.addEventListener('click', () => menu.hidden ? openMenu() : closeMenu());
  menu.addEventListener('click', async e => {
    const pick = e.target.closest('[data-std-pick]');
    if (pick) { closeMenu(); onStandard?.({ pick: pick.dataset.stdPick }); return; }
    if (e.target.closest('[data-std-save]')) { const f = menu.querySelector('.ts-std-name'); f.hidden = false; f.querySelector('input').focus(); return; }
    if (e.target.closest('[data-std-export]')) {
      const { standard } = context(), text = onStandard?.({ exportText: standard || KICE_STANDARD }) || exportStandard(standard || KICE_STANDARD), blob = new Blob([text], { type: 'application/json' }), a = doc.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `${(standard?.name || '수능 틀').replace(/[\\/:*?"<>|]/g, '_')}.5e-typeset.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); closeMenu(); return;
    }
    if (e.target.closest('[data-std-import]')) { menu.querySelector('[data-std-file]').click(); return; }
    if (e.target.closest('[data-std-school]')) { closeMenu(); onStandard?.({ school: true }); }
  });
  menu.addEventListener('submit', e => { e.preventDefault(); const name = menu.querySelector('.ts-std-name input').value.trim(); if (!name) return; closeMenu(); onStandard?.({ saveAs: name }); });
  menu.addEventListener('change', async e => {
    const file = e.target.closest('[data-std-file]')?.files?.[0]; if (!file) return;
    closeMenu();
    try { const text = await file.text(); onStandard?.({ imported: importStandard(text), raw: text }); } catch (error) { onStandard?.({ error: error.message }); }
  });
  doc.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !stdButton.contains(e.target)) closeMenu(); });
  doc.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!menu.hidden) closeMenu(); else if (!pop.hidden) { selected = ''; draw(); } } });
  lockButton?.addEventListener('click', () => requestAnimationFrame(() => { if (selected) showPop(); }));
  return { draw, get on() { return on; } };
}
