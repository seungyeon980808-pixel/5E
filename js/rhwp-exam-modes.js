// 5E_hwp 도구 모드 3개(10-21): 기본(한글 리본 그대로) · 집중(시험지·학습지에 필요한 것만 + 팔레트) · 없음(종이만).
// 시안 5e-design-mockups/hwp-modes.html. 집중 도구 줄의 단추는 단축키와 같은 명령(runDocumentAction)·팔레트·5E 조판 기능을 부른다.
import { runDocumentAction } from './rhwp-exam-shortcuts.js?v=1014-compact-panel';
import { applyTableAlignment, applyHangingIndent } from './rhwp-exam-table-controls.js?v=1014-compact-panel';
import { fitCellPicture, centerPicturesInCells, picturesToGrid, fitTableToColumn, renumberQuestions, relayoutChoices, checkLayout, questionBlocks, moveQuestion, splitQuestions, duplicateQuestion, deleteQuestion, fitWideObjects, keepQuestionsWhole, allQuestionBlocks, fillColumns, CHOICE_COMBOS, insertChoiceCombo, questionRegion } from './rhwp-exam-layout-tools.js';
import { showConfirm } from './ui-dialogs.js?v=1.7.0-four-session-integration';
// ExamPool 조판 엔진은 무거워서(exam-build·native-hwpx) 「ExamPool 시험지 열기」를 누를 때만 불러온다.
const examPoolOpen = () => import('./rhwp-exam-exampool-open.js');
import { applyScienceScripts, fixUnitGaps } from './rhwp-exam-science-text.js';
import { markBlank, studentCopy, appendBlankAnswers, insertExamHeader, insertAnswerGrid, setQuestionSpacing, extraChecks, BOX_PRESETS, insertBox, insertAnswerLines, insertRubric, setColumns, setPaper, makeVariant, appendVariantMapping, answerKeyCopy, STEMS, shadeHeaderRow, insertWorksheetFrame, PAGE_NUMBER_STYLES, insertPageNumbers, SCORE_CHOICES, setQuestionScore, insertQrCode, unifyQuestionFonts, boldToBlanks, WORKSHEET_FRAMES, blueprintCopy, setQuestionAnswer, questionAnswers, explanationCopy, addExplanationLine, fitEquationSizes, underlineNegativeWords, examSummary, insertRunningHeader, balanceAnswers, setQuestionMeta, cursorQuestion, questionMeta, pickQuestionsCopy, TABLE_PRESETS, insertTablePreset, setAllAnswers } from './rhwp-exam-worksheet.js';
import { SYMBOL_ROW, SYMBOL_TABS, SYMBOL_CHUNKS, symbolCells, recentSymbols, rememberSymbol } from './rhwp-exam-symbols.js';

