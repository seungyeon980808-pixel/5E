// 11-21: 그림 변환 「목록 대조 뒤 빠진 것만 다시 그리기」.
// 1) 그림 생성과 동시에 글 모델(Sol)이 원본에서 「남아야 할 과학 구조」 목록을 만든다(생성 시간 안에 끝나 기다림이 늘지 않음).
// 2) 생성이 끝나면 원본·결과·목록을 대조해 빠진 것과 남으면 안 되는 것(글자·허공 지시선 등)을 뽑는다.
// 3) 걸리면 그 항목만 짚은 요청으로 한 번만 다시 그린다. 다시 그린 것이 더 나쁘거나 크기가 다르면 앞 결과를 쓴다.
// 4) 그래도 남은 것은 「원본과 다를 수 있는 곳」으로 결과에 싣는다(표시용). 어느 단계가 실패해도 앞 결과로 끝낸다(변환 실패 금지).
export const CONVERT_CHECK_VERSION = 1;
export const CONVERT_CHECK_MODEL = 'gpt-6.1-sol';
// 11-21 측정: 기출(5장)은 대조 뒤 다시 그리기 4/5·심사 점수 4.7→4.6으로 나아지지 않아 교과서만 켠다. 기출도 켜려면 'exam'을 넣는다.
// 11-21: 'dual' = 두 장 동시에 그려 대조로 고르기(다시 그리기 없음, 시간 ≈ 한 장), 'redraw' = 한 장 그린 뒤 빠진 것만 다시 그리기.
// 11-22 밤샘: 앱의 그림 통로(createImageLabelRasterController)는 한 번에 한 장만 받아 둘째 장을 「이미 진행 중」으로 거절한다 —
// 앱에서 'dual'은 동시가 아니라 차례로 돌아 시간·한도만 늘었다. 통로를 여러 장 받게 고치기 전까지 'redraw'(한 장 → 대조 → 빠진 것만 다시)로 둔다.
export const CONVERT_CHECK_MODE = 'redraw';
export const CONVERT_CHECK_KINDS = Object.freeze(['general']);
export const CONVERT_CHECK_LIMITS = Object.freeze({ listMs: 40000, checkMs: 30000, maxItems: 6 });

const kindWord = imageKind => imageKind === 'exam' ? '기출' : '교과서';

export function convertListPrompt(imageKind = 'general') {
  // 기출은 글자·지시선만 지우고 나머지(빈 글자 칸 틀·확대 원·순서 화살표·회색 면 포함)는 모두 남기는 규칙이다(REDRAW_EXAM_PROMPT).
  if (imageKind === 'exam') return `첨부 그림은 기출 그림이다. 이 그림에서 글자·숫자·문자와 글자를 가리키는 지시선만 지우고 다시 그릴 때, 결과에 반드시 그대로 남아야 할 것을 짧은 목록으로 써라.
- 넣을 것: 물체·부품과 그 개수, 구획·띠의 개수와 순서, 화살표와 방향, 치수선·각도 호·점선·직각 표시, 회색으로 칠한 면, 글자가 들어 있던 네모·원 틀(비운 채로 남음), 확대 원과 잇는 선, 연결(어디와 어디가 이어지는지).
- 넣지 말 것: 글자·숫자·문자, 글자를 가리키는 지시선.
한 줄에 하나, '- '로 시작, 12줄 이내. 다른 말은 쓰지 마라.`;
  return `첨부 그림은 ${kindWord(imageKind)} 그림이다. 이 그림을 글자·라벨 없이 시험지용 흑백 그림으로 다시 그릴 때, 결과에 반드시 그대로 남아야 할 과학 구조를 짧은 목록으로 써라.
- 넣을 것: 물체·부품과 그 개수, 물체 안 구획(띠·층·방·마디)의 개수와 순서, 짝을 이룬 물체끼리 같은 배열, 물체에 붙거나 관·도선을 따라 흐르는 화살표와 방향, 치수선(파장·진폭·길이)과 기준 점선, 확대 그림(확대한 사진·단면 그림 자체), 켜짐/꺼짐 같은 상태 표현, 연결(어디와 어디가 이어지는지).
- 넣지 말 것: 글자·숫자·라벨, 글자를 가리키는 지시선, 괄호선, 글자 칸·말풍선, 안내 캐릭터, 배경 판·띠·테두리, 확대 표시 원·네모와 잇는 선, 그림 사이 순서 화살표, 색(회색으로 바뀌는 것은 정상).
한 줄에 하나, '- '로 시작, 12줄 이내. 다른 말은 쓰지 마라.`;
}

