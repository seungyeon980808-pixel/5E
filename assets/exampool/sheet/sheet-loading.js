// 시험지 쪽 로딩 창(11-15 사용자: 「쪽에 배치하는 중」이 70%에 멈춰 답답함, 이미지 변환처럼 블러가 서서히 걷히게 — 시안 flow-1115 D).
// - 흐린 그림: 지난번 그린 이 시험지 1~2쪽 작은 사진(없으면 빈 종이 모양)이 진행에 맞춰 선명해진다(BlurReveal, 이미지 변환과 같은 효과).
// - 막대: 단계마다 지난번 걸린 시간만큼 쉬지 않고 나아간다. 한글 엔진 계산 중에도 끊기지 않도록 시간 기준 애니메이션(transform)만 쓴다.
// - 큰 글씨는 지금 단계 이름만, 숫자(32/32)는 쓰지 않는다. 아래 작은 단계 줄에서 지난 단계는 초록.
import { BlurReveal } from '../../../js/loading/blur-reveal.js?v=1.7.0-four-session-integration';

const NAMES = { items: '문항 조판', form: '학교 양식에 맞추기', place: '쪽에 배치하는 중', check: '걸친 문항 확인', fill: '단 아래 채우기', draw: '쪽 그리기' };
const SHORT = { items: '문항 조판', form: '양식 맞추기', place: '1차 배치', check: '걸친 문항 확인', fill: '단 아래 채우기', draw: '쪽 그리기' };
const ORDER = { form: ['items', 'form', 'place', 'check', 'fill', 'draw'], plain: ['items', 'place', 'draw'] };
// 기록이 없을 때 단계별 어림(ms) — 대왕중 양식 32문항 실측 기준.
const GUESS = { form: { items: 500, form: 500, place: 1700, check: 1600, fill: 450, draw: 500 }, plain: { items: 500, place: 900, draw: 400 } };
const TIME_KEY = kind => `5e.sheet.stageMs.${kind}`;
const SNAP_KEY = id => `5e.sheet.snap.${id}`;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function expected(kind) {
  const saved = store.get(TIME_KEY(kind)) || {}, guess = GUESS[kind], out = {};
  for (const k of ORDER[kind]) { const v = (saved[k] || []).filter(n => n >= 1).sort((a, b) => a - b); out[k] = Math.max(40, v.length ? v[v.length >> 1] : guess[k]); }
  return out;
}
function remember(kind, took) {
  const saved = store.get(TIME_KEY(kind)) || {};
  for (const [k, ms] of Object.entries(took)) if (ms >= 1) saved[k] = [...(saved[k] || []), Math.round(ms)].slice(-7);
  store.set(TIME_KEY(kind), saved);
}

// 빈 종이 모양(처음 그리는 시험지): 두 쪽, 2단 글줄.
function skeleton() {
  const c = document.createElement('canvas'), W = 520, H = 368; c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
  for (const x0 of [10, 266]) {
    g.fillStyle = '#fff'; g.fillRect(x0, 8, 244, 352);
    g.fillStyle = '#c9ced6'; g.fillRect(x0 + 122, 22, 1, 322);
    for (const cx of [x0 + 14, x0 + 132]) for (let y = 24, i = 0; y < 340; y += 9, i++) { if (i % 9 === 8) { y += 6; continue; } g.fillRect(cx, y, (i % 9 === 0 ? 70 : 98) - (i % 4) * 6, 3); }
  }
  return c;
}

