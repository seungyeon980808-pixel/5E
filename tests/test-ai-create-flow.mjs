// CHATFIX(11-20): 그림 생성 탭 「대화 보내기 / 이미지 생성」 나누기의 화면 없는 조각 + 엔진 쪽 고침(되묻기·실패한 고침 버리기·대화 넘기기).
// 가짜 AI만 쓴다(실제 AI·네트워크 없음). 근거: 보고서 CHATGEN.md, 시안 대화생성분리.
import test from 'node:test';
import assert from 'node:assert/strict';
import { enterAction, isImeEnter, isBlankInspection, gatherDrawRequest, drawPlanNote, drawPreviewLine, composerHint, looksLikeDrawSummary, drawScope, messagesSinceReset, resetIsLast, resultActionText } from '../js/ai-create-flow.js';
import { inspectRgbaPixels } from '../js/ai-png-inspection.js';
import { createEngine, makeIndex } from '../js/ai-figure/index.js';
import { expandPrompt, editFindPrompt } from '../js/ai-figure/prompt.js';
import { buildDiscussionPrompt } from '../js/ai-prompt.js';

// 11-20 실제 대화(대화-기록-추출.md)
const TALK = [
  { role: 'user', text: '광합성에서 암반응과 명반응의 결과 차이를 보여주는 두 비커 그림을 만들어줘\n실험 세팅과 실험 이후의 결과도 보여줘\n실험 장치를 세팅하는 사람이 보이게끔 해줘' },
  { role: 'assistant', text: '어떤 차이를 보여 주려는지 알려 주세요.' },
  { role: 'user', text: '물질의 차이를 보여주려는거야' },
  { role: 'assistant', text: '생성 물질을 글자 라벨로도 표시할까요?' },
  { role: 'user', text: '응 다 글자 라벨로도 표현해저' },
  { role: 'assistant', text: '그림 형식은요?' },
  { role: 'user', text: '비커를 이용한 개념 모식도로 만들어줘' },
  { role: 'assistant', text: '비커를 이용한 개념 모식도로 정리하겠습니다.' },
  { role: 'user', text: '시작해' },
  { role: 'assistant', text: '제작할 구성은 다음과 같습니다.\n\n- 두 비커로 명반응과 암반응을 각각 표현\n- 실험 전 장치 세팅과 실험 후 결과를 비교\n- 장치를 세팅하는 사람 포함\n- 라벨: 명반응, 암반응, 산소, ATP, NADPH, 당' },
];

test('Enter 구분: 한글 조합 중 Enter는 아무것도 보내지 않고, Enter=대화, ⌘/Ctrl+Enter=그리기, ⇧Enter=줄바꿈', () => {
  assert.equal(enterAction({ key: 'Enter', isComposing: true }), 'ime');
  assert.equal(enterAction({ key: 'Enter', keyCode: 229 }), 'ime', 'WebKit: compositionend 뒤 keyCode 229');
  assert.equal(enterAction({ key: 'Enter' }, { composing: true }), 'ime');
  assert.equal(enterAction({ key: 'Enter', metaKey: true, isComposing: true }), 'ime', '조합 중이면 ⌘Enter도 보내지 않음');
  assert.equal(enterAction({ key: 'Enter', keyCode: 13 }), 'chat');
  assert.equal(enterAction({ key: 'Enter', metaKey: true }), 'generate');
  assert.equal(enterAction({ key: 'Enter', ctrlKey: true }), 'generate');
  assert.equal(enterAction({ key: 'Enter', shiftKey: true }), 'newline');
  assert.equal(enterAction({ key: 'a' }), null);
  assert.equal(isImeEnter({ key: 'Enter', which: 229 }), true);
  assert.equal(isImeEnter({ key: 'Enter', keyCode: 13 }), false);
});