export function convertCheckPrompt(list, imageKind = 'general') {
  if (imageKind === 'exam') return `첫째 그림은 기출 원본, 둘째 그림은 글자·숫자·문자와 글자를 가리키는 지시선만 지우고 다시 그린 결과다.
글자·지시선이 없어진 것과 글자 칸이 빈 틀로 남은 것은 의도한 변경이니 문제로 보지 마라. 빈 틀·확대 원·화살표·회색 면은 남아 있어야 정상이다.
[A] 아래 목록에서 결과에 빠졌거나 개수·순서·방향·연결이 바뀐 항목만 고른다.
[B] 결과에 남으면 안 되는 것이 남았는지 본다: 글자·숫자·문자, 글자를 가리키던 지시선(한쪽 끝이 허공에 뜬 선).
확실한 것만 쓴다. 애매하면 쓰지 않는다. 항목은 짧은 한국어로, 각각 ${CONVERT_CHECK_LIMITS.maxItems}개 이내.
JSON 한 줄만 답하라: {"missing":["빠지거나 바뀐 것"],"leftover":["남은 것"]}
목록:
${String(list || '').trim()}`;
  return `첫째 그림은 ${kindWord(imageKind)} 원본, 둘째 그림은 그것을 시험지용 흑백 그림으로 다시 그린 결과다.
색이 회색으로 바뀐 것, 글자·라벨·지시선·괄호선·글자 칸·말풍선·안내 캐릭터·배경 판·확대 표시 원과 잇는 선·그림 사이 순서 화살표가 없어진 것은 의도한 변경이니 문제로 보지 마라.
[A] 아래 목록에서 결과에 빠졌거나 개수·순서·방향·연결이 바뀐 항목만 고른다.
[B] 결과에 남으면 안 되는 것이 남았는지 본다: 글자·숫자, 한쪽 끝이 허공에 뜬 지시선, 괄호선, 빈 글자 칸 테두리, 확대 표시 원·잇는 선, 그림 사이 순서 화살표, 배경 판.
확실한 것만 쓴다. 애매하면 쓰지 않는다. 항목은 짧은 한국어로, 각각 ${CONVERT_CHECK_LIMITS.maxItems}개 이내.
JSON 한 줄만 답하라: {"missing":["빠지거나 바뀐 것"],"leftover":["남은 것"]}
목록:
${String(list || '').trim()}`;
}

const cleanItems = value => (Array.isArray(value) ? value : [])
  .map(item => String(item ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, CONVERT_CHECK_LIMITS.maxItems);

// 대조 답(JSON 한 줄, 코드 블록·앞뒤 말 허용)을 읽는다. 읽을 수 없으면 null.
export function parseConvertCheck(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(raw.slice(start, end + 1));
    if (!json || typeof json !== 'object') return null;
    return { missing: cleanItems(json.missing), leftover: cleanItems(json.leftover) };
  } catch { return null; }
}

export const issueCount = issues => (issues?.missing?.length || 0) + (issues?.leftover?.length || 0);
export const issueList = issues => [...(issues?.missing || []).map(text => ({ kind: 'missing', text })),
  ...(issues?.leftover || []).map(text => ({ kind: 'leftover', text }))];

// 다시 그릴 때 붙이는 글. 원래 지시문 뒤 「사용자 요청:」 자리에 들어간다.
export function convertFixRequest(issues) {
  const lines = ['앞서 다시 그린 결과가 원본과 다음 점에서 달랐다. 이번에는 이 항목들을 반드시 바로잡고, 나머지는 지시대로 원본을 따라 그린다.'];
  if (issues?.missing?.length) lines.push(`- 빠졌거나 바뀐 것(원본과 같은 자리·개수·방향으로 그린다): ${issues.missing.join('; ')}`);
  if (issues?.leftover?.length) lines.push(`- 남으면 안 되는 것(깨끗이 지운다): ${issues.leftover.join('; ')}`);
  return lines.join('\n');
}

const abortError = () => new DOMException('작업이 취소되었습니다.', 'AbortError');
const withLimit = (promise, ms, signal) => new Promise((resolve, reject) => {
  let done = false, timer = null;
  const finish = fn => value => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); fn(value); };
  const onAbort = () => finish(reject)(abortError());
  if (signal?.aborted) { onAbort(); return; }
  signal?.addEventListener?.('abort', onAbort, { once: true });
  if (ms > 0) timer = setTimeout(() => finish(reject)(Object.assign(new Error(`응답 없음 ${Math.round(ms / 1000)}초`), { code: 'CHECK_TIMEOUT' })), ms);
  Promise.resolve(promise).then(finish(resolve), finish(reject));
});
const isAbort = (error, signal) => error?.name === 'AbortError' || signal?.aborted;
const short = error => String(error?.message || error || '').slice(0, 160);

