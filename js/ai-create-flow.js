// 11-20 CHATFIX: 그림 생성 탭의 「대화 보내기」와 「이미지 생성」을 나누는 화면 없는 조각.
// 화면 코드(ai-panel.js)가 부르고, 단위 검사(tests/test-ai-create-flow.mjs)가 그대로 돌린다.
// 근거: 보고서 CHATGEN.md(흰 그림·한글 Enter), 시안 대화생성분리(안 B · 안 1).

/**
 * 한글 입력기가 글자를 조합하는 중에 눌린 Enter인가. 조합 중 Enter는 글자를 확정할 뿐, 대화도 그림도 보내지 않는다.
 * - isComposing: 크롬·파이어폭스(조합 중 keydown)
 * - keyCode 229: 사파리(WebKit)는 compositionend 뒤에 keyCode 229인 keydown을 한 번 더 보낸다(isComposing false)
 * - composing: 화면 코드가 compositionstart~end 사이를 따로 기억한 값
 */
export function isImeEnter(event, { composing = false } = {}) {
  if (!event) return false;
  return Boolean(composing || event.isComposing || event.keyCode === 229 || event.which === 229);
}

/** Enter 하나를 무엇으로 볼지: 'ime'(조합 확정, 아무것도 안 함) · 'newline' · 'generate'(⌘/Ctrl+Enter) · 'chat' · null(Enter 아님). */
export function enterAction(event, { composing = false } = {}) {
  if (!event || event.key !== 'Enter') return null;
  if (isImeEnter(event, { composing })) return 'ime';
  if (event.altKey) return null;
  if (event.shiftKey) return 'newline';
  if (event.metaKey || event.ctrlKey) return 'generate';
  return 'chat';
}

// 빈(흰) 그림 판정. 앱이 이미 재는 darkPixelShare(가장 밝은 채널 ≤ 32인 점의 몫)가 0.1% 미만이면 「진한 선 없음」.
// 다만 회색 선으로만 그린 정상 그림(검사 그림 rights-clear-smoke.png: darkPixelShare 0, 회색 선 6.6%)을 빈 그림으로
// 잘못 보지 않도록, 밝기 160 미만 점(inkPixelShare)도 0.2% 미만일 때만 빈 그림으로 본다. 11-20 사고 그림은 둘 다 0이었다.
export const BLANK_DARK_SHARE = 0.001;
export const BLANK_INK_SHARE = 0.002;
/** 검사값(inspectRgbaPixels 결과) → 빈 그림인가. 값이 없거나 못 쟀으면 빈 그림이 아니다(막지 않음). */
export function isBlankInspection(p) {
  if (!p || !Number.isFinite(p.darkPixelShare)) return false;
  if (p.darkPixelShare >= BLANK_DARK_SHARE) return false;
  if (Number.isFinite(p.inkPixelShare) && p.inkPixelShare >= BLANK_INK_SHARE) return false;
  return true;
}

const clean = (text) => String(text || '').trim();
const oneLine = (text, max = 90) => { const t = clean(text).replace(/\s+/g, ' '); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

/** AI 답이 그림 구성을 정리한 것으로 보이는가(그 답 아래 「이대로 그리기」 칩). */
export function looksLikeDrawSummary(text) {
  const t = clean(text);
  if (!t) return false;
  if (/그릴 구성|제작할 구성|구성은 다음|정리하(겠|면|면요|자면)|정리했|정리한 구성|이대로 그리|이미지 생성.{0,6}누르/.test(t)) return true;
  // 목록(줄머리 -, ·, •, 숫자.)이 둘 이상이고 그림 낱말이 있으면 정리로 본다.
  const items = t.split('\n').filter((line) => /^\s*(?:[-·•*]|\d+[.)])\s+/.test(line)).length;
  return items >= 2 && /그림|비커|라벨|장면|배치|표시|구성|모식도/.test(t);
}

