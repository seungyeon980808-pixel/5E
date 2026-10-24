// 시험지 만들기 ② 문항 고르기(10-24 확정, 시안 5e-design-mockups/exam-flow-1024-v4.html 그대로).
// 왼쪽 문항 보관함(기출 + 내 문항, 문항 전체 카드 · 거르기 줄 · 태그 줄 · 분류·태그 창 · 여러 개 고르기), 오른쪽 담은 문항(목표 대비 막대).
// 분류: 내 문항은 문항 자료(q.tags · q.difficulty · q.unitLarge · q.standardCode), 기출은 이 기기 저장소(store 'pastMeta', 열쇠 past:<id>).
import { store } from './card-shared.js';
import { past, loadPast, examLabel, loadThumbs } from './library-view.js';
import { libraryQuestions } from './exams.js';
import { questionTitle } from './views.js';
import { goalOf } from './exam-flow.js';

const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAGE = 40, LEVELS = ['상', '중', '하'], TYPES = ['객관식', '합답형', '서술형'];
const CV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>';
const X = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
export function pickState(view) { return view.pick ||= { kind: 'all', subject: '', part: '', std: '', lv: '', ty: '', star: false, sort: 'recent', tags: [], query: '', multi: false, picked: [], limit: PAGE }; }

// ── 분류 읽기·쓰기 ──
const pastMeta = () => store.get('pastMeta', {});
export function metaOf(x) {
  if (x.kind === 'mine') return { tags: x.q.tags || [], lv: x.q.difficulty || '', unit: [x.q.unitLarge, x.q.unitMiddle].filter(Boolean).join(' · '), std: x.q.standardCode || '' };
  const m = pastMeta()['past:' + x.id] || {};
  return { tags: m.tags || [], lv: m.lv || '', unit: m.unit || x.i.parts.join(' · '), std: m.std || '' };
}
// 바꾸기: fn(meta)가 고친 값을 돌려받아 저장한다. 내 문항은 api.mutate로(되돌리기·저장), 기출은 저장소에.
export function editMeta(api, xs, fn) {
  const mine = xs.filter(x => x.kind === 'mine'), pasts = xs.filter(x => x.kind === 'past');
  if (mine.length) api.mutate(() => { for (const x of mine) { const m = fn({ ...metaOf(x), tags: [...metaOf(x).tags] }); const q = x.q;
    if (m.tags.length) q.tags = m.tags.slice(0, 30); else delete q.tags; if (m.lv) q.difficulty = m.lv; else delete q.difficulty;
    if (m.unit !== undefined) { const [a, b] = String(m.unit).split(' · '); q.unitLarge = a || ''; if (b !== undefined) q.unitMiddle = b; }
    if (m.std !== undefined) q.standardCode = m.std; } }, { render: false });
  if (pasts.length) { const all = pastMeta(); for (const x of pasts) { const m = fn({ ...metaOf(x), tags: [...metaOf(x).tags] }); all['past:' + x.id] = { tags: m.tags.slice(0, 30), lv: m.lv, unit: m.unit, std: m.std }; } store.set('pastMeta', all); }
}
export const normTag = t => { t = String(t || '').trim().replace(/\s+/g, '').slice(0, 39); return !t || t === '#' ? '' : t.startsWith('#') ? t : '#' + t; };

