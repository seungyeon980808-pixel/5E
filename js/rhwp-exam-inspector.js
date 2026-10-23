// 5E_hwp 양쪽 인스펙터(10-23 다시 하기, 시안 5e-design-mockups/hwp-inspector.html 그대로).
// 오른쪽 340px = 한글에 있는 기능: 글자·문단 / 표 / 그림 / 쪽 네 칸. 누른 것(글·표·그림·빈 곳)에 따라 저절로 바뀐다.
//   묶음(소제목 + 줄) · 줄 = 이름(78px) + 값 칸(−/값/+)·단추·고르기 · 맨 아래 늘 보이는 문자표·조판 부호.
// 왼쪽 288px = 5E에서 만든 기능: 새 시험지 · 만드는 순서 · 모드(문항·학습지·판짜기) · 내용 넣기 · 자동 다듬기 · 모드 도구 · 문서의 그림 · 점검·양식 저장.
// 값은 엔진에서 읽어 보이고, 바꿀 때는 단축키와 같은 명령(ctx.command)이나 엔진 쓰기(bridge.transaction 안 — 되돌리기 한 번)를 쓴다.
import { applyHangingIndent } from './rhwp-exam-table-controls.js?v=1014-compact-panel';
import { fitTableToColumn, fitCellPicture, renumberQuestions } from './rhwp-exam-layout-tools.js';
import { applyScienceScripts } from './rhwp-exam-science-text.js';
import { setColumns, setPaper, PAPERS } from './rhwp-exam-worksheet.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const HU = 7200 / 25.4; // 1mm = 283.46 HWPUNIT
const mm = units => Math.round(units / HU * 10) / 10;
const round1 = v => Math.round(v * 10) / 10;
const LINE_SPACINGS = [100, 130, 150, 160, 180, 200, 250];
const SVG = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  book: '<path d="M4 5h11a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z"/><path d="M8 9h6M8 13h6"/>',
  md: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9l2.5 3L12 9v6M16 9v6M14 13l2 2 2-2"/>',
  grid: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  form: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>',
  fit: '<path d="M4 6h16M4 12h11M4 18h16"/><path d="M18 10l2 2-2 2"/>',
  oneline: '<path d="M4 12h16"/><path d="M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  sub: '<path d="M4 6l7 9M11 6l-7 9"/><path d="M15 15h4l-4 4h4"/>',
  num: '<path d="M6 5h2v6M5 11h4M5 15h3.5a1.5 1.5 0 0 1 0 3H6l3.5 2"/><path d="M13 7h7M13 13h7M13 19h7"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  save: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/>',
  omega: '<path d="M6 19h4v-2a6 6 0 1 1 4 0v2h4"/>',
  tool: '<path d="M14 6l4 4M4 20l6-6M13 7l4 4-7 7-4-4z"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[name] || SVG.tool}</svg>`;
const MODES = [['item', '문항', '문항 모드 — 시험 문항을 쓰고 다듬기'], ['sheet', '학습지', '학습지 모드 — 빈칸·활동지 만들기'], ['layout', '판짜기', '판짜기 모드 — 쪽·단에 문항 배치']];
const MODE_TOOLS = { item: '문항 쓰기', sheet: '학습지 도구', layout: '판짜기 도구' };

// ── 오른쪽: 묶음·줄 그리기 ──
const numCtl = (key, value, title = '') => `<div class="ei-num" data-ei-num="${key}"${title ? ` title="${esc(title)}"` : ''}><button type="button" data-ei-step="${key}:-1" aria-label="줄이기">−</button><span data-ei-val="${key}">${esc(value)}</span><button type="button" data-ei-step="${key}:1" aria-label="늘리기">+</button></div>`;
const btns = (cols, list) => `<div class="ei-btns c${cols}">${list.map(([key, label, title]) => `<button type="button" class="ei-b" data-ei-act="${key}" title="${esc(title || '')}">${label}</button>`).join('')}</div>`;
const row = (label, control) => `<div class="ei-row"><label>${label}</label>${control}</div>`;
const sel = (key, label, title = '') => `<button type="button" class="ei-ctl sel" data-ei-act="${key}" title="${esc(title)}"><span data-ei-val="${key}">${label}</span></button>`;
const sw = (key, label, title = '') => `<button type="button" class="ei-sw" data-ei-act="${key}" aria-pressed="false" title="${esc(title)}"><span>${label}</span><i></i></button>`;
const sec = (title, em, body) => `<div class="ei-sec"><h4>${title}${em ? `<em>${em}</em>` : ''}</h4>${body}</div>`;