test('빈 그림 판정: 11-20 흰 종이(밝기 250~255)는 빈 그림, 회색 선만 있는 그림·검은 선 그림은 아님', () => {
  const W = 200, H = 100;
  const paper = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < paper.length; i += 4) { const v = 250 + (i / 4) % 6; paper[i] = paper[i + 1] = paper[i + 2] = v; paper[i + 3] = 255; }
  const p0 = inspectRgbaPixels(paper, W, H);
  assert.equal(p0.darkPixelShare, 0); assert.equal(p0.inkPixelShare, 0);
  assert.equal(isBlankInspection(p0), true);
  const gray = paper.slice();
  for (let x = 20; x < 180; x++) for (let y = 48; y < 52; y++) { const i = (y * W + x) * 4; gray[i] = gray[i + 1] = gray[i + 2] = 110; }
  const p1 = inspectRgbaPixels(gray, W, H);
  assert.equal(p1.darkPixelShare, 0, '회색 선은 darkPixelShare로는 0');
  assert.ok(p1.inkPixelShare > 0.002);
  assert.equal(isBlankInspection(p1), false, '회색 선 그림은 빈 그림이 아니다');
  const black = paper.slice();
  for (let x = 20; x < 180; x++) { const i = (50 * W + x) * 4; black[i] = black[i + 1] = black[i + 2] = 0; }
  assert.equal(isBlankInspection(inspectRgbaPixels(black, W, H)), false);
  assert.equal(isBlankInspection(null), false, '못 쟀으면 막지 않음');
  assert.equal(isBlankInspection({ darkPixelShare: 0 }), true, '옛 검사값(inkPixelShare 없음)은 darkPixelShare만으로');
});

test('대화 모으기: 교사 말 전부 + AI 정리 구성, 질문 한 줄이 그림 요청이 되지 않는다', () => {
  const g = gatherDrawRequest([...TALK, { role: 'user', text: '지금 이미지를 생성중이야?' }, { role: 'assistant', text: '아직 그리지 않았어요.' }], '');
  assert.equal(g.count, 12);
  assert.match(g.request, /두 비커 그림/); assert.match(g.request, /장치를 세팅하는 사람/); assert.match(g.request, /개념 모식도/);
  assert.notEqual(g.request.trim(), '지금 이미지를 생성중이야?');
  assert.match(g.conversation, /교사: 시작해/); assert.match(g.conversation, /AI: 제작할 구성은/);
  assert.deepEqual(g.summary, ['두 비커로 명반응과 암반응을 각각 표현', '실험 전 장치 세팅과 실험 후 결과를 비교', '장치를 세팅하는 사람 포함', '라벨: 명반응, 암반응, 산소, ATP, NADPH, 당']);
  const note = drawPlanNote(g);
  assert.match(note, /^지금까지 대화 12개를 모아 이렇게 그려요\./);
  assert.match(note, /· 라벨: 명반응, 암반응, 산소, ATP, NADPH, 당/);
  // 입력칸 글도 함께
  const g2 = gatherDrawRequest(TALK, '사람은 왼쪽에');
  assert.equal(g2.count, 11); assert.match(g2.request, /사람은 왼쪽에$/);
  // 대화 없이 입력칸만: 대화 칸은 비고 요청은 그 말
  const g3 = gatherDrawRequest([], '진자 그림');
  assert.equal(g3.request, '진자 그림'); assert.equal(g3.conversation, ''); assert.equal(g3.count, 1);
  assert.equal(gatherDrawRequest([], '').request, '');
});

