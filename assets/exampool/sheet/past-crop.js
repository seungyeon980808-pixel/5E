// 기출 카드 그림 자르기: 카드 그림(github exam-search cards)에는 단 여백·단 구분선·쪽 번호 상자가 붙어 있다.
// 문항 번호를 왼쪽 위로, 〈보기〉·본문 폭을 좌우 폭으로, 선지 번호 줄을 아래로 잘라 문항만 남긴다(단 구분선·쪽 번호·과목 탭은 뺀다).
// 픽셀만 보고 정하므로 어느 해·과목 카드에도 같은 규칙이 적용된다. 실패하면 null(원본을 그대로 쓴다).
// COLUMN: 카드 그림에서 한 단(문항 번호 ~ 〈보기〉 오른쪽 끝)의 글자 폭(px). 카드는 모두 같은 배율이라 폭이 거의 같다(표본 87장 629~638).
// 본문이 좁은 문항도 이 폭으로 맞춰 글자 크기가 카드마다 같게 한다.
const DARK = 200, PAD = 14, COLUMN = 634 + 2 * 14;

export function pastCropRect({ data, width: W, height: H }) {
  const ink = new Uint8Array(W * H);
  // 파란 글자(아래 저작권 문구)는 글자로 치지 않는다.
  for (let i = 0, p = 0; i < ink.length; i++, p += 4) ink[i] = data[p] < DARK && data[p + 1] < DARK && data[p + 2] < DARK && !(data[p + 2] > data[p] + 40) ? 1 : 0;
  // 단 구분선: 높이의 80% 이상 이어진 세로줄은 지운다.
  const col = new Uint32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[x] += ink[y * W + x];
  for (let x = 0; x < W; x++) if (col[x] > H * 0.8) for (let y = 0; y < H; y++) ink[y * W + x] = 0;
  // 글자 줄(가로 띠).
  const bands = [];
  for (let y = 0, start = -1, gap = 0, l = W, r = -1; y <= H; y++) {
    let lo = W, hi = -1;
    if (y < H) for (let x = 0; x < W; x++) if (ink[y * W + x]) { if (x < lo) lo = x; hi = x; }
    if (hi >= 0) { if (start < 0) start = y; gap = 0; l = Math.min(l, lo); r = Math.max(r, hi); continue; }
    if (start >= 0 && (++gap >= 4 || y === H)) { bands.push({ top: start, bottom: y - gap, l, r }); start = -1; gap = 0; l = W; r = -1; }
  }
  if (!bands.length) return null;
  // 아래 끝 = 선지 번호 줄: 한 줄 높이에 ①~⑤가 넓은 틈(30px 이상)으로 4덩어리 이상 늘어선 마지막 줄.
  // 그 아래(쪽 번호 상자·「※ 확인 사항」 상자 등)는 버린다. 선지가 그림이라 그런 줄이 없으면 맨 아래 좁은 띠(쪽 번호)만 버린다.
  // 그래프 눈금(1970 1975 …) 같은 줄과 헷갈리지 않게: 본문 왼쪽 끝 가까이에서 시작해 본문 폭의 60% 이상 걸쳐야 한다.
  const wide = bands.reduce((a, b) => (b.r - b.l > a.r - a.l ? b : a));
  const isChoices = band => {
    if (band.bottom - band.top > 45 || band.r - band.l < (wide.r - wide.l) * 0.6 || band.l - wide.l > (wide.r - wide.l) * 0.12) return false;
    let groups = 0, gap = 99;
    for (let x = band.l; x <= band.r; x++) {
      let on = 0; for (let y = band.top; y <= band.bottom && !on; y++) on = ink[y * W + x];
      if (on) { if (gap >= 30) groups++; gap = 0; } else gap++;
    }
    return groups >= 4;
  };
  let last = -1; for (let i = bands.length - 1; i >= 0 && last < 0; i--) if (isChoices(bands[i])) last = i;
  if (last >= 0) bands.length = last + 1;
  else while (bands.length > 1 && bands.at(-1).r - bands.at(-1).l < W * 0.15) bands.pop();
  const top = bands[0].top, bottom = bands.at(-1).bottom;
  // 좌우: 문항 줄들 안의 글자 덩어리(빈 틈 8px 이상으로 나뉨). 오른쪽 끝의 좁은 덩어리(과목 탭)는 버린다 → 왼쪽 = 문항 번호, 오른쪽 = 〈보기〉·본문 폭.
  const used = new Uint8Array(W);
  for (const band of bands) for (let y = band.top; y <= band.bottom; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) used[x] = 1;
  const groups = [];
  for (let x = 0, start = -1, gap = 0; x <= W; x++) {
    if (x < W && used[x]) { if (start < 0) start = x; gap = 0; continue; }
    if (start >= 0 && (++gap >= 8 || x === W)) { groups.push([start, x - gap]); start = -1; gap = 0; }
  }
  // 과목 탭: 오른쪽 끝(80% 너머)의 좁고(8% 미만) 세로로 긴(80px 이상) 덩어리. 선지 끝 숫자 같은 짧은 글자는 남긴다.
  const tall = ([a, b]) => { let t = H, u = -1; for (let y = top; y <= bottom; y++) for (let x = a; x <= b; x++) if (ink[y * W + x]) { if (y < t) t = y; u = y; break; } return u - t; };
  while (groups.length > 1 && groups.at(-1)[1] - groups.at(-1)[0] < W * 0.08 && groups.at(-1)[0] > W * 0.8 && tall(groups.at(-1)) >= 80) groups.pop();
  if (!groups.length) return null;
  const left = groups[0][0], right = groups.at(-1)[1];
  if (right - left < 40 || bottom - top < 20) return null;
  const x = Math.max(0, left - PAD), y = Math.max(0, top - PAD);
  return { x, y, width: Math.min(W - x, Math.max(right + PAD + 1 - x, COLUMN)), height: Math.min(H, bottom + PAD + 1) - y };
}

// 브라우저: 그림을 읽어 잘라 낸 PNG 주소를 돌려준다(같은 그림은 한 번만).
// 잘린 그림의 세로/가로 비율은 기억해 두고(이 브라우저 저장소), 다음에 목록을 그릴 때 그림 칸을 처음부터 그 높이로 잡는다 → 읽히면서 칸이 움직이지 않는다.
const cache = new Map(), RATIO_KEY = 'exampool-past-crop-ratio:v1';
let ratios = null;
const ratioStore = () => { if (!ratios) { try { ratios = JSON.parse(localStorage.getItem(RATIO_KEY) || '{}'); } catch { ratios = {}; } } return ratios; };
export function knownRatio(url) { return ratioStore()[url] || 0; }
function rememberRatio(url, ratio) {
  const all = ratioStore(); all[url] = Math.round(ratio * 1000) / 1000;
  const keys = Object.keys(all); if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 4000)) delete all[k];
  try { localStorage.setItem(RATIO_KEY, JSON.stringify(all)); } catch {}
}
export function croppedPastImage(url) {
  if (!cache.has(url)) cache.set(url, (async () => {
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const r = pastCropRect(g.getImageData(0, 0, c.width, c.height));
    if (!r) { rememberRatio(url, c.height / c.width); return url; }
    const out = document.createElement('canvas'); out.width = r.width; out.height = r.height;
    out.getContext('2d').drawImage(c, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    rememberRatio(url, r.height / r.width);
    return URL.createObjectURL(await new Promise(res => out.toBlob(res, 'image/png')));
  })().catch(() => url));
  return cache.get(url);
}
