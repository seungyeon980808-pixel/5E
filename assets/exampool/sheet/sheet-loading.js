// 시험지 쪽 로딩 창(11-15 사용자: 「쪽에 배치하는 중」이 70%에 멈춰 답답함, 이미지 변환처럼 블러가 서서히 걷히게 — 시안 flow-1115 D).
// - 흐린 그림: 지난번 그린 이 시험지 1~2쪽 사진(없으면 빈 종이 모양)이 진행에 맞춰 선명해진다(BlurReveal, 이미지 변환과 같은 효과).
//   11-15(시안 로딩창-1115): 쪽 칸 가운데 작은 상자(약 130px로 줄어 보였음)가 아니라, 다 그렸을 때 쪽이 놓일 자리·크기 그대로
//   쪽 모양 칸(.pv-ldpg — .pv-pg와 같은 폭 규칙)에 걷히고, 단계 글씨는 가운데 작은 반투명 판(.pv-ldpill)에.
// - 막대: 단계마다 지난번 걸린 시간만큼 쉬지 않고 나아간다. 한글 엔진 계산 중에도 끊기지 않도록 시간 기준 애니메이션(transform)만 쓴다.
// - 큰 글씨는 지금 단계 이름만, 숫자(32/32)는 쓰지 않는다. 아래 작은 단계 줄에서 지난 단계는 초록.
import { BlurReveal } from '../../../js/loading/blur-reveal.js?v=1.7.0-four-session-integration';

const NAMES = { items: '문항 조판', form: '학교 양식에 맞추기', place: '쪽에 배치하는 중', check: '걸친 문항 확인', fill: '단 아래 채우기', draw: '쪽 그리기' };
const SHORT = { items: '문항 조판', form: '양식 맞추기', place: '1차 배치', check: '걸친 문항 확인', fill: '단 아래 채우기', draw: '쪽 그리기' };
const ORDER = { form: ['items', 'form', 'place', 'check', 'fill', 'draw'], plain: ['items', 'place', 'draw'] };
// 기록이 없을 때 단계별 어림(ms) — 대왕중 양식 32문항 실측 기준.
const GUESS = { form: { items: 500, form: 500, place: 1700, check: 1600, fill: 450, draw: 500 }, plain: { items: 500, place: 900, draw: 400 } };
const TIME_KEY = kind => `5e.sheet.stageMs.${kind}`;
const SNAP_KEY = id => `5e.sheet.snap2.${id}`, SNAP_LIST = '5e.sheet.snap2.list', SNAP_KEEP = 6; // 쪽 칸 크기 사진은 커서(시험지마다 ~180KB) 최근 6개만
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

// 빈 종이 모양(처음 그리는 시험지): 쪽 하나, 2단 글줄.
function skeleton(w = 257, h = 364) {
  const W = 600, H = Math.round(W * h / w), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c9ced6'; g.fillRect(W / 2, 40, 1.5, H - 80);
  const lh = 15, colW = W / 2 - 60;
  for (const cx of [32, W / 2 + 28]) for (let y = 48, i = 0; y < H - 44; y += lh, i++) { if (i % 9 === 8) { y += 10; continue; } g.fillRect(cx, y, (i % 9 === 0 ? colW * .62 : colW) - (i % 4) * 12, 5); }
  return c;
}

export function sheetLoader(n, { kind = 'plain', examId = '' } = {}) {
  const order = ORDER[kind] || ORDER.plain, exp = expected(kind), total = order.reduce((a, k) => a + exp[k], 0);
  const at = {}; let acc = 0; for (const k of order) { at[k] = [acc / total, (acc + exp[k]) / total]; acc += exp[k]; }
  const snap = examId && store.get(SNAP_KEY(examId)), shots = Array.isArray(snap?.pages) && snap.pages.length ? snap.pages.slice(0, 2) : [{ w: 257, h: 364 }, { w: 257, h: 364 }];
  n.classList.add('pv-loading');
  n.innerHTML = shots.map(p => `<figure class="pv-ldpg" aria-hidden="true" style="aspect-ratio:${p.w}/${p.h}"><div class="pv-blur"></div></figure>`).join('')
    + `<div class="pv-ldpill" role="status" aria-live="polite"><b>${NAMES[order[0]]}</b><span class="pv-bar"><i></i></span><span class="pv-steps">${order.map(k => `<span data-k="${k}">${SHORT[k]}</span>`).join('<em>·</em>')}</span></div>`;
  const box = n.querySelector('.pv-ldpill'), bar = box.querySelector('.pv-bar i'), title = box.querySelector('b');
  // 판은 지금 보이는 쪽 칸의 가운데(스크롤 칸 n의 위쪽 기준).
  const place = () => { box.style.top = `${Math.round(n.scrollTop + Math.min(n.clientHeight, innerHeight) * .45)}px`; }; place();
  // 흐린 그림: 진행과 같은 시간에 걸쳐 걷힌다(시간 기준 — 엔진이 화면 줄을 잡고 있어도 움직임).
  const reveals = [];
  n.querySelectorAll('.pv-ldpg .pv-blur').forEach((pic, i) => {
    try { const r = BlurReveal.attach(pic, { variant: 'fade', fit: 'cover', revealMs: Math.max(1500, total * 1.15), startBlur: 0.06, residualBlur: 0.008 }); r.start(shots[i].url || skeleton(shots[i].w, shots[i].h)); reveals.push(r); } catch {}
  });
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
      for (const r of reveals) { try { r.destroy(); } catch {} }
      n.classList.remove('pv-loading');
    },
  };
}

// 다 그린 뒤 한가할 때 이 시험지 1~2쪽 사진을 기억한다(다음 로딩의 흐린 그림, 쪽 칸 크기에 맞춘 해상도). 실패해도 조용히 넘어간다.
export function rememberSheet(examId, pages) {
  if (!examId || !pages?.length) return;
  const run = async () => {
    try {
      const out = [];
      for (const p of pages.slice(0, 2)) {
        const W = 640, H = Math.round(W * p.height / p.width), c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
        const url = URL.createObjectURL(new Blob([p.svg], { type: 'image/svg+xml' }));
        try { const img = new Image(); img.src = url; await img.decode(); g.drawImage(img, 0, 0, W, H); } finally { URL.revokeObjectURL(url); }
        out.push({ w: Math.round(p.width), h: Math.round(p.height), url: c.toDataURL('image/jpeg', 0.6) });
      }
      store.set(SNAP_KEY(examId), { pages: out });
      // 최근 SNAP_KEEP개만 남긴다(옛 작은 사진 키 5e.sheet.snap.<id>도 함께 지움).
      const list = [examId, ...(store.get(SNAP_LIST) || []).filter(id => id !== examId)];
      for (const id of list.slice(SNAP_KEEP)) { try { localStorage.removeItem(SNAP_KEY(id)); } catch {} }
      store.set(SNAP_LIST, list.slice(0, SNAP_KEEP));
      try { localStorage.removeItem(`5e.sheet.snap.${examId}`); } catch {}
    } catch {}
  };
  (window.requestIdleCallback || (f => setTimeout(f, 400)))(() => void run(), { timeout: 4000 });
}