// ── 보관함 목록 ──
export function poolEntries(data, exam, s) {
  const mineQs = [...libraryQuestions(data), ...exam.items.map(id => data.questions.find(q => q.id === id)).filter(Boolean)];
  const mine = s.kind === 'past' ? [] : mineQs.map(q => ({ kind: 'mine', key: 'q:' + q.id, id: q.id, q, title: questionTitle(q) + (q.unitSmall || q.unitMiddle ? ` — ${q.unitSmall || q.unitMiddle}` : ''), ty: q.type, pt: Number(q.points) || 0, subject: '', exam: '' }));
  const pasts = s.kind === 'mine' || !past.items ? [] : past.items.map(i => ({ kind: 'past', key: 'past:' + i.id, id: i.id, i, title: i.short, ty: i.tags.find(t => TYPES.includes(t)) || '', pt: null, subject: i.subjectLabel, exam: examLabel(i.year, i.month) }));
  const stars = store.get('stars', {}), words = String(s.query || '').toLowerCase().split(/\s+/).filter(Boolean);
  let list = [...mine, ...pasts].filter(x => { const m = metaOf(x);
    return (!s.star || stars[x.key]) && (!s.subject || x.subject === s.subject || x.kind === 'mine') && (!s.part || m.unit.split(' · ').includes(s.part)) && (!s.std || m.std === s.std) && (!s.lv || m.lv === s.lv) && (!s.ty || x.ty === s.ty)
      && s.tags.every(t => m.tags.includes(t)) && (!words.length || words.every(w => [x.title, m.unit, m.std, ...m.tags, x.kind === 'mine' ? x.q.ask : x.i.text].join(' ').toLowerCase().includes(w))); });
  if (s.sort === 'unit') list = [...list].sort((a, b) => metaOf(a).unit.localeCompare(metaOf(b).unit));
  if (s.sort === 'level') list = [...list].sort((a, b) => (LEVELS.indexOf(metaOf(a).lv) + 4) % 4 - (LEVELS.indexOf(metaOf(b).lv) + 4) % 4);
  return list;
}
// 태그 목록(많이 쓴 순): 내 문항 + 기출 분류.
export function allTags(data) {
  const n = new Map(), add = t => n.set(t, (n.get(t) || 0) + 1);
  for (const q of data.questions) (q.tags || []).forEach(add);
  for (const m of Object.values(pastMeta())) (m.tags || []).forEach(add);
  return [...n].sort((a, b) => b[1] - a[1]);
}

