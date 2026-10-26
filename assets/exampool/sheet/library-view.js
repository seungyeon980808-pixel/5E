// 문항 보관함(10-23 다시 하기, 시안 5e-design-mockups/exampool-viewer-1023.html 그대로).
// 기출과 내 문항을 한 목록으로: 위쪽 「전체 / 기출 / 내 문항」 · 「모두 · ★ 별표만 · 메모 있음」 · 과목 · 단원 · 시험 칩, 오른쪽 보기 단추 셋(카드 · 목록 · 한 문항).
// 카드를 누르면 「문항 보기」 창: 제목 줄 별표·위치·닫기, 문항 좌우 큰 ‹ ›(← →, 0.32초 미끄러짐), 단추 줄, 변형 단계 띠, 문항 정보 · 내 메모.
// 별표·메모는 이 기기에만(store stars·memos, 열쇠 past:<id> · q:<id>) — 카드 화면 라이브러리 칸과 같은 저장소.
import {F,MONTH,shortTitle,norm,splitWords} from './past-search.js';
import {croppedQuestion,pdfHref} from './past-pdf.js';
import {croppedPastImage} from './past-crop.js';
import {store,ICON,E} from './card-shared.js';
import {libraryQuestions} from './exams.js';
import {questionTitle,previewHtml,workflowOf} from './views.js';
import {WORKFLOWS} from './model.js';
import {isBlank} from './pool-views.js';

