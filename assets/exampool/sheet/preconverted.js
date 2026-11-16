// 미리 변환한 기출(11-03 밤): 「변형」과 같은 엔진으로 밤새 바꿔 둔 문항 JSON을 정적 주소에서 받아 쓴다 — PDF 받기·변환이 없어 0.5초 안쪽.
// 엔진이 바뀌면 열쇠(KEY)가 달라 옛 파일은 쓰지 않고 그 자리에서 바꾼다. 열쇠는 exam-pdf/engine-key.cjs가 만든 값과 같아야 한다(검사 test-preconverted-key).
// 다시 만들기: node exam-pdf/preconvert.cjs (+ --source=hakpyeong) → exam-pdf/build-site.mjs → deploy.
export const PRECONVERTED_KEY = '30d4d036828d';
const HOSTS = { kice: 'https://5e-exam-pdf.5e-desktop.workers.dev/q/', hakpyeong: 'https://5e-exam-hak.5e-desktop.workers.dev/q/' };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// 같은 기출을 두 번 가져와도 카드·칸·줄의 id가 겹치지 않게 모든 id를 새로 매긴다(같은 옛 id는 같은 새 id로).
export function freshIds(value) {
  const map = new Map();
  return JSON.parse(JSON.stringify(value).replace(UUID, id => map.get(id) || (map.set(id, crypto.randomUUID()), map.get(id))));
}

// 받은 파일은 잠깐 기억한다 — 크게 보기·고르기 때 미리 받아 두면(prefetchPreconverted) 「변형」을 누를 때 기다리지 않는다. 최근 12개만.
const fetched = new Map();
function load(item, timeout) {
  const hit = fetched.get(item.id);if (hit) { fetched.delete(item.id);fetched.set(item.id, hit);return hit; }
  const host = /^학력평가\//.test(item.publicPath || '') ? HOSTS.hakpyeong : HOSTS.kice;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  const work = fetch(host + encodeURIComponent(item.id) + '.json', { credentials: 'omit', signal: controller.signal })
    .then(r => r.ok ? r.json() : null).catch(() => null).finally(() => clearTimeout(timer));
  fetched.set(item.id, work);work.then(v => { if (!v && fetched.get(item.id) === work) fetched.delete(item.id); });
  while (fetched.size > 12) fetched.delete(fetched.keys().next().value);
  return work;
}
const usable = item => item?.id && /^[\w.-]+$/.test(item.id);
export function prefetchPreconverted(item) { if (usable(item)) void load(item, 8000); }

export async function preconverted(item, { timeout = 4000 } = {}) {
  if (!usable(item)) return null;
  const saved = await load(item, timeout);
  if (saved?.v !== PRECONVERTED_KEY || saved.id !== item.id || !saved.question) return null;
  return { question: freshIds(saved.question), diag: saved.diag || { notes: [] } };
}
