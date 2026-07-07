/* ===== IMAGE LINE EXTRACT — 가는 획 → 중심선(획) 추출 (명세 §8 단계 A) =====
//
// 순수 함수 모듈 (DOM/스토어 접근 없음) — Node 단위 테스트 가능. cut-geometry.js
// 스타일 참고. image-vectorize.js의 판정 사다리 §2-⑤(가는 획 망)가 이 모듈을 쓴다.
//
//   extractStrokes(getInk, x0, y0, x1, y1) →
//     null | { paths:[{kind,points,thicknessPx}], isResidualInk(x,y), coverage }
//
// 흐름: 지역 마스크 → Zhang–Suen 세선화(중심선) → 이웃≥3 분기점 제거로 경로 토막
//   → 경로 추적 → RDP + 급꺾임(≥35°) 분할 → 경로별 굵기 샘플 → 게이트 통과분만 수락.
// 획으로 설명 안 된 잉크(화살촉 등)는 isResidualInk로 잔여 조각(폴백 폴리곤) 몫으로 넘긴다.
//
// 게이트(명세 §2 시작값 그대로 상수):
//   · 굵기 ≤ 8px, 굵기 변동계수(CV) ≤ 0.35, 길이 ≥ 3×굵기
//   · 직선 판정: 현(chord) 이탈 ≤ max(1.5px, 현 길이의 4%), 급꺾임 분할 각 ≥ 35°
//   · 컴포넌트 수락: 획들이 잉크의 ≥ 60%를 설명(미달 시 null → 호출부 현행 폴백)
//
// 안전: 어떤 입력에도 예외를 밖으로 던지지 않는다 — 실패·이상은 전부 null. */

// ---- 게이트 상수 (명세 §2) ----
const MAX_THICK_PX = 8;       // 평균 굵기 상한
const THICK_CV_MAX = 0.35;    // 굵기 변동계수 상한
const MIN_LEN_RATIO = 3;      // 길이 ≥ 3×굵기
const CHORD_DEV_ABS = 1.5;    // 직선 판정 현이탈 절대 하한(px)
const CHORD_DEV_REL = 0.04;   // 직선 판정 현이탈 비율(현 길이의 4%)
const SHARP_ANGLE_DEG = 35;   // 급꺾임 분할 각(도)
const COVERAGE_MIN = 0.6;     // 컴포넌트 수락 커버리지
const RDP_EPS = 1.2;          // 경로 단순화 허용 오차(px) — 세선화 계단 잡음 흡수

// ---- 소소 기하 ----
function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.hypot(dx, dy); }

// 점 (px,py)에서 선분 (ax,ay)-(bx,by)까지 수직거리.
function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return dist(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return dist(px, py, ax + dx * t, ay + dy * t);
}

// 폴리라인 총 길이(px).
function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  return L;
}

/* ----- 지역 마스크 만들기: bbox 안의 잉크를 1픽셀 여백 둘러 이진 배열로 ----- */
// getInk(x,y): 이 컴포넌트의 잉크 여부. bbox(x0..x1, y0..y1) 밖은 무시.
// 반환: { data(Uint8, 여백 포함), W, H, ox, oy } — 로컬(lx,ly) = 원본(ox+lx, oy+ly).
function buildLocalMask(getInk, x0, y0, x1, y1) {
  const pad = 1;
  const ox = Math.floor(Math.min(x0, x1)) - pad;
  const oy = Math.floor(Math.min(y0, y1)) - pad;
  const ex = Math.ceil(Math.max(x0, x1)) + pad;
  const ey = Math.ceil(Math.max(y0, y1)) + pad;
  const W = ex - ox + 1, H = ey - oy + 1;
  if (W < 3 || H < 3 || W * H > 4_000_000) return null; // 이상 크기 방어
  const data = new Uint8Array(W * H);
  let ink = 0;
  for (let ly = 0; ly < H; ly++) {
    for (let lx = 0; lx < W; lx++) {
      if (getInk(ox + lx, oy + ly)) { data[ly * W + lx] = 1; ink += 1; }
    }
  }
  if (ink < 3) return null;
  return { data, W, H, ox, oy, ink };
}

