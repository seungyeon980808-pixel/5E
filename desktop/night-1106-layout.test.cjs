// 11-06 밤샘에서 고친 조판·라이브러리 동작을 지키는 단위 검사.
const test = require('node:test');
const assert = require('node:assert/strict');

test('기출 수식 끝 ¼ 빈칸: 숫자 뒤 글자로 끝나는 짧은 수식 + 뒤가 한글·쉼표·마침표일 때만', async () => {
  const { kiceTailOf } = await import('../assets/exampool/sheet/equation-script.js');
  assert.equal(kiceTailOf('1m', ','), '`');
  assert.equal(kiceTailOf('L=1m', '일 때'), '`');
  assert.equal(kiceTailOf('10kg', '인'), '`');
  assert.equal(kiceTailOf('P', '에서'), '', '한 글자 변수는 그대로(기출 대부분이 바뀌지 않게)');
  assert.equal(kiceTailOf('2m', ' '), '', '뒤가 빈칸이면 그대로');
  assert.equal(kiceTailOf('L_{x}', '일'), '', '첨자로 끝나면 그대로');
  assert.equal(kiceTailOf('1234567m', '이'), '', '긴 수식은 그대로');
});

// 〈보기〉 칸(ㄱ·ㄴ·ㄷ) 하나: ㄴ은 분수 줄 두 개. 엔진이 쓴 줄 배치(lineseg)를 그대로 흉내 낸다(2025 9월 물Ⅱ 5번 실측).
const seg = (pos, size, base, spacing) => `<hp:lineseg textpos="0" vertpos="${pos}" vertsize="${size}" textheight="${size}" baseline="${base}" spacing="${spacing}" horzpos="0" horzsize="28868" flags="393216"/>`;
const para = (text, segs, eq = '') => `<hp:p id="0" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>${text}</hp:t>${eq}</hp:run><hp:linesegarray>${segs.join('')}</hp:linesegarray></hp:p>`;
const eq = script => `<hp:equation id="1" baseLine="85"><hp:script>${script}</hp:script><hp:sz width="1124" widthRelTo="ABSOLUTE" height="2806" heightRelTo="ABSOLUTE"/></hp:equation>`;
const bogi = (lines, cell = 10950, table = 12070) => `<hp:p><hp:run><hp:tbl id="7"><hp:sz width="30567" widthRelTo="ABSOLUTE" height="${table}" heightRelTo="ABSOLUTE" protect="0"/><hp:tr><hp:tc name=""><hp:subList>${lines}</hp:subList><hp:cellSz width="30567" height="${cell}"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`;
const plain = para('ㄱ. 추의 역학적 에너지는 같다.', [seg(0, 1150, 978, 516)]);
const tall = para('ㄴ. 추가 높이가 인 지점', [seg(1666, 2806, 2385, 516), seg(4988, 2829, 2405, 516)], eq('\\frac{h}{2}'));
const last = para('ㄷ. 단진동의 주기는', [seg(8333, 1173, 997, 516)]);

test('〈보기〉 분수 줄 간격: 잉크 기준으로 당기고, 줄인 만큼 칸·표 높이도 줄인다', async () => {
  const { tightenBogiTallLines } = await import('../assets/exampool/sheet/typeset-model.js');
  const xml = bogi(plain + tall + last), out = tightenBogiTallLines(xml);
  const segs = [...out.matchAll(/<hp:lineseg\b[^>]*>/g)].map(m => ({ pos: Number(m[0].match(/vertpos="(-?\d+)"/)[1]), sp: Number(m[0].match(/spacing="(-?\d+)"/)[1]) }));
  assert.equal(segs[0].pos, 0, 'ㄱ은 그대로');
  assert.ok(segs[1].pos < 1666, `ㄴ 첫 줄이 위로 당겨짐(${segs[1].pos})`);
  assert.ok(segs[1].sp < 516, `ㄴ 문단 안 줄 사이를 줄임(${segs[1].sp})`);
  assert.ok(segs[3].pos < 8333, 'ㄷ도 함께 올라감');
  const cut = 10950 - Number(out.match(/<hp:cellSz [^>]*height="(\d+)"/)[1]);
  assert.ok(cut > 1500, `칸 높이가 줄어듦(${cut})`);
  assert.equal(12070 - Number(out.match(/<hp:sz [^>]*height="(\d+)"/)[1]), cut, '표 높이도 같은 만큼');
  // 다시 해도 더 줄지 않을 만큼 안정적이어야 한다(이미 당긴 문서는 거의 그대로).
  const again = tightenBogiTallLines(out), cut2 = 10950 - Number(again.match(/<hp:cellSz [^>]*height="(\d+)"/)[1]);
  assert.ok(cut2 - cut < 300, `두 번째는 거의 그대로(${cut2 - cut})`);
});

