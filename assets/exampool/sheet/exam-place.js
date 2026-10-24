// 시험지 만들기 ③ 배치 · 점검(10-24 확정, 시안 5e-design-mockups/exam-flow-1024-v4.html 그대로).
// 왼쪽 문항 순서(목록/카드), 가운데 실제 조판 쪽(쪽 맞춤/폭 맞춤), 오른쪽 점검(목표 대비 지금 · 규칙 점검 · 배치 점검 · AI 내용 검토).
// 규칙 점검은 AI 없이 문항 자료만으로 계산한다. 목표가 없는 줄은 숫자만, 경고하지 않는다(10-24 결정 ⑥).
import { ANSWER_MARK } from './exam-review.js';
import { goalOf, frameOf, propsMarkup } from './exam-flow.js';
import { questionTitle, questionSubtitle } from './views.js';

const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SVG = {
  pen: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  list: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/></svg>',
  grid: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  up: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  card: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  out: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  spark: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
};
const objective = q => q.type !== '서술형';
// 자료 칩: 문항 구성에서 보이는 자료(표 · 그림 · 〈보기〉 · 과정 · 대화) + 선지 표현.
const CHIP = { table: '표', figure: '그림', bogi: '〈보기〉', steps: '과정', dialogue: '대화' };
export function chipsOf(q) {
  const out = [...new Set((q.blocks || []).map(b => CHIP[b.kind]).filter(Boolean))];
  if (q.style === '대응표') out.push('선지 대응표'); else if (q.style === '그림·그래프') out.push('그래프 선지'); else if (q.style === '조합') out.push('ㄱㄴㄷ 선지');
  if (/기출/.test(q.source || '')) out.unshift('기출');
  return out;
}
const answerText = q => !objective(q) ? '서술형' : Number.isInteger(q.answer) ? `정답 ${ANSWER_MARK[q.answer]}` : '<span class="wn">정답 없음</span>';

export function placeState(view) { return view.place ||= { lv: 'list', zoom: 'page', noGoal: false }; }