// ── 그리기 ──
const MENUS = { subj: '과목', unit: '단원', std: '성취기준', lv: '난이도', ty: '유형', sort: '정렬' };
const SORTS = [['recent', '최근 고친 순'], ['unit', '단원 순'], ['level', '난이도 순']];
export function menuOptions(data, exam, s, k) {
  if (k === 'subj') return (past.index?.subjects || []).map(v => [v[1], v[1]]);
  if (k === 'unit') return [...new Set(poolEntries(data, exam, { ...s, part: '', tags: [], limit: 0 }).flatMap(x => metaOf(x).unit.split(' · ')).filter(Boolean))].sort().slice(0, 200).map(v => [v, v]);
  if (k === 'std') return [...new Set(data.questions.map(q => q.standardCode).filter(Boolean))].sort().map(v => [v, v]);
  if (k === 'lv') return LEVELS.map(v => [v, v]);
  if (k === 'ty') return TYPES.map(v => [v, v]);
  return SORTS;
}
const FIELD = { subj: 'subject', unit: 'part', std: 'std', lv: 'lv', ty: 'ty', sort: 'sort' };
export function renderStep2(exam, data, forms, s, { busy = null } = {}) {
  if (s.kind !== 'mine' && !past.items) loadPast().catch(() => {});
  const list = poolEntries(data, exam, s), shown = list.slice(0, s.limit), g = goalOf(exam, forms), inExam = new Set(exam.items);
  const fb = (k, label) => { const v = s[FIELD[k]]; const show = k === 'sort' ? SORTS.find(x => x[0] === s.sort)[1] : label; return `<button type="button" class="ep-fbtn${v && k !== 'sort' ? ' on' : ''}" data-ep-menu="${k}" aria-haspopup="menu">${E(show)}${v && k !== 'sort' ? ` <span class="v">${E(v)}</span>` : ''}${CV}</button>`; };
  const tags = allTags(data);
  const card = x => { const m = metaOf(x), inC = x.kind === 'mine' && inExam.has(x.id), pk = s.picked.includes(x.key), conv = busy && x.kind === 'past' && busy.id === x.id;
    const doc = x.kind === 'mine' ? `<div class="ep-doc" data-preview="${E(x.id)}"></div>` : `<img alt="${E(x.title)}" data-lv-card="${E(past.index.cards.replace('{id}', encodeURIComponent(x.id)))}" data-fallback="${E(x.i.hasFigure ? new URL(`../../exam-library/images/${encodeURIComponent(x.id)}.png`, import.meta.url).href : '')}">`;
    // 카드 아래는 해시태그 한 줄 + 「#＋」(10-24 시안 16 3차): 내 문항/기출 표 · 제목 · 유형·배점은 위 「전체 · 내 문항 · 기출」로 이미 구별돼 뺀다.
    // 담은 카드는 그림 왼쪽 위 「✓ n번」(시험지에 담긴 순서) + 은은한 파랑 테두리 + 눌린 듯한 회색 음영. 「빼기」·「＋ 담기」는 마우스를 올릴 때만.
    const at = inC ? exam.items.indexOf(x.id) + 1 : 0, tagsHtml = [...(m.lv ? [`난이도 ${m.lv}`] : []), ...m.tags];
    return `<article class="ep-card${inC ? ' in' : ''}${pk ? ' pk' : ''}" data-ep-key="${E(x.key)}" title="${E(x.title)}"><div class="ep-th">${doc}</div><span class="ep-pick" aria-hidden="true">${pk ? '✓' : ''}</span>
      <span class="ep-no"${inC ? '' : ' hidden'}>✓ ${at}번</span>
      <div class="ep-acts"><button type="button" class="take" data-ep-take="${E(x.key)}" ${conv ? 'disabled' : ''}>${inC ? '빼기' : conv ? '바꾸는 중…' : '＋ 담기'}</button></div>
      <div class="ep-mt"><div class="ep-tgs">${tagsHtml.length ? tagsHtml.map(t => `<span class="ep-tg">${E(t)}</span>`).join('') : '<span class="ep-tg none"># 태그</span>'}</div><button type="button" class="ep-tadd" data-ep-tag="${E(x.key)}" title="분류 · 태그" aria-label="분류 · 태그">#＋</button></div></article>`; };
  const body = !list.length ? `<p class="ef-hint ep-empty">${s.kind !== 'mine' && !past.items ? '기출을 불러오는 중입니다…' : '이 태그·조건에 맞는 문항이 없습니다.'}</p>` : `<div class="ep-cols">${shown.map(card).join('')}</div>${list.length > shown.length ? `<div class="ep-more"><button type="button" class="ef-btn" data-ep-more>${Math.min(PAGE, list.length - shown.length)}개 더 보기 <small>(${shown.length.toLocaleString()} / ${list.length.toLocaleString()})</small></button></div>` : ''}`;
  return `<div class="ef-work ep-s2">
  <section class="ef-pane${s.multi ? ' multi' : ''}" id="ep-pool"><div class="ef-ph"><b>문항 보관함</b><small>${list.length.toLocaleString()}개</small><span class="sp"></span><button type="button" class="ef-btn" data-ep-multi aria-pressed="${s.multi}">여러 개 고르기</button><input class="ep-search" data-ep-query value="${E(s.query)}" placeholder="내용·단원·태그 찾기" aria-label="보관함 찾기"></div>
    <div class="ep-fbar"><div class="ef-seg ep-kind">${[['all', '전체'], ['mine', '내 문항'], ['past', '기출']].map(([k, v]) => `<button type="button" data-ep-kind="${k}" aria-pressed="${s.kind === k}">${v}</button>`).join('')}</div><span class="ep-fdiv"></span>${fb('subj', '과목')}${fb('unit', '단원')}${fb('std', '성취기준')}${fb('lv', '난이도')}${fb('ty', '유형')}<button type="button" class="ep-fbtn${s.star ? ' on' : ''}" data-ep-star aria-pressed="${s.star}"><span class="st">★</span> 별표</button><span class="sp"></span>${fb('sort', '정렬')}</div>
    <div class="ep-tbar"><span class="lbl">태그</span>${tags.length ? tags.map(([t, n]) => `<button type="button" class="ep-tok${s.tags.includes(t) ? ' on' : ''}" data-ep-tagf="${E(t)}" aria-pressed="${s.tags.includes(t)}">${E(t)}<small>${n}</small></button>`).join('') : '<span class="mu ep-none">카드의 「# 분류·태그」로 태그를 붙이면 여기서 거를 수 있습니다</span>'}${s.tags.length ? '<button type="button" class="ep-tok mu" data-ep-tagclear>✕ 풀기</button>' : ''}</div>
    <div class="ep-grid">${body}</div>
    ${s.multi ? `<div class="ep-bulk"><b>${s.picked.length}개 골랐음</b><span class="mu">카드를 누르면 고르고 · 다시 누르면 뺍니다</span><span class="sp"></span><button type="button" class="ef-btn" data-ep-bulktag ${s.picked.length ? '' : 'disabled'}># 태그 · 분류 한꺼번에</button><button type="button" class="ef-btn" data-ep-bulktake ${s.picked.length ? '' : 'disabled'}>모두 담기</button><button type="button" class="ef-btn" data-ep-multi>그만 고르기</button></div>` : ''}</section>
  <section class="ef-pane"><div class="ef-ph"><b>담은 문항</b><small>${exam.items.length}문항</small></div>
    <div class="ep-meter">${meters(exam, data, g, busy)}</div>
    <div class="ep-cart">${cart(exam, data, busy)}</div>
    <div class="ef-foot"><span class="sp"></span><button type="button" class="ef-btn go" data-ef-step="3">다음: 배치 →</button></div></section>
</div>`;
}
const qsOf = (exam, data) => exam.items.map(id => data.questions.find(q => q.id === id)).filter(Boolean);
function bar(lb, v, goal, unit = '') { const r = goal ? v / goal : 0, cls = !goal ? '' : v > goal ? 'over' : v === goal ? 'full' : ''; return `<div class="ep-mrow"><span class="lb">${lb}</span><span class="bar">${goal ? `<i class="${cls}" style="width:${Math.min(100, r * 100)}%"></i>` : ''}</span><span class="v">${v}${goal ? ` / ${goal}` : ''}${unit}</span></div>`; }
function meters(exam, data, g) {
  const qs = qsOf(exam, data), obj = qs.filter(q => q.type !== '서술형').length, pts = qs.reduce((a, q) => a + (Number(q.points) || 0), 0), ranges = {};
  for (const q of qs) { const r = q.unitLarge || '단원 없음'; ranges[r] = (ranges[r] || 0) + 1; }
  const out = Object.keys(ranges).filter(r => g.range.length && !g.range.includes(r));
  return bar('선택형', obj, g.nObj) + bar('서술형', qs.length - obj, g.nEssay) + (g.total == null ? '' : bar('배점', pts, g.total, '점'))
    + `<div class="ep-mrow"><span class="lb">범위</span><span class="ep-rng">${g.range.map(r => `<span class="ep-cz">${E(r)} ${ranges[r] || 0}</span>`).join('')}${out.map(r => `<span class="ep-cz wn">범위 밖 ${E(r)} ${ranges[r]}</span>`).join('')}${!g.range.length ? Object.entries(ranges).map(([r, n]) => `<span class="ep-cz">${E(r)} ${n}</span>`).join('') || '<span class="mu">—</span>' : ''}</span></div>`;
}
function cart(exam, data, busy) {
  const rows = qsOf(exam, data).map((q, i) => `<div class="ep-ci"><span class="n">${i + 1}</span><div><b>${E(questionTitle(q))}${q.unitSmall || q.unitMiddle ? ` — ${E(q.unitSmall || q.unitMiddle)}` : ''}</b><small>${/기출/.test(q.source || '') ? '기출 · ' : ''}${E(q.type)} · ${Number(q.points) || 0}점</small></div><button type="button" class="ef-btn ic x" data-ep-out="${E(q.id)}" title="빼기" aria-label="${i + 1}번 빼기">${X}</button></div>`);
  if (busy) rows.push(`<div class="ep-ci conv"><span class="n">…</span><div><b>${E(busy.title)}</b><small><span class="go">편집할 수 있는 문항으로 바꾸는 중${busy.stage ? ` · ${E(busy.stage)}` : ''}</span></small></div></div>`);
  return rows.join('') || '<p class="ef-hint" style="padding:12px">왼쪽 보관함에서 카드에 마우스를 올려 「담기」를 누르세요.</p>';
}
// 그린 뒤: 내 문항 미리보기 · 기출 그림 채우기.
export function fillStep2(root, data) {
  loadThumbs(root);
}

// 분류·태그 창(한 문항 또는 고른 여러 문항).
export function tagPopMarkup(xs, data) {
  const one = xs.length === 1, metas = xs.map(metaOf), m = metas[0], has = t => metas.every(x => x.tags.includes(t)), cur = [...new Set(metas.flatMap(x => x.tags))];
  const units = [...new Set([...data.questions.map(q => [q.unitLarge, q.unitMiddle].filter(Boolean).join(' · ')), ...metas.map(x => x.unit)].filter(Boolean))].sort();
  const stds = [...new Set([...data.questions.map(q => q.standardCode), ...metas.map(x => x.std)].filter(Boolean))].sort();
  const sel = (k, n, opts, v) => `<label class="ef-f"><span class="n">${n}</span><select data-ep-cls="${k}">${one ? '<option value="">없음</option>' : '<option value="__keep">(그대로)</option>'}${opts.map(o => `<option${one && o === v ? ' selected' : ''}>${E(o)}</option>`).join('')}</select></label>`;
  return `<div class="ef-ph"><b>${one ? '분류 · 태그' : `${xs.length}개 문항 · 분류 · 태그`}</b><span class="sp"></span><button type="button" class="ef-btn ic" data-ep-popx aria-label="닫기">${X}</button></div>
    <div class="ep-pb">${one ? `<div class="ttl">${E(xs[0].title)}</div>` : ''}
      <div class="ef-gh">분류</div>${sel('unit', '단원', units, m.unit)}${sel('std', '성취기준', stds, m.std)}
      <div class="ef-row2"><div class="ef-seg">${LEVELS.map(l => `<button type="button" data-ep-lvset="${l}" aria-pressed="${metas.every(x => x.lv === l)}">${l}</button>`).join('')}</div><div class="ef-f"><span class="n">출처</span><span class="mu ep-src">${one ? E(xs[0].kind === 'past' ? xs[0].i.title : xs[0].q.source || '내 문항') : '여러 곳'}</span></div></div>
      <div class="ef-gh">해시태그<em>${one ? '' : '모두에 붙음'}</em></div>
      <div class="ep-tagin">${cur.map(t => `<span class="ep-tg">${E(t)}${one || has(t) ? '' : ' <small>일부</small>'}<button type="button" data-ep-tagrm="${E(t)}" aria-label="${E(t)} 떼기">✕</button></span>`).join('')}<input data-ep-taginput placeholder="${cur.length ? '' : '#태그 입력 후 Enter'}" aria-label="태그 입력"></div>
      <div class="ep-sugg">${allTags(data).map(([t]) => t).filter(t => !has(t)).slice(0, 8).map(t => `<button type="button" data-ep-tagadd="${E(t)}">＋ ${E(t)}</button>`).join('')}</div>
      <p class="ef-hint">바로 저장됩니다 · 단원 · 성취기준 · 난이도는 ③ 점검의 「범위 · 난이도」에 그대로 쓰입니다.${xs.some(x => x.kind === 'past') ? ' 기출의 분류는 이 기기에 저장됩니다.' : ''}</p></div>`;
}
export function menuMarkup(data, exam, s, k) {
  const field = FIELD[k], opts = menuOptions(data, exam, s, k);
  return (k === 'sort' ? '' : `<button type="button" role="menuitemradio" data-ep-set="${k}" data-v="" aria-checked="${!s[field]}">전체</button>`)
    + opts.map(([v, l]) => `<button type="button" role="menuitemradio" data-ep-set="${k}" data-v="${E(v)}" aria-checked="${s[field] === v}">${E(l)}</button>`).join('')
    + (opts.length ? '' : '<p class="ef-hint" style="padding:4px 10px">고를 것이 없습니다</p>');
}
export { MENUS };
// 담은 문항 칸만 다시(기출 변형 진행 · 담기·빼기 뒤 카드 그림을 다시 읽지 않게).
export function refreshCart(root, exam, data, forms, busy) {
  const m = root.querySelector('.ep-meter'), c = root.querySelector('.ep-cart'), n = root.querySelector('.ep-s2 .ef-pane:last-child .ef-ph small');
  if (m) m.innerHTML = meters(exam, data, goalOf(exam, forms)); if (c) c.innerHTML = cart(exam, data, busy); if (n) n.textContent = `${exam.items.length}문항`;
  const inExam = new Set(exam.items);
  root.querySelectorAll('.ep-card[data-ep-key^="q:"]').forEach(card => { const id = card.dataset.epKey.slice(2), on = inExam.has(id); card.classList.toggle('in', on); const b = card.querySelector('.take'); if (b) b.textContent = on ? '빼기' : '＋ 담기'; const no = card.querySelector('.ep-no'); if (no) { no.hidden = !on; no.textContent = on ? `✓ ${exam.items.indexOf(id) + 1}번` : ''; } });
  root.querySelectorAll('.ep-card[data-ep-key^="past:"] .take').forEach(b => { const id = b.closest('.ep-card').dataset.epKey.slice(5), conv = busy && busy.id === id; b.disabled = !!conv; b.textContent = conv ? '바꾸는 중…' : '＋ 담기'; });
}
