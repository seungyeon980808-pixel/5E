// 시험지 만들기 세 단계(10-24 확정, 시안 5e-design-mockups/exam-flow-1024-v4.html 그대로):
// ① 틀 · 속성 → ② 문항 고르기 → ③ 배치 · 점검. 여기는 단계 막대 · ① 틀 · 속성 · 내 틀 등록 창.
// 틀이 곧 시험 종류다 — 틀을 고르면 문항 수 · 총점 · 시간 · 배점 규칙 기본값이 같이 채워진다(exam.goal).
const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 틀(용지 · 단 · 머리 · 꼬리)과 그 틀의 시험 종류 · 기본 목표. 등록한 내 틀(학교 시험지 · 학습지 한글 파일)은 forms에서 온다.
const DEF = {
  exam: { nObj: 20, nEssay: 2, total: 100, time: 50, points: false, rule: true },
  kice: { nObj: 20, nEssay: 0, total: 50, time: 30, points: true, rule: true },
  school: { nObj: 20, nEssay: 3, total: 100, time: 50, points: false, rule: true },
  sheet: { nObj: 10, nEssay: 0, total: null, time: null, points: false, rule: false },
};
export const BASE_FRAMES = {
  basic: { name: '기본', desc: 'A4 2단 · 여백 15mm · 가운데 선 · 쪽 번호', kind: '정기고사', cols: 2, m: 15, hdr: 0, look: 'basic', def: DEF.exam },
  kice: { name: '수능', desc: 'B4 2단(기출 원본 그대로) · A4는 줄여 인쇄 · 평가원 시험지 머리 · 영역·과목 표시', kind: '수능형 모의', cols: 2, m: 15, hdr: 24, look: 'kice', def: DEF.kice, pts: '2 · 3점' },
  sheet: { name: '학습지', desc: 'A4 1단 · 제목 · 반·번호·이름 칸', kind: '학습지', cols: 1, m: 18, hdr: 22, look: 'sheet', def: DEF.sheet },
};
export const SUBJECTS = ['통합과학', '물리학Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ', '물리학Ⅱ', '화학Ⅱ', '생명과학Ⅱ', '지구과학Ⅱ'];

// 틀 목록: 기본 · 수능 · (등록한 내 틀) · 학습지. 내 틀 열쇠는 'form:<id>'.
export function frameList(forms = []) {
  const mine = forms.map(f => {
    const sheet = f.kind === 'sheet', st = f.structure || {};
    return ['form:' + f.id, { name: f.name, desc: sheet ? `등록한 한글 파일 · A4 ${st.columns || 1}단 · 제목 · 이름 칸` : `등록한 한글 양식 · 제목 표${st.footer ? ' · 꼬리말' : ''}`, kind: sheet ? '학습지' : '정기고사', cols: st.columns || (sheet ? 1 : 2), m: sheet ? 18 : 12, hdr: sheet ? 30 : 18, foot: !sheet && st.footer ? 6 : 0, look: sheet ? 'mine' : 'school', title: f.name, mine: true, def: sheet ? DEF.sheet : DEF.school }];
  });
  return [['basic', BASE_FRAMES.basic], ['kice', BASE_FRAMES.kice], ...mine, ['sheet', BASE_FRAMES.sheet]];
}
// 시험지의 틀: exam.frame이 없으면 예전 시험지 — 학교 양식을 골랐으면 그 양식, 아니면 기본.
export function frameKey(exam) { return exam?.frame === 'form' ? (exam.formId ? 'form:' + exam.formId : 'basic') : exam?.frame || (exam?.formId ? 'form:' + exam.formId : 'basic'); }
export function frameOf(exam, forms) { const key = frameKey(exam), list = new Map(frameList(forms)); return { key, ...(list.get(key) || BASE_FRAMES.basic) }; }
// 시험지 속성(목표): 없으면 틀 기본값. total·time이 null이면 「점검 안 함」.
export function goalOf(exam, forms) {
  const f = frameOf(exam, forms), g = exam?.goal || {};
  return { subject: g.subject || '', range: Array.isArray(g.range) ? g.range : [], nObj: g.nObj ?? f.def.nObj, nEssay: g.nEssay ?? f.def.nEssay, total: g.total === undefined ? f.def.total : g.total, time: g.time === undefined ? f.def.time : g.time, points: g.points ?? f.def.points, diff: g.diff ?? false, rule: g.rule ?? f.def.rule, edited: !!g.edited };
}
// 틀을 고르면 목표를 그 틀 기본값으로(과목 · 범위는 그대로).
export function applyFrame(exam, key, forms) {
  if (key.startsWith('form:')) { exam.frame = 'form'; exam.formId = key.slice(5); } else { exam.frame = key; delete exam.formId; }
  const f = frameOf(exam, forms), g = exam.goal || {};
  exam.goal = { subject: g.subject || '', range: g.range || [], ...f.def, diff: g.diff || false, edited: false };
}
const GOAL_NUM = { nObj: [0, 200], nEssay: [0, 200], total: [0, 1000], time: [0, 600] };
// 시험지 자료 검사(exams.js validateExams가 부른다).
export function validFrame(e) {
  if (e.frame !== undefined && !['basic', 'kice', 'sheet', 'form'].includes(e.frame)) return false;
  if (e.goal === undefined) return true;
  const g = e.goal;
  if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
  if (g.subject !== undefined && !(typeof g.subject === 'string' && g.subject.length <= 40)) return false;
  if (g.range !== undefined && !(Array.isArray(g.range) && g.range.length <= 40 && g.range.every(v => typeof v === 'string' && v.length <= 80))) return false;
  for (const [k, [lo, hi]] of Object.entries(GOAL_NUM)) if (g[k] !== undefined && g[k] !== null && !(Number.isInteger(g[k]) && g[k] >= lo && g[k] <= hi)) return false;
  for (const k of ['points', 'diff', 'rule', 'edited']) if (g[k] !== undefined && typeof g[k] !== 'boolean') return false;
  return true;
}