export function sheetLoader(n, { kind = 'plain', examId = '' } = {}) {
  const order = ORDER[kind] || ORDER.plain, exp = expected(kind), total = order.reduce((a, k) => a + exp[k], 0);
  const at = {}; let acc = 0; for (const k of order) { at[k] = [acc / total, (acc + exp[k]) / total]; acc += exp[k]; }
  n.innerHTML = `<div class="pv-load pv-load2" role="status" aria-live="polite"><div class="pv-blur" aria-hidden="true"></div><b>${NAMES[order[0]]}</b><span class="pv-bar"><i></i></span><span class="pv-steps">${order.map(k => `<span data-k="${k}">${SHORT[k]}</span>`).join('<em>·</em>')}</span></div>`;
  const box = n.querySelector('.pv-load2'), bar = box.querySelector('.pv-bar i'), title = box.querySelector('b'), pic = box.querySelector('.pv-blur');
  const snap = examId && store.get(SNAP_KEY(examId));
  // 흐린 그림: 진행과 같은 시간에 걸쳐 걷힌다(시간 기준 — 엔진이 화면 줄을 잡고 있어도 움직임).
  let reveal = null;
  try { reveal = BlurReveal.attach(pic, { variant: 'fade', fit: 'contain', revealMs: Math.max(1500, total * 1.15), startBlur: 0.09, residualBlur: 0.012 }); reveal.start(snap || skeleton()); } catch { reveal = null; }
  let cur = '', t0 = performance.now(), tStage = t0, anim = null, scale = 0;
  const took = {};
  const nowScale = () => { const m = getComputedStyle(bar).transform; const v = m && m !== 'none' ? Number(m.slice(7).split(',')[0]) : scale; return Number.isFinite(v) ? v : scale; };
  const go = (to, ms) => { const from = nowScale(); scale = Math.max(from, to); anim?.cancel(); if (reduced()) { bar.style.transform = `scaleX(${scale})`; return; }
    anim = bar.animate([{ transform: `scaleX(${from})` }, { transform: `scaleX(${scale})` }], { duration: Math.max(120, ms), easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'forwards' }); };
  const enter = k => {
    if (k === cur || !at[k]) return; const now = performance.now(); if (cur) took[cur] = (took[cur] || 0) + now - tStage; cur = k; tStage = now;
    title.textContent = NAMES[k]; const i = order.indexOf(k);
    box.querySelectorAll('.pv-steps [data-k]').forEach(s => { const j = order.indexOf(s.dataset.k); s.className = j < i ? 'done' : j === i ? 'on' : ''; });
    // 단계 끝 조금 앞까지 그 단계의 어림 시간에 걸쳐 나아간다(늦어지면 거기서 천천히 기다림 — 뒤로 가지 않음).
    go(at[k][0] + (at[k][1] - at[k][0]) * 0.92, exp[k]);
  };
  go(0.02, 200);
  return {
    update(p) {
      if (!p?.stage) return; enter(p.stage);
      if (p.n && at[p.stage]) { const [a, b] = at[p.stage]; go(a + (b - a) * Math.min(1, p.i / p.n), 220); }
    },
    done(ok = true) {
      anim?.cancel(); if (cur) took[cur] = (took[cur] || 0) + performance.now() - tStage;
      // 건너뛴 단계(지난 단 나눔이 맞아 「걸친 문항 확인」이 없던 때 등)는 아주 짧게 기록해 다음 막대 몫이 줄게 한다.
      if (ok) { for (const k of order) if (!took[k]) took[k] = 1; remember(kind, took); }
      try { reveal?.destroy(); } catch {}
    },
  };
}

// 다 그린 뒤 한가할 때 이 시험지 1~2쪽 작은 사진을 기억한다(다음 로딩의 흐린 그림). 실패해도 조용히 넘어간다.
export function rememberSheet(examId, pages) {
  if (!examId || !pages?.length) return;
  const run = async () => {
    try {
      const W = 520, H = 368, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#0d1117'; g.fillRect(0, 0, W, H);
      for (const [i, p] of pages.slice(0, 2).entries()) {
        const url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }));
        try { const img = new Image(); img.src = url; await img.decode(); const h = 352, w = Math.min(244, h * p.width / p.height); g.fillStyle = '#fff'; g.fillRect(10 + i * 256, 8, w, h); g.drawImage(img, 10 + i * 256, 8, w, h); }
        finally { URL.revokeObjectURL(url); }
      }
      store.set(SNAP_KEY(examId), c.toDataURL('image/jpeg', 0.62));
    } catch {}
  };
  (window.requestIdleCallback || (f => setTimeout(f, 400)))(() => void run(), { timeout: 4000 });
}