/** 정리 답에서 목록 줄만 뽑기(「그릴 내용」 줄에 씀). */
function summaryLines(text, max = 8) {
  return clean(text).split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:[-·•*]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^(?:[-·•*]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

// 11-20 V5(시안 대화창v5 ④·⑥): 대화 기록 안의 표시(말이 아닌 줄). 그림 요청·대화 요약은 user/assistant만 읽으므로 그냥 건너뛴다.
//  { role: 'result', id, name } — 그 자리에서 결과가 나왔다(다음 그리기는 이 뒤 대화만 읽는다)
//  { role: 'reset' }            — 「새 대화」(이 위 대화는 그림·대화 AI에 쓰지 않는다)
export const RESULT_MARK = 'result';
export const RESET_MARK = 'reset';
const isTalk = (m) => m && (m.role === 'user' || m.role === 'assistant');

/** 마지막 「새 대화」 뒤 기록(표시 포함). 「새 대화」가 없으면 전부. */
export function messagesSinceReset(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  let at = -1;
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.role === RESET_MARK) { at = i; break; }
  return at < 0 ? list : list.slice(at + 1);
}

/** 마지막 표시가 「새 대화」인가(그 뒤로 결과가 아직 없음). */
export function resetIsLast(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const role = list[i]?.role;
    if (role === RESET_MARK) return true;
    if (role === RESULT_MARK) return false;
  }
  return false;
}

/**
 * 다음 그리기가 읽을 대화의 범위.
 * - scope 'after-result'(기본): 「새 대화」 뒤에서, 결과(resultId, 없으면 마지막 결과) 뒤 대화만.
 * - scope 'all': 「새 대화」 뒤 대화 전체(▾ 「처음부터 다시 그리기」).
 * resultIds를 주면 지금 남아 있는 결과의 표시만 센다(지운 결과의 표시는 건너뜀).
 * @returns {{ messages: object[], after: {id: string, name: string}|null, reset: boolean }}
 */
export function drawScope(messages = [], { scope = 'after-result', resultId = null, resultIds = null } = {}) {
  const all = Array.isArray(messages) ? messages : [];
  const since = messagesSinceReset(all);
  const reset = since.length !== all.length;
  if (scope === 'all') return { messages: since, after: null, reset };
  const live = (m) => m?.role === RESULT_MARK && (!resultIds || resultIds.includes(m.id));
  let at = -1;
  for (let i = since.length - 1; i >= 0; i--) {
    if (!live(since[i])) continue;
    if (!resultId || since[i].id === resultId) { at = i; break; }
  }
  if (at < 0) return { messages: since, after: null, reset };
  return { messages: since.slice(at + 1), after: { id: since[at].id, name: String(since[at].name || '') }, reset };
}

/**
 * 지금까지 대화(+ 입력칸 글)를 그림 요청 한 덩어리로 모은다.
 * - request: 교사가 한 말만(구체화·기출 검색·라벨 힌트의 바탕). 질문·진행 문의도 들어가지만 구체화가 걸러 낸다.
 * - conversation: AI 답까지 포함한 대화 전체(구체화의 「앞서 정리한 대화」 자리로 넘긴다).
 * - count: 모은 대화 수(말풍선 수, 입력칸 글 포함).
 * - after: 결과 뒤 대화만 모았으면 그 결과({id, name}), reset: 「새 대화」 뒤만 모았는가, scope: 모은 범위.
 * V5: 기록에 결과·「새 대화」 표시가 있으면 drawScope로 범위를 먼저 자른다(표시가 없으면 예전과 같이 전부).
 * @param {{role: string, text: string}[]} messages
 */
export function gatherDrawRequest(messages = [], entered = '', { maxMessages = 20, maxChars = 6000, scope = 'after-result', resultId = null, resultIds = null } = {}) {
  const range = drawScope(messages, { scope, resultId, resultIds });
  const list = range.messages
    .filter((m) => isTalk(m) && clean(m.text))
    .slice(-maxMessages)
    .map((m) => ({ role: m.role, text: clean(m.text) }));
  const extra = clean(entered);
  const all = extra ? [...list, { role: 'user', text: extra }] : list;
  const users = all.filter((m) => m.role === 'user').map((m) => m.text);
  let request = users.join('\n');
  if (request.length > maxChars) request = request.slice(-maxChars);
  const lines = [];
  let used = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const line = `${all[i].role === 'user' ? '교사' : 'AI'}: ${all[i].text}`;
    if (used + line.length > maxChars) break;
    lines.unshift(line); used += line.length + 1;
  }
  const lastSummary = [...all].reverse().find((m) => m.role === 'assistant' && looksLikeDrawSummary(m.text));
  return { request, conversation: all.length > 1 ? lines.join('\n') : '', count: all.length, userCount: users.length, summary: lastSummary ? summaryLines(lastSummary.text) : [], users,
    after: range.after, reset: range.reset, scope };
}