/* ----- Zhang–Suen 세선화: 이진 마스크 → 1픽셀 폭 중심선 ----- */
// 표준 2-서브패스 알고리즘. 원본 mask는 안 건드리고 복사본을 깎는다.
function zhangSuenThin(src, W, H) {
  const img = src.slice();
  const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : img[y * W + x]);
  let changed = true;
  let guard = 0;
  const toClear = [];
  while (changed && guard < 200) {
    changed = false;
    guard += 1;
    for (let step = 0; step < 2; step++) {
      toClear.length = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          if (img[y * W + x] !== 1) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y);
          const p5 = at(x + 1, y + 1), p6 = at(x, y + 1), p7 = at(x - 1, y + 1);
          const p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          // 0→1 전이 수 A
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let A = 0;
          for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) A += 1;
          if (A !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          toClear.push(y * W + x);
        }
      }
      if (toClear.length) { changed = true; for (const idx of toClear) img[idx] = 0; }
    }
  }
  return img;
}

/* ----- 스켈레톤 후처리: 여분 픽셀 제거로 계단 이중선 → 진짜 1px ----- */
// Zhang–Suen 결과의 대각 계단에서 2×2 꽉 찬 블록이 남아 가짜 분기점(이웃≥3)을
// 만든다. 8-연결을 깨지 않으면서 지워도 되는 픽셀(이웃 중 하나로 우회 가능)을 제거해
// 곡선이 잘게 토막나는 것을 막는다. 반복해 안정될 때까지.
function pruneRedundant(src, W, H) {
  const img = src.slice();
  const at = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? 0 : img[y * W + x]);
  let changed = true, guard = 0;
  while (changed && guard < 20) {
    changed = false; guard += 1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!img[y * W + x]) continue;
        // 이 픽셀을 지워도 8-이웃들이 서로 연결돼 있으면(=여분) 제거.
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1),
          at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const cnt = p.reduce((s, v) => s + v, 0);
        if (cnt < 3) continue; // 끝점/직선 통과점은 놔둔다
        // 8-연결 성분 수(순환 배열에서 1→0 전이 대신 0→1 전이 수).
        let trans = 0;
        for (let k = 0; k < 8; k++) if (p[k] === 0 && p[(k + 1) % 8] === 1) trans += 1;
        if (trans === 1) { img[y * W + x] = 0; changed = true; } // 단일 성분=여분(제거 안전)
      }
    }
  }
  return img;
}

/* ----- 스켈레톤 이웃 수 세기 ----- */
function neighborCount(skel, W, H, x, y) {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && skel[ny * W + nx]) n += 1;
    }
  }
  return n;
}