// 틀 그림(210 × 297 mm 좌표). 문항 자리는 파란 점선.
export function frameSvg(f, { place = true } = {}) {
  const h = 297, m = f.m, top = m + (f.hdr || 0), foot = f.foot || 0, W = 210 - 2 * m;
  let s = `<svg viewBox="0 0 210 297" aria-hidden="true">`;
  if (f.look === 'kice') s += `<rect x="${m}" y="${m}" width="${W}" height="18" fill="none" stroke="#111" stroke-width=".5"/><text x="105" y="${m + 8}" font-size="6" text-anchor="middle" font-family="serif">대학수학능력시험 문제지</text><text x="105" y="${m + 15}" font-size="5" text-anchor="middle" font-family="serif">과학탐구 영역</text>`;
  if (f.look === 'school') s += `<rect x="${m}" y="${m}" width="${W}" height="13" fill="#f2f2f2" stroke="#111" stroke-width=".4"/>${[1, 2, 3, 4].map(i => `<line x1="${m + W / 5 * i}" y1="${m}" x2="${m + W / 5 * i}" y2="${m + 13}" stroke="#111" stroke-width=".3"/>`).join('')}<line x1="${m}" y1="${m + 6.5}" x2="${210 - m}" y2="${m + 6.5}" stroke="#111" stroke-width=".3"/>${foot ? `<line x1="${m}" y1="${h - m - 2}" x2="${210 - m}" y2="${h - m - 2}" stroke="#999" stroke-width=".3"/>` : ''}`;
  if (f.look === 'sheet') s += `<text x="${m}" y="${m + 9}" font-size="8" font-family="sans-serif" font-weight="700">학습지</text><rect x="${210 - m - 70}" y="${m + 2}" width="70" height="10" fill="none" stroke="#111" stroke-width=".4"/><text x="${210 - m - 66}" y="${m + 8.5}" font-size="3.6" font-family="sans-serif">반    번호    이름</text>`;
  if (f.look === 'mine') s += `<rect x="${m}" y="${m}" width="${W}" height="26" rx="2" fill="#eef3f8" stroke="#111" stroke-width=".4"/><text x="${m + 5}" y="${m + 11}" font-size="7.5" font-family="sans-serif" font-weight="700">${E(String(f.title || '').slice(0, 18))}</text><rect x="${210 - m - 58}" y="${m + 4}" width="54" height="9" fill="#fff" stroke="#111" stroke-width=".3"/><text x="${210 - m - 55}" y="${m + 10}" font-size="3.4" font-family="sans-serif">반   번호   이름</text>`;
  if (place) s += `<rect x="${m}" y="${top}" width="${W}" height="${h - m - top - foot}" fill="rgba(107,164,248,.07)" stroke="rgba(107,164,248,.6)" stroke-dasharray="2 2" stroke-width=".4"/>`;
  if (f.cols === 2) s += `<line x1="105" y1="${top}" x2="105" y2="${h - m - foot}" stroke="#555" stroke-width=".4"/>`;
  if (f.look === 'basic' || f.look === 'kice') s += `<text x="105" y="${h - m + 6}" font-size="4" text-anchor="middle" font-family="serif">- 1 -</text>`;
  if (place) s += `<text x="${m + 2}" y="${top + 6}" font-size="3.4" fill="#2f6fd6" font-family="sans-serif">문항 자리</text>`;
  return s + '</svg>';
}
const defLine = f => { const d = f.def; return `${f.kind} · ${d.nObj + d.nEssay}문항${d.total != null ? ` · ${d.total}점 · ${d.time}분` : ' · 총점·시간 점검 안 함'}`; };