const MODE_KEY = '5e.hwp.toolMode';
const MODES = [['basic', '기본', '한글 리본 그대로(모든 기능)'], ['focus', '집중', '시험지·학습지에 필요한 것만 + 팔레트'], ['none', '없음', '도구 없이 종이만']];
const LINE_SPACINGS = [100, 130, 150, 160, 180, 200, 250];
const HIGHLIGHT = '#fff176';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 단추: [표시(HTML), 설명, 실행] 또는 '|'(나눔줄). 실행은 (ctx, button) => 결과.
function focusTabs(ctx) {
  const cmd = action => () => ctx.command(action);
  const tool = (key, arg) => () => ctx.palette?.tool(key, arg);
  const doc = fn => () => ctx.withBridge(fn);
  return {
    text: [
      ['font'], ['size'], '|',
      ['<b>가</b>', '굵게 (⌘B)', cmd('format:bold')], ['<i>가</i>', '기울임 (⌘I)', cmd('format:italic')], ['<u>가</u>', '밑줄 (⌘U)', cmd('format:underline')],
      ['x<sup>2</sup>', '위 첨자 (Alt+Shift+P)', cmd('format:superscript')], ['x<sub>2</sub>', '아래 첨자 (Alt+Shift+S)', cmd('format:subscript')],
      ['H₂O 첨자', '문서 전체 화학식·이온·단위에 첨자 자동(H2O→H₂O, Fe3+→Fe³⁺, m/s2→m/s², S1→S₁) — 글자는 그대로', doc(b => { const n = applyScienceScripts(b); ctx.message(n ? `첨자 ${n}곳을 입혔습니다(되돌리기 ⌘Z).` : '첨자를 입힐 화학식·단위를 찾지 못했습니다.'); })], '|',
      ['자간<span class="t">−</span>', '자간 줄이기 (Alt+Shift+N)', cmd('format:char-spacing-decrease')], ['자간<span class="t">+</span>', '자간 늘리기 (Alt+Shift+W)', cmd('format:char-spacing-increase')],
      ['⇥| 한 줄', '한 줄 맞춤: 줄 끝에 넘친 한두 글자를 자간으로 줄 안에 넣기 (팔레트 자간 맞춤)', tool('spacing_fit')], '|',
      ['형광펜', '고른 글자에 형광펜', () => ctx.highlight(HIGHLIGHT)], ['형광펜<span class="t">×</span>', '형광펜 지우기', () => ctx.highlight('#ffffff')],
      ['모양 복사', '모양 복사·적용 (Alt+C)', cmd('edit:format-copy')],
    ],
    para: [
      ['왼쪽', '왼쪽 정렬', cmd('format:align-left')], ['가운데', '가운데 정렬', cmd('format:align-center')], ['양쪽', '양쪽 정렬', cmd('format:align-justify')],
      ['spacing'],
      ['문단↑<span class="t">+</span>', '문단 위 간격 2pt 늘리기', () => ctx.paraSpacing('spacingBefore', 2)], ['문단↑<span class="t">−</span>', '문단 위 간격 2pt 줄이기', () => ctx.paraSpacing('spacingBefore', -2)],
      ['문단↓<span class="t">+</span>', '문단 아래 간격 2pt 늘리기', () => ctx.paraSpacing('spacingAfter', 2)], ['문단↓<span class="t">−</span>', '문단 아래 간격 2pt 줄이기', () => ctx.paraSpacing('spacingAfter', -2)],
      ['내어쓰기', '빠른 내어쓰기: 커서 앞 글자 폭만큼 둘째 줄부터 들여 맞춤 (Shift+Tab)', doc(b => { if (!applyHangingIndent(b)) throw new Error('본문이나 칸 안 글자 사이에 커서를 두고 누르세요.'); })],
      ['들여쓰기', '첫 줄 들여쓰기 한 글자 (Ctrl+F6)', cmd('para:indent-in')], ['¶', '조판 부호 보기 켜기·끄기', cmd('view:ctrl-mark')],
    ],
    table: [
      ['표 넣기', '표 넣기 (Ctrl+N, T)', cmd('table:create')], '|',
      ['+행', '아래에 줄 넣기 (표 안 Ctrl+Enter)', cmd('table:insert-row-below')], ['−행', '줄 지우기 (표 안 Ctrl+Backspace)', cmd('table:delete-row')],
      ['+칸', '오른쪽에 칸 넣기', cmd('table:insert-col-right')], ['−칸', '칸 지우기', cmd('table:delete-col')], '|',
      ['합치기', '셀 합치기 (셀 고르고 M)', cmd('table:cell-merge')], ['나누기', '셀 나누기 (셀 고르고 S)', cmd('table:cell-split')],
      ['높이 같게', '고른 셀 높이 같게 (H)', cmd('equal-height')], ['너비 같게', '고른 셀 너비 같게 (W)', cmd('equal-width')], '|',
      ['머리 줄 음영', '커서가 있는 표의 첫 줄에 음영·굵게', doc(b => ctx.message(`머리 줄 ${shadeHeaderRow(b)}칸에 음영을 넣었습니다.`))],
      ['표 가운데', '표를 가운데로', doc(b => applyTableAlignment(b, 'center'))],
      ['단 폭 맞춤', '표를 단 폭에 맞추기(칸 비율 그대로)', doc(b => { if (!fitTableToColumn(b)) ctx.message('이미 단 폭에 맞습니다.'); })],
      ['셀 칠', '셀 테두리·배경', cmd('table:cell-props')],
      ['엑셀 표', '엑셀에서 복사한 표를 마크다운 창에 붙여 넣으면 한글 표로 바뀝니다 (팔레트)', tool('convert')],
    ],
    pic: [
      ['그림 화면에서 넣기', '그림 화면(5E_image)에서 영역을 골라 지금 커서 자리에 넣기 — 예전 아래 막대 「한글에 넣기」', () => ctx.actions.insertFromImage()],
      ['그림 파일', '그림 파일 넣기 (Ctrl+N, I)', cmd('insert:image')], ['그림 설정', '그림 크기·글과 어울림·여백', (_, button) => ctx.openPictureSettings(button)], '|',
      ['칸 너비 맞춤', '표 칸 안 그림을 칸 너비에 맞춤(여백 3mm 남김)', doc(b => { if (!fitCellPicture(b)) ctx.message('이미 칸 너비에 맞습니다.'); })],
      ['칸 안 가운데', '표 칸 안에서 그림만 있는 문단을 모두 가운데로', doc(b => ctx.message(`그림 ${centerPicturesInCells(b)}개를 칸 가운데로 놓았습니다.`))],
      ['2×N 나란히', '커서 문단의 그림 여러 개를 2×N 표로(윗줄 그림·아랫줄 캡션 (가)(나))', doc(b => ctx.message(`그림 ${picturesToGrid(b)}개를 나란히 놓았습니다. 캡션을 고쳐 쓰세요.`))], '|',
      ['흑백·300dpi', '그림 스타일 8종: 흑백·여백 정리·300dpi (팔레트 사진)', tool('manager', '사진')],
      ['원본 편집', '그림 원본 편집 → 5E_image에서 고치고 돌아옴', () => ctx.actions.edit()],
      ['글 앞·뒤', '그림을 글 앞·뒤로 띄우기(개체 속성 창의 배치)', cmd('format:object-properties')],
    ],
    item: [
      ['문항 틀', '문항 틀 넣기 — 수능·학교 양식 (팔레트)', tool('manager', '템플릿')],
      ['발문', '자주 쓰는 발문 넣기(평가원 과학탐구 꼴)', (_, button) => ctx.openPicker(button, 'stem')],
      ['〈보기〉', '〈보기〉 상자 넣기(마크다운 창에 틀을 채워 둠)', tool('markdown', '보기:\nㄱ: \nㄴ: \nㄷ: ')],
      ['내어쓰기', '〈보기〉 「ㄱ. 」 뒤에 커서를 두고 누르면 둘째 줄을 글자에 맞춰 내어 씀', doc(b => { if (!applyHangingIndent(b)) throw new Error('「ㄱ. 」 바로 뒤에 커서를 두고 누르세요.'); })], '|',
      ['ㄱㄴㄷ 선지', '〈보기〉 ㄱㄴㄷ·학생 A B C 조합 선지 다섯 개를 커서 줄 뒤에 5열로 넣기', (_, button) => ctx.openPicker(button, 'combo')], ['선지 자동', '선지 길이를 보고 5열·3열·1열 중 한 줄에 들어가는 배열로', doc(b => ctx.message(`선지를 ${relayoutChoices(b, 'auto')}열로 놓았습니다.`))], ['선지 1열', '선지를 한 줄에 하나씩', doc(b => relayoutChoices(b, 1))], ['3열', '선지 3열(①②③ / ④⑤)', doc(b => relayoutChoices(b, 3))], ['5열', '선지 5열(한 줄)', doc(b => relayoutChoices(b, 5))], '|',
      ['번호 다시', '문항 번호 1부터 다시 매기기', doc(b => ctx.message(`문항 번호 ${renumberQuestions(b)}곳을 고쳤습니다.`))],
      ['정답', '커서가 있는 문항 끝에 「[정답] ③」 줄 넣기·바꾸기(학생용에서는 빠짐, 정답표·나형 정답·정답 분포 점검에 쓰임)', (_, button) => ctx.openPicker(button, 'answer')],
      ['해설', '커서 문항 끝에 「[해설] 」 줄을 만들고 커서를 그 끝에(학생용에서 빠지고 정답·해설지에 모임)', doc(b => { ctx.message(`${addExplanationLine(b)} 해설 줄에 쓰세요.`); ctx.refocus(); })],
      ['분류', '커서 문항의 내용 영역·성취기준·난이도(상·중·하) 줄 넣기·바꾸기 — 분류표가 채워 씀(학생용에서는 빠짐)', (_, button) => ctx.openPicker(button, 'meta')],
      ['배점', '커서가 있는 문항의 배점 넣기·바꾸기(발문 끝, [3점]·(3점) 중 문서가 쓰는 모양) — 합계를 바로 알려 줌', (_, button) => ctx.openPicker(button, 'score')],
      ['쪽 나누기', '쪽 나누기 (Ctrl+Enter)', cmd('page:break')],
      ['수식', '수식 넣기 (Ctrl+N, M)', cmd('insert:equation')],
    ],
    sheet: [
      ['빈칸 표시', '고른 낱말을 빈칸으로 표시(연한 파랑·밑줄) — 학생용에서 「(　　　)」로 바뀜', doc(b => markBlank(b, true))],
      ['표시 지우기', '고른 부분의 빈칸 표시 지우기', doc(b => markBlank(b, false))],
      ['굵은 글씨→빈칸', '문서의 굵은 낱말을 한 번에 빈칸 표시로(줄 전체가 굵은 제목·머리 칸은 그대로)', doc(b => ctx.message(`굵은 낱말 ${boldToBlanks(b)}개를 빈칸으로 표시했습니다. 「학생용 내려받기」로 빈칸 학습지를 만드세요.`))],
      ['학생용 내려받기', '빈칸을 「(　　　)」로 바꾸고 「[정답]·[해설]·정답:」 줄을 뺀 학생용 HWPX 사본 내려받기(지금 문서는 그대로)', doc(b => ctx.studentCopy(b))],
      ['정답지 내려받기', '빈칸 자리에 정답을 빨간 굵은 글씨로 채운 정답지 HWPX 사본 내려받기', doc(b => ctx.answerKey(b))],
      ['정답 모아 넣기', '빈칸 정답을 문서 끝에 「[빈칸 정답] 1. … 2. …」로 넣기', doc(b => ctx.message(`빈칸 정답 ${appendBlankAnswers(b)}개를 문서 끝에 넣었습니다.`))], '|',
      ['학습지 틀', '제목·이름 칸과 상자를 문서 끝에 한 번에 — 수업 학습지·실험 보고서·형성 평가', (_, button) => ctx.openPicker(button, 'frame')],
      ['상자', '개념 정리·탐구 활동·생각해 보기·주의·유의 사항 상자(제목 줄 음영)와 표 틀(KWL·비교·실험 결과·용어)을 커서 문단 뒤에 넣기', (_, button) => ctx.openPicker(button, 'box')],
      ['답란', '서술형 답을 쓰는 줄(3·5·8줄)을 커서 문단 뒤에 넣기', (_, button) => ctx.openPicker(button, 'lines')],
      ['QR 코드', '영상·자료 주소를 QR 코드로 커서 문단 뒤에 넣기(왼쪽 QR, 오른쪽 안내 글)', (_, button) => ctx.openPicker(button, 'qr')],
      ['평가 기준표', '평가 요소 | 상 | 중 | 하 표를 커서 문단 뒤에 넣기', doc(b => ctx.message(`평가 기준표(${insertRubric(b)}줄)를 넣었습니다.`))],
    ],
    layout: [
      ['시험지 머리', '문서 맨 앞에 제목 줄과 학년·반·번호·이름 칸 넣기', (_, button) => ctx.openHeaderForm(button)],
      ['정답·해설지', '문항마다 「번호. 정답」과 [해설] 줄을 모은 정답·해설지를 새 한글 파일로 내려받기', doc(b => ctx.explanations(b))],
      ['분류표', '이원목적분류표: 문항 번호·배점·정답을 채운 표를 새 한글 파일로 내려받기(성취기준·난이도 칸은 비워 둠)', doc(b => ctx.blueprint(b))],
      ['정답표 칸', '찾은 문항 번호로 「번호/정답」 표를 문서 끝에 넣기(정답은 비워 둠)', doc(b => ctx.message(`문항 ${insertAnswerGrid(b)}개의 정답표 칸을 넣었습니다.`))],
      ['문항 간격', '두 번째 문항부터 문항 위 간격을 한꺼번에 맞추기', (_, button) => ctx.openSpacingForm(button)],
      ['단 채우기', '단마다 남는 빈 공간을 그 단 문항 사이에 고르게 나누기(풀이 공간 맞추기, 다시 눌러도 같음)', doc(b => { const r = fillColumns(b); ctx.message(r.columns ? `단 ${r.columns}곳의 문항 사이 빈 공간을 고르게 나눴습니다.` : '나눌 빈 공간이 있는 단이 없습니다(단마다 문항이 둘 이상이어야 합니다).'); })], '|',
      ['1단', '모든 쪽을 1단으로', doc(b => ctx.message(`${setColumns(b, 1)}단으로 바꿨습니다.`))], ['2단', '모든 쪽을 2단으로(단 사이 8mm) — 시험지 기본', doc(b => ctx.message(`${setColumns(b, 2)}단으로 바꿨습니다.`))],
      ['용지', '용지 크기 A4·B4·A3 (여백·방향은 그대로)', (_, button) => ctx.openPicker(button, 'paper')],
      ['쪽 번호·머리말', '모든 쪽 아래 가운데에 쪽 번호(- 1 -, 1 / 4 …) — 다시 누르면 모양만 바뀜 · 쪽 위 머리말(시험 이름)도 여기서', (_, button) => ctx.openPicker(button, 'pagenum')],
      ['가·나형', '문항 순서를 섞은 나형 사본 내려받기(번호 다시 매김, 선지까지 섞기 고를 수 있음) + 교사용 문서 끝에 대응표·나형 정답', (_, button) => ctx.openPicker(button, 'variant')], '|',
      ['인쇄', '인쇄 창 열기', cmd('file:print')], ['PDF로 저장', 'PDF로 저장', cmd('file:print-to-pdf')],
    ],
  };
}