const PAGE = 40;
const SVG = {
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>',
  memo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/></svg>',
  one: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3.5" width="12" height="17" rx="1.5"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};
const STEPS = ['문항을 스캔하는 중', '문항 카드를 작성하는 중', '한글 조판을 작성하는 중'];
const stepOf = stage => /카드|여는/.test(stage || '') ? 1 : /조판/.test(stage || '') ? 2 : 0;

// ── 기출 자료(과목 파일은 처음 기출을 볼 때 읽는다) ──
export const past = { index: null, items: null, loading: null };
export async function loadPast() {
  if (past.items) return past.items;
  past.loading ||= (async () => {
    past.index = await fetch(new URL('../convert/data/index.json', import.meta.url)).then(r => { if (!r.ok) throw Error('기출 목록을 불러오지 못했습니다.'); return r.json(); });
    const lists = await Promise.all(past.index.subjects.map(([code, label]) => fetch(new URL(`../convert/data/${code}.json`, import.meta.url)).then(r => r.ok ? r.json() : []).then(rows => rows.map(row => ({ code, label, row })))));
    past.items = lists.flat().map(({ code, label, row }) => ({ id: row[F.id], subject: code, subjectLabel: label, year: row[F.year], month: row[F.month], no: row[F.no], page: row[F.page], box: row[F.box], pdfFile: row[F.pdfFile], publicPath: past.index.files[row[F.pdfFile]], parts: row[F.parts] || [], tags: row[F.tags] || [], hasFigure: !!row[F.hasFigure], record: row[F.record], text: row[F.text] || '',
      title: `${row[F.year]}학년도 ${MONTH[row[F.month]] || row[F.month] + '월'} ${label} ${row[F.no]}번`, short: shortTitle(row[F.year], row[F.month], label, row[F.no]) }))
      .sort((a, b) => b.year - a.year || String(a.month).localeCompare(String(b.month)) || a.subject.localeCompare(b.subject) || (+a.no) - (+b.no));
    return past.items;
  })();
  try { return await past.loading; } catch (e) { past.loading = null; throw e; }
}
export const examLabel = (y, m) => `${String(y).slice(2)}년 ${{ 6: '6평', 9: '9평', 11: '수능' }[m] || m + '월'}`;

// ── 목록 만들기 ──
function entries(data, s) {
  const stars = store.get('stars', {}), memos = store.get('memos', {}), words = splitWords(s.query || '');
  const mine = s.kind === 'past' ? [] : libraryQuestions(data).map(q => ({ kind: 'mine', key: 'q:' + q.id, id: q.id, q, title: questionTitle(q), pt: q.points, subject: '', part: [q.unitLarge, q.unitMiddle].filter(Boolean).join(' · '), exam: '' }));
  const pasts = s.kind === 'mine' || !past.items ? [] : past.items.map(i => ({ kind: 'past', key: 'past:' + i.id, id: i.id, i, title: i.short, pt: null, subject: i.subjectLabel, part: i.parts.join(' · '), exam: examLabel(i.year, i.month) }));
  return [...mine, ...pasts].filter(x =>
    (!s.mark || (s.mark === 'star' ? stars[x.key] : memos[x.key])) &&
    (!s.subject || x.subject === s.subject) && (!s.part || x.part.split(' · ').includes(s.part)) && (!s.exam || x.exam === s.exam) &&
    (!words.length || words.every(w => norm(x.kind === 'past' ? [x.title, x.i.title, x.i.text, ...x.i.tags, ...x.i.parts].join(' ') : [x.title, x.q.ask, x.q.passage, x.part, x.q.source].join(' ')).includes(w))));
}

// 보관함 상태는 app의 view.lib에 둔다(다시 그려도 남게).
export function libState(view) { return view.lib ||= { kind: 'all', mark: '', subject: '', part: '', exam: '', query: '', mode: 'grid', limit: PAGE, open: -1 }; }

export function renderLibraryView(root, data, view, api) {
  const s = libState(view), stars = store.get('stars', {}), memos = store.get('memos', {});
  if (s.kind !== 'mine' && !past.items) loadPast().then(() => { if (root.isConnected) api.rerender(); }).catch(e => api.status?.(e.message, true));
  const list = entries(data, s), shown = s.mode === 'one' ? list : list.slice(0, s.limit);
  const starN = Object.keys(stars).length, memoN = Object.keys(memos).filter(k => memos[k]).length;
  const subjects = past.index ? past.index.subjects.map(v => v[1]) : [], partPool = list.flatMap(x => x.part ? x.part.split(' · ') : []), parts = [...new Set(partPool)].sort().slice(0, 300);
  const exams = past.items ? [...new Set(past.items.filter(i => !s.subject || i.subjectLabel === s.subject).map(i => examLabel(i.year, i.month)))] : [];
  const chipSel = (k, label, opts) => `<label class="lv-chip lv-sel${s[k] ? ' on' : ''}"><span>${E(s[k] || label)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><select data-lv-sel="${k}" aria-label="${label}"><option value="">${label} 전체</option>${opts.map(o => `<option${s[k] === o ? ' selected' : ''}>${E(o)}</option>`).join('')}</select></label>`;
  const head = `<div class="lv-head"><h1>문항 보관함</h1><p>${list.length.toLocaleString()}개 보는 중${s.kind !== 'mine' && !past.items ? ' · 기출을 불러오는 중…' : ''}</p>
      <div class="lv-vt" role="group" aria-label="보기 방식">${[['grid', '카드 모아 보기', 'grid'], ['list', '목록', 'list'], ['one', '한 문항씩 보기', 'one']].map(([m, t, ic]) => `<button type="button" data-lv-mode="${m}" aria-pressed="${s.mode === m}" title="${t}" aria-label="${t}">${SVG[ic]}</button>`).join('')}</div></div>
    <div class="lv-chips">
      <span class="lv-kseg" role="group" aria-label="문항 종류">${[['all', '전체'], ['past', '기출'], ['mine', '내 문항']].map(([k, v]) => `<button type="button" data-lv-kind="${k}" aria-pressed="${s.kind === k}">${v}</button>`).join('')}</span><span class="lv-vline"></span>
      <button type="button" class="lv-chip${!s.mark ? ' on' : ''}" data-lv-mark="">모두</button>
      <button type="button" class="lv-chip${s.mark === 'star' ? ' on' : ''}" data-lv-mark="star"><span class="lv-st">★</span> 별표만 ${starN}</button>
      <button type="button" class="lv-chip${s.mark === 'memo' ? ' on' : ''}" data-lv-mark="memo">${SVG.memo} 메모 있음 ${memoN}</button>
      ${s.kind !== 'mine' ? chipSel('subject', '과목', subjects) : ''}${chipSel('part', '단원', parts)}${s.kind !== 'mine' ? chipSel('exam', '시험', exams) : ''}
      <label class="lv-search"><input id="lib-query" value="${E(s.query)}" placeholder="내용·단원 찾기" aria-label="보관함 찾기"></label>
    </div>`;
  const kt = x => `<span class="lv-kt ${x.kind}">${x.kind === 'mine' ? '내 문항' : '기출'}</span>`;
  const thumb = x => x.kind === 'mine' ? (isBlank(x.q) ? '<div class="pv-thumb is-blank"><span><b>빈 문항</b>눌러서 쓰기</span></div>' : `<div class="pv-thumb"><div class="pv-doc" data-preview="${x.id}"></div></div>`) : `<img alt="${E(x.title)}" data-lv-card="${E(past.index.cards.replace('{id}', encodeURIComponent(x.id)))}" data-lv-past="${E(x.id)}" data-fallback="${E(x.i.hasFigure ? new URL(`../../exam-library/images/${encodeURIComponent(x.id)}.png`, import.meta.url).href : '')}">`;
  let body;
  // 보관함을 읽지 못했으면(저장소 오류) 그 까닭을 먼저 보인다(예전 보관함과 같은 자리·같은 글).
  if (view.loadError && !libraryQuestions(data).length) body = `<p class="lv-empty pv-empty">${E(view.loadError)}</p>`;
  else if (!list.length) body = `<p class="lv-empty pv-empty">${s.kind !== 'mine' && !past.items ? '기출을 불러오는 중입니다…' : '조건에 맞는 문항이 없습니다.'}</p>`;
  else if (s.mode === 'one') body = `<div class="lv-inline">${viewerHtml(list, Math.max(0, Math.min(list.length - 1, s.open < 0 ? 0 : s.open)), true, api)}</div>`;
  else if (s.mode === 'list') body = `<ol class="lv-list">${shown.map((x, n) => `<li><button type="button" class="lv-row" data-lv-open="${n}">${kt(x)}<b>${E(x.title)}</b><span>${E(x.part || x.subject)}</span>${memos[x.key] ? `<i class="lv-memo-dot" title="메모 있음">${SVG.memo}</i>` : ''}<small>${x.pt ? x.pt + '점' : x.exam}</small></button><button type="button" class="lv-cstar${stars[x.key] ? ' on' : ''}" data-lv-star="${E(x.key)}" aria-pressed="${!!stars[x.key]}" title="별표">${SVG.star}</button></li>`).join('')}</ol>`;
  else body = `<div class="lv-grid">${shown.map((x, n) => `<article class="lv-card" data-lv-open="${n}" tabindex="0" aria-label="${E(x.title)} 보기"><div class="lv-thumb">${thumb(x)}</div>
      <button type="button" class="lv-cstar${stars[x.key] ? ' on' : ''}" data-lv-star="${E(x.key)}" aria-pressed="${!!stars[x.key]}" aria-label="${stars[x.key] ? '별표 빼기' : '별표'}" title="별표 (S)">${SVG.star}</button>
      <div class="lv-meta">${kt(x)}<span class="lv-title">${E(x.title)}</span>${memos[x.key] ? `<i class="lv-memo-dot" title="메모 있음">${SVG.memo}</i>` : ''}<small>${x.pt ? x.pt + '점' : E(x.exam)}</small>${x.kind === 'mine' ? `<button type="button" class="lv-open" data-open-card="${x.id}" title="카드 열기 — 바로 고쳐 쓰기">열기</button>` : ''}</div></article>`).join('')}</div>`;
  const more = s.mode !== 'one' && list.length > shown.length ? `<div class="lv-more"><button type="button" data-lv-more>${Math.min(PAGE, list.length - shown.length)}개 더 보기 <small>(${shown.length.toLocaleString()} / ${list.length.toLocaleString()})</small></button></div>` : '';
  root.innerHTML = head + body + more;
  fillOwn(root, data, api);
  loadThumbs(root);
  view.lib.list = list;
  if (s.open >= 0 && s.mode !== 'one') openViewer(root, list, s.open, api);
}

// 내 문항 카드·열어 보기 = 한글 엔진이 조판한 그림(시험지 화면 카드와 같은 모양, 10-26 지적 U1).
// 어림 HTML은 수식($5h$)·〈보기〉 틀이 실제와 달라 보였다. 엔진은 한 번에 하나씩 그리니 화면에 들어온 카드만 그린다.
// 엔진 그림(SVG) 글은 글자 조각으로 흩어져 있어 읽기 프로그램·찾기(⌘F)가 읽지 못한다 — 같은 글을 숨은 글로 붙인다.
const plainOf = q => [...(q.blocks || []).flatMap(b => [b.text, ...(b.lines || []).map(l => l.text)]), q.ask, ...(q.choices || []).map(c => c.text)]
  .filter(Boolean).join(' ').replace(/\$([^$]*)\$/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 600);
let ownSeen = null;
function fillOwn(root, data, api) {
  const draw = n => { const q = data.questions.find(x => x.id === n.dataset.preview); if (!q) return;
    if (api?.engine) { n.classList.add('lv-eng'); api.engine(n, q).then(() => { if (n.isConnected) n.insertAdjacentHTML('beforeend', `<span class="sr-only">${E(plainOf(q))}</span>`); }); } else previewHtml(q).then(h => { if (n.isConnected) n.innerHTML = h; }); };
  ownSeen?.disconnect();
  ownSeen = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { ownSeen.unobserve(e.target); draw(e.target); } }, { rootMargin: '300px' }) : null;
  root.querySelectorAll('[data-preview]').forEach(n => { if (n.closest('[data-lv-viewer]') || !ownSeen) draw(n); else ownSeen.observe(n); });
}