/* ----- 방향 추종 추적: 스켈레톤을 헤딩 유지하며 걸어 경로 토막으로 ----- */
// 분기점을 미리 지우지 않는다(계단 이중선이 가짜 분기점을 만들기 때문). 대신:
//   · 끝점(이웃 1)에서 출발, 매 스텝 현 진행방향과 가장 잘 이어지는 미방문 이웃 선택
//   · 걸으며 visited 표시 → 계단 여분 픽셀·2폭 띠도 소비되어 곡선이 한 경로로 이어짐
//   · 진짜 3갈래(X 교차 등)는 한 팔을 다 소비한 뒤 다른 끝점 출발이 교차 중심(방문됨)서
//     막혀 자연히 토막난다.
// 반환: [{ pixels:[{x,y}(로컬)] }].
function tracePaths(skel, W, H) {
  // 진짜 교차(3갈래 이상)만 토막낸다. 이웃≥3 픽셀을 군집으로 묶고, 그 군집을
  // 지웠을 때 팔(연결 성분)이 ≥3개면 교차 → 군집 전체를 분기점으로 제거. 계단 이중선
  // 군집은 팔이 2개뿐이라 안 지워지고, 곡선/직선은 온전히 한 경로로 남는다.
  const walk = skel.slice();
  const junction = new Uint8Array(W * H);
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (skel[y * W + x]) cells.push(y * W + x);

  // 이웃≥3 후보를 인접끼리 군집화.
  const cand = new Uint8Array(W * H);
  for (const idx of cells) {
    const x = idx % W, y = (idx - (idx % W)) / W;
    if (neighborCount(skel, W, H, x, y) >= 3) cand[idx] = 1;
  }
  const clustered = new Uint8Array(W * H);
  for (const idx of cells) {
    if (!cand[idx] || clustered[idx]) continue;
    // BFS로 인접 후보 군집 수집.
    const stack = [idx]; const cluster = [];
    clustered[idx] = 1;
    while (stack.length) {
      const ci = stack.pop(); cluster.push(ci);
      const cx = ci % W, cy = (ci - (ci % W)) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (cand[ni] && !clustered[ni]) { clustered[ni] = 1; stack.push(ni); }
      }
    }
    // 군집을 지웠을 때 인접 팔(연결 성분) 수를 센다.
    const inCluster = new Set(cluster);
    const armSeed = [];
    for (const ci of cluster) {
      const cx = ci % W, cy = (ci - (ci % W)) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const ni = ny * W + nx;
        if (skel[ni] && !inCluster.has(ni)) armSeed.push(ni);
      }
    }
    // armSeed들을 (군집 제외) 8-연결로 묶어 팔 개수 산정.
    const seen = new Set(); let arms = 0;
    for (const s of armSeed) {
      if (seen.has(s)) continue;
      arms += 1; const st = [s]; seen.add(s);
      let steps = 0;
      while (st.length && steps < 64) { // 팔 개수 판별엔 짧은 탐색으로 충분
        const c = st.pop(); steps += 1;
        const cx = c % W, cy = (c - (c % W)) / W;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (skel[ni] && !inCluster.has(ni) && !seen.has(ni) && armSeed.includes(ni)) { seen.add(ni); st.push(ni); }
        }
      }
    }
    if (arms >= 3) for (const ci of cluster) { junction[ci] = 1; walk[ci] = 0; }
  }

  const visited = new Uint8Array(W * H);
  const paths = [];
  const buf = new Int32Array(16);
  const nbrs = (x, y, onlyUnvisited) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || !walk[ny * W + nx]) continue;
        if (onlyUnvisited && visited[ny * W + nx]) continue;
        buf[n * 2] = nx; buf[n * 2 + 1] = ny; n += 1;
      }
    }
    return n;
  };
  // 지워진 인접 분기점(있으면) 좌표 — 토막 끝에 이어붙여 교차점까지 닿게.
  const touchJunction = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && junction[ny * W + nx]) return { x: nx, y: ny };
      }
    }
    return null;
  };

  const traceFrom = (sx, sy) => {
    const px = [];
    const j0 = touchJunction(sx, sy);
    if (j0) px.push({ x: j0.x, y: j0.y });
    px.push({ x: sx, y: sy });
    visited[sy * W + sx] = 1;
    let cx = sx, cy = sy, hx = 0, hy = 0; // 현재 진행 방향(헤딩)
    while (true) {
      const cnt = nbrs(cx, cy, true);
      if (cnt === 0) { const j1 = touchJunction(cx, cy); if (j1 && !(j0 && j1.x === j0.x && j1.y === j0.y)) px.push({ x: j1.x, y: j1.y }); break; }
      // 헤딩과 가장 잘 맞는(내적 최대) 이웃 선택. 첫 스텝은 아무 이웃.
      let best = 0, bestScore = -Infinity;
      for (let k = 0; k < cnt; k++) {
        const bx = buf[k * 2], by = buf[k * 2 + 1];
        const dx = bx - cx, dy = by - cy;
        const l = Math.hypot(dx, dy) || 1;
        const score = (hx === 0 && hy === 0) ? 0 : (dx * hx + dy * hy) / l;
        if (score > bestScore) { bestScore = score; best = k; }
      }
      const nx = buf[best * 2], ny = buf[best * 2 + 1];
      const dx = nx - cx, dy = ny - cy; const l = Math.hypot(dx, dy) || 1;
      hx = dx / l; hy = dy / l;
      visited[ny * W + nx] = 1;
      px.push({ x: nx, y: ny });
      cx = nx; cy = ny;
    }
    if (px.length >= 2) paths.push({ pixels: px });
  };

  // 1) 끝점(이웃 1) 우선 — 열린 획의 양끝, 교차서 갈린 팔의 뿌리 포함.
  for (const idx of cells) {
    if (junction[idx] || visited[idx]) continue;
    const x = idx % W, y = (idx - (idx % W)) / W;
    if (nbrs(x, y, false) === 1) traceFrom(x, y);
  }
  // 2) 남은 미방문(폐곡선 등) — 임의 점에서.
  for (const idx of cells) {
    if (junction[idx] || visited[idx]) continue;
    const x = idx % W, y = (idx - (idx % W)) / W;
    traceFrom(x, y);
  }
  return paths;
}