const PANES = {
  text: () => sec('글자', '⌥L',
    row('글꼴', '<select class="ei-ctl" data-ei-font aria-label="글꼴"></select>') +
    row('크기', numCtl('size', '10.0 pt')) +
    row('모양', btns(4, [['bold', '<b>가</b>', '굵게 (⌘B)'], ['italic', '<i>가</i>', '기울임 (⌘I)'], ['underline', '<u>가</u>', '밑줄 (⌘U)'], ['strike', '<s>가</s>', '취소선']])) +
    row('첨자', btns(2, [['sup', 'x² 위 첨자', '위 첨자 (Alt+Shift+P)'], ['sub', 'x₂ 아래 첨자', '아래 첨자 (Alt+Shift+S)']])) +
    row('자간', numCtl('spacing', '0 %', '자간 (Alt+Shift+N / W)')) +
    row('장평', numCtl('ratio', '100 %', '장평 (Alt+Shift+J / K)')) +
    row('색', `<div class="ei-pair">${sel('color', '<span class="ei-chip" data-ei-chip="color"></span> 글자색', '글자 모양 창(글자색) — Alt+L')}${sel('shade', '<span class="ei-chip" data-ei-chip="shade"></span> 형광펜', '고른 글자에 형광펜 켜기·끄기')}</div>`))
    + sec('문단', '⌥T',
    row('정렬', btns(4, [['justify', '양쪽'], ['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']])) +
    row('줄 간격', numCtl('line', '160 %')) +
    row('문단 위', numCtl('before', '0 pt')) +
    row('문단 아래', numCtl('after', '0 pt')) +
    row('왼쪽 여백', numCtl('left', '0 mm')) +
    row('첫 줄', `<div class="ei-pair"><select class="ei-ctl" data-ei-first aria-label="첫 줄"><option value="none">보통</option><option value="indent">들여쓰기</option><option value="hang">내어쓰기</option></select>${numCtl('indent', '0 pt')}</div>`)),
  table: () => sec('표 크기', '',
    row('너비', sel('tfit', '단 너비에 맞춤', '표를 단 폭에 맞추기(칸 비율 그대로)')) +
    row('줄·칸', `<div class="ei-pair">${numCtl('rows', '— 줄', '줄 넣기·지우기(커서 줄 아래)')}${numCtl('cols', '— 칸', '칸 넣기·지우기(커서 칸 오른쪽)')}</div>`) +
    row('칸 너비', btns(2, [['equalw', '똑같이 나누기', '고른 칸 너비를 같게 (W)'], ['contentw', '내용에 맞춤', '칸 너비를 글에 맞추기']])))
    + sec('칸', '',
    row('합치기', btns(2, [['merge', '칸 합치기', '셀 합치기 (M)'], ['split', '칸 나누기', '셀 나누기 (S)']])) +
    row('세로 정렬', btns(3, [['vtop', '위'], ['vmid', '가운데'], ['vbot', '아래']])) +
    row('칸 여백', numCtl('pad', '0.5 mm', '커서 칸(고른 칸)의 안 여백 네 방향')) +
    row('배경', sel('fill', '<span class="ei-chip" data-ei-chip="fill"></span> <span data-ei-val="filltext">없음</span>', '셀 테두리·배경 창')))
    + sec('테두리', '',
    row('선', `<div class="ei-pair">${sel('bline', '실선', '셀 테두리·배경 창')}${sel('bwidth', '0.12 mm', '셀 테두리·배경 창')}</div>`) +
    row('적용', btns(4, [['ball', '전체', '모든 칸에 실선'], ['bout', '바깥', '표 바깥 선만'], ['bin', '안쪽', '안쪽 선만'], ['bnone', '없음', '모든 선 지우기']])))
    + sec('배치', '', sw('tchar', '글자처럼 취급', '표를 글자처럼 취급(시험지 겹침 방지)') + '<p class="ei-hint">시험지에서는 켜진 채로 잠김 (겹침 방지)</p>'),
  pic: () => sec('크기', '',
    row('너비', numCtl('pw', '— mm')) + row('높이', numCtl('ph', '— mm')) +
    sw('pratio', '비율 유지', '너비·높이를 함께 바꾸기').replace('aria-pressed="false"', 'aria-pressed="true"') +
    `<div class="ei-row" style="margin-top:6px"><label>맞춤</label>${btns(2, [['pcol', '단 너비', '그림을 단(칸) 너비에 맞춤'], ['porig', '원래 크기', '그림 원래 크기로']])}</div>`)
    + sec('위치', '', sw('pchar', '글자처럼 취급', '그림을 글자처럼 취급(시험지 겹침 방지)') + '<p class="ei-hint">시험지에서는 켜진 채로 잠김 (겹침 방지)</p>' +
    `<div class="ei-row" style="margin-top:8px"><label>정렬</label>${btns(3, [['pleft', '왼쪽'], ['pcenter', '가운데'], ['pright', '오른쪽']])}</div>` +
    row('바깥 여백', numCtl('pmargin', '1.0 mm', '그림 위·아래 바깥 여백')))
    + sec('모양', '',
    row('테두리', `<div class="ei-pair">${sel('pborder', '없음', '개체 속성 창(테두리)')}${sel('pbwidth', '0.12 mm', '개체 속성 창(테두리)')}</div>`) +
    row('자르기', btns(2, [['pcrop', '자르기', '그림 원본 편집(5E_image)에서 자르기'], ['puncrop', '원래대로', '그림 원본 편집에서 자르기 되돌리기']])) +
    row('캡션', btns(3, [['capnone', '없음'], ['capbottom', '아래'], ['captop', '위', '개체 속성 창(캡션 위치)']]))),
  page: () => sec('용지', 'F7',
    row('종류', `<select class="ei-ctl" data-ei-paper aria-label="용지">${Object.entries(PAPERS).map(([n, [w, h]]) => `<option value="${n}">${n} (${w} × ${h})</option>`).join('')}</select>`) +
    row('방향', btns(2, [['portrait', '세로'], ['landscape', '가로']])))
    + sec('여백', '',
    row('위·아래', `<div class="ei-pair">${numCtl('mtop', '—')}${numCtl('mbottom', '—')}</div>`) +
    row('왼쪽·오른쪽', `<div class="ei-pair">${numCtl('mleft', '—')}${numCtl('mright', '—')}</div>`) +
    row('머리·꼬리', `<div class="ei-pair">${numCtl('mheader', '—')}${numCtl('mfooter', '—')}</div>`))
    + sec('단', '',
    row('단 수', btns(3, [['col1', '1단'], ['col2', '2단'], ['col3', '3단']])) +
    row('단 간격', numCtl('colgap', '— mm')) +
    sw('colline', '구분선', '단 설정 창(구분선)'))
    + sec('머리말 · 꼬리말 · 쪽 번호', '', btns(3, [['header', '머리말'], ['footer', '꼬리말'], ['pagenum', '쪽 번호']]) + '<p class="ei-hint">학교 양식을 쓰는 시험지에서는 쪽 설정이 잠김</p>'),
};
const NAMES = { text: ['글자', '문단 안에 커서가 있음'], table: ['표', '표 칸 안에 커서'], pic: ['그림', '그림을 골랐음'], page: ['쪽', '쪽 전체 설정'] };