export function loadThumbs(root) {
  // 그림을 못 받으면(인터넷 없음 등) 깨진 그림 대신 제목만 옅게 보인다. 로컬 그림이 있으면 그것으로.
  const miss = img => { if (img.dataset.fallback && img.src !== img.dataset.fallback) { img.src = img.dataset.fallback; return; } img.closest('.lv-thumb,.lv-qbox')?.setAttribute('data-missing', img.alt || ''); img.remove(); };
  const show = img => { if (img.dataset.loading) return; img.dataset.loading = '1'; img.onerror = () => miss(img);
    croppedPastImage(img.dataset.lvCard).then(src => { if (img.isConnected) img.src = src; }).catch(() => miss(img)); };
  const imgs = root.querySelectorAll('img[data-lv-card]');
  if (!('IntersectionObserver' in window)) { imgs.forEach(show); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } }), { rootMargin: '400px 0px' });
  imgs.forEach(img => io.observe(img));
}

// ── 문항 보기(창·한 문항 공통) ──
function viewerHtml(list, n, inline, api) {
  const x = list[n], stars = store.get('stars', {}), memos = store.get('memos', {}), memoAt = store.get('memoAt', {}), on = !!stars[x.key];
  const busy = api.pastBusy?.(), job = x.kind === 'past' && busy && busy.id === x.id ? busy : null;
  const info = x.kind === 'past'
    ? [['출처', `${x.i.title}`], ['과목', x.subject], ['단원', x.part || '—'], ['유형', x.i.tags.slice(0, 4).map(t => `<span class="lv-tagp">${E(t)}</span>`).join('') || '—', true], ['연결', '원본 PDF 있음']]
    : [['출처', x.q.source || '내가 만든 문항'], ['단원', x.part || '—'], ['배점 · 정답', `${x.q.points ? x.q.points + '점' : '배점 없음'} · ${x.q.answer || '정답 없음'}`], ['유형', `<span class="lv-tagp">${E(x.q.type || '')}</span><span class="lv-tagp">${E(WORKFLOWS[workflowOf(x.q)] || '')}</span>`, true], ['연결', `근거 ${(x.q.references || []).length}개`]];
  const btns = x.kind === 'past'
    ? `${x.i.publicPath ? `<a class="lv-btn" href="${E(pdfHref(x.i.publicPath, x.i.page))}" target="_blank" rel="noopener" title="이 문항이 있는 시험지 쪽을 원본 PDF로 봅니다">시험지 쪽에서 보기</a><a class="lv-btn" href="${E(pdfHref(x.i.publicPath, 1))}" target="_blank" rel="noopener" title="시험지 PDF 원본">PDF</a>` : ''}<span class="sp"></span>
       <button type="button" class="lv-btn" data-lv-act="link" title="문항 카드를 연 상태에서 그 카드의 근거로 연결합니다">${SVG.link}근거로 연결</button>
       <button type="button" class="lv-btn soft" data-lv-act="convert" ${job ? 'disabled' : ''} title="편집 가능한 한글 문항으로 바꿔 새 문항 카드로 만듭니다(AI 없음)">${job ? '변형 중…' : '변형'}</button>`
    : `<span class="sp"></span><button type="button" class="lv-btn danger" data-lv-act="delete">삭제</button><button type="button" class="lv-btn" data-lv-act="toexam">시험지에 넣기…</button><button type="button" class="lv-btn soft" data-lv-act="card">카드 열기</button>`;
  const at = job ? stepOf(job.stage) : 0;
  return `<div class="lv-viewer" data-lv-viewer data-n="${n}"><div class="lv-vhead"><h3>${E(x.title)}</h3>${x.kind === 'mine' ? '<span class="lv-kt mine">내 문항</span>' : '<span class="lv-kt past">기출</span>'}
      <button type="button" class="lv-ib lv-vstar${on ? ' on' : ''}" data-lv-star="${E(x.key)}" aria-pressed="${on}" title="별표 (S)" aria-label="별표">${SVG.star}</button>
      <span class="lv-pos">${n + 1} / ${list.length.toLocaleString()}</span>${inline ? '' : `<button type="button" class="lv-ib" data-lv-close title="닫기 (Esc)" aria-label="닫기">${SVG.close}</button>`}</div>
    <div class="lv-stage"><button type="button" class="lv-side" data-lv-step="-1" title="이전 (←)" aria-label="이전 문항" ${n <= 0 ? 'disabled' : ''}>${SVG.prev}</button>
      <div class="lv-qbox">${x.kind === 'mine' ? `<div class="lv-own pv-doc" data-preview="${x.id}"></div>` : `<img alt="${E(x.title)}" data-lv-full="${E(x.id)}">`}</div>
      <button type="button" class="lv-side" data-lv-step="1" title="다음 (→)" aria-label="다음 문항" ${n >= list.length - 1 ? 'disabled' : ''}>${SVG.next}</button></div>
    <div class="lv-btns">${btns}</div>
    <div class="lv-strip${job ? ' on' : ''}">${job ? `<div class="lv-jmsg"><span class="lv-spin"></span><b>${STEPS[at]}…</b><small>${at + 1} / 3 · 다른 문항을 봐도 계속됩니다</small></div><div class="lv-steps">${STEPS.map((_, k) => `<span class="${k < at ? 'done' : k === at ? 'run' : ''}"></span>`).join('')}</div>` : ''}</div>
    <div class="lv-im"><div class="lv-box"><h4>문항 정보</h4><dl class="lv-kv">${info.map(([k, v, html]) => `<dt>${k}</dt><dd>${html ? v : E(v)}</dd>`).join('')}</dl></div>
      <div class="lv-box"><h4>${SVG.memo}내 메모 <em>이 기기에 저장</em></h4><textarea data-lv-memo="${E(x.key)}" placeholder="이 문항에 대한 메모 — 쓰는 대로 저장됩니다">${E(memos[x.key] || '')}</textarea><div class="lv-saved">${memoAt[x.key] ? '마지막 저장 ' + E(memoAt[x.key]) : ''}</div></div></div></div>`;
}
function fillViewer(host, list, data, api) {
  const v = host.querySelector('[data-lv-viewer]'); if (!v) return;
  const x = list[Number(v.dataset.n)];
  fillOwn(v, data, api);
  const img = v.querySelector('img[data-lv-full]');
  if (img && x?.i) { img.onerror = () => { if (!img.dataset.sharp) { img.closest('.lv-qbox')?.setAttribute('data-missing', '그림을 불러오지 못했습니다 — 인터넷 연결을 확인하세요'); img.remove(); } }; croppedPastImage(past.index.cards.replace('{id}', encodeURIComponent(x.id))).then(src => { if (img.isConnected && !img.dataset.sharp) img.src = src; }).catch(() => {});
    if (x.i.publicPath && Array.isArray(x.i.box)) croppedQuestion(x.i).then(r => { if (r && img.isConnected) { img.dataset.sharp = '1'; img.src = r.url; } }).catch(() => {}); }
}
let modal = null;
function openViewer(root, list, n, api) {
  modal ||= Object.assign(document.createElement('div'), { className: 'lv-modal-bg' });
  if (!modal.isConnected) document.body.append(modal);
  modal.innerHTML = `<div class="lv-modal" role="dialog" aria-modal="true" aria-label="문항 보기">${viewerHtml(list, n, false, api)}</div>`;
  modal.hidden = false; fillViewer(modal, list, api.data(), api); api.crumb?.(list[n].title);
  modal.querySelector('[data-lv-close]')?.focus({ preventScroll: true });
}
export function closeViewer(api) { if (modal && !modal.hidden) { modal.hidden = true; modal.innerHTML = ''; api?.crumb?.(''); } }

