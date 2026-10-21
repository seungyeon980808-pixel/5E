// QR 코드 만들기(학습지에 영상·자료 주소 넣기, 10-22 새벽). 외부 라이브러리 없이 표준(ISO/IEC 18004) 바이트 모드만 쓴다.
// encodeQr(text, {ecc:'M'}) → {size, modules: boolean[][]} (modules[y][x] = 검은 칸). 버전 1~40 중 들어가는 가장 작은 것.
const ECC_BITS = { L: 1, M: 0, Q: 3, H: 2 };
const ECC_ROW = { L: 0, M: 1, Q: 2, H: 3 };
// 버전별 블록당 오류 정정 부호어 수, 블록 수(표준 표 그대로, 0번은 비움).
const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const align = Math.floor(ver / 7) + 2; n -= (25 * align - 10) * align - 55; if (ver >= 7) n -= 36; }
  return n;
}
const dataCodewords = (ver, ecc) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ECC_ROW[ecc]][ver] * BLOCKS[ECC_ROW[ecc]][ver];

// GF(256), 다항식 0x11D
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1; let root = 1;
  for (let i = 0; i < degree; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
  return r;
}
function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
  return r;
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const count = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2, out = [6];
  for (let pos = ver * 4 + 17 - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

export function encodeQr(text, { ecc = 'M' } = {}) {
  if (!(ecc in ECC_BITS)) throw new Error('오류 정정 단계는 L·M·Q·H 중 하나입니다.');
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1;
  for (; ver <= 40; ver++) { const need = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8; if (need <= dataCodewords(ver, ecc) * 8) break; }
  if (ver > 40) throw new Error('QR 코드에 넣기에는 글이 너무 깁니다.');
  // 비트 열: 바이트 모드(0100) + 글자 수 + 자료 + 끝 표시 + 채움
  const bits = [], push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(4, 4); push(bytes.length, ver <= 9 ? 8 : 16); for (const b of bytes) push(b, 8);
  const capacity = dataCodewords(ver, ecc) * 8;
  push(0, Math.min(4, capacity - bits.length)); push(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // 블록 나누기 + 오류 정정 + 섞어 놓기
  const row = ECC_ROW[ecc], blockCount = BLOCKS[row][ver], eccLen = ECC_PER_BLOCK[row][ver], raw = Math.floor(rawModules(ver) / 8);
  const shortCount = blockCount - raw % blockCount, shortLen = Math.floor(raw / blockCount), divisor = rsDivisor(eccLen), blocks = [];
  for (let i = 0, k = 0; i < blockCount; i++) {
    const part = data.slice(k, k + shortLen - eccLen + (i < shortCount ? 0 : 1)); k += part.length;
    const ec = rsRemainder(part, divisor); if (i < shortCount) part.push(0); blocks.push(part.concat(ec));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortCount) codewords.push(b[i]); });

  const size = ver * 4 + 17, modules = Array.from({ length: size }, () => new Array(size).fill(false)), fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { modules[y][x] = dark; fixed[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  const aligns = alignmentPositions(ver), last = aligns.length - 1;
  aligns.forEach((ax, i) => aligns.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const drawFormat = mask => {
    const value = (ECC_BITS[ecc] << 3) | mask; let rem = value;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((value << 10) | rem) ^ 0x5412, bit = i => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const dark = ((v >>> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); }
  }
  // 자료 칸 채우기(오른쪽 아래부터 두 줄씩 지그재그)
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fixed[y][x] && n < codewords.length * 8) { modules[y][x] = ((codewords[n >>> 3] >>> (7 - (n & 7))) & 1) === 1; n++; }
    }
  }
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
  ];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && maskFn[m](x, y)) modules[y][x] = !modules[y][x]; };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const score = penalty(modules, size); if (score < bestScore) { best = m; bestScore = score; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return { size, version: ver, modules };
}

// 가림 무늬 고르기 점수(표준 규칙 1~4).
function penalty(m, size) {
  let score = 0, dark = 0;
  const line = get => {
    let s = 0, run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else { if (run >= 5) s += run - 2; run = 1; }
    }
    // 1:1:3:1:1 찾기 무늬(앞이나 뒤에 밝은 칸 4개)
    for (let i = 0; i + 11 <= size; i++) {
      const w = [...Array(11).keys()].map(k => get(i + k) ? 1 : 0).join('');
      if (w === '10111010000' || w === '00001011101') s += 40;
    }
    return s;
  };
  for (let y = 0; y < size; y++) score += line(x => m[y][x]);
  for (let x = 0; x < size; x++) score += line(y => m[y][x]);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3; }
  for (const row of m) for (const c of row) if (c) dark++;
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}

// 캔버스로 그려 PNG 바이트로(둘레 여백 4칸). cell = 한 칸 화소 수.
export async function qrPng(text, { ecc = 'M', cell = 8 } = {}) {
  const { size, modules, version } = encodeQr(text, { ecc }), quiet = 4, px = (size + quiet * 2) * cell;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = px;
  const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.fillStyle = '#000';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) g.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: px, height: px, version };
}