test('정리 답 알아보기·한 줄 미리 말하기·안내 줄', () => {
  assert.equal(looksLikeDrawSummary(TALK.at(-1).text), true);
  assert.equal(looksLikeDrawSummary('그릴 구성:\n- 비커 두 개'), true);
  assert.equal(looksLikeDrawSummary('어떤 차이를 보여 주려는지 알려 주세요.'), false);
  assert.equal(drawPreviewLine({ count: 10 }), '지금까지 대화 10개를 모아 새로 그립니다');
  assert.equal(drawPreviewLine({ editing: true, baseNo: 1 }), '보는 그림 생성 결과 1에서 적은 곳만 고칩니다');
  // V5(시안 대화창v5 태그 3): 안내 줄은 짧게, ⇧Enter는 ✈ 단추 설명으로 옮김
  assert.equal(composerHint({}), 'Enter 대화 · ⌘Enter 이미지 생성');
  assert.equal(composerHint({ editing: true, mod: 'Ctrl+' }), 'Enter 대화 · Ctrl+Enter 이 그림 고치기');
  assert.equal(composerHint({ action: '이미지 생성', note: '새 대화 2개로' }), 'Enter 대화 · ⌘Enter 이미지 생성 (새 대화 2개로)');
  assert.doesNotMatch(composerHint({ editing: true }), /줄바꿈|⇧Enter/);
  // 미리 말하는 줄은 그리기 단추 설명으로 — 결과 뒤 대화·새 대화도 말한다
  assert.equal(drawPreviewLine({ count: 3, after: '생성 결과 3' }), '생성 결과 3 뒤 대화 3개를 모아 새로 그립니다');
  assert.equal(drawPreviewLine({ count: 0, after: '생성 결과 3' }), '생성 결과 3 뒤 대화가 없어 같은 내용으로 다시 그립니다');
  assert.equal(drawPlanNote({ after: { name: '생성 결과 1' }, again: true, count: 0, summary: ['두 비커'] }), '생성 결과 1 뒤 대화가 없어 같은 내용으로 다시 그려요.\n· 두 비커');
  assert.equal(drawPreviewLine({ count: 2, reset: true }), '새 대화 2개를 모아 새로 그립니다');
  assert.equal(drawPreviewLine({ count: 14, all: true }), '대화 전체 14개를 모아 처음부터 새로 그립니다');
});

// V5(시안 대화창v5 ④·⑤·⑥ · 태그 12·13·16): 결과 뒤 대화만 · 「처음부터 다시 그리기」 · 「새 대화」
const R = (id, name) => ({ role: 'result', id, name, text: '' });
const AFTER3 = [
  { role: 'user', text: '오른쪽 비커에도 빛 화살표를 넣고, 사람 손은 왼쪽 비커만 잡게 해 줘' },
  { role: 'assistant', text: '오른쪽 비커 위에 빛 화살표를 더하고, 손은 왼쪽 비커만 잡도록 하겠습니다. 라벨은 그대로 둘까요?' },
  { role: 'user', text: '응 새로 그려줘' },
];
const WITH_RESULTS = [...TALK, R('r1', '생성 결과 1'), { role: 'user', text: '라벨 글자를 조금 더 크게 해 줘' }, R('r2', '생성 결과 2'),
  { role: 'user', text: '확정하고 라벨 살리기' }, R('r3', '생성 결과 3 · 라벨'), ...AFTER3];

test('V5 대화 모으기: 결과가 나온 뒤에는 그 결과 뒤 대화만 모은다(gatherDrawRequest)', () => {
  const g = gatherDrawRequest(WITH_RESULTS, '');
  assert.equal(g.count, 3, '결과 3 뒤 대화 3개만');
  assert.deepEqual(g.after, { id: 'r3', name: '생성 결과 3 · 라벨' });
  assert.doesNotMatch(g.request, /두 비커 그림|라벨 글자를 조금/, '앞 대화는 넣지 않는다');
  assert.match(g.request, /빛 화살표/); assert.match(g.request, /응 새로 그려줘$/);
  const note = drawPlanNote(g);
  assert.match(note, /^생성 결과 3 · 라벨 뒤 대화 3개를 모아 이렇게 그려요\./, '「그릴 내용」 첫 줄이 무엇을 모았는지 말한다');
  assert.match(note, /\(그 앞 대화도 쓰려면 「처음부터 다시 그리기」\)$/);
  // 특정 결과(보는 결과) 뒤로 자르기
  assert.equal(gatherDrawRequest(WITH_RESULTS, '', { resultId: 'r2' }).count, 1 + 3, '결과 2 뒤: 말 1 + 말 3(결과 3 표시 줄은 세지 않음)');
  // 지운 결과의 표시는 건너뛴다
  assert.equal(gatherDrawRequest(WITH_RESULTS, '', { resultIds: ['r1', 'r2'] }).after.id, 'r2');
  // 표시가 없는 옛 기록은 예전과 똑같이 전부
  assert.equal(gatherDrawRequest(TALK, '').count, 10);
  assert.equal(gatherDrawRequest(TALK, '').after, null);
});