// 크기가 같은지(가로세로 비율 2% 안). 크기를 잴 수 없으면(헤드리스 검사) 같다고 본다.
async function sameShape(frameOf, a, b, signal) {
  if (typeof frameOf !== 'function') return true;
  const [fa, fb] = await Promise.all([frameOf(a, signal), frameOf(b, signal)]);
  if (!fa?.width || !fb?.width) return true;
  return Math.abs(fa.width / fa.height - fb.width / fb.height) <= 0.02 * (fa.width / fa.height);
}

/**
 * generateFirst(): 첫 그림 { data, ... }. redraw(fixText): 다시 그린 그림 { data, ... }.
 * readText({ model, text, attachments }) → { text }. 돌려주는 값: { picture, check }.
 * check.status: 'pass' | 'fixed' | 'issues' | 'skipped'. check.differences: 「원본과 다를 수 있는 곳」(표시용).
 */
export async function runConvertCheck({ readText, sourceData, imageKind = 'general', generateFirst, redraw, frameOf = null,
  onPhase = () => {}, signal, limits = CONVERT_CHECK_LIMITS, now = () => Date.now() } = {}) {
  const started = now();
  const timings = {};
  const check = { version: CONVERT_CHECK_VERSION, status: 'skipped', reason: null, differences: [], firstIssues: null, calls: 0, redrawn: false, timings };
  const ask = async (text, attachments, ms) => {
    check.calls++;
    const reply = await withLimit(readText({ model: CONVERT_CHECK_MODEL, text, attachments }), ms, signal);
    return typeof reply?.text === 'string' ? reply.text : '';
  };
  // 목록은 그림 생성과 동시에 시작한다. 실패해도 그림은 그대로 간다.
  const listStarted = now();
  const listPromise = typeof readText === 'function' && sourceData
    ? ask(convertListPrompt(imageKind), [sourceData], limits.listMs).then(text => text.trim() || null, error => { if (isAbort(error, signal)) throw error; check.reason = `목록: ${short(error)}`; return null; })
        .finally(() => { timings.list = now() - listStarted; })
    : Promise.resolve(null);
  listPromise.catch(() => {}); // 생성이 먼저 실패해도 처리되지 않은 거부로 남지 않게.
  const first = await generateFirst();
  let list = null;
  try { list = await listPromise; } catch (error) { if (isAbort(error, signal)) throw error; }
  if (!list) { check.reason ||= typeof readText === 'function' ? '목록 없음' : '글 읽기 연결 없음'; timings.total = now() - started; return { picture: first, check }; }

  const inspect = async (picture, phaseName) => {
    onPhase(phaseName, {});
    const t = now();
    try {
      const text = await ask(convertCheckPrompt(list, imageKind), [sourceData, picture.data], limits.checkMs);
      return parseConvertCheck(text);
    } catch (error) { if (isAbort(error, signal)) throw error; check.reason = `대조: ${short(error)}`; return null; }
    finally { timings[phaseName] = now() - t; }
  };
  const firstIssues = await inspect(first, 'convertCheck');
  check.list = list;
  if (!firstIssues) { timings.total = now() - started; return { picture: first, check }; }
  check.firstIssues = firstIssues;
  if (!issueCount(firstIssues)) { check.status = 'pass'; timings.total = now() - started; return { picture: first, check }; }

  const items = issueList(firstIssues);
  onPhase('convertFix', { count: items.length, missing: firstIssues.missing, leftover: firstIssues.leftover, items });
  const fixStarted = now();
  let second = null;
  try { second = await redraw(convertFixRequest(firstIssues)); }
  catch (error) { if (isAbort(error, signal)) throw error; check.reason = `다시 그리기: ${short(error)}`; }
  finally { timings.convertFix = now() - fixStarted; }
  check.redrawn = Boolean(second?.data);
  let keepFirst = !second?.data;
  if (!keepFirst) {
    try { keepFirst = !(await sameShape(frameOf, first.data, second.data, signal)); if (keepFirst) check.reason = '다시 그린 그림의 크기가 달라 앞 결과를 씀'; }
    catch (error) { if (isAbort(error, signal)) throw error; keepFirst = true; check.reason = `크기 확인: ${short(error)}`; }
  }
  if (keepFirst) {
    check.status = 'issues'; check.differences = items; timings.total = now() - started;
    return { picture: first, check };
  }
  const secondIssues = await inspect(second, 'convertRecheck');
  if (!secondIssues) {
    // 다시 그린 것을 확인하지 못했다: 짚은 항목을 고친 그림이므로 쓰되, 앞서 짚은 곳은 「다를 수 있는 곳」으로 남긴다.
    check.status = 'issues'; check.differences = items; timings.total = now() - started;
    return { picture: second, check };
  }
  check.secondIssues = secondIssues;
  const better = issueCount(secondIssues) <= issueCount(firstIssues);
  const remaining = better ? secondIssues : firstIssues;
  check.status = issueCount(remaining) ? 'issues' : 'fixed';
  check.differences = issueList(remaining);
  if (!better) check.reason = '다시 그린 그림이 더 많이 달라 앞 결과를 씀';
  timings.total = now() - started;
  return { picture: better ? second : first, check };
}