export function inspectorMarkup() {
  return `<div class="ei-top"><div class="ei-what"><b data-ei-title>글자</b><span data-ei-sub>문단 안에 커서가 있음</span></div>
    <div class="ei-seg" role="tablist">${[['text', '글자·문단'], ['table', '표'], ['pic', '그림'], ['page', '쪽']].map(([k, l]) => `<button type="button" role="tab" data-ei-pane="${k}" aria-pressed="false">${l}</button>`).join('')}</div></div>
    <div class="ei-body">${Object.entries(PANES).map(([k, f]) => `<div class="ei-pane" data-ei-panel="${k}" hidden>${f()}<div class="ei-sec"><button type="button" class="el-more" data-ei-more title="이 칸의 나머지 기능(모양 복사·형광펜 지우기·표 넣기·머리 줄 음영·그림 나란히 등)">⋯ 더 보기</button></div></div>`).join('')}</div>
    <div class="ei-foot"><button type="button" class="ei-ghost" data-exam-fx="symbols" title="특수기호 창: 기출 3년 빈도로 고른 첫 줄 16칸 + 묶음 탭">${icon('omega')} 문자표</button><button type="button" class="ei-ghost exam-marks-toggle" data-exam-marks aria-pressed="false" title="조판 부호 — 고정 띄어쓰기 빨간 V · 내어쓰기·여백 초록 선 (화면에만)">조판 부호 보기</button></div>`;
}

// 왼쪽 5E 기능 칸
export function leftToolsMarkup() {
  const tiles = list => `<div class="ei-tiles">${list.map(([key, label, title, ic]) => `<button type="button" class="ei-cb" data-el-act="${key}" title="${esc(title)}">${icon(ic)}<span>${label}</span></button>`).join('')}</div>`;
  return `<div class="ei-top el-top"><button type="button" class="el-new" data-el-act="new">${icon('plus')}새 시험지</button><button type="button" class="el-tour" data-el-act="tour" aria-expanded="false">▶ 만드는 순서 보기</button>
      <div class="ei-seg el-seg" role="tablist">${MODES.map(([k, l]) => `<button type="button" role="tab" data-exam-ltab="${k}" aria-pressed="false">${l}</button>`).join('')}</div>
      <p class="el-note" data-el-note></p></div>
    <div class="ei-body el-body">
      <div class="el-guide-slot"></div>
      ${sec('내용 넣기', '밖에서 가져오기', tiles([['md', '마크다운', '고른 마크다운을 한글 문서로 (팔레트)', 'md'], ['excel', '문항 엑셀', '엑셀 표에 채워 문항 만들기 (팔레트)', 'grid'], ['form', '양식 채우기', '양식 빈칸을 채워 새 문서로 (팔레트)', 'form'], ['photo', '사진', '그림 파일을 커서 자리에 (팔레트 사진)', 'photo']]) + '<button type="button" class="el-more" data-el-act="palette">조판 팔레트로 가기 ↓</button>')}
      ${sec('자동 다듬기', '고른 곳에 적용', tiles([['fit', '자간 맞춤', '줄 끝에서 단어가 잘리지 않게 — 넘친 한두 글자를 자간으로 줄 안에 (팔레트 자간 맞춤)', 'fit'], ['oneline', '한 줄에 맞추기', '고른 문단을 한 줄에 들어가게 자간으로 (팔레트 한 줄 맞춤)', 'oneline'], ['chem', '화학식 첨자', 'H2O → H₂O 숫자를 아래 첨자로(문서 전체)', 'sub'], ['renum', '문항 번호', '문항 번호를 1부터 순서대로 다시 매기기', 'num']]))}
      <div class="ei-sec el-figs-slot"></div>
      <div class="ei-sec el-mode"><h4 data-el-modetitle>문항 쓰기<em>지금 모드</em></h4><div class="ei-tiles" data-el-modetools></div><button type="button" class="el-more" data-el-more title="이 모드의 나머지 기능(문항을 그림으로·고른 문항만 새 파일로·㉠㉡ 빈칸 학생용 등)">⋯ 더 보기</button></div>
      <div class="ei-sec el-outline-slot"></div>
      <div class="ei-sec el-palette-slot"></div>
    </div>
    <div class="ei-foot"><button type="button" class="ei-ghost" data-exam-fx="check" title="조판 점검: 넓은 그림·표, 흐린 그림, 빈칸, 번호 빠짐을 찾아 목록으로">${icon('check')} 점검</button><button type="button" class="ei-ghost" data-exam-fx="capture" title="고른 부분을 양식(조각)으로 저장 → 팔레트 「템플릿」에 담김">${icon('save')} 양식 저장</button></div>`;
}