test('〈보기〉 분수 줄 간격: 키 큰 수식 줄이 없거나 〈보기〉가 아니면 손대지 않는다', async () => {
  const { tightenBogiTallLines } = await import('../assets/exampool/sheet/typeset-model.js');
  const flat = bogi(plain + para('ㄴ. 보통 줄', [seg(1666, 1150, 978, 516)], eq('x')) + last.replace('8333', '3332'));
  assert.equal(tightenBogiTallLines(flat), flat);
  const notBogi = bogi(para('가. 선지', [seg(0, 1150, 978, 516)]) + para('나. 분수', [seg(1666, 2806, 2385, 516)], eq('\\frac{1}{2}')));
  assert.equal(tightenBogiTallLines(notBogi), notBogi);
});

test('정답 형광펜: 정답 번호부터 다음 번호 앞까지, 문항 영역 안 낱말만', async () => {
  const { answerHighlights } = await import('../js/unified-library-ui.js');
  const keys = { documents: { doc: 'p2_2025_11.pdf' }, papers: { 'p2_2025_11.pdf': [[1], [1], [2], [4], [], null] } };
  const words = [{ text: '① ㄱ ② ㄴ', rect: [0.10, 0.80, 0.20, 0.01] }, { text: '④ m', rect: [0.75, 0.40, 0.04, 0.01] }];
  const result = number => ({ cropType: 'question', provenance: { documentId: 'doc', rect: [0.05, 0.2, 0.9, 0.7] }, metadata: { itemNumber: number }, searchWords: words });
  const four = answerHighlights(result(4), keys);
  assert.equal(four.length, 1);
  assert.ok(Math.abs(four[0].rect[0] - 0.75) < 0.01 && four[0].answer === true);
  const one = answerHighlights(result(1), keys);
  assert.equal(one.length, 1);
  assert.ok(one[0].rect[2] < 0.13, '한 낱말에 선지 둘이면 그 선지 몫만');
  assert.deepEqual(answerHighlights(result(5), keys), [], '전원 정답은 표시 없음');
  assert.deepEqual(answerHighlights(result(6), keys), [], '정답 없음');
  assert.deepEqual(answerHighlights({ ...result(4), cropType: 'page' }, keys), [], '문항 미리보기에만');
});

test('기출 문항 영역: 선지 낱말이 아래로 조금 넘치면 덮고, 멀리 떨어진 낱말은 무시', async () => {
  const { coverItemWords } = await import('../js/library/provider.js');
  const source = { rect: [0.509, 0.6591, 0.4815, 0.234] };
  const near = coverItemWords(source, [{ text: '① ㄱ', rect: [0.52, 0.8846, 0.03, 0.0097] }]);
  assert.ok(near.rect[1] + near.rect[3] >= 0.8943, '선지 아래 끝까지');
  const far = coverItemWords(source, [{ text: '다음 문항', rect: [0.52, 0.95, 0.03, 0.01] }]);
  assert.equal(far, source);
  assert.equal(coverItemWords(source, []), source);
});

test('통합 정답(11-07): 평가원·학평 파일명으로 찾고, 전원 정답은 빈 배열·없는 문항은 null', async () => {
  const { acceptedAnswers } = await import('../assets/exampool/answers/answers.js');
  const fs = require('node:fs'), path = require('node:path');
  const book = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/exampool/answers/science-answers.json'), 'utf8'));
  assert.ok(Object.keys(book.papers).length >= 1056, '평가원·학평 시험지 1,056개');
  assert.deepEqual(acceptedAnswers(book, 'p2_2025_11.pdf', 4), [4], '2025 수능 물Ⅱ 4번');
  assert.deepEqual(acceptedAnswers(book, '학력평가/생명과학1/문제/b1_2027_10.pdf', 3), [5], '경로가 붙어도 파일명으로');
  assert.deepEqual(acceptedAnswers(book, 'b2_2022_11.pdf', 20), [], '전원 정답');
  assert.deepEqual(acceptedAnswers(book, 'p2_2008_11.pdf', 11), [2, 4], '복수 정답');
  assert.equal(acceptedAnswers(book, 'p2_2025_11.pdf', 99), null);
  assert.equal(acceptedAnswers(book, 'none.pdf', 1), null);
});

test('라벨 이름 글꼴(11-07 안 B): 한 글자 이름만 명조, 한글 이름·글꼴 바꾼 라벨은 그대로', async () => {
  const { presentationRoleFor, measureLabelTypography } = await import('../js/ai-label-typography.js');
  const state = await import('../js/state.js');
  assert.equal(presentationRoleFor('name', 'A'), 'name');
  assert.equal(presentationRoleFor('name', 'A₁'), 'name');
  assert.equal(presentationRoleFor('name', '전류 센서'), 'text');
  assert.equal(presentationRoleFor('quantity', 'm'), 'quantity');
  const mixed = (fontFamily) => ({ type: 'labeler', text: '검출기 Q', contentMode: 'plain', fontFamily, labelFontOverride: true, fontSize: 4,
    labelRuns: [{ text: '검출기 ', role: 'text', contentMode: 'plain' }, { text: 'Q', role: 'name', contentMode: 'plain' }] });
  const runs = o => measureLabelTypography(o).lines.flatMap(l => l.runs);
  const auto = runs(mixed(state.DEFAULT_TEXT_FONT));
  assert.equal(auto.find(r => r.text === 'Q').font.fontFamily, state.OBJECT_LABEL_TEXT_FONT_FAMILY, '섞인 라벨 안 Q는 명조');
  assert.equal(auto.find(r => r.text.startsWith('검출기')).font.fontFamily, state.DEFAULT_TEXT_FONT, '한글은 돋움');
  const manual = runs(mixed('Arial, sans-serif'));
  assert.equal(manual.find(r => r.text === 'Q').font.fontFamily, 'Arial, sans-serif', '사람이 고른 글꼴은 그대로');
});