test('V5 「처음부터 다시 그리기」(scope all) = 새 대화 뒤 대화 전체, 「새 대화」 위는 어떤 그리기도 읽지 않는다', () => {
  const all = gatherDrawRequest(WITH_RESULTS, '', { scope: 'all' });
  assert.equal(all.after, null);
  assert.equal(all.count, 10 + 1 + 1 + 3);
  assert.match(all.request, /두 비커 그림/);
  assert.match(drawPlanNote(all), /^지금까지 대화 15개를 모아/);
  const NEW = [{ role: 'user', text: '같은 실험인데 비커 대신 시험관 두 개로, 사람은 빼고 그려줘' }, { role: 'assistant', text: '시험관 두 개로 그릴까요?' }];
  const cut = [...WITH_RESULTS, { role: 'reset', text: '' }, ...NEW];
  assert.equal(resetIsLast(cut), true, '새 대화 뒤 아직 결과 없음 → 그리기 단추는 「이미지 생성」');
  assert.equal(resetIsLast(WITH_RESULTS), false);
  assert.deepEqual(messagesSinceReset(cut), NEW);
  for (const scope of ['after-result', 'all']) {
    const g = gatherDrawRequest(cut, '', { scope });
    assert.equal(g.count, 2, `${scope}: 새 대화 2개만`);
    assert.equal(g.reset, true); assert.equal(g.after, null);
    assert.doesNotMatch(g.request, /두 비커|빛 화살표/);
    assert.match(drawPlanNote(g), /^새 대화 2개를 모아 이렇게 그려요\./);
  }
  // 새 대화 뒤 결과가 나오면 다시 그 결과 뒤만
  const later = [...cut, R('r4', '생성 결과 4'), { role: 'user', text: '선 진하게' }];
  assert.equal(resetIsLast(later), false);
  assert.equal(drawScope(later).after.id, 'r4');
  assert.equal(gatherDrawRequest(later, '').count, 1);
  assert.equal(gatherDrawRequest(later, '', { scope: 'all' }).count, 3, '처음부터 다시 그리기도 새 대화 위로는 가지 않는다');
});

test('V5 결과 고르기 목록(안 A)의 「한 일」', () => {
  const r1 = { id: 'a', meta: { ui: { kind: 'figure' } } };
  const r2 = { id: 'b', meta: { ui: { kind: 'edit', from: 'a', summary: '라벨 글자 크게' } } };
  const r3 = { id: 'c', meta: { ui: { kind: 'label', from: 'b' } } };
  const r4 = { id: 'd', meta: { ui: { kind: 'figure' } } };
  const items = [r1, r2, r3, r4];
  assert.equal(resultActionText(r1, items), '처음 그림');
  assert.equal(resultActionText(r2, items), '라벨 글자 크게');
  assert.equal(resultActionText(r3, items), '라벨 살리기');
  assert.equal(resultActionText(r4, items), '새로 그림');
});

test('구체화 지시문에 대화 전체가 들어가고, 질문·진행 문의는 그림 내용이 아니라고 적는다', () => {
  const g = gatherDrawRequest(TALK, '');
  const text = expandPrompt({ request: g.request, conversation: g.conversation, types: ['생명 모식도'] });
  assert.match(text, /교사와 AI가 그림을 정리한 대화/);
  assert.match(text, /AI: 제작할 구성은/);
  assert.match(text, /진행 문의는 그림 내용이 아니다/);
  assert.doesNotMatch(expandPrompt({ request: '진자' }), /정리한 대화/, '대화가 없으면 예전 지시문 그대로');
  assert.match(editFindPrompt({ instruction: '지금 그림이 제대로 안보이는데?' }), /확인 불가/);
});