/* ----- RDP 단순화 ----- */
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = pointSegDist(pts[i].x, pts[i].y, pts[a].x, pts[a].y, pts[b].x, pts[b].y);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/* ----- 급꺾임(≥35°)에서 폴리라인 분할 → 여러 런(run) ----- */
// 각 정점에서 이전·다음 방향의 사잇각이 임계 이상이면 그 점에서 끊는다(점은 공유).
function splitAtSharpTurns(pts) {
  if (pts.length <= 2) return [pts];
  const cosThresh = Math.cos((180 - SHARP_ANGLE_DEG) * Math.PI / 180); // 방향각 편차 기준
  const runs = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    cur.push(pts[i]);
    const ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x, by = pts[i + 1].y - pts[i].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) continue;
    const cosT = (ax * bx + ay * by) / (la * lb); // 두 방향 벡터의 cos(사잇각)
    // 방향이 SHARP_ANGLE_DEG 이상 꺾이면(=cos < cos(35°)) 그 점에서 분할.
    if (cosT < Math.cos(SHARP_ANGLE_DEG * Math.PI / 180)) {
      runs.push(cur);
      cur = [pts[i]];
    }
  }
  cur.push(pts[pts.length - 1]);
  runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}

/* ----- 거리변환(distance transform): 각 잉크 픽셀 → 배경까지 최단거리 ----- */
// 2-패스 chamfer(3-4 근사). 배경(0)까지 거리 → 중심선 픽셀의 DT값 ≈ 반두께.
// 법선 프로브(45° 계단에 취약)보다 대각 획에도 안정적으로 굵기를 준다.
function distanceTransform(mask, W, H) {
  const INF = 1e9;
  const dt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dt[i] = mask[i] ? INF : 0;
  const D1 = 1, D2 = 1.41421356; // 정/대각 이동 비용
  // 정방향
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (dt[idx] === 0) continue;
      let m = dt[idx];
      if (x > 0) m = Math.min(m, dt[idx - 1] + D1);
      if (y > 0) m = Math.min(m, dt[idx - W] + D1);
      if (x > 0 && y > 0) m = Math.min(m, dt[idx - W - 1] + D2);
      if (x < W - 1 && y > 0) m = Math.min(m, dt[idx - W + 1] + D2);
      dt[idx] = m;
    }
  }
  // 역방향
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const idx = y * W + x;
      if (dt[idx] === 0) continue;
      let m = dt[idx];
      if (x < W - 1) m = Math.min(m, dt[idx + 1] + D1);
      if (y < H - 1) m = Math.min(m, dt[idx + W] + D1);
      if (x < W - 1 && y < H - 1) m = Math.min(m, dt[idx + W + 1] + D2);
      if (x > 0 && y < H - 1) m = Math.min(m, dt[idx + W - 1] + D2);
      dt[idx] = m;
    }
  }
  return dt;
}