// 오른쪽 인스펙터 동작: 값 읽기(sync)·누르기. ctx = rhwp-exam-modes의 ctx(command·withBridge·message·openPicker·paraSpacing·highlight 등).
export function installInspector(root, { ctx, getBridge, run, studio, onPane }) {
  let pane = 'text', auto = true, lastKind = '';
  const $ = s => root.querySelector(s), $$ = s => root.querySelectorAll(s);
  const setText = (key, v) => { const el = root.querySelector(`[data-ei-val="${key}"]`); if (el && el.textContent !== v) el.textContent = v; };
  const press = (key, on) => root.querySelector(`[data-ei-act="${key}"]`)?.classList.toggle('on', !!on);
  const swOn = (key, on) => root.querySelector(`[data-ei-act="${key}"]`)?.setAttribute('aria-pressed', String(!!on));
  function show(next, sub) {
    pane = next;
    $$('[data-ei-pane]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.eiPane === pane)));
    $$('[data-ei-panel]').forEach(p => { p.hidden = p.dataset.eiPanel !== pane; });
    $('[data-ei-title]').textContent = NAMES[pane][0];
    $('[data-ei-sub]').textContent = sub || NAMES[pane][1];
    onPane?.(pane); sync(true);
  }
  // 커서·고른 것에 따라: 그림을 고르면 그림, 표 칸 안이면 표, 아니면 글자(쪽은 손으로 고를 때만 머문다).
  function follow() {
    const b = getBridge(); if (!b?.input) return;
    let kind = 'text';
    try { if (b.input.cursor?.getSelectedPictureRef?.()) kind = 'pic'; else if (b.input.cursor?.isInCell?.()) kind = 'table'; } catch {}
    if (kind === lastKind) return; lastKind = kind;
    if (!auto && pane === 'page' && kind === 'text') return;
    auto = true; show(kind);
  }
  const tableAt = b => { const p = b.input.getCursorPosition(); if (!b.input.cursor.isInCell?.()) throw new Error('표 칸 안을 먼저 누르세요.'); if ((p.cellPath?.length || 1) > 1) throw new Error('표 안의 표는 여기서 바꿀 수 없습니다.'); return { sec: p.sectionIndex, para: p.parentParaIndex, ctrl: p.controlIndex, cell: p.cellIndex ?? p.cellPath?.[0]?.cellIndex ?? 0 }; };
  const pictureRef = b => { const ref = b.input.cursor?.getSelectedPictureRef?.(); if (!ref) throw new Error('그림을 먼저 누르세요.'); return ref; };
  const doc = b => b.wasm.borrowDocumentHandle();
  // 값 읽기
  function sync(fillFonts = false) {
    const b = getBridge(); if (!b?.input || root.closest('[hidden]')) return;
    try {
      if (pane === 'text') {
        const c = b.input.getCharProperties() || {}, p = b.input.getParaProperties() || {};
        const font = $('[data-ei-font]'), sFont = studio()?.getElementById('font-name');
        if (font && sFont && (fillFonts || font.options.length !== sFont.options.length)) font.innerHTML = [...sFont.options].map(o => `<option value="${esc(o.value)}">${esc(o.textContent)}</option>`).join('');
        if (font && document.activeElement !== font && c.fontFamily) font.value = c.fontFamily;
        setText('size', `${(c.fontSize / 100 || 10).toFixed(1)} pt`);
        press('bold', c.bold); press('italic', c.italic); press('underline', c.underline); press('strike', c.strikethrough); press('sup', c.superscript); press('sub', c.subscript);
        setText('spacing', `${c.spacings?.[0] ?? 0} %`); setText('ratio', `${c.ratios?.[0] ?? 100} %`);
        const chip = (k, color) => { const el = root.querySelector(`[data-ei-chip="${k}"]`); if (el) el.style.background = color; };
        chip('color', c.textColor || '#000'); chip('shade', c.shadeColor && c.shadeColor !== '#ffffff' ? c.shadeColor : '#ffffff'); press('shade', c.shadeColor && c.shadeColor.toLowerCase() !== '#ffffff');
        for (const a of ['justify', 'left', 'center', 'right']) press(a, String(p.alignment).toLowerCase() === a);
        setText('line', `${p.lineSpacing ?? 160} %`);
        // 엔진은 문단 위·아래 간격을 쓴 값(1pt=200)의 1/75, 여백·첫 줄은 1/150로 돌려준다(10-21 실측).
        setText('before', `${round1((p.spacingBefore || 0) * 75 / 200)} pt`); setText('after', `${round1((p.spacingAfter || 0) * 75 / 200)} pt`);
        setText('left', `${round1((p.marginLeft || 0) * 150 / 200 * 25.4 / 72)} mm`);
        const ind = (p.indent || 0) * 150 / 200, first = $('[data-ei-first]');
        if (first && document.activeElement !== first) first.value = ind > 0.05 ? 'indent' : ind < -0.05 ? 'hang' : 'none';
        setText('indent', `${round1(Math.abs(ind))} pt`);
      } else if (pane === 'table' && b.input.cursor.isInCell?.()) {
        const t = tableAt(b), d = doc(b), tp = parse(d.getTableProperties(t.sec, t.para, t.ctrl)), dim = parse(d.getTableDimensions(t.sec, t.para, t.ctrl)), cp = parse(d.getCellProperties(t.sec, t.para, t.ctrl, t.cell));
        const pg = parse(d.getPageDef(t.sec)), cd = parse(d.getColumnDef(t.sec)), colW = (pg.width - pg.marginLeft - pg.marginRight - (cd.columnCount > 1 ? cd.spacing * (cd.columnCount - 1) : 0)) / Math.max(1, cd.columnCount);
        setText('tfit', Math.abs(tp.tableWidth - colW) < 60 ? '단 너비에 맞춤' : `${mm(tp.tableWidth)} mm · 단 너비로`);
        setText('rows', `${dim.rowCount} 줄`); setText('cols', `${dim.colCount} 칸`);
        press('vtop', cp.verticalAlign === 0); press('vmid', cp.verticalAlign === 1); press('vbot', cp.verticalAlign === 2);
        setText('pad', `${mm(cp.paddingLeft)} mm`);
        const fill = cp.fillType && cp.fillType !== 'none' ? cp.fillColor : null;
        const chip = root.querySelector('[data-ei-chip="fill"]'); if (chip) chip.style.background = fill || '#fff';
        setText('filltext', fill ? fill : '없음');
        const bl = cp.borderTop || {}; setText('bline', bl.type ? (bl.type === 1 ? '실선' : '점선 등') : '없음');
        swOn('tchar', tp.treatAsChar);
      } else if (pane === 'pic') {
        const ref = b.input.cursor?.getSelectedPictureRef?.(); if (!ref) return;
        const p = parse(b.properties(ref)) || {}, lay = b.pictureLayout(ref);
        setText('pw', `${mm(p.width || 0)} mm`); setText('ph', `${mm(p.height || 0)} mm`);
        swOn('pchar', lay.treatAsChar);
        for (const [k, a] of [['pleft', 'Left'], ['pcenter', 'Center'], ['pright', 'Right']]) press(k, lay.alignment === a);
        setText('pmargin', `${round1(lay.top)} mm`);
        press('capnone', !p.hasCaption); press('capbottom', !!p.hasCaption);
      } else if (pane === 'page') {
        const d = doc(b), at = b.input.getCursorPosition(), s = at.sectionIndex ?? 0, pg = parse(d.getPageDef(s)), cd = parse(d.getColumnDef(s));
        const paper = Object.entries(PAPERS).find(([, [w, h]]) => Math.abs(mm(pg.landscape ? pg.height : pg.width) - w) < 1 && Math.abs(mm(pg.landscape ? pg.width : pg.height) - h) < 1)?.[0];
        const ps = $('[data-ei-paper]'); if (ps && document.activeElement !== ps) { if (paper) ps.value = paper; }
        press('portrait', !pg.landscape); press('landscape', !!pg.landscape);
        for (const [k, f] of [['mtop', 'marginTop'], ['mbottom', 'marginBottom'], ['mleft', 'marginLeft'], ['mright', 'marginRight'], ['mheader', 'marginHeader'], ['mfooter', 'marginFooter']]) setText(k, String(mm(pg[f])));
        for (const n of [1, 2, 3]) press('col' + n, cd.columnCount === n);
        setText('colgap', `${mm(cd.spacing || 0)} mm`);
      }
    } catch { /* 커서가 옮겨지는 중이면 다음 번에 */ }
  }
  // 엔진 쓰기 도우미(되돌리기 한 번)
  const tx = (b, label, fn) => b.transaction(label, () => { fn(); return true; });
  function setCells(b, t, props, all = false) {
    const d = doc(b), n = parse(d.getTableDimensions(t.sec, t.para, t.ctrl)).cellCount;
    tx(b, 'inspector-cell', () => { for (let i = 0; i < n; i++) if (all || i === t.cell) d.setCellProperties(t.sec, t.para, t.ctrl, i, JSON.stringify(typeof props === 'function' ? props(i) : props)); });
  }
  function borders(b, mode) {
    const t = tableAt(b), d = doc(b), dim = parse(d.getTableDimensions(t.sec, t.para, t.ctrl));
    // 칸 자리(줄·칸): 쪽 개체 배치에서 이 표의 칸 목록을 찾는다.
    let cells = [];
    for (let pg = 0; pg < d.pageCount() && !cells.length; pg++) for (const c of parse(d.getPageControlLayout(pg)).controls || []) if (c.type === 'table' && c.paraIdx === t.para && c.controlIdx === t.ctrl && !(c.cellPath || []).length) cells = c.cells || [];
    if (!cells.length) throw new Error('표 칸 자리를 찾지 못했습니다.');
    const line = { type: 1, width: 1, color: '#000000' }, none = { type: 0, width: 0, color: '#000000' };
    const pick = (c, side) => { const edge = { Left: c.col === 0, Right: c.col + c.colSpan >= dim.colCount, Top: c.row === 0, Bottom: c.row + c.rowSpan >= dim.rowCount }[side];
      return mode === 'ball' ? line : mode === 'bnone' ? none : mode === 'bout' ? (edge ? line : none) : (edge ? none : line); };
    tx(b, 'inspector-borders', () => { for (const c of cells) d.setCellProperties(t.sec, t.para, t.ctrl, c.cellIdx, JSON.stringify(Object.fromEntries(['Left', 'Right', 'Top', 'Bottom'].map(s => ['border' + s, pick(c, s)])))); });
  }
  function pageDef(b, change) { const d = doc(b); tx(b, 'inspector-page', () => { for (let s = 0; s < d.getSectionCount(); s++) { const pg = parse(d.getPageDef(s)); d.setPageDef(s, JSON.stringify(change(pg))); } }); }
  function picture(b, change) { const ref = pictureRef(b), lay = b.pictureLayout(ref); b.applyPictureLayout(ref, change(lay)); }
  function pictureSize(b, key, dir) {
    const ref = pictureRef(b), p = parse(b.properties(ref)), keep = root.querySelector('[data-ei-act="pratio"]')?.getAttribute('aria-pressed') === 'true';
    const ratio = p.height / p.width, min = HU * 5; let w = p.width, h = p.height;
    if (key === 'pw') { w = Math.max(min, w + dir * HU); if (keep) h = w * ratio; } else { h = Math.max(min, h + dir * HU); if (keep) w = h / ratio; }
    b.transaction('inspector-picture-size', () => { b.setProperties(ref, { width: Math.round(w), height: Math.round(h) }); return true; });
  }
  const STEP = {
    size: (b, d) => ctx.command(d > 0 ? 'format:font-size-increase' : 'format:font-size-decrease'),
    spacing: (b, d) => ctx.command(d > 0 ? 'format:char-spacing-increase' : 'format:char-spacing-decrease'),
    ratio: (b, d) => ctx.command(d > 0 ? 'format:char-ratio-increase' : 'format:char-ratio-decrease'),
    line: (b, d) => { const now = b.input.getParaProperties()?.lineSpacing || 160, list = LINE_SPACINGS, next = d > 0 ? list.find(v => v > now) ?? now + 10 : [...list].reverse().find(v => v < now) ?? Math.max(80, now - 10); b.input.dispatcher.dispatch('format:line-spacing', { value: next }); },
    before: (b, d) => ctx.paraSpacing('spacingBefore', d), after: (b, d) => ctx.paraSpacing('spacingAfter', d),
    left: (b, d) => ctx.command(d > 0 ? 'para:left-increase' : 'para:left-decrease'),
    indent: (b, d) => { const p = b.input.getParaProperties() || {}, now = Math.round((p.indent || 0) * 150), sign = now < 0 || $('[data-ei-first]')?.value === 'hang' ? -1 : 1; b.input.applyParaFormat({ indent: now + sign * d * 200 }); },
    rows: (b, d) => ctx.command(d > 0 ? 'table:insert-row-below' : 'table:delete-row'),
    cols: (b, d) => ctx.command(d > 0 ? 'table:insert-col-right' : 'table:delete-col'),
    pad: (b, d) => { const t = tableAt(b), cp = parse(doc(b).getCellProperties(t.sec, t.para, t.ctrl, t.cell)), v = Math.max(0, Math.round(cp.paddingLeft + d * HU * 0.1)); setCells(b, t, { paddingLeft: v, paddingRight: v, paddingTop: v, paddingBottom: v, applyInnerMargin: true }); },
    pw: (b, d) => pictureSize(b, 'pw', d), ph: (b, d) => pictureSize(b, 'ph', d),
    pmargin: (b, d) => picture(b, l => ({ ...l, top: Math.max(0, round1(l.top + d * 0.5)), bottom: Math.max(0, round1(l.bottom + d * 0.5)) })),
    mtop: (b, d) => pageDef(b, p => ({ ...p, marginTop: Math.max(0, p.marginTop + d * HU) })), mbottom: (b, d) => pageDef(b, p => ({ ...p, marginBottom: Math.max(0, p.marginBottom + d * HU) })),
    mleft: (b, d) => pageDef(b, p => ({ ...p, marginLeft: Math.max(0, p.marginLeft + d * HU) })), mright: (b, d) => pageDef(b, p => ({ ...p, marginRight: Math.max(0, p.marginRight + d * HU) })),
    mheader: (b, d) => pageDef(b, p => ({ ...p, marginHeader: Math.max(0, p.marginHeader + d * HU) })), mfooter: (b, d) => pageDef(b, p => ({ ...p, marginFooter: Math.max(0, p.marginFooter + d * HU) })),
    colgap: (b, d) => { const dd = doc(b); tx(b, 'inspector-colgap', () => { for (let s = 0; s < dd.getSectionCount(); s++) { const c = parse(dd.getColumnDef(s)); dd.setColumnDef(s, c.columnCount, c.columnType || 0, c.sameWidth !== false, Math.max(0, (c.spacing || 0) + d * HU)); } }); },
  };
  const ACT = {
    bold: () => ctx.command('format:bold'), italic: () => ctx.command('format:italic'), underline: () => ctx.command('format:underline'), strike: () => ctx.command('format:strikethrough'),
    sup: () => ctx.command('format:superscript'), sub: () => ctx.command('format:subscript'),
    color: () => ctx.command('format:char-shape'),
    shade: b => { const c = b.input.getCharProperties() || {}; ctx.highlight(c.shadeColor && c.shadeColor.toLowerCase() !== '#ffffff' ? '#ffffff' : '#fff176'); },
    justify: () => ctx.command('format:align-justify'), left: () => ctx.command('format:align-left'), center: () => ctx.command('format:align-center'), right: () => ctx.command('format:align-right'),
    tfit: b => { if (!fitTableToColumn(b)) ctx.message('이미 단 폭에 맞습니다.'); },
    equalw: () => ctx.command('equal-width'),
    contentw: () => { throw new Error('「내용에 맞춤」은 아직 한글 엔진에 없는 기능입니다. 칸 경계를 끌어 맞추세요.'); },
    merge: () => ctx.command('table:cell-merge'), split: () => ctx.command('table:cell-split'),
    vtop: b => setCells(b, tableAt(b), { verticalAlign: 0 }), vmid: b => setCells(b, tableAt(b), { verticalAlign: 1 }), vbot: b => setCells(b, tableAt(b), { verticalAlign: 2 }),
    fill: () => ctx.command('table:cell-props'), bline: () => ctx.command('table:cell-props'), bwidth: () => ctx.command('table:cell-props'),
    ball: b => borders(b, 'ball'), bout: b => borders(b, 'bout'), bin: b => borders(b, 'bin'), bnone: b => borders(b, 'bnone'),
    tchar: b => { const t = tableAt(b), d = doc(b), tp = parse(d.getTableProperties(t.sec, t.para, t.ctrl)); if (tp.treatAsChar) { ctx.message('시험지에서는 표를 글자처럼 취급한 채로 둡니다(겹침 방지).'); return; } tx(b, 'inspector-table-char', () => d.setTableProperties(t.sec, t.para, t.ctrl, JSON.stringify({ treatAsChar: true }))); },
    pratio: () => { const el = root.querySelector('[data-ei-act="pratio"]'); el.setAttribute('aria-pressed', String(el.getAttribute('aria-pressed') === 'false')); },
    pcol: b => { if (b.input.cursor?.getSelectedPictureRef?.()?.cellPath?.length) { if (!fitCellPicture(b)) ctx.message('이미 칸 너비에 맞습니다.'); return; } const ref = pictureRef(b), p = parse(b.properties(ref)), d = doc(b), pg = parse(d.getPageDef(ref.sec || 0)), cd = parse(d.getColumnDef(ref.sec || 0)), colW = (pg.width - pg.marginLeft - pg.marginRight - (cd.columnCount > 1 ? cd.spacing * (cd.columnCount - 1) : 0)) / Math.max(1, cd.columnCount); b.transaction('inspector-picture-fit', () => { b.setProperties(ref, { width: Math.round(colW), height: Math.round(colW * p.height / p.width) }); return true; }); },
    porig: b => { const ref = pictureRef(b), p = parse(b.properties(ref)); if (!(p.originalWidth > 0 && p.originalHeight > 0)) throw new Error('이 그림은 원래 크기 정보가 없습니다.'); b.transaction('inspector-picture-orig', () => { b.setProperties(ref, { width: p.originalWidth, height: p.originalHeight }); return true; }); },
    pchar: b => picture(b, l => { if (l.treatAsChar) { ctx.message('시험지에서는 그림을 글자처럼 취급한 채로 둡니다(겹침 방지).'); return l; } return { ...l, treatAsChar: true }; }),
    pleft: b => picture(b, l => ({ ...l, alignment: 'Left' })), pcenter: b => picture(b, l => ({ ...l, alignment: 'Center' })), pright: b => picture(b, l => ({ ...l, alignment: 'Right' })),
    pborder: () => ctx.command('format:object-properties'), pbwidth: () => ctx.command('format:object-properties'),
    pcrop: () => ctx.actions.edit(), puncrop: () => ctx.actions.edit(),
    capnone: () => ctx.command('insert:caption-none'), capbottom: () => ctx.command('insert:caption-bottom'), captop: () => ctx.command('format:object-properties'),
    portrait: b => pageDef(b, p => p.landscape ? { ...p, landscape: false, width: Math.min(p.width, p.height), height: Math.max(p.width, p.height) } : p),
    landscape: b => pageDef(b, p => p.landscape ? p : { ...p, landscape: true, width: Math.max(p.width, p.height), height: Math.min(p.width, p.height) }),
    col1: b => setColumns(b, 1), col2: b => setColumns(b, 2), col3: b => setColumns(b, 3),
    colline: () => ctx.command('page:col-settings'),
    header: () => ctx.command('page:header-create'), footer: () => ctx.command('page:footer-create'), pagenum: (b, button) => ctx.openPicker(button, 'pagenum'),
  };
  root.addEventListener('mousedown', e => { if (e.target.closest('button') && !e.target.closest('input,select')) e.preventDefault(); }); // 누를 때 문서 커서를 잃지 않게
  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-ei-pane]'); if (tab) { auto = tab.dataset.eiPane !== 'page'; show(tab.dataset.eiPane, tab.dataset.eiPane === 'page' ? '쪽 전체 설정(누른 곳과 상관없이)' : ''); return; }
    const step = e.target.closest('[data-ei-step]');
    if (step) { const [key, d] = step.dataset.eiStep.split(':'); void run(async () => { const b = getBridge(); await STEP[key](b, Number(d)); ctx.refocus(); setTimeout(() => sync(), 60); }); return; }
    const act = e.target.closest('[data-ei-act]');
    if (act && ACT[act.dataset.eiAct]) void run(async () => { const b = getBridge(); if (!b?.input) throw new Error('시험지 편집기를 준비하는 중입니다.'); await ACT[act.dataset.eiAct](b, act); ctx.refocus(); setTimeout(() => sync(), 60); });
  });
  root.addEventListener('change', e => {
    const el = e.target;
    void run(async () => {
      const b = getBridge(), sdoc = studio();
      if (el.matches('[data-ei-font]') && sdoc) { const s = sdoc.getElementById('font-name'); s.value = el.value; s.dispatchEvent(new sdoc.defaultView.Event('change', { bubbles: true })); }
      if (el.matches('[data-ei-first]')) {
        if (el.value === 'none') b.input.applyParaFormat({ indent: 0 });
        else if (el.value === 'indent') ctx.command('para:indent-in');
        else if (!applyHangingIndent(b)) b.input.applyParaFormat({ indent: -2000 });
      }
      if (el.matches('[data-ei-paper]')) ctx.message(`용지를 ${setPaper(b, el.value)}로 바꿨습니다.`);
      ctx.refocus(); setTimeout(() => sync(), 60);
    });
  });
  // 크기 칸: 값을 눌러 직접 쓰기(Enter)
  root.addEventListener('dblclick', e => {
    const v = e.target.closest('[data-ei-val="size"]'); if (!v) return;
    const now = parseFloat(v.textContent) || 10, next = window.prompt('글자 크기(pt)', String(now)); if (!next) return;
    void run(async () => { const sdoc = studio(), s = sdoc?.getElementById('font-size'); if (!s) return; s.value = next; s.dispatchEvent(new sdoc.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); ctx.refocus(); setTimeout(() => sync(), 60); });
  });
  show('text');
  return { sync, follow, show, get pane() { return pane; } };
}