// 「⋯ 더 보기」: 자주 쓰지 않지만 한글 리본을 켜지 않고도 닿아야 하는 것(기능 목록의 ○ 항목).
const MORE = {
  sheet: [['학생용(㉠㉡ 빈칸)', '빈칸을 「( ㉠ )」처럼 이름 붙은 빈칸으로 바꾼 학생용 사본(정답 대응은 알림에)', 'x:student-labeled'], ['찾아 바꾸기', '찾아 바꾸기 (Ctrl+H)', 'edit:find-replace'], ['문자표 전체', '한글 문자표 창', 'insert:symbols'], ['글상자', '글상자 넣기', 'insert:textbox'], ['각주', '각주 넣기', 'insert:footnote']],
  text: [['장평 −', '장평 줄이기 (Alt+Shift+J)', 'format:char-ratio-decrease'], ['장평 +', '장평 늘리기 (Alt+Shift+K)', 'format:char-ratio-increase'], ['글자 모양 창', '글자 모양 전체 설정(글자색·테두리 등) (Alt+L)', 'format:char-shape'], ['문단 모양 창', '문단 모양 전체 설정 (Alt+T)', 'format:para-shape'],
    ['문단 번호', '문단 번호 켜기·끄기', 'format:toggle-numbering'], ['글머리표', '글머리표 켜기·끄기', 'format:toggle-bullet'],
    ['왼쪽 여백 +1pt', '왼쪽 여백 늘이기 (Ctrl+Alt+F6)', 'para:left-increase'], ['왼쪽 여백 −1pt', '왼쪽 여백 줄이기 (Ctrl+Alt+F5)', 'para:left-decrease'],
    ['오른쪽 여백 +1pt', '오른쪽 여백 늘이기', 'para:right-increase'], ['오른쪽 여백 −1pt', '오른쪽 여백 줄이기', 'para:right-decrease'],
    ['오른쪽 정렬', '오른쪽 정렬', 'format:align-right'], ['취소선', '취소선', 'format:strikethrough'],
    ['찾아 바꾸기', '찾아 바꾸기 (Ctrl+H)', 'edit:find-replace'], ['격자 보기', '격자 보기 켜기·끄기', 'view:toggle-grid'], ['문단 부호', '문단 부호 보기 켜기·끄기', 'view:para-mark']],
  table: [['위에 줄', '위에 줄 넣기', 'table:insert-row-above'], ['왼쪽에 칸', '왼쪽에 칸 넣기', 'table:insert-col-left'],
    ['표 지우기', '표 전체 지우기', 'table:delete'], ['표 나누기', '표를 커서 줄에서 나누기', 'table:split'],
    ['셀 범위 고르기', '셀 고르기 시작 (표 안 F5)', 'extend-cells'], ['표 빠져나오기', '표 밖으로 나가기 (Shift+Esc)', 'exit-table'],
    ['표 왼쪽으로', '표를 왼쪽으로', 'table-align-left'], ['표 오른쪽으로', '표를 오른쪽으로', 'table-align-right']],
  pic: [['캡션 넣기', '그림 아래 캡션 넣기', 'insert:caption-bottom'], ['캡션 없애기', '캡션 없애기', 'insert:caption-none'],
    ['그림 지우기', '고른 그림 지우기', 'insert:picture-delete'], ['좌우 뒤집기', '그림 좌우 뒤집기', 'insert:flip-horz'], ['오른쪽으로 90°', '그림 오른쪽으로 돌리기', 'insert:rotate-cw']],
  item: [['문항을 그림으로', '커서가 있는 문항을 고해상도 PNG로 내려받기(PPT·학습 앱에 붙이기, [정답]·[해설] 줄은 빼고)', 'x:question-image'], ['모든 문항 그림(zip)', '문항마다 PNG 한 장씩 zip으로 내려받기(복습 PPT·문제 은행용)', 'x:all-question-images'], ['고른 문항만 새 파일로', '「3, 5, 7-9」처럼 고른 번호의 문항만 남긴 사본(번호 다시) — 오답·보충 학습지', 'x:pick-questions'], ['마크다운 → 문항', '마크다운 → 한글 문항 (팔레트)', 'tool:convert'], ['엑셀 문항', '엑셀 문항 목록 → 한글 (팔레트)', 'tool:exam_excel'], ['단 나누기', '단 나누기 (Ctrl+Shift+Enter)', 'page:column-break'], ['머리말', '머리말 만들기·고치기', 'page:header-create'], ['꼬리말', '꼬리말 만들기·고치기', 'page:footer-create'], ['머리말·꼬리말 닫기', '머리말·꼬리말 편집 마치기', 'page:headerfooter-close'],
    ['쪽 번호 넣기', '지금 자리에 쪽 번호 넣기', 'page:insert-field-pagenum'], ['전체 쪽 수', '지금 자리에 전체 쪽 수 넣기', 'page:insert-field-totalpage'],
    ['각주', '각주 넣기', 'insert:footnote'], ['미주', '미주 넣기', 'insert:endnote'], ['글상자', '글상자 넣기', 'insert:textbox'],
    ['단 설정', '단 수·간격 설정', 'page:col-settings'], ['쪽 설정', '용지·여백 설정', 'page:setup'], ['문자표 전체', '한글 문자표 창', 'insert:symbols']],
  layout: [['쪽 테두리', '쪽 테두리·배경', 'page:page-border'], ['쪽 설정', '용지·여백 설정', 'page:setup'], ['단 설정', '단 수·간격 설정', 'page:col-settings'],
    ['머리말', '머리말 만들기·고치기', 'page:header-create'], ['꼬리말', '꼬리말 만들기·고치기', 'page:footer-create'], ['쪽 번호 넣기', '지금 자리에 쪽 번호 넣기', 'page:insert-field-pagenum']],
};