// 11-07 수능 틀 본문·선지 분수 줄 위 빈틈(17번 「p와 / y축」 2.1→5.1mm, 발문→선지 3.8→6.6mm).
const top = (segs, eq = '') => `<hp:p id="0" paraPrIDRef="1" styleIDRef="0"><hp:run charPrIDRef="1"><hp:t>글</hp:t>${eq}</hp:run><hp:linesegarray>${segs.join('')}</hp:linesegarray></hp:p>`;
const feq = h => `<hp:equation id="1" baseLine="85" baseUnit="1150"><hp:script>\\frac{1}{4}mg</hp:script><hp:sz width="2420" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE"/></hp:equation>`;
test('수능 틀 본문 분수 줄: 수식은 drop까지만 올리고, 다음 줄은 수식 아래가 보통 줄 사이만큼 남게 당긴다', async () => {
  const { tightenKiceTallLines } = await import('../assets/exampool/sheet/typeset-model.js');
  const xml = '<hs:sec>' + top([seg(0, 1150, 978, 690), seg(1840, 2806, 2385, 690), seg(5336, 1150, 978, 690)], feq(2806)) + top([seg(7176, 1150, 978, 690)]) + '</hs:sec>';
  const out = tightenKiceTallLines(xml, () => 690, (para, line) => para === 0 && line === 1 ? { gap: 517, above: 1380, below: 310 } : null);
  const segs = [...out.matchAll(/<hp:lineseg\b[^>]*>/g)].map(m => ({ pos: Number(m[0].match(/vertpos="(-?\d+)"/)[1]), size: Number(m[0].match(/vertsize="(\d+)"/)[1]), sp: Number(m[0].match(/spacing="(-?\d+)"/)[1]) }));
  const L = Math.round(690 / 0.85), y = Math.round(310 + L * .85 - 517);
  assert.equal(segs[1].size, 2806 - L, '분수 줄 높이를 drop÷0.85만큼(수식이 줄 맨 위로)');
  assert.equal(segs[1].sp, 690 + L - y, '줄인 높이 중 y만 빼고 줄 사이로 돌려줌');
  assert.equal(segs[3].pos, 7176 - y, '다음 문단도 y만큼 올라옴');
  assert.equal(tightenKiceTallLines(xml, () => 690, () => null), xml, '실측이 없으면 그대로');
});
test('수능 틀 선지 표: 모든 칸이 분수인 한 줄 선지만 당기고, 섞인 선지·다른 표는 그대로', async () => {
  const { tightenKiceTallLines } = await import('../assets/exampool/sheet/typeset-model.js');
  const cell = (text, eq, col) => `<hp:tc><hp:subList><hp:p id="9"><hp:run><hp:t>${text}</hp:t>${eq}</hp:run><hp:linesegarray>${seg(0, eq ? 2806 : 1150, eq ? 2385 : 978, 576)}</hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="${col}" rowAddr="0"/><hp:cellSz width="6123" height="3600"/></hp:tc>`;
  const choices = cells => `<hs:sec><hp:p id="0"><hp:run><hp:tbl id="2"><hp:sz width="30566" height="3600"/><hp:tr>${cells}</hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`;
  const mixed = choices(cell('① 2', '', 0) + cell('② ', feq(2806), 1));
  assert.equal(tightenKiceTallLines(mixed, () => 690, () => null), mixed, '보통 칸이 섞인 선지 줄은 그대로');
  const notChoice = choices(cell('ㄱ. ', feq(2806), 0) + cell('ㄴ. ', feq(2806), 1));
  assert.equal(tightenKiceTallLines(notChoice, () => 690, () => null), notChoice, '선지가 아닌 표는 그대로');
  // 모든 칸이 분수인 한 줄 선지: 줄·칸·표 높이를 같이 줄인다(11-07 「글 선지처럼 깔끔하게」).
  const out = tightenKiceTallLines(choices(cell('① ', feq(2806), 0) + cell('② ', feq(2806), 1)), () => 690, () => null), L = Math.round(690 / 0.85), cut = Math.round(L * .7);
  assert.deepEqual([...out.matchAll(/<hp:cellSz [^>]*height="(\d+)"/g)].map(m => Number(m[1])), [3600 - cut, 3600 - cut]);
  assert.equal(Number(out.match(/<hp:sz [^>]*height="(\d+)"/)[1]), 3600 - cut);
  assert.deepEqual([...out.matchAll(/vertsize="(\d+)"/g)].map(m => Number(m[1])), [2806 - L, 2806 - L]);
});