// 왼쪽 5E 기능 칸 동작
export function installLeftTools(root, { ctx, run, focusTabs, palette, actions, onMode, guide, figures }) {
  let mode = 'item';
  const tiles = root.querySelector('[data-el-modetools]');
  function render() {
    const items = focusTabs(ctx)[mode].filter(it => it !== '|' && it.length > 1);
    tiles.innerHTML = items.map((it, i) => `<button type="button" class="ei-cb plain" data-el-i="${i}" title="${esc(it[1])}"><span>${it[0]}</span></button>`).join('');
    root.querySelectorAll('[data-exam-ltab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.examLtab === mode)));
    root.querySelector('[data-el-note]').textContent = MODES.find(m => m[0] === mode)[2];
    root.querySelector('[data-el-modetitle]').innerHTML = `${MODE_TOOLS[mode]}<em>지금 모드</em>`;
    onMode?.(mode);
  }
  if (guide) root.querySelector('.el-guide-slot').append(guide);
  if (figures) root.querySelector('.el-figs-slot').append(...figures);
  const ACT = {
    new: () => actions.newDocument(),
    tour: button => { const g = guide || root.querySelector('.exam-guide'); if (!g) return; g.open = !g.open; button.setAttribute('aria-expanded', String(g.open)); button.textContent = g.open ? '▼ 만드는 순서 접기' : '▶ 만드는 순서 보기'; },
    md: () => palette?.tool('convert'), excel: () => palette?.tool('exam_excel'), form: () => palette?.tool('form_fill'), photo: () => palette?.tool('photo'), palette: () => {},
    fit: () => palette?.tool('spacing_fit'), oneline: () => palette?.tool('spacing_fit'),
    chem: () => ctx.withBridge(b => { const n = applyScienceScripts(b); ctx.message(n ? `첨자 ${n}곳을 입혔습니다(되돌리기 ⌘Z).` : '첨자를 입힐 화학식·단위를 찾지 못했습니다.'); }),
    renum: () => ctx.withBridge(b => ctx.message(`문항 번호 ${renumberQuestions(b)}곳을 고쳤습니다.`)),
  };
  const PALETTE = new Set(['palette']);
  const showPalette = () => requestAnimationFrame(() => root.querySelector('.el-palette-slot')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-exam-ltab]'); if (t) { mode = t.dataset.examLtab; render(); return; }
    const a = e.target.closest('[data-el-act]'); if (a && ACT[a.dataset.elAct]) { if (a.dataset.elAct === 'tour') return ACT.tour(a); void run(async () => { await ACT[a.dataset.elAct](a); if (PALETTE.has(a.dataset.elAct)) showPalette(); }); return; }
    const i = e.target.closest('[data-el-i]'); if (!i) return;
    const item = focusTabs(ctx)[mode].filter(it => it !== '|' && it.length > 1)[Number(i.dataset.elI)];
    void run(async () => { await item[2](ctx, i); });
  });
  render();
  return { render, setMode: m => { mode = m; render(); }, get mode() { return mode; } };
}