// ── 단계 막대 ──
export const STEP_NOTE = { 1: '틀을 고르고 시험지 속성(목표)을 정합니다 — 점검의 기준이 됩니다', 2: '카드에 마우스를 올려 「담기」 · 오른쪽 막대가 목표를 채워 갑니다', 3: '문항을 눌러 아래 여백 · 「다음 단에서 시작」 · 왼쪽 위 목록/카드 · 오른쪽 「목표 없이 보기」' };
// 화면 전환 탭(10-24 시안 14 안 A): 번호·✓ 없이 「문항 고르기 · 배치·점검」 둘만, 언제든 오간다. 안내 글은 탭 툴팁, 이름 옆에는 지금 상태(담은 문항 수 · 쪽 수)만.
// ① 틀 · 속성은 탭이 아니라 머리의 「틀 · 이름」 표로 연다(17 안 A — 새 시험지는 「새 시험지」 창에서 틀·목표를 정한다).
export function stepsMarkup(step, { n = 0, pages = 0 } = {}) {
  const tab = (k, t, small) => `<button type="button" role="tab" data-ef-step="${k}" aria-selected="${step === k}" title="${E(STEP_NOTE[k])}">${t}<small>${small}</small></button>`;
  return `<div class="ef-steps" role="tablist" aria-label="시험지 만들기 화면">${tab(2, '문항 고르기', `${n}문항`)}${tab(3, '배치·점검', `${pages}쪽`)}</div>`;
}