export function renderStep3(exam, data, forms, items, st) {
  const qs = items.map(x => x.q);
  const rows = items.map((x, i) => { const q = x.q;
    return `<div class="pv-orow ex-lr" draggable="true" data-order="${E(x.id)}" data-ex-tip="${E(x.id)}"><span class="n">${i + 1}</span><div class="ex-t"><b>${E(questionSubtitle(q))}</b>
      <div class="ex-cs">${chipsOf(q).map(c => `<span class="ex-cz">${E(c)}</span>`).join('')}</div>
      <div class="ex-m">${[q.unitLarge, q.type, `${Number(q.points) || 0}점`].filter(Boolean).map(E).join(' · ')} · ${answerText(q)}</div></div>
      <span class="ex-tools pv-row-tools"><button type="button" class="mini" data-move="up" title="위로" aria-label="${i + 1}번 위로">${SVG.up}</button><button type="button" class="mini" data-move="down" title="아래로" aria-label="${i + 1}번 아래로">${SVG.down}</button><button type="button" class="mini" data-open-card="${E(x.id)}" title="카드 열기" aria-label="${i + 1}번 카드 열기">${SVG.card}</button><button type="button" class="mini" data-out="${E(x.id)}" title="보관함으로 빼기" aria-label="${i + 1}번 빼기">${SVG.out}</button></span></div>`; }).join('');
  const cards = items.map((x, i) => `<div class="pv-orow ex-cc" draggable="true" data-order="${E(x.id)}"><div class="ex-th"><div class="ep-doc" data-preview="${E(x.id)}"></div></div><div class="ex-cm"><b><span class="ex-no">${i + 1}</span>${E(questionSubtitle(x.q))}</b><span>${E(x.q.type)} · ${Number(x.q.points) || 0}점 · ${answerText(x.q)}</span></div>
      <span class="ex-tools pv-row-tools"><button type="button" class="mini" data-open-card="${E(x.id)}" title="카드 열기" aria-label="${i + 1}번 카드 열기">${SVG.card}</button><button type="button" class="mini" data-out="${E(x.id)}" title="보관함으로 빼기" aria-label="${i + 1}번 빼기">${SVG.out}</button></span></div>`).join('');
  return `<div class="ef-work ex-s3">
  <section class="ef-pane"><div class="ef-ph"><b>문항 순서</b><small>${items.length}문항</small><span class="sp"></span>
      <div class="ef-seg ex-lv" role="group" aria-label="보기 방식"><button type="button" data-ex-lv="list" aria-pressed="${st.lv === 'list'}" title="목록" aria-label="목록">${SVG.list}</button><button type="button" data-ex-lv="card" aria-pressed="${st.lv === 'card'}" title="카드" aria-label="카드">${SVG.grid}</button></div></div>
    <div class="ex-ord" id="exam-order">${items.length ? (st.lv === 'card' ? `<div class="ex-cgrid">${cards}</div>` : rows) : '<p class="ef-hint" style="padding:12px">아직 문항이 없습니다. 「＋ 문항 더 담기」로 보관함에서 고르세요.</p>'}</div>
    <div class="ef-foot"><button type="button" class="ef-btn" data-ef-step="2">＋ 문항 더 담기</button><span class="sp"></span><span class="mu" style="font-size:11.5px">끌어서 순서 바꾸기</span></div></section>
  <section class="ef-pane"><div class="ef-ph"><b>쪽</b><small id="exam-sheet-info"></small><span class="sp"></span>
      <div class="ef-seg ex-zoom" role="group" aria-label="쪽 보기"><button type="button" data-ex-zoom="page" aria-pressed="${st.zoom === 'page'}">쪽 맞춤</button><button type="button" data-ex-zoom="width" aria-pressed="${st.zoom === 'width'}">폭 맞춤</button></div></div>
    <div class="ex-desk"><div class="pv-sheet ex-zoom-${st.zoom}" id="exam-sheet" data-exam="${E(exam.id)}"><p class="pv-empty">${items.length ? '한글 조판으로 쪽을 그리는 중…' : '문항을 넣으면 실제 쪽이 보입니다.'}</p></div></div></section>
  <section class="ef-pane"><div class="ef-ph"><b>점검</b><span class="sp"></span><label class="ex-swl"><input type="checkbox" data-ex-nogoal ${st.noGoal ? 'checked' : ''}><span class="sw"></span>목표 없이 보기</label></div>
    <div class="ex-rp" id="exam-check">${checkMarkup(exam, data, forms, items, st, null)}</div></section>
</div>`;
}

// 배치 점검 줄(그린 쪽 결과가 오면 다시 쓴다). sheet: pageSheets 결과(없으면 어림 쪽 나눔).
export function placeRows(exam, items, sheet) {
  const no = id => exam.items.indexOf(id) + 1, list = ids => ids.map(no).join('·');
  const over = sheet ? sheet.oversized || [] : [], moved = sheet ? sheet.moved || [] : [], rewidth = sheet ? sheet.rewidth || [] : [];
  return rl(over.length ? 'wn' : 'ok', '단 높이를 넘는 문항 · 선지가 떨어진 곳', over.length ? `${list(over)}번` : sheet ? '없음' : '쪽을 그리는 중', over[0])
    + rl('in', '통째로 다음 단 · 쪽으로 넘김', moved.length ? `${list(moved)}번` : '없음')
    + (rewidth.length ? rl('in', '단 폭이 다른 용지로 조판한 문항', `${rewidth.join('·')}번 — 시험지 단 폭으로 다시 조판해 놓음`) : '');
}
const rl = (state, text, value, open) => `<div class="ex-rl${open ? ' act' : ''}"${open ? ` data-open-card="${E(open)}" role="button" tabindex="0"` : ''}>${state === 'ok' ? '<i class="si ok">✓</i>' : state === 'in' ? '<i class="si in">i</i>' : `<i class="si ${state}">!</i>`}<span>${text}</span><span class="rv ${state === 'ok' || state === 'in' ? '' : state}">${value}${open ? '<span class="go">→</span>' : ''}</span></div>`;