export function installExamModes(panel, services) {
  const { getBridge, message, run } = services;
  let mode = (() => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } })();
  if (!MODES.some(([m]) => m === mode)) mode = 'focus';
  let tab = 'text', syncTimer = 0;

  // ── 맨 위 줄: 모드 고르기 ──
  const modes = document.createElement('span');
  modes.className = 'exam-modes'; modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '도구 모드');
  modes.innerHTML = MODES.map(([m, label, tip], i) => `<button type="button" data-exam-mode="${m}" aria-pressed="false" title="${esc(tip)} (⌘⌥${i + 1})">${label}</button>`).join('');
  const actionsNav = panel.querySelector('.exam-actions');
  const sep = document.createElement('span'); sep.className = 'exam-top-sep exam-modes-sep'; sep.setAttribute('aria-hidden', 'true');
  actionsNav.before(sep, modes);

  // ── 집중 도구 줄 ──
  const bar = document.createElement('div');
  bar.className = 'exam-focusbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '집중 편집 도구');
  bar.innerHTML = `<span class="exam-ftabs" role="tablist">${[['text', '글자'], ['para', '문단'], ['table', '표'], ['pic', '그림'], ['item', '문항'], ['sheet', '학습지'], ['layout', '판짜기']].map(([k, l]) => `<button type="button" role="tab" data-exam-ftab="${k}" aria-selected="false">${l}</button>`).join('')}</span>
    <span class="exam-fdiv"></span><div class="exam-fgroup"></div>
    <div class="exam-fright"><span class="exam-fdiv"></span>
      <button type="button" class="exam-fx big" data-exam-fx="symbols" title="특수기호 창: 기출 3년 빈도로 고른 첫 줄 16칸 + 묶음 탭">Ω 기호</button>
      <button type="button" class="exam-fx big" data-exam-fx="capture" title="고른 부분을 양식(조각)으로 저장 → 팔레트 「템플릿」에 담김">⬚ 양식 저장</button>
      <button type="button" class="exam-fx big" data-exam-fx="check" title="조판 점검: 넓은 그림·표, 흐린 그림, 빈칸, 번호 빠짐을 찾아 목록으로">✓ 점검</button></div>`;
  panel.querySelector('.exam-topbar').after(bar);
  const group = bar.querySelector('.exam-fgroup');

  const peek = document.createElement('button');
  peek.type = 'button'; peek.className = 'exam-peek'; peek.hidden = true; peek.textContent = '☰ 도구 보기';
  peek.title = '집중 모드로 돌아가기 (⌘⌥2)';
  panel.querySelector('.exam-body').append(peek);

  // ── 떠 있는 창(기호·점검) ──
  const pop = document.createElement('div');
  pop.className = 'exam-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog');
  panel.append(pop);
  const closePop = () => { pop.hidden = true; pop.innerHTML = ''; };

  const bridgeOrThrow = () => { const b = getBridge(); if (!b?.input) throw new Error('시험지 편집기를 준비하는 중입니다. 잠시 뒤 다시 누르세요.'); return b; };
  const studio = () => getBridge()?.editor?.element?.contentDocument || null;
  const refocus = () => { try { getBridge()?.input?.focus?.(); } catch {} };
  const documentBase = () => (services.documentName?.() || '문항').replace(/[\\/:*?"<>|]/g, '_');
  // 문항 하나를 그림으로(쪽 그림은 pages에 담아 다시 쓴다). {blob, width, height} 또는 null
  async function questionShot(b, d, q, pages) {
    const region = questionRegion(d, q); if (!region) return null;
    const host = b.editor?.element?.contentDocument || document, scale = 3;
    if (!pages.has(region.page)) { const page = host.createElement('canvas'); b.wasm.renderPageToCanvas(region.page, page, scale); pages.set(region.page, page); }
    const page = pages.get(region.page), out = document.createElement('canvas'), k = page.width / region.width;
    out.width = Math.round(region.w * k); out.height = Math.round(region.h * k);
    const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
    g.drawImage(page, Math.round(region.x * k), Math.round(region.y * k), out.width, out.height, 0, 0, out.width, out.height);
    return { blob: await new Promise(resolve => out.toBlob(resolve, 'image/png')), width: out.width, height: out.height };
  }
  const ctx = {
    palette: services.palette, actions: services.actions, message, refocus,
    openPictureSettings: anchor => services.openPictureSettings(anchor),
    withBridge: fn => fn(bridgeOrThrow()),
    command(action) {
      const b = bridgeOrThrow();
      let failure = null;
      runDocumentAction(b, action, { notify: text => { failure = text; } });
      if (failure) throw new Error(failure);
      refocus();
    },
    highlight(color) { const b = bridgeOrThrow(); b.deps.eventBus.emit('format-char', { shadeColor: color }); refocus(); },
    paraSpacing(name, deltaPt) {
      const b = bridgeOrThrow(), input = b.input, para = input.getParaProperties();
      // 문단 위·아래 간격은 쓴 값(1pt=200)의 1/75로 돌려준다(여백은 1/150이라 다르다 — 10-21 실측).
      // 돌려주는 값은 소수 한 자리라 조금 어긋난다 — 0.5pt(100) 단위로 맞춘 뒤 더한다.
      const units = Math.max(0, Math.round((para?.[name] || 0) * 75 / 100) * 100 + deltaPt * 200), pt = units / 200;
      input.applyParaFormat({ [name]: units });
      message(`${name === 'spacingBefore' ? '문단 위' : '문단 아래'} 간격 ${pt}pt`);
      refocus();
    },
    studentCopy(b, labeled = false) {
      const { bytes, count, removed, relaid, refilled, labels } = studentCopy(b, { labeled }), name = `${(services.documentName?.() || '학습지').replace(/[\\/:*?"<>|]/g, '_')}-학생용.hwpx`;
      services.download(new Blob([bytes], { type: 'application/vnd.hancom.hwpx' }), name);
      message(`${[count ? `빈칸 ${count}개를 비우고` : '', removed ? `[정답]·[해설] 줄 ${removed}개를 뺀` : ''].filter(Boolean).join(' ').replace(/비우고$/, '비운')} 학생용 사본을 내려받습니다(${name})${refilled || relaid ? ` — 줄이 빠진 만큼 ${[refilled ? '단을 다시 채우고' : '', relaid ? `나뉜 문항 ${relaid}개를 넘겼습니다` : ''].filter(Boolean).join(' ').replace(/채우고$/, '채웠습니다')}` : ''}. 지금 문서는 그대로입니다.${labels ? ` 빈칸 정답: ${labels.join(', ')}` : ''}`);
    },
    answerKey(b) {
      const { bytes, count } = answerKeyCopy(b), name = `${(services.documentName?.() || '학습지').replace(/[\\/:*?"<>|]/g, '_')}-정답지.hwpx`;
      services.download(new Blob([bytes], { type: 'application/vnd.hancom.hwpx' }), name);
      message(`빈칸 ${count}개에 정답을 채운 정답지를 내려받습니다(${name}).`);
    },
    // 문항을 그림으로: 스튜디오 문서(글꼴이 올라 있는 곳)의 캔버스에 쪽을 3배로 그려 문항 영역만 잘라 PNG로.
    async questionImage(b) {
      const d = b.wasm.borrowDocumentHandle(), at = b.input.cursor.getPosition(), sec = at.sectionIndex ?? 0, para = at.cellPath?.length ? (at.parentParaIndex ?? at.paragraphIndex) : at.paragraphIndex;
      const q = allQuestionBlocks(d).find(x => x.sec === sec && x.start <= para && para < x.end);
      if (!q) throw new Error('그림으로 만들 문항 안에 커서를 두세요.');
      const shot = await questionShot(b, d, q, new Map());
      services.download(shot.blob, `${documentBase()}-${q.label.replace(/\s+/g, '')}.png`);
      message(`${q.label}을 그림(${shot.width}×${shot.height})으로 내려받습니다.`);
    },
    // 모든 문항을 그림으로: 문항별 PNG를 zip 하나로(쪽은 한 번씩만 그린다).
    async allQuestionImages(b) {
      const d = b.wasm.borrowDocumentHandle(), blocks = allQuestionBlocks(d);
      if (!blocks.length) throw new Error('문단 머리에 「1.」처럼 번호가 붙은 문항을 찾지 못했습니다.');
      const { zipSync } = await import('../vendor/fflate/index.js'), pages = new Map(), files = {};
      let n = 0;
      for (const q of blocks) { const shot = await questionShot(b, d, q, pages); if (shot) files[`${String(++n).padStart(2, '0')}-${q.label.replace(/\s+/g, '')}.png`] = new Uint8Array(await shot.blob.arrayBuffer()); }
      services.download(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }), `${documentBase()}-문항그림.zip`);
      message(`문항 ${Object.keys(files).length}개를 그림으로 묶어 내려받습니다.`);
    },
    explanations(b) {
      const base = (services.documentName?.() || '시험').replace(/[\\/:*?"<>|]/g, '_'), { bytes, count, explained } = explanationCopy(b, base === '새 시험지' ? '시험' : base);
      services.download(new Blob([bytes], { type: 'application/vnd.hancom.hwpx' }), `${base}-정답과해설.hwpx`);
      message(`문항 ${count}개(해설 ${explained}개)의 정답·해설지를 내려받습니다.`);
    },
    blueprint(b) {
      const base = (services.documentName?.() || '시험').replace(/[\\/:*?"<>|]/g, '_'), { bytes, count, total } = blueprintCopy(b, base === '새 시험지' ? '시험' : base);
      services.download(new Blob([bytes], { type: 'application/vnd.hancom.hwpx' }), `${base}-이원목적분류표.hwpx`);
      message(`문항 ${count}개(배점 합계 ${total}점)의 이원목적분류표를 내려받습니다. 성취기준·난이도 칸을 채우세요.`);
    },
    variant(b, choices = false) {
      const { bytes, mapping, shuffled } = makeVariant(b, Math.random, { choices }), name = `${(services.documentName?.() || '시험지').replace(/[\\/:*?"<>|]/g, '_')}-나형.hwpx`;
      services.download(new Blob([bytes], { type: 'application/vnd.hancom.hwpx' }), name);
      message(`나형을 내려받습니다(${name})${choices ? ` — 선지도 섞은 문항 ${shuffled}개` : ''}. 교사용 문서 끝에 대응표를 넣었습니다: ${appendVariantMapping(b, mapping)}`);
    },
    documentTitle: kind => { const n = services.documentName?.() || ''; return n && n !== '새 시험지' ? n : (WORKSHEET_FRAMES[kind]?.[0] || '학습지'); },
    openHeaderForm: anchor => openForm(anchor, 'header'),
    openSpacingForm: anchor => openForm(anchor, 'spacing'),
    openPicker: (anchor, kind) => openForm(anchor, kind),
    insertText(text) {
      const palette = services.palette;
      if (palette?.native) return palette.native.insertChar(text, palette.native.capture());
      bridgeOrThrow().insertText(text);
    },
  };

  // 글꼴·크기·줄 간격 칸: 스튜디오의 같은 칸(숨겨져 있어도 살아 있음)에 값을 넣어 스튜디오가 적용하게 한다.
  function controlHtml(kind) {
    if (kind === 'font') return '<select class="exam-fsel" data-exam-fctl="font" aria-label="글꼴" title="글꼴"></select>';
    if (kind === 'size') return '<input class="exam-fsize" data-exam-fctl="size" aria-label="글자 크기(pt)" title="글자 크기(pt) · Enter로 적용" inputmode="decimal">';
    return `<select class="exam-fsel narrow" data-exam-fctl="spacing" aria-label="줄 간격" title="줄 간격">${LINE_SPACINGS.map(v => `<option value="${v}">${v}%</option>`).join('')}</select>`;
  }
  function renderTab() {
    const items = [...focusTabs(ctx)[tab], '|', ['⋯ 더 보기', '자주 쓰지 않는 기능 모음(한글 리본을 켜지 않고 쓰기)', (_, button) => openMore(button)]];
    group.innerHTML = items.map((it, i) => {
      if (it === '|') return '<span class="exam-fdiv"></span>';
      if (it.length === 1) return controlHtml(it[0]);
      return `<button type="button" class="exam-fx" data-exam-fi="${i}" title="${esc(it[1])}">${it[0]}</button>`;
    }).join('');
    bar.querySelectorAll('[data-exam-ftab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.examFtab === tab)));
    group.scrollLeft = 0; requestAnimationFrame(() => syncOverflow());
    syncControls(true);
  }
  group.addEventListener('click', event => {
    const button = event.target.closest('[data-exam-fi]'); if (!button) return;
    const item = [...focusTabs(ctx)[tab], '|', ['⋯', '', (_, b) => openMore(b)]][Number(button.dataset.examFi)];
    void run(async () => { await item[2](ctx, button); });
  });
  // 좁은 화면: 세로 휠로도 도구 줄을 옆으로 넘기고, 넘치면 가장자리를 흐리게 보여 더 있다는 것을 알린다.
  group.addEventListener('wheel', event => {
    if (group.scrollWidth <= group.clientWidth + 1 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    group.scrollLeft += event.deltaY; event.preventDefault();
  }, { passive: false });
  const syncOverflow = () => {
    const over = group.scrollWidth > group.clientWidth + 1;
    group.classList.toggle('is-over-start', over && group.scrollLeft > 2);
    group.classList.toggle('is-over-end', over && group.scrollLeft + group.clientWidth < group.scrollWidth - 2);
  };
  group.addEventListener('scroll', syncOverflow, { passive: true });
  new ResizeObserver(() => syncOverflow()).observe(group);
  bar.querySelector('.exam-ftabs').addEventListener('click', event => {
    const b = event.target.closest('[data-exam-ftab]'); if (!b) return;
    tab = b.dataset.examFtab; renderTab();
  });
  // 스튜디오 값 ↔ 도구 줄 값
  function syncControls(fillFonts = false) {
    const doc = studio(); if (!doc || mode !== 'focus') return;
    const font = group.querySelector('[data-exam-fctl="font"]'), size = group.querySelector('[data-exam-fctl="size"]'), spacing = group.querySelector('[data-exam-fctl="spacing"]');
    const sFont = doc.getElementById('font-name'), sSize = doc.getElementById('font-size'), sSpacing = doc.getElementById('linespacing-select');
    if (font && sFont) {
      if (fillFonts || font.options.length !== sFont.options.length) font.innerHTML = [...sFont.options].map(o => `<option value="${esc(o.value)}">${esc(o.textContent)}</option>`).join('');
      if (document.activeElement !== font) font.value = sFont.value;
    }
    if (size && sSize && document.activeElement !== size) size.value = sSize.value;
    if (spacing && sSpacing && document.activeElement !== spacing) {
      const v = Number(sSpacing.value);
      if (v && ![...spacing.options].some(o => Number(o.value) === v)) spacing.insertAdjacentHTML('beforeend', `<option value="${v}">${v}%</option>`);
      if (v) spacing.value = String(v);
    }
  }
  group.addEventListener('change', event => {
    const el = event.target, doc = studio(); if (!doc) return;
    void run(async () => {
      const b = bridgeOrThrow();
      if (el.dataset.examFctl === 'font') { const s = doc.getElementById('font-name'); s.value = el.value; s.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true })); }
      if (el.dataset.examFctl === 'spacing') b.input.dispatcher.dispatch('format:line-spacing', { value: Number(el.value) });
      refocus();
    });
  });
  group.addEventListener('keydown', event => {
    const el = event.target; if (el.dataset?.examFctl !== 'size' || event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    void run(async () => {
      const doc = studio(), s = doc?.getElementById('font-size'); if (!s) return;
      s.value = el.value; s.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      refocus();
    });
  });

  // ── 기호 창 ──
  let symbolTab = Object.keys(SYMBOL_TABS)[0];
  function openSymbols(anchor) {
    const cell = (s, cls = '') => `<button type="button" class="exam-sym ${cls}" data-exam-sym="${esc(s)}" title="${esc(s)}">${esc(s.startsWith('위첨자') ? s.slice(-1) + 'ˢᵘᵖ' : s)}</button>`;
    const recent = recentSymbols();
    const grid = symbolTab === '조각' ? SYMBOL_CHUNKS.map(s => cell(s, 'chunk')).join('') : symbolCells(SYMBOL_TABS[symbolTab]).map(c => cell(c.s, c.rare ? 'rare' : '')).join('');
    pop.className = 'exam-pop exam-sympop';
    pop.innerHTML = `<div class="exam-pop-head">특수기호 <small>기출 3년 많이 쓴 순 · 누르면 커서 자리에 넣음</small></div>
      <div class="exam-symrow">${SYMBOL_ROW.map(s => cell(s, s.length > 1 ? 'wide' : '')).join('')}</div>
      ${recent.length ? `<div class="exam-symrecent"><span>최근</span>${recent.map(s => cell(s)).join('')}</div>` : ''}
      <div class="exam-symtabs" role="tablist">${[...Object.keys(SYMBOL_TABS), '조각'].map(k => `<button type="button" role="tab" data-exam-symtab="${esc(k)}" aria-selected="${k === symbolTab}">${esc(k)}</button>`).join('')}<button type="button" data-exam-symmore title="예전 hwpPalette의 기호 425개·이름으로 찾기">전체 기호…</button></div>
      <div class="exam-symgrid">${grid}</div>
      <div class="exam-pop-foot">흐린 기호 = 3년 기출엔 드물지만 수업 자료용 · ＝～＋－는 평가원식 전각 · Esc로 닫기</div>`;
    place(anchor);
  }
  function place(anchor) {
    pop.hidden = false;
    const p = panel.getBoundingClientRect(), a = anchor.getBoundingClientRect(), w = pop.offsetWidth || 440;
    pop.style.top = `${Math.round(a.bottom - p.top + 6)}px`;
    pop.style.left = `${Math.round(Math.max(8, Math.min(a.right - p.left - w, p.width - w - 8)))}px`;
  }
  async function insertSymbol(s) {
    const b = bridgeOrThrow();
    if (s.startsWith('위첨자')) {
      // 위 첨자 모양까지: 한 글자 넣은 뒤 그 글자를 골라 위 첨자를 걸고 커서를 뒤로 돌린다.
      await ctx.insertText(s.slice(-1));
      const at = b.input.getCursorPosition(), from = { ...at, charOffset: Math.max(0, at.charOffset - 1) };
      if (b.input.cursor.selectRange?.(from, at) === false) throw new Error('이 자리에서는 위 첨자 모양을 걸 수 없습니다. 글자는 넣었습니다.');
      ctx.command('format:superscript');
      b.input.cursor.moveTo(at); b.input.updateCaret?.();
    } else if (s === '‘’') {
      await ctx.insertText('‘’');
      const at = b.input.getCursorPosition(); b.input.cursor.moveTo({ ...at, charOffset: Math.max(0, at.charOffset - 1) }); b.input.updateCaret?.();
    } else await ctx.insertText(s);
    rememberSymbol(s);
    refocus();
  }
  pop.addEventListener('click', event => {
    const tabButton = event.target.closest('[data-exam-symtab]');
    if (tabButton) { symbolTab = tabButton.dataset.examSymtab; openSymbols(bar.querySelector('[data-exam-fx="symbols"]')); return; }
    if (event.target.closest('[data-exam-symmore]')) { closePop(); services.palette?.tool('manager', '특수기호'); return; }
    const sym = event.target.closest('[data-exam-sym]');
    if (sym) { void run(() => insertSymbol(sym.dataset.examSym)); return; }
    const more = event.target.closest('[data-exam-more]');
    if (more) { const [, , action] = (MORE[tab] || MORE[tab === 'para' ? 'text' : 'sheet'])[Number(more.dataset.examMore)]; closePop(); void run(async () => runMore(action)); return; }
    const jump = event.target.closest('[data-exam-jump]');
    if (jump) {
      const issue = lastIssues[Number(jump.dataset.examJump)];
      void run(async () => { const b = bridgeOrThrow(); b.input.cursor.moveTo(issue.at); b.input.updateCaret?.(); refocus(); });
    }
  });
  pop.addEventListener('mousedown', event => { if (!event.target.closest('input,select,textarea')) event.preventDefault(); }); // 누를 때 문서 커서를 잃지 않게(입력 칸은 예외)

  // ── 더 보기 창 ──
  function openMore(anchor) {
    if (!pop.hidden && pop.dataset.kind === 'more') { closePop(); return; }
    pop.dataset.kind = 'more';
    pop.className = 'exam-pop exam-morepop';
    pop.innerHTML = `<div class="exam-pop-head">더 보기 <small>${esc(bar.querySelector(`[data-exam-ftab="${tab}"]`)?.textContent || '')}</small></div>
      <div class="exam-morelist">${(MORE[tab] || MORE[tab === 'para' ? 'text' : 'sheet']).map(([label, tip], i) => `<button type="button" data-exam-more="${i}" title="${esc(tip)}">${esc(label)}</button>`).join('')}</div>
      <div class="exam-pop-foot">모든 기능은 「기본」 모드의 한글 리본에도 있습니다 · Esc로 닫기</div>`;
    place(anchor);
  }
  function runMore(action) {
    if (action.startsWith('tool:')) return services.palette?.tool(action.slice(5));
    if (action === 'x:question-image') return ctx.questionImage(bridgeOrThrow());
    if (action === 'x:student-labeled') return ctx.studentCopy(bridgeOrThrow(), true);
    if (action === 'x:all-question-images') return ctx.allQuestionImages(bridgeOrThrow());
    if (action === 'x:pick-questions') return openForm(bar.querySelector('.exam-fgroup [data-exam-fi]:last-child') || bar, 'pick');
    if (action === 'table-align-left' || action === 'table-align-right') return ctx.withBridge(b => applyTableAlignment(b, action.slice(12)));
    return ctx.command(action);
  }

  // ── 작은 입력 창(시험지 머리·문항 간격) ──
  const HEADER_KEY = '5e.hwp.examHeader';
  function openForm(anchor, kind) {
    if (!pop.hidden && pop.dataset.kind === kind) { closePop(); return; }
    pop.dataset.kind = kind;
    pop.className = 'exam-pop exam-formpop';
    if (kind === 'header') {
      let saved = {}; try { saved = JSON.parse(localStorage.getItem(HEADER_KEY) || '{}'); } catch {}
      pop.innerHTML = `<div class="exam-pop-head">시험지 머리 <small>문서 맨 앞에 넣음 · 다음에도 기억</small></div>
        <label class="exam-field"><span>시험 이름</span><input data-exam-form="title" value="${esc(saved.title || '2026학년도 1학기 중간고사')}"></label>
        <label class="exam-field"><span>과목</span><input data-exam-form="subject" value="${esc(saved.subject || '')}" placeholder="예: 통합과학"></label>
        <label class="exam-field"><span>학년</span><input data-exam-form="grade" value="${esc(saved.grade || '')}" placeholder="예: 1" inputmode="numeric"></label>
        <div class="exam-form-actions"><button type="button" data-exam-form-submit>넣기</button></div>`;
    } else if (kind === 'box') {
      pop.innerHTML = `<div class="exam-pop-head">상자 <small>커서 문단 뒤에 넣음</small></div>
        <div class="exam-morelist">${BOX_PRESETS.map(([title]) => `<button type="button" data-exam-box="${esc(title)}">${esc(title)}</button>`).join('')}</div>
        <div class="exam-pop-head exam-pop-sub">표 틀 <small>머리 줄 음영 · 커서 문단 뒤</small></div>
        <div class="exam-morelist">${TABLE_PRESETS.map(([name]) => `<button type="button" data-exam-tpreset="${esc(name)}">${esc(name)}</button>`).join('')}</div>`;
    } else if (kind === 'stem') {
      pop.innerHTML = `<div class="exam-pop-head">자주 쓰는 발문 <small>누르면 커서 자리에 넣음</small></div>
        <div class="exam-stemlist">${STEMS.map((t, i) => `<button type="button" data-exam-stem="${i}">${esc(t)}</button>`).join('')}</div>`;
    } else if (kind === 'paper') {
      pop.innerHTML = `<div class="exam-pop-head">용지 <small>여백·방향은 그대로</small></div>
        <div class="exam-morelist exam-three">${['A4', 'B4', 'A3'].map(n => `<button type="button" data-exam-paper="${n}">${n}</button>`).join('')}</div>`;
    } else if (kind === 'qr') {
      pop.innerHTML = `<div class="exam-pop-head">QR 코드 <small>커서 문단 뒤에 넣음</small></div>
        <label class="exam-field"><span>주소</span><input data-exam-qr="url" placeholder="https://" inputmode="url" autocomplete="off" spellcheck="false"></label>
        <label class="exam-field"><span>안내 글</span><input data-exam-qr="label" placeholder="예: 실험 영상 보기"></label>
        <div class="exam-morelist exam-three">${[20, 25, 30].map(n => `<button type="button" data-exam-qr-size="${n}">${n}mm로 넣기</button>`).join('')}</div>
        <div class="exam-pop-head exam-pop-sub">정답 QR <small>문항 안 [정답]을 「1-③ 2-①」로 담아 학생이 스스로 채점</small></div>
        <div class="exam-morelist"><button type="button" data-exam-qr-answers>정답을 QR로 넣기</button></div>`;
    } else if (kind === 'frame') {
      pop.innerHTML = `<div class="exam-pop-head">학습지 틀 <small>문서 끝에 넣음 · 제목은 문서 이름</small></div>
        <div class="exam-stemlist">${Object.entries(WORKSHEET_FRAMES).map(([k, [, name, parts]]) => `<button type="button" data-exam-frame="${k}"><b>${esc(name)}</b> — ${esc(parts.map(x => x[0].replace(/ \(.*\)$/, '')).join(' · '))}</button>`).join('')}</div>`;
    } else if (kind === 'combo') {
      pop.innerHTML = `<div class="exam-pop-head">조합 선지 <small>커서 줄 뒤에 5열로</small></div>
        <div class="exam-stemlist">${CHOICE_COMBOS.map((c, i) => `<button type="button" data-exam-combo="${i}">${c.map((t, k) => `${'①②③④⑤'[k]} ${esc(t)}`).join('&nbsp;&nbsp;')}</button>`).join('')}</div>`;
    } else if (kind === 'variant') {
      pop.innerHTML = `<div class="exam-pop-head">가·나형 <small>나형 사본 내려받기 · 지금 문서는 대응표만 붙음</small></div>
        <div class="exam-morelist"><button type="button" data-exam-variant="order">문항 순서만 섞기</button><button type="button" data-exam-variant="choices" title="선지가 한 줄에 하나씩인 문항만 선지 순서도 섞고, 문항 안 「[정답] ③」을 따라 고침">문항+선지 순서 섞기</button></div>`;
    } else if (kind === 'pick') {
      pop.innerHTML = `<div class="exam-pop-head">고른 문항만 새 파일로 <small>오답·보충 학습지 · 지금 문서는 그대로</small></div>
        <label class="exam-field"><span>문항 번호</span><input data-exam-pick placeholder="예: 3, 5, 7-9" inputmode="numeric" autocomplete="off"></label>
        <div class="exam-form-actions"><button type="button" data-exam-pick-submit>내려받기</button></div>`;
    } else if (kind === 'meta') {
      let now = {}, last = {}; try { last = JSON.parse(localStorage.getItem('5e.hwp.questionMeta') || '{}'); } catch {}
      try { const f = cursorQuestion(bridgeOrThrow()); if (f) now = Object.fromEntries(Object.entries(questionMeta(f.doc, f.sec, f.q)).map(([k, v]) => [k, v.value])); } catch {}
      const val = k => esc(now[k] ?? last[k] ?? '');
      pop.innerHTML = `<div class="exam-pop-head">분류 정보 <small>커서 문항 · 분류표에 채워짐 · 학생용에서는 빠짐</small></div>
        <label class="exam-field"><span>내용 영역</span><input data-exam-meta="area" value="${val('area')}" placeholder="예: 물질과 규칙성"></label>
        <label class="exam-field"><span>성취기준</span><input data-exam-meta="standard" value="${val('standard')}" placeholder="예: [10통과1-01]"></label>
        <div class="exam-field"><span>난이도</span><div class="exam-morelist exam-levels" role="group" aria-label="난이도">${['상', '중', '하'].map(l => `<button type="button" data-exam-meta-level="${l}" aria-pressed="${(now.level ?? '') === l}">${l}</button>`).join('')}</div></div>
        <div class="exam-form-actions"><button type="button" data-exam-meta-submit>넣기</button></div>`;
    } else if (kind === 'answer') {
      pop.innerHTML = `<div class="exam-pop-head">정답 <small>커서가 있는 문항 끝 · 학생용에서는 빠짐</small></div>
        <div class="exam-morelist exam-three">${[...'①②③④⑤'].map(m => `<button type="button" data-exam-answer="${m}">${m}</button>`).join('')}<button type="button" data-exam-answer="">지우기</button></div>
        <div class="exam-pop-head exam-pop-sub">정답 한 번에 <small>선택형 문항 차례대로 · 예: 31425 24153</small></div>
        <label class="exam-field"><span>정답</span><input data-exam-allanswers placeholder="31425 24153" inputmode="numeric" autocomplete="off"></label>
        <div class="exam-form-actions"><button type="button" data-exam-allanswers-submit>모두 넣기</button></div>`;
    } else if (kind === 'score') {
      pop.innerHTML = `<div class="exam-pop-head">배점 <small>커서가 있는 문항 · 발문 끝</small></div>
        <div class="exam-morelist exam-four">${SCORE_CHOICES.map(n => `<button type="button" data-exam-score="${n}">${n}점</button>`).join('')}<button type="button" data-exam-score="">지우기</button></div>`;
    } else if (kind === 'pagenum') {
      let savedHeader = {}; try { savedHeader = JSON.parse(localStorage.getItem(HEADER_KEY) || '{}'); } catch {}
      pop.innerHTML = `<div class="exam-pop-head">쪽 번호 <small>모든 쪽 아래 가운데</small></div>
        <div class="exam-morelist exam-three">${Object.entries(PAGE_NUMBER_STYLES).map(([k, t]) => `<button type="button" data-exam-pagenum="${k}">${esc(t)}</button>`).join('')}</div>
        <div class="exam-pop-head exam-pop-sub">머리말 <small>모든 쪽 위 가운데 한 줄(시험 이름 등) · 비우면 지움</small></div>
        <label class="exam-field"><span>머리말</span><input data-exam-runhead value="${esc([savedHeader.title, savedHeader.subject].filter(Boolean).join(' '))}"></label>
        <div class="exam-form-actions"><button type="button" data-exam-runhead-submit>머리말 넣기</button></div>`;
    } else if (kind === 'lines') {
      pop.innerHTML = `<div class="exam-pop-head">서술형 답란 <small>줄 수</small></div>
        <div class="exam-morelist exam-three">${[3, 5, 8].map(n => `<button type="button" data-exam-lines="${n}">${n}줄</button>`).join('')}</div>`;
    } else {
      pop.innerHTML = `<div class="exam-pop-head">문항 간격 <small>두 번째 문항부터 문항 위 간격</small></div>
        <div class="exam-morelist">${[6, 10, 14, 20, 28].map(pt => `<button type="button" data-exam-spacing="${pt}">${pt}pt</button>`).join('')}</div>`;
    }
    place(anchor);
    pop.querySelector('input')?.focus();
  }
  pop.addEventListener('click', event => {
    if (event.target.closest('[data-exam-keepwhole]')) { closePop(); void run(async () => { const { moved, left } = keepQuestionsWhole(bridgeOrThrow()); message(`문항 ${moved}개를 다음 단(쪽)으로 넘겼습니다.${left ? ` 단보다 긴 문항 ${left}개는 그대로 두었습니다.` : ''}`); }); return; }
    if (event.target.closest('[data-exam-fixanswers]')) { closePop(); void run(async () => { const r = balanceAnswers(bridgeOrThrow()); renderOutline(); message(r.changed ? `${r.changed}문항의 선지를 맞바꿔 정답 분포를 ${r.counts.map((c, i) => `${'①②③④⑤'[i]}${c}`).join(' ')}로 맞췄습니다(되돌리기 ⌘Z).` : '선지를 옮길 수 있는 문항으로는 더 고르게 할 수 없습니다.'); }); return; }
    if (event.target.closest('[data-exam-fixneg]')) { closePop(); void run(async () => message(`발문의 부정 표현 ${underlineNegativeWords(bridgeOrThrow())}곳에 밑줄을 그었습니다.`)); return; }
    if (event.target.closest('[data-exam-fixunit]')) { closePop(); void run(async () => message(`숫자와 단위 사이 ${fixUnitGaps(bridgeOrThrow())}곳을 띄어 썼습니다(되돌리기 ⌘Z).`)); return; }
    if (event.target.closest('[data-exam-fixeq]')) { closePop(); void run(async () => message(`수식 ${fitEquationSizes(bridgeOrThrow())}개의 크기를 둘레 글자에 맞췄습니다.`)); return; }
    if (event.target.closest('[data-exam-fixfont]')) { closePop(); void run(async () => message(`문항 ${unifyQuestionFonts(bridgeOrThrow())}개의 글꼴·크기를 대부분 문항에 맞췄습니다.`)); return; }
    if (event.target.closest('[data-exam-fixwide]')) { closePop(); void run(async () => message(`넓은 그림·표 ${fitWideObjects(bridgeOrThrow())}개를 단 폭에 맞췄습니다.`)); return; }
    const stem = event.target.closest('[data-exam-stem]');
    if (stem) { const text = STEMS[Number(stem.dataset.examStem)]; closePop(); void run(async () => { await ctx.insertText(text); refocus(); }); return; }
    const frameKind = event.target.closest('[data-exam-frame]');
    if (frameKind) { const kind = frameKind.dataset.examFrame; closePop(); void run(async () => message(`${WORKSHEET_FRAMES[kind][1]} 틀(상자 ${insertWorksheetFrame(bridgeOrThrow(), ctx.documentTitle(kind), kind)}개)을 넣었습니다. 칸 안에 내용을 쓰세요.`)); return; }
    const combo = event.target.closest('[data-exam-combo]');
    if (combo) { const i = Number(combo.dataset.examCombo); closePop(); void run(async () => { insertChoiceCombo(bridgeOrThrow(), i); refocus(); }); return; }
    const variant = event.target.closest('[data-exam-variant]');
    if (variant) { const choices = variant.dataset.examVariant === 'choices'; closePop(); void run(async () => ctx.variant(bridgeOrThrow(), choices)); return; }
    if (event.target.closest('[data-exam-qr-answers]')) {
      closePop(); void run(async () => {
        const b = bridgeOrThrow(), answers = [...questionAnswers(b.wasm.borrowDocumentHandle())].sort((x, y) => x[0] - y[0]);
        if (!answers.length) throw new Error('문항 안에 「[정답] ③」이 없습니다. 문항 → 정답으로 먼저 적으세요.');
        const r = await insertQrCode(b, { url: answers.map(([n, a]) => `${n}-${a}`).join(' '), label: `정답 확인 (${answers.length}문항)`, sizeMm: 25 });
        message(`정답 ${answers.length}개를 담은 QR(「${r.title}」)를 넣었습니다.`);
      }); return;
    }
    const qrSize = event.target.closest('[data-exam-qr-size]');
    if (qrSize) {
      const value = name => pop.querySelector(`[data-exam-qr="${name}"]`)?.value || '', form = { url: value('url'), label: value('label'), sizeMm: Number(qrSize.dataset.examQrSize) };
      if (!form.url.trim()) { pop.querySelector('[data-exam-qr="url"]')?.focus(); message('QR 코드에 넣을 주소를 쓰세요.', true); return; }
      closePop(); void run(async () => { const r = await insertQrCode(bridgeOrThrow(), form); message(`QR 코드(「${r.title}」)를 넣었습니다. 휴대폰 카메라로 비춰 확인해 보세요.`); }); return;
    }
    if (event.target.closest('[data-exam-pick-submit]')) {
      const text = pop.querySelector('[data-exam-pick]')?.value || '';
      closePop(); void run(async () => { const r = pickQuestionsCopy(bridgeOrThrow(), text); services.download(new Blob([r.bytes], { type: 'application/vnd.hancom.hwpx' }), `${documentBase()}-${r.numbers.length}문항.hwpx`); message(`${r.numbers.join(', ')}번 문항 ${r.count}개만 남긴 사본을 내려받습니다(번호는 1부터 다시).`); }); return;
    }
    const level = event.target.closest('[data-exam-meta-level]');
    if (level) { for (const b of pop.querySelectorAll('[data-exam-meta-level]')) b.setAttribute('aria-pressed', String(b === level && b.getAttribute('aria-pressed') !== 'true')); return; }
    if (event.target.closest('[data-exam-meta-submit]')) {
      const get = k => pop.querySelector(`[data-exam-meta="${k}"]`)?.value || '', values = { area: get('area'), standard: get('standard'), level: pop.querySelector('[data-exam-meta-level][aria-pressed="true"]')?.dataset.examMetaLevel || '' };
      try { localStorage.setItem('5e.hwp.questionMeta', JSON.stringify({ area: values.area, standard: values.standard })); } catch {}
      closePop(); void run(async () => { message(`${setQuestionMeta(bridgeOrThrow(), values)} 분류 정보를 적었습니다.`); refocus(); }); return;
    }
    if (event.target.closest('[data-exam-allanswers-submit]')) { const text = pop.querySelector('[data-exam-allanswers]')?.value || ''; closePop(); void run(async () => { const r = setAllAnswers(bridgeOrThrow(), text); renderOutline(); message(`선택형 ${r.total}문항 중 ${r.count}문항에 정답을 넣었습니다.`); }); return; }
    const answer = event.target.closest('[data-exam-answer]');
    if (answer) { const mark = answer.dataset.examAnswer || null; closePop(); void run(async () => { const r = setQuestionAnswer(bridgeOrThrow(), mark); renderOutline(); message(`${r.label} 정답${mark ? `을 ${mark}로 적었습니다` : ' 줄을 지웠습니다'}.`); refocus(); }); return; }
    const score = event.target.closest('[data-exam-score]');
    if (score) { const value = score.dataset.examScore === '' ? null : Number(score.dataset.examScore); closePop(); void run(async () => { const r = setQuestionScore(bridgeOrThrow(), value); message(`${r.label} ${value == null ? '배점을 지웠습니다' : `${value}점`} — 배점 ${r.count}곳 합계 ${r.total}점${r.count && r.total !== 100 ? ' (100점 아님)' : ''}`); refocus(); }); return; }
    if (event.target.closest('[data-exam-runhead-submit]')) { const text = pop.querySelector('[data-exam-runhead]')?.value || ''; closePop(); void run(async () => { const line = insertRunningHeader(bridgeOrThrow(), text); message(line ? `모든 쪽 머리말을 「${line}」로 넣었습니다.` : '머리말 글을 지웠습니다.'); }); return; }
    const pagenum = event.target.closest('[data-exam-pagenum]');
    if (pagenum) { const style = pagenum.dataset.examPagenum; closePop(); void run(async () => message(`모든 쪽 아래에 쪽 번호(${insertPageNumbers(bridgeOrThrow(), style)})를 넣었습니다.`)); return; }
    const paper = event.target.closest('[data-exam-paper]');
    if (paper) { const name = paper.dataset.examPaper; closePop(); void run(async () => message(`용지를 ${setPaper(bridgeOrThrow(), name)}로 바꿨습니다.`)); return; }
    const tpreset = event.target.closest('[data-exam-tpreset]');
    if (tpreset) { const name = tpreset.dataset.examTpreset; closePop(); void run(async () => message(`「${insertTablePreset(bridgeOrThrow(), name)}」을 넣었습니다.`)); return; }
    const box = event.target.closest('[data-exam-box]'), lineCount = event.target.closest('[data-exam-lines]');
    if (box) { const title = box.dataset.examBox; closePop(); void run(async () => message(`「${insertBox(bridgeOrThrow(), title)}」 상자를 넣었습니다. 아래 칸에 내용을 쓰세요.`)); return; }
    if (lineCount) { const n = Number(lineCount.dataset.examLines); closePop(); void run(async () => message(`서술형 답란 ${insertAnswerLines(bridgeOrThrow(), n)}줄을 넣었습니다.`)); return; }
    const spacing = event.target.closest('[data-exam-spacing]');
    if (spacing) { const pt = Number(spacing.dataset.examSpacing); closePop(); void run(async () => message(`문항 ${setQuestionSpacing(bridgeOrThrow(), pt)}곳의 위 간격을 ${pt}pt로 맞췄습니다.`)); return; }
    if (event.target.closest('[data-exam-form-submit]')) {
      const value = name => pop.querySelector(`[data-exam-form="${name}"]`)?.value || '';
      const form = { title: value('title'), subject: value('subject'), grade: value('grade') };
      try { localStorage.setItem(HEADER_KEY, JSON.stringify(form)); } catch {}
      closePop(); void run(async () => message(`시험지 머리 「${insertExamHeader(bridgeOrThrow(), form)}」를 넣었습니다.`));
    }
  });
  // 입력 칸에서 Enter = 그 창의 넣기 단추(한글 조합 중에는 무시).
  pop.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.target.tagName !== 'INPUT') return;
    const submit = pop.querySelector('[data-exam-form-submit],[data-exam-pick-submit],[data-exam-meta-submit],[data-exam-runhead-submit],[data-exam-allanswers-submit],[data-exam-qr-size="25"]');
    if (submit) { event.preventDefault(); submit.click(); }
  });

  // ── 점검 창 ──
  let lastIssues = [];
  // 점검 결과에 맞는 「한 번에 고치기」 단추들
  const FIXES = [
    [/단 폭보다 넓습니다/, '<button type="button" data-exam-fixwide>넓은 그림·표 모두 단 폭에 맞추기</button>'],
    [/경계에서 나뉩니다/, '<button type="button" data-exam-keepwhole>나뉜 문항 다음 단으로 넘기기</button>'],
    [/글꼴이 다릅니다/, '<button type="button" data-exam-fixfont>문항 글꼴 맞추기</button>'],
    [/수식 \d+개의 크기가/, '<button type="button" data-exam-fixeq>수식 크기 맞추기</button>'],
    [/단위 사이 띄어쓰기가 빠진/, '<button type="button" data-exam-fixunit>숫자·단위 띄어 쓰기</button>'],
    [/부정 표현 .*밑줄이 없습니다/, '<button type="button" data-exam-fixneg>부정 표현에 밑줄</button>'],
    [/정답 분포가 고르지|같은 정답 .*잇달아/, '<button type="button" data-exam-fixanswers title="정답이 몰린 문항의 선지 두 개(정답 ↔ 덜 쓰인 번호)를 맞바꾸고 [정답]을 따라 고침">정답 분포 고르게</button>'],
  ];
  const fixButtons = issues => { const html = FIXES.filter(([re]) => issues.some(issue => re.test(issue.text))).map(([, button]) => button).join(''); return html ? `<div class="exam-form-actions">${html}</div>` : ''; };
  function openCheck(anchor) {
    let summary = '';
    { const b = bridgeOrThrow(), d = b.wasm.borrowDocumentHandle(); lastIssues = [...checkLayout(b), ...extraChecks(d), ...splitQuestions(d)]; summary = examSummary(d); }
    pop.className = 'exam-pop exam-checkpop';
    pop.innerHTML = `<div class="exam-pop-head">조판 점검 <small>${lastIssues.length ? `${lastIssues.length}곳 · 누르면 그 자리로` : '고칠 곳이 없습니다'}</small></div>
      ${summary ? `<p class="exam-check-summary">${esc(summary)}</p>` : ''}
      ${lastIssues.length ? `<ol class="exam-checklist">${lastIssues.map((issue, i) => `<li><button type="button" data-exam-jump="${i}" ${issue.at ? '' : 'disabled'}>${esc(issue.text)}</button></li>`).join('')}</ol>` : '<p class="exam-pop-empty">넓은 그림·표, 흐린 그림, 채우지 않은 빈칸, 문항 번호 빠짐·겹침을 살폈습니다.</p>'}
      ${fixButtons(lastIssues)}
      <div class="exam-pop-foot">Esc로 닫기</div>`;
    place(anchor);
  }
  bar.querySelector('.exam-fright').addEventListener('click', event => {
    const b = event.target.closest('[data-exam-fx]'); if (!b) return;
    const kind = b.dataset.examFx;
    if (!pop.hidden && pop.dataset.kind === kind) { closePop(); return; }
    pop.dataset.kind = kind;
    if (kind === 'symbols') { try { bridgeOrThrow(); openSymbols(b); } catch (error) { message(error.message, true); } }
    else if (kind === 'check') void run(async () => openCheck(b));
    else if (kind === 'capture') { closePop(); services.palette?.tool('capture'); }
  });
  document.addEventListener('mousedown', event => { if (!pop.hidden && !event.target.closest('.exam-pop,[data-exam-fx]')) closePop(); }, true);

  // ── 왼쪽 칸 「만드는 순서」: 시험지·학습지를 만드는 차례. 누르면 그 묶음을 열고 해당 단추를 잠깐 밝힌다. ──
  const GUIDE = {
    exam: [['판짜기', 'layout', '문서 맨 앞에 제목 줄', '시험지 머리'], ['문항 틀·발문·선지', 'item', '문항 틀 넣기', '문항 쓰기'], ['정답·배점·해설', 'item', '커서가 있는 문항 끝에 「[정답]', '정답·배점'],
      ['점검', null, null, '✓ 점검'], ['쪽 번호·단 채우기', 'layout', '모든 쪽 아래 가운데에', '마무리'], ['학생용·정답 해설·분류표', 'layout', '문항마다 「번호. 정답」', '내보내기']],
    sheet: [['학습지 틀', 'sheet', '제목·이름 칸과 상자', '틀 넣기'], ['핵심어 굵게 쓰기', 'text', '굵게', '내용 쓰기'], ['굵은 글씨→빈칸', 'sheet', '문서의 굵은 낱말을', '빈칸 만들기'],
      ['QR·상자·답란', 'sheet', '영상·자료 주소를 QR', '자료 더하기'], ['학생용·정답지', 'sheet', '빈칸을 「', '내려받기']],
  };
  const GUIDE_KEY = '5e.hwp.guide';
  const guide = document.createElement('details');
  guide.className = 'exam-guide';
  try { guide.open = localStorage.getItem(GUIDE_KEY) === 'open'; } catch {}
  let guideKind = 'exam';
  const renderGuide = () => {
    guide.innerHTML = `<summary>만드는 순서</summary><div class="exam-guide-kinds" role="group"><button type="button" data-exam-guide-kind="exam" aria-pressed="${guideKind === 'exam'}">시험지</button><button type="button" data-exam-guide-kind="sheet" aria-pressed="${guideKind === 'sheet'}">학습지</button></div>
      <ol>${GUIDE[guideKind].map(([what, , , step], i) => `<li><button type="button" data-exam-guide="${i}"><small>${esc(step)}</small> ${esc(what)}</button></li>`).join('')}</ol>`;
  };
  renderGuide();
  guide.addEventListener('toggle', () => { try { localStorage.setItem(GUIDE_KEY, guide.open ? 'open' : 'closed'); } catch {} });
  guide.addEventListener('click', event => {
    const kind = event.target.closest('[data-exam-guide-kind]');
    if (kind) { guideKind = kind.dataset.examGuideKind; renderGuide(); guide.open = true; return; }
    const step = event.target.closest('[data-exam-guide]'); if (!step) return;
    const [, tabKey, title] = GUIDE[guideKind][Number(step.dataset.examGuide)];
    let target = null;
    if (!tabKey) target = bar.querySelector('[data-exam-fx="check"]');
    else { bar.querySelector(`[data-exam-ftab="${tabKey}"]`)?.click(); target = [...bar.querySelectorAll('.exam-fgroup [data-exam-fi]')].find(b => (b.title || '').startsWith(title)); }
    if (!target) return;
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    target.classList.remove('is-hint'); void target.offsetWidth; target.classList.add('is-hint');
    setTimeout(() => target.classList.remove('is-hint'), 1600);
  });
  panel.querySelector('.exam-sidebar')?.prepend(guide);

  // ── 왼쪽 칸 문항 목록: 누르면 그 문항으로, ↑↓로 순서 바꾸기(번호는 다시 매김) ──
  const outline = document.createElement('section');
  outline.className = 'exam-outline'; outline.setAttribute('aria-label', '문항 목록');
  const figuresHeading = [...panel.querySelectorAll('.exam-sidebar h2')].find(h => h.textContent.includes('문서의 그림'));
  (figuresHeading || panel.querySelector('.exam-sidebar')).before?.(outline);
  let outlineTimer = 0;
  function renderOutline() {
    const b = getBridge(); if (!b?.input || panel.hidden) return;
    let blocks = [];
    let answers = new Map();
    try { const d = b.wasm.borrowDocumentHandle(); blocks = allQuestionBlocks(d); answers = questionAnswers(d); } catch { return; }
    outline.hidden = !blocks.length;
    outline.innerHTML = `<h2>문항 <small>${blocks.length}</small></h2><ol class="exam-qlist">${blocks.map((q, i) => `<li><button type="button" class="exam-q" data-exam-q="${i}" title="${esc(`${q.label} ${q.preview}`)}">${q.group && q.start !== q.head ? `<small class="exam-qgroup" title="묶음 문항 — 지문과 함께라 순서는 그대로">[${q.group.from}~${q.group.to}]</small> ` : ''}<b>${q.essay ? `서술형 ${q.number}` : `${q.number}.`}</b> ${esc(q.preview || '(빈 문항)')}</button>${!q.essay && answers.get(q.number) ? `<span class="exam-qans" title="정답">${esc(answers.get(q.number).slice(0, 2))}</span>` : ''}<button type="button" class="exam-qmove" data-exam-qmove="${i}:-1" title="위로" aria-label="${q.label} 위로" ${i && blocks[i - 1].sec === q.sec && !q.group && !blocks[i - 1].group && !!blocks[i - 1].essay === !!q.essay ? '' : 'disabled'}>↑</button><button type="button" class="exam-qmove" data-exam-qmove="${i}:1" title="아래로" aria-label="${q.label} 아래로" ${i < blocks.length - 1 && blocks[i + 1].sec === q.sec && !q.group && !blocks[i + 1].group && !!blocks[i + 1].essay === !!q.essay ? '' : 'disabled'}>↓</button><button type="button" class="exam-qmove" data-exam-qdup="${i}" title="복제(바로 뒤에 한 벌 더)" aria-label="${q.label} 복제">⧉</button><button type="button" class="exam-qmove" data-exam-qdel="${i}" title="지우기" aria-label="${q.label} 지우기">×</button></li>`).join('')}</ol>`;
  }
  const scheduleOutline = () => { clearTimeout(outlineTimer); outlineTimer = setTimeout(renderOutline, 450); };
  outline.addEventListener('click', event => {
    const dup = event.target.closest('[data-exam-qdup]'), del = event.target.closest('[data-exam-qdel]');
    if (dup) { void run(async () => { duplicateQuestion(bridgeOrThrow(), Number(dup.dataset.examQdup)); renderOutline(); message('문항을 바로 뒤에 복제하고 번호를 다시 매겼습니다.'); }); return; }
    if (del) {
      const i = Number(del.dataset.examQdel), q = allQuestionBlocks(bridgeOrThrow().wasm.borrowDocumentHandle())[i];
      void (async () => {
        if (!q || !await showConfirm(`${q.label} 문항을 통째로 지울까요?\n되돌리기(⌘Z)로 되살릴 수 있습니다.`, { title: '문항 지우기', okText: '지우기', cancelText: '그대로 두기' })) return;
        await run(async () => { deleteQuestion(bridgeOrThrow(), i); renderOutline(); message(`${q.label} 문항을 지우고 번호를 다시 매겼습니다.`); });
      })();
      return;
    }
    const go = event.target.closest('[data-exam-q]'), move = event.target.closest('[data-exam-qmove]:not([data-exam-qdup]):not([data-exam-qdel])');
    if (go) void run(async () => {
      const b = bridgeOrThrow(), q = allQuestionBlocks(b.wasm.borrowDocumentHandle())[Number(go.dataset.examQ)]; if (!q) return;
      b.input.cursor.moveTo({ sectionIndex: q.sec, paragraphIndex: q.start, charOffset: 0 }); b.input.updateCaret?.(); refocus();
    });
    if (move) void run(async () => {
      const [i, dir] = move.dataset.examQmove.split(':').map(Number), b = bridgeOrThrow();
      const at = moveQuestion(b, i, dir); renderOutline();
      outline.querySelector(`[data-exam-qmove="${at}:${dir}"]`)?.focus();
      message(`문항 순서를 바꾸고 번호를 다시 매겼습니다.`);
    });
  });

  // ── 모드 적용 ──
  function applyStudioChrome() {
    const doc = studio(); if (!doc?.head) return;
    let style = doc.getElementById('exam-mode-style');
    if (!style) {
      style = doc.createElement('style'); style.id = 'exam-mode-style';
      // 집중·없음 모드에서는 스튜디오 메뉴·리본·서식 줄을 감춘다(칸은 살아 있어 도구 줄이 값을 넘겨 쓴다).
      style.textContent = 'html[data-exam-tools="focus"] #studio-header,html[data-exam-tools="none"] #studio-header{display:none!important}html[data-exam-tools="none"] #status-bar{display:none!important}';
      doc.head.append(style);
    }
    doc.documentElement.dataset.examTools = mode;
    doc.defaultView?.dispatchEvent(new doc.defaultView.Event('resize'));
  }
  function setMode(next, { announce = true } = {}) {
    if (!MODES.some(([m]) => m === next)) return;
    mode = next;
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    panel.dataset.toolMode = mode;
    modes.querySelectorAll('[data-exam-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.examMode === mode)));
    bar.hidden = mode !== 'focus';
    peek.hidden = mode !== 'none';
    closePop();
    applyStudioChrome();
    clearInterval(syncTimer);
    scheduleOutline();
    if (mode === 'focus') { renderTab(); syncTimer = setInterval(() => { if (!panel.hidden) syncControls(); }, 600); }
    if (announce) message(mode === 'basic' ? '기본 모드: 한글 리본 그대로(모든 기능)' : mode === 'focus' ? '집중 모드: 시험지·학습지에 필요한 도구 + 팔레트' : '없음: 도구 없이 종이만 · 「도구 보기」나 ⌘⌥2로 돌아옴');
  }
  modes.addEventListener('click', event => { const b = event.target.closest('[data-exam-mode]'); if (b) setMode(b.dataset.examMode); });
  peek.addEventListener('click', () => setMode('focus'));
  const modeKey = event => {
    if (panel.hidden || !(event.metaKey || event.ctrlKey) || !event.altKey || event.shiftKey) return;
    const n = { Digit1: 'basic', Digit2: 'focus', Digit3: 'none' }[event.code]; if (!n) return;
    event.preventDefault(); event.stopImmediatePropagation(); setMode(n);
  };
  const escKey = event => { if (event.key === 'Escape' && !pop.hidden) { event.preventDefault(); event.stopImmediatePropagation(); closePop(); } };
  document.addEventListener('keydown', modeKey, true);
  document.addEventListener('keydown', escKey, true);
  // ── ExamPool 시험지 열기 ──
  let examPoolData = null;
  async function openExamPool(anchor) {
    const { data, exams } = await (await examPoolOpen()).listExamPoolExams();
    examPoolData = data;
    pop.dataset.kind = 'exampool';
    pop.className = 'exam-pop exam-exampoolpop';
    pop.innerHTML = `<div class="exam-pop-head">ExamPool 시험지 열기 <small>${exams.length ? '고르면 지금 문서를 자동 저장한 뒤 엽니다' : ''}</small></div>
      ${exams.length ? `<div class="exam-stemlist">${exams.map(e => `<button type="button" data-exam-pool="${esc(e.id)}" ${e.missing || e.mixed ? 'aria-disabled="true"' : ''}><b>${esc(e.title)}</b> · ${e.count}문항${e.missing ? ` · 조판 저장 안 한 문항 ${e.missing}개(ExamPool에서 먼저 저장)` : e.mixed ? ' · 용지가 섞임' : ''}</button>`).join('')}</div>`
        : '<p class="exam-pop-empty">ExamPool에 문항을 넣은 시험지가 없습니다. 맨 위 「exam」에서 시험지를 만든 뒤 다시 여세요.</p>'}
      <div class="exam-pop-foot">Esc로 닫기</div>`;
    place(anchor || bar);
  }
  pop.addEventListener('click', event => {
    const pick = event.target.closest('[data-exam-pool]'); if (!pick) return;
    if (pick.getAttribute('aria-disabled') === 'true') { message('이 시험지는 아직 열 수 없습니다. ExamPool에서 문항마다 「조판 저장」을 한 뒤 다시 여세요.', true); return; }
    const id = pick.dataset.examPool; closePop();
    void run(async () => {
      const b = bridgeOrThrow(), Document = b.wasm.borrowDocumentHandle().constructor;
      const { bytes, title } = await (await examPoolOpen()).buildExamPoolHwpx(Document, examPoolData, id);
      await services.loadExam(bytes, title);
      message(`ExamPool 시험지 「${title}」를 열었습니다. 인쇄 전 「점검」으로 확인하세요.`);
    });
  });

  let boundDoc = null;
  setMode(mode, { announce: false });
  return {
    openExamPool,
    get mode() { return mode; },
    setMode,
    // 편집기가 준비되거나 다시 만들어지면 스튜디오 쪽 모양·단축키를 다시 붙인다.
    attach() {
      const doc = studio(); if (!doc) return;
      applyStudioChrome();
      if (doc !== boundDoc) {
        boundDoc = doc; doc.addEventListener('keydown', modeKey, true); doc.addEventListener('keydown', escKey, true);
        getBridge()?.deps?.eventBus?.on?.('document-changed', scheduleOutline);
        // 사파리는 이레 동안 안 쓴 사이트 저장소를 지울 수 있다 — 자동 저장·팔레트를 지키려고 계속 보관을 한 번 부탁한다.
        try { void navigator.storage?.persist?.(); } catch {}
      }
      renderOutline();
      syncControls(true);
    },
  };
}