/* ----- 굵기 샘플: 중심선 픽셀들의 거리변환값(반두께) → 두께 통계 ----- */
// rawPix: 세선화 경로의 원(原) 픽셀열(로컬). dt: 거리변환 그리드.
// 두께 ≈ 2×DT. 끝점 근처는 두께가 줄어드니(끝 둥긂) 양끝 표본은 제외.
// 반환: { mean, cv } 또는 null.
function sampleThickness(rawPix, dt, W, H) {
  if (rawPix.length < 2) return null;
  const skip = Math.min(2, Math.floor(rawPix.length / 4)); // 양끝 표본 제외
  const widths = [];
  for (let i = skip; i < rawPix.length - skip; i++) {
    const p = rawPix[i];
    if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) continue;
    const half = dt[p.y * W + p.x];
    if (half > 0) widths.push(half * 2);
  }
  if (widths.length < 1) {
    // 매우 짧은 경로: 끝 제외 후 표본이 없으면 전체에서.
    for (const p of rawPix) {
      if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) continue;
      const half = dt[p.y * W + p.x];
      if (half > 0) widths.push(half * 2);
    }
  }
  if (widths.length < 1) return null;
  const mean = widths.reduce((s, v) => s + v, 0) / widths.length;
  if (mean < 1e-6) return null;
  const varc = widths.reduce((s, v) => s + (v - mean) * (v - mean), 0) / widths.length;
  const cv = Math.sqrt(varc) / mean;
  return { mean, cv };
}

/* ----- 직선/휘어짐 판정: 현이탈로 kind 결정 ----- */
// 곧다 → 'line'(끝점 2개), 휘었다 → 'curve'. 중간 정점이 없으면 곧은 것.
function classifyRun(run) {
  if (run.length <= 2) return "line";
  const a = run[0], b = run[run.length - 1];
  const chord = dist(a.x, a.y, b.x, b.y);
  const tol = Math.max(CHORD_DEV_ABS, chord * CHORD_DEV_REL);
  let maxDev = 0;
  for (let i = 1; i < run.length - 1; i++) {
    const d = pointSegDist(run[i].x, run[i].y, a.x, a.y, b.x, b.y);
    if (d > maxDev) maxDev = d;
  }
  return maxDev <= tol ? "line" : "curve";
}