/** 「그릴 내용」 첫 줄: 무엇을 모았는지 늘 말한다(시안 태그 16). */
export function drawPlanHead(g = {}) {
  if (g.after?.name && g.again) return `${g.after.name} 뒤 대화가 없어 같은 내용으로 다시 그려요.`;
  if (g.after?.name) return `${g.after.name} 뒤 대화 ${g.count}개를 모아 이렇게 그려요.`;
  if (g.reset && g.count > 0) return `새 대화 ${g.count}개를 모아 이렇게 그려요.`;
  return g.count > 1 ? `지금까지 대화 ${g.count}개를 모아 이렇게 그려요.` : '이렇게 그려요.';
}

/** 그리기 시작 때 대화에 한 번 남기는 「그릴 내용」 글. */
export function drawPlanNote(gathered) {
  const g = gathered || {};
  const items = g.summary?.length ? g.summary : (g.users || []).map((u) => oneLine(u)).slice(-6);
  const tail = g.after?.name && !g.again ? ['(그 앞 대화도 쓰려면 「처음부터 다시 그리기」)'] : [];
  return [drawPlanHead(g), ...items.map((item) => `· ${item}`), ...tail].join('\n');
}

/**
 * 그리기 단추 설명(마우스 올림). V5: 입력칸 밖 「미리 말하는 줄」을 빼고 같은 말을 여기로 옮겼다.
 * editing이면 고칠 결과 번호, after(결과 이름)·reset이면 모은 범위를 말한다.
 */
export function drawPreviewLine({ editing = false, baseNo = null, count = 0, fresh = false, after = null, reset = false, all = false } = {}) {
  if (editing) return baseNo ? `보는 그림 생성 결과 ${baseNo}에서 적은 곳만 고칩니다` : '보는 그림에서 적은 곳만 고칩니다';
  if (after) return count > 0 ? `${after} 뒤 대화 ${count}개를 모아 새로 그립니다` : `${after} 뒤 대화가 없어 같은 내용으로 다시 그립니다`;
  if (count > 0) return `${reset ? '새 대화' : all ? '대화 전체' : '지금까지 대화'} ${count}개를 모아 ${fresh || all ? '처음부터 ' : ''}새로 그립니다`;
  return '입력칸에 그릴 그림을 적고 누르세요';
}

/**
 * 입력칸 안내 줄(시안 v5 태그 3): 「Enter 대화 · ⌘Enter 이미지 생성」. ⇧Enter는 ✈ 단추 설명으로 옮겼다.
 * action: 그리기 단추에 적힌 일(없으면 editing/fresh로 정함), note: 끝에 붙일 괄호 말(예: 「새 대화 2개로」).
 */
export function composerHint({ editing = false, fresh = false, mod = '⌘', action = '', note = '' } = {}) {
  const label = action || (editing ? '이 그림 고치기' : fresh ? '새로 그리기' : '이미지 생성');
  return `Enter 대화 · ${mod}Enter ${label}${note ? ` (${note})` : ''}`;
}

/** 결과 고르기 목록(시안 v5 안 A · 태그 10)의 「한 일」: 처음 그림 · 새로 그림 · 라벨 살리기 · 고친 말. */
export function resultActionText(item, items = []) {
  const ui = item?.meta?.ui || {};
  if (ui.kind === 'label') return '라벨 살리기';
  if (ui.kind === 'edit') return oneLine(ui.summary || ui.instruction || '고침', 18) || '고침';
  const figures = (Array.isArray(items) ? items : []).filter((other) => (other?.meta?.ui?.kind || 'figure') !== 'label' && other?.meta?.ui?.kind !== 'edit');
  return figures[0] === item || items[0] === item ? '처음 그림' : '새로 그림';
}
