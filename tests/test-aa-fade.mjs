// 증상 재현: (A) 선명한 검정 선이 흐려짐, (B) 글자 획 소실.
// 가설: 스캔/AA 이미지에서 획 경계의 중간 회색 픽셀이 §2-1 다단계에서
//  ① 별도 회색 레벨로 방출되어 검정 선 밑에 "회색 유령"이 깔리고(blur),
//  ② fillLevel 중앙값 측정이 AA 픽셀에 오염되어 연하게 측정되고(fade),
//  ③ 검정 코어가 조각나 minArea에 걸려 획이 소실된다(글자).
import { vectorizeImage } from "../js/image-vectorize.js";

function makeImage(w, h) {
  const data = new Uint8Array(w * h * 4).fill(255);
  return { width: w, height: h, data,
    set(x, y, g) { x = Math.round(x); y = Math.round(y); if (x < 0 || x >= w || y < 0 || y >= h) return;
      const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255; } };
}
const opts = { minArea: 25, dilateRadius: 3, textSizePx: 22, epsilon: 1.2 };
function report(name, img) {
  const { components } = vectorizeImage(img, opts);
  console.log(`\n[${name}] 컴포넌트 ${components.length}개`);
  components.forEach((c, i) => {
    const kinds = c.ellipse ? "ellipse" : (c.loops || []).map((l) => `${l.isHole ? "hole" : "out"}:fill=${l.fillLevel}`).join(" ");
    console.log(`  #${i} level=${c.level} bbox=[${c.bbox}] isText=${c.isText} ${kinds}`);
  });
  return components;
}

// ── A. AA 있는 2px 검정 수평선 (코어 g20, 상하 1px 헤일로 g150) ──
{
  const img = makeImage(200, 40);
  for (let x = 20; x < 180; x += 1) {
    img.set(x, 19, 150); img.set(x, 20, 20); img.set(x, 21, 20); img.set(x, 22, 150); // AA 라인
  }
  const comps = report("A. AA 검정선(코어20+헤일로150)", img);
  const ghost = comps.filter((c) => c.loops && c.loops.some((l) => l.fillLevel > 90));
  console.log(ghost.length ? `  ⚠ 회색 유령 ${ghost.length}개 방출됨 (blur 재현)` : "  (유령 없음)");
}

// ── B. 코어 없는 1px 연회색 선 — 저해상 스캔에서 '분명한 선'이 g110으로 스캔된 경우 ──
{
  const img = makeImage(200, 30);
  for (let x = 20; x < 180; x += 1) img.set(x, 15, 110);
  const comps = report("B. 1px 선(g110, 코어 없음)", img);
  const faded = comps.some((c) => c.loops && c.loops.some((l) => !l.isHole && l.fillLevel > 90));
  console.log(faded ? "  ⚠ 선이 fillLevel>90 회색으로 방출 (fade 재현)" : "  (정상 검정)");
}

// ── C. 글자 획 시뮬레이션: 검정 코어가 군데군데 끊긴 가는 획 (스캔 특성) ──
//   세로획 20px 중 코어(g30)는 4px 조각 3개, 사이는 AA(g150)만 존재.
{
  const img = makeImage(60, 40);
  const x = 30;
  for (let y = 8; y < 28; y += 1) img.set(x, y, 150);           // 전체는 회색으로 이어짐
  for (const y0 of [8, 16, 24]) for (let y = y0; y < y0 + 4; y += 1) img.set(x, y, 30); // 코어 조각
  const comps = report("C. 끊긴 코어 가는 획", img);
  const darkOut = comps.filter((c) => c.loops && c.loops.some((l) => !l.isHole && l.fillLevel <= 90));
  console.log(darkOut.length === 0 ? "  ⚠ 어두운 획이 하나도 안 남음 (획 소실/흐려짐 재현)"
    : `  어두운 성분 ${darkOut.length}개 유지`);
}