// 11-21: 두 장을 동시에 그려 대조로 고르기(다시 그리기 없음). 시간 상한 ≈ 그림 한 번 + 대조 한 번.
// generate(): 그림 한 장. 한 장이 먼저 끝나고 다른 장이 lateMs 넘게 늦으면 먼저 끝난 장만 본다.
export const CONVERT_DUAL_LATE_MS = 20000;
export async function runConvertCheckDual({ readText, sourceData, imageKind = 'general', generate, onPhase = () => {}, signal,
  limits = CONVERT_CHECK_LIMITS, lateMs = CONVERT_DUAL_LATE_MS, now = () => Date.now() } = {}) {
  const started = now();
  const timings = {};
  const check = { version: CONVERT_CHECK_VERSION, mode: 'dual', status: 'skipped', reason: null, differences: [], calls: 0, redrawn: false, candidates: 0, chosen: 0, timings };
  const ask = async (text, attachments, ms) => {
    check.calls++;
    const reply = await withLimit(readText({ model: CONVERT_CHECK_MODEL, text, attachments }), ms, signal);
    return typeof reply?.text === 'string' ? reply.text : '';
  };
  const listStarted = now();
  const listPromise = typeof readText === 'function' && sourceData
    ? ask(convertListPrompt(imageKind), [sourceData], limits.listMs).then(text => text.trim() || null, error => { if (isAbort(error, signal)) throw error; check.reason = `목록: ${short(error)}`; return null; })
        .finally(() => { timings.list = now() - listStarted; })
    : Promise.resolve(null);
  listPromise.catch(() => {});
  // 두 장을 동시에. 하나라도 그려지면 끝까지 간다(둘 다 실패하면 첫 오류를 던져 기존 실패 처리로).
  const draws = [0, 1].map(index => { const t = now(); return Promise.resolve().then(() => generate(index))
    .then(picture => ({ index, picture, ms: now() - t }), error => ({ index, error, ms: now() - t })); });
  draws.forEach(p => p.catch(() => {}));
  const firstDone = await Promise.race(draws);
  if (signal?.aborted) throw abortError();
  let results = [firstDone];
  const other = draws[1 - firstDone.index];
  const late = Symbol('late');
  // 첫 장이 실패했으면 둘째를 끝까지 기다린다(그림 생성 자체의 시간 제한을 따름). 첫 장이 있으면 lateMs만 더 기다린다.
  let lateTimer = null;
  const second = firstDone.error ? await other
    : await Promise.race([other, new Promise(resolve => { lateTimer = setTimeout(() => resolve(late), lateMs); })]).finally(() => clearTimeout(lateTimer));
  if (second !== late) results.push(second); else check.reason = '둘째 그림이 늦어 첫째만 봄';
  if (signal?.aborted) throw abortError();
  const pictures = results.filter(r => r.picture?.data).sort((a, b) => a.index - b.index);
  timings.draws = results.map(r => r.ms);
  if (!pictures.length) throw results.find(r => r.error)?.error || new Error('그림을 만들지 못했습니다.');
  check.candidates = pictures.length;
  let list = null;
  try { list = await listPromise; } catch (error) { if (isAbort(error, signal)) throw error; }
  const fastest = pictures.slice().sort((a, b) => a.ms - b.ms)[0];
  if (!list) { check.reason ||= typeof readText === 'function' ? '목록 없음' : '글 읽기 연결 없음'; check.chosen = fastest.index; timings.total = now() - started; return { picture: fastest.picture, check }; }
  check.list = list;
  onPhase('convertCheck', { candidates: pictures.length });
  const t = now();
  const verdicts = await Promise.all(pictures.map(async entry => {
    try { return { ...entry, issues: parseConvertCheck(await ask(convertCheckPrompt(list, imageKind), [sourceData, entry.picture.data], limits.checkMs)) }; }
    catch (error) { if (isAbort(error, signal)) throw error; return { ...entry, issues: null, error }; }
  }));
  timings.convertCheck = now() - t;
  const judged = verdicts.filter(v => v.issues);
  if (!judged.length) { check.reason = '대조 실패'; check.chosen = fastest.index; timings.total = now() - started; return { picture: fastest.picture, check }; }
  judged.sort((a, b) => issueCount(a.issues) - issueCount(b.issues) || a.ms - b.ms);
  const best = judged[0];
  check.chosen = best.index;
  check.candidateIssues = verdicts.map(v => ({ index: v.index, count: v.issues ? issueCount(v.issues) : null, issues: v.issues }));
  check.status = issueCount(best.issues) ? 'issues' : 'pass';
  check.differences = issueList(best.issues);
  timings.total = now() - started;
  return { picture: best.picture, check };
}
