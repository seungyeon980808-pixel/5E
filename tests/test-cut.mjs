// 분리 브러시 cutMask 검증: 붙은 두 사각형이 절단선으로 갈라지는지.
import { vectorizeImage } from "file:///C:/Users/user/Desktop/project/51_5E/5E_image_dev/js/image-vectorize.js";

function makeImage(w, h) {
  const data = new Uint8Array(w * h * 4).fill(255);
  const set = (x, y, g) => { const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255; };
  return { width: w, height: h, data, set };
}
const opts = { minArea: 20, dilateRadius: 3, textSizePx: 60, epsilon: 1.2 };

// 붙어 있는 두 검정 사각형 (사이 간격 0 — 한 덩어리)
const W = 160, H = 80;
const img = makeImage(W, H);
for (let y = 20; y < 60; y += 1) for (let x = 20; x < 140; x += 1) img.set(x, y, 0); // 하나로 이어진 긴 사각

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass += 1; console.log(`  ✅ ${n}`); } else { fail += 1; console.log(`  ❌ ${n} ${d}`); } };

// 절단 없음 → 1 덩어리
{
  const { components } = vectorizeImage(img, opts);
  check("절단 없음 → 1 컴포넌트", components.length === 1, `got ${components.length}`);
}

// 세로 절단선 x=80 (폭 6px) → 2 덩어리
{
  const cutMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 77; x < 83; x += 1) cutMask[y * W + x] = 1;
  const { components } = vectorizeImage(img, { ...opts, cutMask });
  check("세로 절단 → 2 컴포넌트", components.length === 2, `got ${components.length}`);
  if (components.length === 2) {
    const centers = components.map((c) => (c.bbox[0] + c.bbox[2]) / 2).sort((a, b) => a - b);
    check("좌/우로 분리됨", centers[0] < 80 && centers[1] > 80, `centers=${centers}`);
  }
}

// 절단선 너무 얇으면(1px) dilate로 재병합될 수 있음 → 폭 필요성 확인
{
  const cutMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) cutMask[y * W + 80] = 1; // 1px만
  const { components } = vectorizeImage(img, { ...opts, cutMask });
  check("1px 절단도 분리 성공(grouped 재확보 덕분)", components.length === 2, `got ${components.length}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
