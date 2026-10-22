// 시험지 출제 점검·요약(10-22 시험지 편집 기능 분석 4·5절). 화면(시험지 한눈에)·엑셀 내려받기·나형 순서가 함께 쓴다. 순수 계산만.
export const ANSWER_MARK = ['①', '②', '③', '④', '⑤'];
const objective = q => q.type !== '서술형';

export function examStats(qs) {
  const answers = [0, 0, 0, 0, 0], types = new Map(), units = new Map(), standards = new Map();
  for (const q of qs) {
    if (objective(q) && Number.isInteger(q.answer)) answers[q.answer]++;
    types.set(q.type, (types.get(q.type) || 0) + 1);
    if (q.unitLarge) units.set(q.unitLarge, (units.get(q.unitLarge) || 0) + 1);
    if (q.standardCode) standards.set(q.standardCode, (standards.get(q.standardCode) || 0) + 1);
  }
  return { count: qs.length, points: qs.reduce((a, q) => a + (Number(q.points) || 0), 0), answers, types: [...types], units: [...units], standards: [...standards] };
}

// 출제 점검: [{level:'warn'|'info', text, ids:[문항 id]}] — 시험지 순서(qs)대로.
export function examChecks(qs, { ready = () => true } = {}) {
  const out = [], no = q => `${qs.indexOf(q) + 1}번`;
  const add = (level, list, text) => { if (list.length) out.push({ level, text: `${text}: ${list.map(no).join(', ')}`, ids: list.map(q => q.id) }); };
  add('warn', qs.filter(q => objective(q) && !Number.isInteger(q.answer)), '정답을 정하지 않은 문항');
  add('warn', qs.filter(q => !(Number(q.points) > 0)), '배점이 없는 문항');
  add('warn', qs.filter(q => !String(q.ask || '').trim()), '발문이 비어 있는 문항');
  add('info', qs.filter(q => !ready(q)), '한글 조판을 저장하지 않은 문항');
  const dupChoices = qs.filter(q => { const t = (q.choices || []).map(c => String(c.text || '').replace(/\s+/g, '')).filter(Boolean); return new Set(t).size !== t.length; });
  add('warn', dupChoices, '선지 글이 겹치는 문항');
  // 같은 정답이 3번 넘게 이어짐(객관식 순서대로)
  const obj = qs.filter(q => objective(q) && Number.isInteger(q.answer));
  for (let i = 0; i + 2 < obj.length; i++) {
    if (obj[i].answer === obj[i + 1].answer && obj[i].answer === obj[i + 2].answer) {
      let j = i + 2; while (j + 1 < obj.length && obj[j + 1].answer === obj[i].answer) j++;
      const run = obj.slice(i, j + 1); out.push({ level: 'warn', text: `정답 ${ANSWER_MARK[obj[i].answer]}이 ${run.length}번 이어짐: ${run.map(no).join(', ')}`, ids: run.map(q => q.id) }); i = j;
    }
  }
  const s = examStats(qs);
  if (qs.length && s.points !== 100) out.push({ level: 'info', text: `배점 합계 ${s.points}점(100점이 아님)`, ids: [] });
  const counts = s.answers, total = counts.reduce((a, b) => a + b, 0);
  if (total >= 10) { const max = Math.max(...counts), min = Math.min(...counts); if (max - min > Math.ceil(total / 5)) out.push({ level: 'info', text: `정답 분포가 치우침(${counts.map((n, i) => ANSWER_MARK[i] + n).join(' ')})`, ids: [] }); }
  return out;
}

// 이원목적분류표·정답표 행(엑셀 두 시트)
export function blueprintRows(qs) {
  const head = ['번호', '유형', '대단원', '중단원', '소단원', '성취기준', '배점', '정답'];
  return [head, ...qs.map((q, i) => [i + 1, q.type, q.unitLarge || '', q.unitMiddle || '', q.unitSmall || '', q.standardCode || '', Number(q.points) || 0, objective(q) ? (Number.isInteger(q.answer) ? ANSWER_MARK[q.answer] : '') : '서술형'])];
}
export function answerRows(qs, order = qs.map(q => q.id)) {
  return [['번호', '정답', '배점'], ...order.map((id, i) => { const q = qs.find(x => x.id === id); return [i + 1, objective(q) ? (Number.isInteger(q.answer) ? ANSWER_MARK[q.answer] : '') : '서술형', Number(q.points) || 0]; })];
}

// 나형 순서: 같은 시험지 문항을 섞되(씨앗으로 늘 같게) 묶음 지문 문항처럼 옮기면 안 되는 것은 없다고 본다(ExamPool 문항은 하나씩).
export function shuffledOrder(ids, seed = 1) {
  const out = [...ids]; let x = seed >>> 0 || 1;
  const rand = () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  if (out.length > 1 && out.every((id, i) => id === ids[i])) [out[0], out[1]] = [out[1], out[0]];
  return out;
}