// ── 동작(한 번만 붙인다) ──
export function installLibraryView(root, api) {
  const s = () => libState(api.view()), list = () => api.view().lib?.list || [];
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function step(d) {
    const st = s(), host = st.mode === 'one' ? root : modal, cur = Number(host?.querySelector('[data-lv-viewer]')?.dataset.n ?? st.open), n = cur + d, l = list();
    if (n < 0 || n >= l.length) return;
    const old = host.querySelector('.lv-qbox'), rect = old?.getBoundingClientRect(), ghost = old?.cloneNode(true);
    st.open = n;
    if (st.mode === 'one') api.rerender(); else { openViewer(root, l, n, api); }
    const h2 = st.mode === 'one' ? root : modal, box = h2.querySelector('.lv-qbox');
    if (st.mode === 'one') fillViewer(root, l, api.data(), api);
    if (!box || !ghost || reduce()) return;
    // 옛 문항은 밀려 나가며 흐려지고, 새 문항은 반대쪽에서 미끄러져 들어온다(0.32초).
    const E2 = 'cubic-bezier(.22,.8,.24,1)', T = 320, D = 64 * d, stage = box.parentElement; stage.style.position = 'relative';
    ghost.style.cssText = `position:absolute;left:${box.offsetLeft}px;top:${box.offsetTop}px;width:${rect.width}px;pointer-events:none;z-index:2`;
    stage.append(ghost);
    ghost.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-D}px)`, opacity: 0 }], { duration: T, easing: E2 }).onfinish = () => ghost.remove();
    box.animate([{ transform: `translateX(${D}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: T, easing: E2 });
  }
  function toggleStar(key) {
    const st = store.get('stars', {}); if (st[key]) delete st[key]; else st[key] = Date.now(); store.set('stars', st);
    const on = !!st[key];
    document.querySelectorAll(`[data-lv-star="${CSS.escape(key)}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (s().mark === 'star' && modal?.hidden !== false) api.rerender(); else api.navChanged?.();
  }
  const current = () => { const st = s(), host = st.mode === 'one' ? root : modal, v = host?.querySelector('[data-lv-viewer]'); return v ? list()[Number(v.dataset.n)] : null; };
  async function act(kind, button) {
    const x = current(); if (!x) return;
    if (kind === 'convert') { api.convertPast(x.i); setTimeout(() => refreshJob(), 50); return; }
    if (kind === 'link') { api.status('근거로 연결은 문항 카드를 연 뒤 카드 왼쪽 라이브러리 칸에서 할 수 있습니다. 「변형」으로 새 카드를 만들 수도 있습니다.'); return; }
    if (kind === 'card') { closeViewer(api); api.openCard(x.id); return; }
    if (kind === 'delete') { closeViewer(api); api.askDelete(x.id); return; }
    if (kind === 'toexam') api.toExamMenu(x.id, button);
  }
  function refreshJob() { const st = s(); if (st.mode === 'one') api.rerender(); else if (modal && !modal.hidden) { const n = Number(modal.querySelector('[data-lv-viewer]')?.dataset.n); if (Number.isFinite(n)) { modal.querySelector('.lv-modal').innerHTML = viewerHtml(list(), n, false, api); fillViewer(modal, list(), api.data(), api); } } }
  const onClick = e => {
    const t = e.target;
    const star = t.closest('[data-lv-star]'); if (star) { e.stopPropagation(); toggleStar(star.dataset.lvStar); return; }
    const oc = t.closest('[data-open-card]'); if (oc) { e.stopPropagation(); closeViewer(api); api.openCard(oc.dataset.openCard); return; }
    if (t.closest('[data-lv-close]')) { s().open = -1; closeViewer(api); return; }
    const stp = t.closest('[data-lv-step]'); if (stp) { step(Number(stp.dataset.lvStep)); return; }
    const a = t.closest('[data-lv-act]'); if (a) { void act(a.dataset.lvAct, a); return; }
    const k = t.closest('[data-lv-kind]'); if (k) { Object.assign(s(), { kind: k.dataset.lvKind, limit: PAGE, open: -1 }); if (k.dataset.lvKind === 'mine') Object.assign(s(), { subject: '', exam: '' }); api.rerender(); return; }
    const m = t.closest('[data-lv-mark]'); if (m) { Object.assign(s(), { mark: m.dataset.lvMark, limit: PAGE, open: -1 }); api.rerender(); api.navChanged?.(); return; }
    const mo = t.closest('[data-lv-mode]'); if (mo) { Object.assign(s(), { mode: mo.dataset.lvMode, open: mo.dataset.lvMode === 'one' ? Math.max(0, s().open) : -1 }); api.rerender(); if (mo.dataset.lvMode === 'one') fillViewer(root, list(), api.data(), api); return; }
    if (t.closest('[data-lv-more]')) { s().limit += PAGE; api.rerender(); return; }
    const o = t.closest('[data-lv-open]'); if (o && root.contains(o)) { s().open = Number(o.dataset.lvOpen); openViewer(root, list(), s().open, api); }
  };
  root.addEventListener('click', onClick);
  document.addEventListener('click', e => { if (!modal || modal.hidden || !modal.contains(e.target)) return; if (e.target === modal) { s().open = -1; closeViewer(api); return; } onClick(e); });
  document.addEventListener('mousedown', e => { if (modal && !modal.hidden && e.target === modal) { s().open = -1; closeViewer(api); } });
  root.addEventListener('keydown', e => { const o = e.target.closest?.('[data-lv-open]'); if (o && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); o.click(); } });
  root.addEventListener('change', e => { const sel = e.target.closest('[data-lv-sel]'); if (!sel) return; s()[sel.dataset.lvSel] = sel.value; if (sel.dataset.lvSel === 'subject') { s().part = ''; s().exam = ''; } s().limit = PAGE; api.rerender(); });
  // 한글 조합 중에는 다시 그리지 않는다 — 검색칸이 새로 만들어져 「ㄱ」만 남고 조합이 끊겼다(코드 점검 10-21 하). 조합이 끝나면(compositionend) 그린다.
  const searchAgain = t => { clearTimeout(t._t); t._t = setTimeout(() => { if (t._composing) return; s().limit = PAGE; api.rerender(); const n = root.querySelector('#lib-query'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 250); };
  root.addEventListener('compositionstart', e => { if (e.target.id === 'lib-query') e.target._composing = true; });
  root.addEventListener('compositionend', e => { if (e.target.id !== 'lib-query') return; e.target._composing = false; s().query = e.target.value; searchAgain(e.target); });
  root.addEventListener('input', e => { if (e.target.id !== 'lib-query') return; s().query = e.target.value; if (e.isComposing || e.target._composing) return; searchAgain(e.target); });
  // 메모: 쓰는 대로 저장(이 기기). 카드의 메모 표시·「메모 있음」 수는 창을 닫을 때 다시 그린다.
  const memoInput = e => { const t = e.target.closest?.('[data-lv-memo]'); if (!t) return; const m = store.get('memos', {}), at = store.get('memoAt', {}), k = t.dataset.lvMemo;
    if (t.value.trim()) { m[k] = t.value; const d = new Date(); at[k] = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } else { delete m[k]; delete at[k]; }
    store.set('memos', m); store.set('memoAt', at); const n = t.parentElement.querySelector('.lv-saved'); if (n) n.textContent = at[k] ? '저장됨 · ' + at[k] : ''; };
  document.addEventListener('input', memoInput);
  // 키: ← → 넘기기 · S 별표 · Esc 닫기(메모를 쓰는 중에는 꺼짐)
  document.addEventListener('keydown', e => {
    const st = s(), active = (modal && !modal.hidden) || (st.mode === 'one' && root.isConnected && !root.closest('[hidden]'));
    if (!active || /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Escape' && modal && !modal.hidden) { e.preventDefault(); st.open = -1; closeViewer(api); api.rerender(); }
    else if (e.key.toLowerCase() === 's') { const x = current(); if (x) toggleStar(x.key); }
  });
  return { refreshJob, close: () => { s().open = -1; closeViewer(api); } };
}
