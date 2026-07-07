// 삐침 재현 2차: 붓글씨 획 끝 같은 "예각 슬리버" — 두 변이 1~3°로 만나는 형태.
// 스캔 재기(jitter)로 LS 피팅 직선이 평행+오프셋이 되면 교점이 축방향으로 발산하는지.
import { vectorizeImage } from "../js/image-vectorize.js";

function makeImage(w, h) {
  const data = new Uint8Array(w * h * 4).fill(255);
  return { width: w, height: h, data,
    set(x, y, g) { x = Math.round(x); y = Math.round(y); if (x < 0 || x >= w || y < 0 || y >= h) return;
      const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255; } };
}
const opts = { minArea: 25, dilateRadius: 3, textSizePx: 22, epsilon: 1.2 };

function spikeReport(name, img) {
  const { components } = vectorizeImage(img, opts);
  let worst = 0, worstPt = null;
  for (const c of components) {
    if (!c.loops) continue;
    const [bx0, by0, bx1, by1] = c.bbox;
    for (const loop of c.loops) for (const [x, y] of loop.points) {
      const d = Math.hypot(Math.max(bx0 - x, 0, x - bx1), Math.max(by0 - y, 0, y - by1));
      if (d > worst) { worst = d; worstPt = [Math.round(x), Math.round(y)]; }
    }
  }
  console.log(`[${name}] 최대 bbox 이탈 ${worst.toFixed(1)}px ${worstPt ? "@" + worstPt : ""} ${worst > 15 ? "❌ 삐침 재현!" : worst > 5 ? "⚠ 경미" : "✅"}`);
  return worst;
}

// 예각 슬리버: 왼쪽 두께 T에서 오른쪽 끝 0으로 수렴 (붓 획 끝/AA 잔여물 모양) + 상하 재기.
function sliver(img, x0, x1, yMid, T, seed) {
  let rnd = seed;
  const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280 - 0.5; };
  for (let x = x0; x <= x1; x += 1) {
    const t = T * (1 - (x - x0) / (x1 - x0));            // 선형 수렴
    const jt = rand() * 1.4;                              // 스캔 재기 ±0.7px
    const top = yMid - t / 2 + jt, bot = yMid + t / 2 + jt;
    for (let y = Math.round(top); y <= Math.round(bot); y += 1) img.set(x, y, 0);
  }
}

for (const [T, len, seed] of [[4, 60, 7], [3, 50, 13], [5, 70, 3], [4, 45, 21], [3, 65, 42]]) {
  const img = makeImage(160, 60);
  sliver(img, 20, 20 + len, 30, T, seed);
  spikeReport(`슬리버 T=${T} len=${len} seed=${seed}`, img);
}

// 교차형: 획 두 개가 얕은 각도로 만나는 V (ㅅ 획 유사)
{
  const img = makeImage(160, 90);
  const bar = (x0, y0, x1, y1, t) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i += 1) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let k = 0; k < t; k += 1) img.set(x, y + k, 0); } };
  bar(30, 20, 75, 70, 3);   // 사선 1
  bar(75, 70, 120, 24, 3);  // 사선 2 (V자)
  spikeReport("V자(ㅅ 유사) 3px", img);
}