/* ===== 공개 API ===== */
// getInk(x,y)=컴포넌트 잉크 여부. bbox(x0..x1,y0..y1) 밖은 무시.
// 반환: null(가는 획 없음/실패) | { paths, isResidualInk, coverage }.
//   paths: [{ kind:'line'|'polyline'|'curve', points:[{x,y}(원본px)], thicknessPx }]
//   isResidualInk(x,y): 수락된 획으로 설명 안 된 잉크(잔여 조각용) → boolean
//   coverage: 0..1, 획이 설명한 잉크 비율
export function extractStrokes(getInk, x0, y0, x1, y1) {
  try {
    const local = buildLocalMask(getInk, x0, y0, x1, y1);
    if (!local) return null;
    const { data, W, H, ox, oy, ink } = local;

    const skel = pruneRedundant(zhangSuenThin(data, W, H), W, H);
    let skelCount = 0;
    for (let i = 0; i < skel.length; i++) if (skel[i]) skelCount += 1;
    if (skelCount < 2) return null;

    const dt = distanceTransform(data, W, H); // 굵기 측정용(중심선 픽셀의 반두께)
    const rawPaths = tracePaths(skel, W, H);
    if (!rawPaths.length) return null;

    // 수락 마스크: 획으로 설명된 잉크를 1로 칠한다(굵기 반지름 원 브러시).
    const explained = new Uint8Array(W * H);
    const stamp = (cx, cy, r) => {
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          if (dx * dx + dy * dy > r * r + 0.5) continue;
          const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          if (data[y * W + x]) explained[y * W + x] = 1;
        }
      }
    };
    // 폴리라인 전 구간을 따라 브러시로 칠한다(꼭짓점만이 아니라 선분 위 촘촘히).
    const paintPath = (poly, r) => {
      for (let i = 0; i < poly.length; i++) {
        stamp(poly[i].x, poly[i].y, r);
        if (i === poly.length - 1) break;
        const a = poly[i], b = poly[i + 1];
        const seg = dist(a.x, a.y, b.x, b.y);
        const steps = Math.ceil(seg);
        for (let s = 1; s < steps; s++) stamp(a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps, r);
      }
    };

    const accepted = [];
    for (const rp of rawPaths) {
      if (rp.pixels.length < 2) continue;
      const simplified = rdp(rp.pixels, RDP_EPS);
      if (simplified.length < 2) continue;

      // 굵기(거리변환을 세선화 원 픽셀열에서 샘플 → 대각 획에도 안정적).
      const th = sampleThickness(rp.pixels, dt, W, H);
      if (!th) continue;
      if (th.mean > MAX_THICK_PX) continue;      // 굵기 게이트
      if (th.cv > THICK_CV_MAX) continue;        // 굵기 변동계수 게이트

      const totalLen = pathLength(simplified);
      if (totalLen < MIN_LEN_RATIO * th.mean) continue; // 길이 게이트

      // 급꺾임 분할 → 런별 kind 판정.
      const runs = splitAtSharpTurns(simplified);
      const runKinds = runs.map((r) => ({ run: r, kind: classifyRun(r) }));

      let path;
      if (runKinds.length === 1) {
        const rk = runKinds[0];
        // 곧은 런=line은 끝점 2개만(명세 §3). 휜 런=curve는 정점 유지.
        const run = rk.kind === "line" ? [rk.run[0], rk.run[rk.run.length - 1]] : rk.run;
        path = { kind: rk.kind, run };
      } else {
        // 여러 마디: 곧은 마디만이면 polyline, 휜 마디 있으면 curve.
        const anyCurve = runKinds.some((rk) => rk.kind === "curve");
        // 곧은 마디는 끝점만 남겨(꺾임점 공유) 폴리라인 꼭짓점으로.
        const merged = [runKinds[0].run[0]];
        for (const rk of runKinds) {
          if (rk.kind === "line") merged.push(rk.run[rk.run.length - 1]);
          else for (let i = 1; i < rk.run.length; i++) merged.push(rk.run[i]);
        }
        path = { kind: anyCurve ? "curve" : "polyline", run: merged };
      }

      // 원본 좌표로 환산 + 수락 마스크 칠하기(선분 전 구간, 세선화 원 픽셀열 사용).
      const pts = path.run.map((p) => ({ x: p.x + ox, y: p.y + oy }));
      const r = th.mean / 2;
      paintPath(rp.pixels, r); // 마스크는 원 픽셀열로 칠해야 커버리지 정확
      accepted.push({ kind: path.kind, points: pts, thicknessPx: th.mean });
    }

    if (!accepted.length) return null;

    let explainedCount = 0;
    for (let i = 0; i < explained.length; i++) if (explained[i]) explainedCount += 1;
    const coverage = ink > 0 ? explainedCount / ink : 0;
    if (coverage < COVERAGE_MIN) return null; // 커버리지 미달 → 현행 폴백

    // 잔여 잉크 판정: 원본 잉크지만 수락 마스크에 안 칠해진 픽셀.
    const isResidualInk = (x, y) => {
      const lx = Math.round(x) - ox, ly = Math.round(y) - oy;
      if (lx < 0 || lx >= W || ly < 0 || ly >= H) return false;
      const idx = ly * W + lx;
      return data[idx] === 1 && explained[idx] === 0;
    };

    return { paths: accepted, isResidualInk, coverage };
  } catch (_e) {
    return null; // 안전: 어떤 이상도 밖으로 던지지 않는다.
  }
}