test('makeFigureSet: conversation을 구체화에 넘긴다', async () => {
  const seen = [];
  const ai = {
    async readText({ text }) { seen.push(text); return '{"type":"생명 모식도","scenes":["두 비커"],"keyValues":"","subject":"생명과학Ⅰ","types":[],"keywords":[]}'; },
    async generateImage() { return 'data:image/png;base64,' + Buffer.from('fig').toString('base64'); },
  };
  const eng = createEngine({ ai, index: makeIndex({}), grayscale: async (d) => ({ data: d, applied: true }), retries: { text: 1, image: 1 } });
  const g = gatherDrawRequest(TALK, '');
  await eng.makeFigureSet({ request: g.request, conversation: g.conversation, earlyRetrieve: false });
  assert.ok(seen.some((t) => /교사와 AI가 그림을 정리한 대화/.test(t) && /NADPH/.test(t)), '구체화가 대화(AI 정리 구성)를 받는다');
});

const PREV = 'data:image/png;base64,' + Buffer.from('prev').toString('base64');
function editAi({ find, verify = [] }) {
  const calls = { image: 0 };
  let v = 0;
  return { calls, ai: {
    async readText({ text }) {
      if (text.includes('교사가 이 그림에서 일부만')) return find;
      if (text.includes('첫 그림은 고치기 전')) return verify[Math.min(v++, verify.length - 1)];
      return '{}';
    },
    async generateImage() { calls.image++; return 'data:image/png;base64,' + Buffer.from('edit-' + calls.image).toString('base64'); },
  } };
}
const editEngine = (ai) => createEngine({ ai, index: makeIndex({}), grayscale: async (d) => ({ data: d, applied: true }), retries: { text: 1, image: 1 } });

test('이 그림 고치기: 고칠 곳 0개·「확인 불가」면 그리지 않고 되묻는다(앞 그림 그대로)', async () => {
  const { ai, calls } = editAi({ find: '{"targets":[],"keep":[],"summary":"그림 확인 불가","mode":"draw","ops":[],"ask":"어느 부분이 안 보이는지 알려 주세요."}' });
  const r = await editEngine(ai).editFigure({ previousPng: PREV, instruction: '지금 그림이 제대로 안보이는데?' });
  assert.equal(r.needsClarification, true);
  assert.equal(r.ok, false);
  assert.equal(r.scenes[0].kept, true); assert.equal(r.scenes[0].image, PREV);
  assert.equal(calls.image, 0, '그림 AI를 부르지 않는다');
  assert.equal(r.edit.clarify.ask, '어느 부분이 안 보이는지 알려 주세요.');
});

test('이 그림 고치기: 두 번 다 「지시가 반영되지 않음」이면 둘 중 나은 쪽을 결과로 붙이지 않는다', async () => {
  const { ai, calls } = editAi({ find: '{"targets":["T 라벨"],"keep":["A"],"summary":"T만 지움","mode":"draw"}', verify: ['{"done":false,"unwanted":[],"sentences":[]}', '{"done":false,"unwanted":[],"sentences":[]}'] });
  const r = await editEngine(ai).editFigure({ previousPng: PREV, instruction: 'T는 빼 줘' });
  assert.equal(calls.image, 2);
  assert.equal(r.editRejected, true);
  assert.equal(r.ok, false);
  assert.equal(r.scenes[0].kept, true); assert.equal(r.scenes[0].image, PREV);
  assert.equal(r.edit.verify.passed, false);
});

test('대화 AI 지시문: 생성 탭에서는 그리지 않고 「그릴 구성:」 목록으로 정리하게 한다(다른 탭은 그대로)', () => {
  const create = buildDiscussionPrompt({ request: '시작해', creating: true });
  assert.match(create, /그릴 구성:/); assert.match(create, /아직 그리지 않았다/);
  assert.doesNotMatch(buildDiscussionPrompt({ request: '시작해' }), /그릴 구성:/);
});