export function checkMarkup(exam, data, forms, items, st, sheet) {
  const qs = items.map(x => x.q), g = goalOf(exam, forms), useGoal = !st.noGoal, n = qs.length;
  const obj = qs.filter(objective).length, pts = qs.reduce((a, q) => a + (Number(q.points) || 0), 0);
  const ans = qs.filter(q => objective(q) && Number.isInteger(q.answer)).map(q => q.answer), dist = [0, 0, 0, 0, 0]; ans.forEach(a => dist[a]++);
  const spread = ans.length ? Math.max(...dist) - Math.min(...dist) : 0; let run = 1, runMax = ans.length ? 1 : 0, runAt = -1;
  for (let i = 1; i < ans.length; i++) { run = ans[i] === ans[i - 1] ? run + 1 : 1; if (run > runMax) { runMax = run; runAt = i; } }
  const lv = { 상: 0, 중: 0, 하: 0 }; qs.forEach(q => { if (lv[q.difficulty] !== undefined) lv[q.difficulty]++; });
  const lvGoal = [.2, .5, .3].map(r => Math.round(n * r)), lvOk = ['상', '중', '하'].every((k, i) => Math.abs(lv[k] - lvGoal[i]) <= 1);
  const outRange = g.range.length ? qs.map((q, i) => g.range.includes(q.unitLarge) ? 0 : i + 1).filter(Boolean) : [];
  const warn = { goal: 0, rule: 0, place: 0 };
  const ic = (ok, has) => has ? (ok ? '<i class="si ok">✓</i>' : '<i class="si wn">!</i>') : '<i class="si"></i>';
  const grow = (lb, v, goal, unit = '') => { const has = useGoal && goal != null, ok = v === goal; if (has && !ok) warn.goal++; const pct = has && goal ? Math.min(100, v / goal * 100) : 0;
    return `<div class="ex-gr"><span class="gl">${lb}</span><span class="gb">${has ? `<i class="${ok ? 'full' : v > goal ? 'over' : ''}" style="width:${pct}%"></i>` : ''}</span><span class="gv">${v}${unit}${has ? `<small> / ${goal}${unit}</small>` : ''}</span>${ic(ok, has)}</div>`; };
  const info = (lb, v, cls = '', s = '<i class="si"></i>') => `<div class="ex-gr"><span class="gl">${lb}</span><span class="gv wide ${cls}">${v}</span>${s}</div>`;
  const units = new Set(qs.map(q => q.unitLarge).filter(Boolean));
  let goalHtml = grow('문항 수', n, useGoal ? g.nObj + g.nEssay : null) + grow('선택형', obj, g.nObj) + grow('서술형', n - obj, g.nEssay)
    + (g.total == null ? info('배점 합', `${pts}점 <small>· 점검 안 함</small>`, 'off') : grow('배점 합', pts, g.total, '점'))
    + '<div class="ex-gsep"></div>'
    + info('범위', `${units.size}개 단원${outRange.length && useGoal ? ` <span class="wn">· 범위 밖 ${outRange.join('·')}번</span>` : ''}`, '', outRange.length && useGoal ? (warn.goal++, '<i class="si wn">!</i>') : '<i class="si"></i>')
    + info('난이도', `상 ${lv.상} · 중 ${lv.중} · 하 ${lv.하}${useGoal && g.diff ? ` <small>/ ${lvGoal.join(' · ')}</small>` : ''}`, '', useGoal && g.diff ? (lvOk ? '<i class="si ok">✓</i>' : (warn.goal++, '<i class="si wn">!</i>')) : '<i class="si"></i>')
    + info('시험 시간', g.time == null ? '점검 안 함' : `${g.time}분 <small>· 문항당 ${(g.time / Math.max(1, n)).toFixed(1)}분</small>`, g.time == null ? 'off' : '')
    + info('쪽', sheet ? `${sheet.pages.length}쪽` : '<small>그리는 중</small>');
  const distOk = spread <= 2 && runMax < 3;
  if (useGoal && g.rule && ans.length && !distOk) warn.goal++;
  goalHtml += `<div class="ex-gr ex-dist"><span class="gl">정답 분포</span><span class="pv-answers ex-dist2" aria-label="정답 분포">${dist.map((v, k) => `<span title="${ANSWER_MARK[k]} ${v}문항"><i style="height:${3 + v * 4}px"></i>${ANSWER_MARK[k]}${v}</span>`).join('')}</span>${useGoal && g.rule && ans.length ? (distOk ? '<i class="si ok">✓</i>' : '<i class="si wn">!</i>') : '<i class="si"></i>'}</div>`;
  // 규칙 점검(AI 없이): 문항 자료로 바로 계산.
  const list = pred => qs.map((q, i) => pred(q) ? i : -1).filter(i => i >= 0);
  const rule = (idx, label, okText = '없음', level = 'bd') => { if (idx.length) warn.rule++; return rl(idx.length ? level : 'ok', label, idx.length ? `${idx.map(i => i + 1).join('·')}번` : okText, idx.length ? qs[idx[0]].id : null); };
  const noAns = list(q => objective(q) && !Number.isInteger(q.answer)), noPts = list(q => !(Number(q.points) > 0)), noAsk = list(q => !String(q.ask || '').trim());
  const dup = list(q => { const t = (q.choices || []).map(c => String(c.text || '').replace(/\s+/g, '')).filter(Boolean); return new Set(t).size !== t.length; });
  const allowed = new Set(frameOf(exam, forms).pts ? [2, 3] : [2, 3, 4]);
  const badPts = g.points ? list(q => objective(q) && Number(q.points) > 0 && !allowed.has(Number(q.points))) : [];
  const objIdx = list(q => objective(q) && Number.isInteger(q.answer));
  let runIdx = []; if (runMax >= 3 && runAt >= 0) runIdx = objIdx.slice(runAt - runMax + 1, runAt + 1);
  const rules = rule(noAns, '정답을 정하지 않은 문항') + rule(noPts, '배점이 없는 문항') + rule(noAsk, '발문이 비어 있는 문항') + rule(dup, '선지 글이 겹치는 문항', '없음', 'wn')
    + (g.rule ? rule(runIdx, '같은 정답 3번 이상 연속', '없음', 'wn') : '') + (g.points ? rule(badPts, `배점 규칙(선택형 ${[...allowed].join(' · ')}점) 밖`, '없음', 'wn') : '');
  const place = placeRows(exam, items, sheet);
  if (sheet && (sheet.oversized || []).length) warn.place++;
  const total = warn.goal + warn.rule + warn.place;
  return `<div class="ex-sum"><span class="big ${total ? 'wn' : 'ok'}">${total || '✓'}</span><span class="lb"><b>${total ? '확인할 것' : '모두 맞습니다'}</b><small>목표 ${warn.goal} · 규칙 ${warn.rule} · 배치 ${warn.place}</small></span></div>
    <div class="ex-sec ex-goalsec"><div class="ex-chd"><b>목표 대비 지금</b>${useGoal ? '' : '<em>목표 없이 · 숫자만</em>'}<button type="button" class="ex-goalbtn" data-ex-goal-open aria-expanded="${!!st.goalPop}"${useGoal ? ' style="margin-left:auto"' : ''}>${SVG.pen}목표 고치기</button></div>${goalHtml}
      ${st.goalPop ? `<div class="ex-goalpop" role="dialog" aria-label="목표 고치기"><div class="ex-gph"><b>목표 고치기</b><small>시험지 속성</small></div><div class="ex-gpb">${propsMarkup(exam, data, forms)}</div><div class="ex-gpf"><span class="sp"></span><button type="button" class="ef-btn" data-ex-goal-close>닫기</button><button type="button" class="ef-btn go" data-ex-goal-apply>적용</button></div></div>` : ''}</div>
    <div class="ex-sec"><div class="ex-chd"><b>규칙 점검</b><em>AI 없이 · 움직일 때마다</em></div>${rules}</div>
    <div class="ex-sec"><div class="ex-chd"><b>배치 점검</b></div><div id="exam-layout-checks">${place}</div></div>
    <div class="ex-sec" style="border-bottom:0"><div class="ex-chd"><b>내용 검토</b><em>AI · 누를 때만</em></div><button type="button" class="ex-aib" data-ex-ai><span class="ai-ic">${SVG.spark}</span><span><b>AI로 내용 검토</b><small>정답 · 오류 · 힌트 겹침을 문항을 읽고 판단</small></span><span class="go2">→</span></button></div>`;
}
export { SVG as PLACE_ICON, questionTitle };