// ── ① 틀 · 속성 ──
const RANGE_DEFAULT = ['역학', '열', '전자기', '파동', '원자', '빛과 물질'];
export function rangeOptions(data, goal) {
  const units = [...new Set(data.questions.map(q => q.unitLarge).filter(Boolean))];
  return [...new Set([...(units.length ? units : RANGE_DEFAULT), ...goal.range])];
}
// 시험지 속성(목표) 칸 — ① 틀·속성과 ③ 점검 칸 「목표 고치기」 창이 같이 쓴다(10-24 시안 17: 지금 칸을 그대로 옮겨 씀).
export function propsMarkup(exam, data, forms) {
  const cur = frameOf(exam, forms), g = goalOf(exam, forms);
  const field = (n, k, v, u) => v == null
    ? `<div class="ef-f off"><span class="n">${n}</span><span class="mu">점검 안 함</span><button type="button" class="ef-tiny" data-ef-on="${k}">켜기</button></div>`
    : `<label class="ef-f"><span class="n">${n}</span><input inputmode="numeric" data-ef-goal="${k}" value="${E(v)}" aria-label="${n}"><span class="u">${u}</span>${k === 'total' || k === 'time' ? `<button type="button" class="ef-tiny" data-ef-off="${k}" title="이 목표는 점검하지 않기">끄기</button>` : ''}</label>`;
  const tog = (k, label, on) => `<button type="button" class="ef-tog${on ? ' on' : ''}" data-ef-adv="${k}" aria-pressed="${on}">${label}<span class="sw"></span></button>`;
  const ranges = rangeOptions(data, g);
  return `      <div class="ef-from"><span>틀 「<b>${E(cur.name)}</b>」 기본값으로 채웠습니다 · 시험 종류 <b>${E(cur.kind)}</b></span><span class="sp"></span>${g.edited ? '<button type="button" class="ef-tiny" data-ef-redef>기본값으로</button>' : ''}</div>
      <div class="ef-gh">과목 · 범위</div>
      <label class="ef-f"><span class="n">과목</span><select data-ef-subject aria-label="과목"><option value="">고르지 않음</option>${SUBJECTS.map(s => `<option${g.subject === s ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
      <div class="ef-chips">${ranges.map(r => `<button type="button" class="ef-chip${g.range.includes(r) ? ' on' : ''}" data-ef-range="${E(r)}" aria-pressed="${g.range.includes(r)}">${E(r)}</button>`).join('')}</div>
      <div class="ef-gh">문항 수</div><div class="ef-row2">${field('선택형', 'nObj', g.nObj, '문항')}${field('서술형', 'nEssay', g.nEssay, '문항')}</div>
      <div class="ef-gh">총점 · 시간</div><div class="ef-row2">${field('총점', 'total', g.total, '점')}${field('시험 시간', 'time', g.time, '분')}</div>
      <details class="ef-more" ${g.points || g.diff || g.rule ? 'open' : ''}><summary>＋ 더 정하기 (고를 수 있음)</summary>
        <div class="ef-gh">배점 규칙</div>${tog('points', `선택형 ${cur.pts || '2 · 3 · 4점'}만`, g.points)}
        <div class="ef-gh">난이도 비율</div>${tog('diff', '상 20% · 중 50% · 하 30%', g.diff)}
        <div class="ef-gh">정답 분포 규칙</div>${tog('rule', '①~⑤ 차이 2개 이하 · 같은 번호 3번 연속 금지', g.rule)}
        <p class="ef-hint">켜지 않은 규칙은 점검에서 숫자만 보이고 경고하지 않습니다.</p></details>
`;
}

export function renderStep1(exam, data, forms) {
  const list = frameList(forms), cur = frameOf(exam, forms);
  return `<div class="ef-work ef-s1">
  <section class="ef-pane"><div class="ef-ph"><b>틀</b><small>용지 · 단 · 머리 · 꼬리 + 시험 종류 기본값</small></div>
    <div class="ef-body"><div class="ef-frames">${list.map(([k, f]) => `<button type="button" class="ef-fr" data-ef-frame="${E(k)}" aria-pressed="${cur.key === k}">${frameSvg(f)}<span class="tx"><b>${E(f.name)}${f.mine ? '<span class="mine">내 틀</span>' : ''}</b><span>${E(f.desc)}</span><span class="dv">${defLine(f)}</span></span></button>`).join('')}
      <button type="button" class="ef-fr add" data-ef-register><b>＋ 내 틀 등록…</b><span>학교 시험지 · 학습지 한글 파일</span></button></div>
      <p class="ef-hint">틀이 곧 시험 종류입니다 — 틀을 고르면 문항 수 · 총점 · 시간 · 배점 규칙 기본값이 같이 채워집니다(오른쪽에서 바꿀 수 있음). 학교 시험지나 직접 만든 학습지는 한글 파일(hwp·hwpx)을 올려 「내 틀」로 등록합니다.</p></div></section>
  <section class="ef-pane"><div class="ef-ph"><b>시험지 속성</b><small>점검의 기준</small></div>
    <div class="ef-body">
${propsMarkup(exam, data, forms)}    </div>
    <div class="ef-foot"><span class="mu">나중에 언제든 바꿀 수 있습니다</span><span class="sp"></span><button type="button" class="ef-btn go" data-ef-step="2">다음: 문항 고르기 →</button></div></section>
  <section class="ef-pane"><div class="ef-ph"><b>틀 미리보기</b><small>${E(cur.name)}</small></div><div class="ef-bigprev">${frameSvg(cur)}</div></section>
</div>`;
}

// ── 내 틀 등록 창(학교 시험지 양식 · 내가 만든 학습지) ──
// api.readForm(file) → {read:{standard,structure,rows}, bytes, fileName, encrypted} (암호는 api 안에서 묻고 남기지 않음)
// api.saveForm({name,kind,draft}) → 등록한 양식 id
export function openRegister(api) {
  const back = document.createElement('div');
  back.className = 'ef-back';
  back.innerHTML = '<div class="ef-reg" role="dialog" aria-modal="true" aria-label="내 틀 등록"></div>';
  document.body.append(back);
  const dlg = back.firstElementChild, st = { step: 1, kind: 'sheet', draft: null, name: '', busy: false };
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.hwp,.hwpx', hidden: true });
  back.append(input);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  function render() {
    const d = st.draft, s = d?.read?.structure || {};
    let body = '';
    if (st.step === 1) body = `<div class="ef-rb one"><div><div class="ef-gh">무엇을 등록하나요</div><div class="ef-seg">${[['school', '학교 시험지 양식'], ['sheet', '내가 만든 학습지']].map(([k, v]) => `<button type="button" data-reg-kind="${k}" aria-pressed="${st.kind === k}">${v}</button>`).join('')}</div>
      <div class="ef-drop" data-reg-drop><b>한글 파일(hwp · hwpx)을 여기에 끌어 놓기</b><span class="mu">문항을 지운 빈 양식이 가장 좋고, 문항이 들어 있어도 됩니다 — 문항 자리는 비우고 틀만 읽습니다</span><button type="button" class="ef-btn go" data-reg-pick ${st.busy ? 'disabled' : ''}>${st.busy ? '읽는 중…' : '파일 고르기…'}</button></div>
      <div class="ef-store"><b>설치하지 않아도 등록됩니다.</b> 등록한 틀은 이 컴퓨터의 이 브라우저에 저장됩니다. 다른 컴퓨터에서 쓰려면 한글 파일을 다시 올리면 됩니다. 여러 기기·선생님끼리 자동으로 함께 쓰기는 나중에 설치형이나 동기화 때 붙입니다.</div></div></div>`;
    else {
      const preview = { m: st.kind === 'sheet' ? 18 : 12, hdr: st.kind === 'sheet' ? 30 : 18, foot: s.footer ? 6 : 0, cols: s.columns || 1, look: st.kind === 'sheet' ? 'mine' : 'school', title: st.name };
      const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
      body = `<div class="ef-rb"><div class="ef-regprev">${frameSvg(preview)}</div><div>
        <div class="ef-gh">읽은 것<em>${E(d.fileName)}</em></div>
        <table class="ef-readout">${row('쪽 · 단', `${s.pages || 1}쪽 · ${s.columns || 1}단`)}${row('머리', `${s.headTables ? `제목 표 ${s.headTables}개` : '제목 표 없음'}${s.header ? ' · 머리말' : ''}`)}${row('꼬리', s.footer ? '꼬리말 있음 — 모든 쪽' : '없음')}${row('문항 자리', s.firstQuestion >= 0 ? `${s.firstQuestion + 1}번째 문단부터 <span class="ok">✓</span>${s.questions ? ` <span class="mu">(예시 문항 ${s.questions}개는 묶을 때 비움)</span>` : ''}` : '번호 문단을 못 찾아 양식 끝에 붙입니다')}${(d.read.rows || []).filter(r => r.found).slice(0, 3).map(r => row(E(r.label), E(r.value))).join('')}</table>
        <div class="ef-gh">이름 · 기본값</div><label class="ef-f"><span class="n">이름</span><input data-reg-name value="${E(st.name)}" maxlength="40" style="text-align:left"></label>
        <p class="ef-hint">${st.kind === 'sheet' ? '학습지는 총점 · 시험 시간 점검을 끈 채로 시작합니다(③에서 숫자만 보임).' : '정기고사 기본값(23문항 · 100점 · 50분)으로 시작합니다.'}</p>
        <div class="ef-store">이 브라우저에 저장 · 시험지 화면 ①에서 언제든 고를 수 있습니다</div></div></div>`;
    }
    dlg.innerHTML = `<div class="ef-ph"><b>내 틀 등록</b><small>${st.step === 1 ? '1 / 2 · 파일 올리기' : '2 / 2 · 읽은 결과 확인'}</small><span class="sp"></span><button type="button" class="ef-btn ic" data-reg-close aria-label="닫기">✕</button></div>${body}
      <div class="ef-foot"><span class="sp"></span>${st.step === 2 ? '<button type="button" class="ef-btn" data-reg-back>← 다른 파일</button><button type="button" class="ef-btn go" data-reg-done>등록하고 이 틀 쓰기</button>' : '<button type="button" class="ef-btn" data-reg-close>닫기</button>'}</div>`;
  }
  async function read(file) {
    if (!file || st.busy) return;
    st.busy = true; render();
    try { const d = await api.readForm(file); if (!d) return; st.draft = d; st.name = String(d.read?.standard?.name || file.name.replace(/\.[^.]+$/, '')).slice(0, 40); st.step = 2; }
    catch (e) { api.status(`한글 파일을 읽지 못했습니다: ${e.message}`, true); }
    finally { st.busy = false; if (back.isConnected) render(); }
  }
  input.addEventListener('change', () => read(input.files?.[0]));
  back.addEventListener('dragover', e => { if (e.target.closest('[data-reg-drop]')) e.preventDefault(); });
  back.addEventListener('drop', e => { if (!e.target.closest('[data-reg-drop]')) return; e.preventDefault(); read(e.dataTransfer.files?.[0]); });
  back.addEventListener('input', e => { if (e.target.matches('[data-reg-name]')) st.name = e.target.value; });
  back.addEventListener('click', async e => {
    const t = e.target;
    if (t === back || t.closest('[data-reg-close]')) return close();
    const k = t.closest('[data-reg-kind]'); if (k) { st.kind = k.dataset.regKind; return render(); }
    if (t.closest('[data-reg-pick]')) { input.value = ''; input.click(); return; }
    if (t.closest('[data-reg-back]')) { st.step = 1; st.draft = null; return render(); }
    if (t.closest('[data-reg-done]')) {
      const name = st.name.trim(); if (!name) { dlg.querySelector('[data-reg-name]')?.focus(); return; }
      try { await api.saveForm({ name, kind: st.kind, draft: st.draft }); close(); } catch (err) { api.status(err.message, true); }
    }
  });
  render();
  return { close };
}

// ── 「새 시험지」 창(10-24 시안 17 안 A) ──
// 이름 · 틀(작은 카드) · 핵심 목표 넷(틀 기본값으로 채움) → 「만들기」 → 바로 문항 고르기. 범위 · 배점 규칙 · 난이도 · 정답 분포는 배치·점검의 「목표 고치기」에서.
// api: {forms:()=>양식 목록, name:기본 이름, create({name,frame,goal}), register(onSaved(key))}
const SHORT = { basic: '2단 · 정기고사', kice: '2단 · 평가원 머리', sheet: '1단 · 반·번호·이름' };
export function openNewExam(api) {
  const back = document.createElement('div');
  back.className = 'ef-back ef-newback';
  back.innerHTML = '<div class="ef-new" role="dialog" aria-modal="true" aria-label="새 시험지"></div>';
  document.body.append(back);
  const dlg = back.firstElementChild, st = { name: api.name, key: 'basic', goal: null };
  const fill = () => { const f = frameList(api.forms()).find(([k]) => k === st.key)?.[1] || BASE_FRAMES.basic; st.goal = { nObj: f.def.nObj, nEssay: f.def.nEssay, total: f.def.total, time: f.def.time }; };
  fill();
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const num = (k, label, unit) => `<label class="ef-nf"><span>${label}</span><input inputmode="numeric" data-new-goal="${k}" value="${st.goal[k] == null ? '' : E(st.goal[k])}" placeholder="점검 안 함" aria-label="${label}"><em>${unit}</em></label>`;
  function render() {
    const list = frameList(api.forms());
    dlg.innerHTML = `<div class="ef-new-h"><b>새 시험지</b><button type="button" class="ef-x" data-new-close aria-label="닫기">×</button></div>
      <div class="ef-new-b">
        <label class="ef-new-l">이름<input class="ef-new-name" data-new-name value="${E(st.name)}" maxlength="200"></label>
        <div class="ef-new-l">틀</div>
        <div class="ef-new-fr">${list.map(([k, f]) => `<button type="button" class="ef-nc" data-new-frame="${E(k)}" aria-pressed="${st.key === k}"><span class="pp">${frameSvg(f)}</span><b>${E(f.name)}</b><small>${E(SHORT[k] || '내 틀')}</small></button>`).join('')}
          <button type="button" class="ef-nc add" data-new-register><span class="pp plus">＋</span><b>내 틀</b><small>한글 파일 올리기</small></button></div>
        <div class="ef-new-l">핵심 목표 <small>틀 기본값으로 채워짐</small></div>
        <div class="ef-new-g">${num('nObj', '선택형', '문항')}${num('nEssay', '서술형', '문항')}${num('total', '총점', '점')}${num('time', '시간', '분')}</div>
      </div>
      <div class="ef-new-f"><span class="mu">범위 · 배점 규칙 · 난이도 · 정답 분포는 배치·점검의 「목표 고치기」에서</span><span class="sp"></span><button type="button" class="ef-btn" data-new-close>취소</button><button type="button" class="ef-btn go" data-new-make>만들기</button></div>`;
  }
  render();
  dlg.addEventListener('input', e => { if (e.target.matches('[data-new-name]')) st.name = e.target.value; });
  dlg.addEventListener('change', e => {
    const k = e.target.dataset.newGoal; if (!k) return;
    const raw = e.target.value.trim(), v = Math.round(Number(raw)), max = k === 'total' ? 1000 : k === 'time' ? 600 : 200;
    if (raw === '' && (k === 'total' || k === 'time')) { st.goal[k] = null; return; }
    if (!(Number.isFinite(v) && v >= 0 && v <= max)) { e.target.value = st.goal[k] ?? ''; api.status?.('0 이상의 정수로 적어 주세요.', true); return; }
    st.goal[k] = v;
  });
  dlg.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-new-close]')) { close(); return; }
    const fr = t.closest('[data-new-frame]'); if (fr) { st.key = fr.dataset.newFrame; fill(); render(); return; }
    if (t.closest('[data-new-register]')) { api.register(key => { st.key = key; fill(); render(); }); return; }
    if (t.closest('[data-new-make]')) { const name = st.name.trim(); if (!name) { api.status?.('시험지 이름을 적어 주세요.', true); return; } if (api.create({ name, frame: st.key, goal: st.goal }) !== false) close(); }
  });
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  setTimeout(() => dlg.querySelector('[data-new-name]')?.select(), 0);
  return { close };
}

// ── 「틀 바꾸기」 작은 창(10-24 결정 2) ──
// 머리의 「틀 · 이름」 표를 누르면 「새 시험지」 창과 같은 틀 카드가 뜬다. 고르면 그 틀로 바꾸고 핵심 목표 값은 그대로 둔다.
// api: {forms:()=>양식 목록, current:지금 틀 열쇠, pick(key), register()}
export function openFramePicker(api) {
  const back = document.createElement('div');
  back.className = 'ef-back ef-newback';
  back.innerHTML = '<div class="ef-new ef-frpick" role="dialog" aria-modal="true" aria-label="틀 바꾸기"></div>';
  document.body.append(back);
  const dlg = back.firstElementChild;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const list = frameList(api.forms());
  dlg.innerHTML = `<div class="ef-new-h"><b>틀 바꾸기</b><button type="button" class="ef-x" data-new-close aria-label="닫기">×</button></div>
    <div class="ef-new-b"><div class="ef-new-fr">${list.map(([k, f]) => `<button type="button" class="ef-nc" data-pick-frame="${E(k)}" aria-pressed="${api.current === k}"><span class="pp">${frameSvg(f)}</span><b>${E(f.name)}</b><small>${E(SHORT[k] || '내 틀')}</small></button>`).join('')}
      <button type="button" class="ef-nc add" data-new-register><span class="pp plus">＋</span><b>내 틀</b><small>한글 파일 올리기</small></button></div></div>
    <div class="ef-new-f"><span class="mu">틀을 바꿔도 핵심 목표(문항 수 · 총점 · 시간)는 그대로입니다 — 배치·점검의 「목표 고치기」에서 고칩니다</span><span class="sp"></span><button type="button" class="ef-btn" data-new-close>닫기</button></div>`;
  dlg.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-new-close]')) { close(); return; }
    const fr = t.closest('[data-pick-frame]'); if (fr) { close(); if (fr.dataset.pickFrame !== api.current) api.pick(fr.dataset.pickFrame); return; }
    if (t.closest('[data-new-register]')) { close(); api.register(); }
  });
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  setTimeout(() => dlg.querySelector('.ef-nc[aria-pressed="true"]')?.focus(), 0);
  return { close };
}
