/* ===== backup-zip: 전체 백업을 ZIP으로(이미지를 base64→바이너리 분리) =====
 *
 * 기존 백업은 단일 JSON에 이미지가 base64로 박혀 비대했다. 여기서는 백업 payload를 훑어
 * 모든 data:image;base64 URL을 zip 안의 실제 파일(images/imgN.ext)로 빼내고, 본문에는
 * 짧은 토큰만 남긴다. 복원 시 반대로 재수화한다. 이미지가 바이너리라 base64 대비 ~25%↓ +
 * PNG는 이미 압축돼 있어 무압축(STORE) ZIP으로 충분 → 외부 라이브러리 불필요.
 *
 * ★ writer/reader를 우리가 모두 소유하므로 STORE·플래그0·데이터디스크립터 없음으로 고정한다
 *   (Windows 탐색기에서도 열리는 표준 STORE zip).
 */

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------- base64 ↔ bytes ---------- */
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  let bin = "";
  const CHUNK = 0x8000; // fromCharCode 인자 폭주 방지
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/* ---------- STORE ZIP writer ---------- */
// entries: [{ name:string, data:Uint8Array }] → Blob (application/zip)
export function zipStore(entries) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;
    // local file header (30) + name + data
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);   // version needed
    lv.setUint16(6, 0, true);    // flags
    lv.setUint16(8, 0, true);    // method = STORE
    lv.setUint16(10, 0, true);   // mod time
    lv.setUint16(12, 0, true);   // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);   // extra len
    lh.set(nameBytes, 30);
    locals.push(lh, e.data);
    // central directory header (46) + name
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);   // version made by
    cv.setUint16(6, 20, true);   // version needed
    cv.setUint16(8, 0, true);    // flags
    cv.setUint16(10, 0, true);   // method
    cv.setUint16(12, 0, true);   // time
    cv.setUint16(14, 0, true);   // date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);   // extra
    cv.setUint16(32, 0, true);   // comment
    cv.setUint16(34, 0, true);   // disk#
    cv.setUint16(36, 0, true);   // internal attrs
    cv.setUint32(38, 0, true);   // external attrs
    cv.setUint32(42, offset, true); // local header offset
    ch.set(nameBytes, 46);
    centrals.push(ch);
    offset += lh.length + e.data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of centrals) cdSize += c.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  ev.setUint16(20, 0, true);
  return new Blob([...locals, ...centrals, eocd], { type: "application/zip" });
}

/* ---------- STORE ZIP reader ---------- */
const MAX_ZIP_ENTRIES = 10000;
const MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 256 * 1024 * 1024;

function safeEntryName(name) {
  return name !== "" && !name.startsWith("/") && !name.includes("\\") &&
    !name.includes("\0") && !name.split("/").includes("..");
}

function eocdOffset(u8, dv) {
  const earliest = Math.max(0, u8.length - 0xFFFF - 22);
  for (let p = u8.length - 22; p >= earliest; p -= 1) {
    if (dv.getUint32(p, true) !== 0x06054B50) continue;
    const commentLength = dv.getUint16(p + 20, true);
    if (p + 22 + commentLength === u8.length) return p;
  }
  throw new Error("손상된 ZIP 끝 레코드");
}

function readName(u8, start, size, dec) {
  try { return dec.decode(u8.subarray(start, start + size)); }
  catch (_) { throw new Error("ZIP 항목 이름 인코딩 오류"); }
}

function unzipStore(u8) {
  if (u8.length < 22) throw new Error("손상되었거나 잘린 ZIP");
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const dec = new TextDecoder("utf-8", { fatal: true });
  const end = eocdOffset(u8, dv);
  const disk = dv.getUint16(end + 4, true); const centralDisk = dv.getUint16(end + 6, true);
  const entries = dv.getUint16(end + 10, true); const centralSize = dv.getUint32(end + 12, true); const centralStart = dv.getUint32(end + 16, true);
  if (disk !== 0 || centralDisk !== 0 || entries !== dv.getUint16(end + 8, true) ||
      entries > MAX_ZIP_ENTRIES || centralStart > end || centralSize > end - centralStart ||
      centralStart + centralSize !== end) throw new Error("손상된 ZIP 중앙 목록");

  const files = new Map(); let totalBytes = 0; let p = centralStart;
  for (let index = 0; index < entries; index += 1) {
    if (p + 46 > end || dv.getUint32(p, true) !== 0x02014B50) throw new Error("손상된 ZIP 항목");
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const centralEnd = p + 46 + nameLength + extraLength + commentLength;
    if (centralEnd > end || flags !== 0 || method !== 0 || compressedSize !== size ||
        size > MAX_ZIP_ENTRY_BYTES || totalBytes + size > MAX_ZIP_TOTAL_BYTES) {
      throw new Error("지원하지 않거나 너무 큰 ZIP 항목");
    }
    const name = readName(u8, p + 46, nameLength, dec);
    if (!safeEntryName(name) || files.has(name)) throw new Error("안전하지 않거나 중복된 ZIP 항목");
    if (localOffset + 30 > centralStart || dv.getUint32(localOffset, true) !== 0x04034B50) {
      throw new Error("손상된 ZIP 로컬 항목");
    }
    const localFlags = dv.getUint16(localOffset + 6, true);
    const localMethod = dv.getUint16(localOffset + 8, true);
    const localCrc = dv.getUint32(localOffset + 14, true);
    const localCompressedSize = dv.getUint32(localOffset + 18, true);
    const localSize = dv.getUint32(localOffset + 22, true);
    const localNameLength = dv.getUint16(localOffset + 26, true);
    const localExtraLength = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + size;
    if (localFlags !== flags || localMethod !== method || localCrc !== crc ||
        localCompressedSize !== compressedSize || localSize !== size || dataEnd > centralStart ||
        readName(u8, localOffset + 30, localNameLength, dec) !== name) {
      throw new Error("ZIP 로컬 항목이 중앙 목록과 다릅니다");
    }
    const data = u8.subarray(dataStart, dataEnd);
    if (crc32(data) !== crc) throw new Error("ZIP CRC 검사 실패");
    files.set(name, data);
    totalBytes += size;
    p = centralEnd;
  }
  if (p !== end) throw new Error("손상된 ZIP 중앙 목록");
  return files;
}

export function isZip(arrayBufferOrU8) {
  const u8 = arrayBufferOrU8 instanceof Uint8Array ? arrayBufferOrU8 : new Uint8Array(arrayBufferOrU8);
  return u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4B && u8[2] === 0x03 && u8[3] === 0x04;
}

/* ---------- payload ↔ zip (이미지 외부화) ---------- */
// 직렬화된 JSON 텍스트에서 data:image;base64 URL을 찾아 토큰으로 치환(base64 알파벳엔
// 우리 토큰 문자가 없어 충돌 없음). 반환: 토큰 치환된 텍스트 + 이미지 파일 목록 + 매니페스트.
const IMG_RE = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;
function externalize(payload) {
  const text = JSON.stringify(payload);
  const files = [];
  const manifest = [];
  let idx = 0;
  const swapped = text.replace(IMG_RE, (_m, subtype, b64) => {
    const safeExt = /^[a-z0-9]+$/i.test(subtype) ? subtype.toLowerCase() : "bin";
    const name = `images/img${idx}.${safeExt}`;
    files.push({ name, data: b64ToBytes(b64) });
    manifest.push({ token: `[[5E-ZIPIMG:${idx}]]`, name, mediaType: `image/${subtype}` });
    const token = `[[5E-ZIPIMG:${idx}]]`;
    idx += 1;
    return token;
  });
  return { text: swapped, files, manifest };
}

export function buildBackupZip(payload) {
  const enc = new TextEncoder();
  const { text, files, manifest } = externalize(payload);
  const entries = [
    { name: "backup.json", data: enc.encode(text) },
    { name: "manifest.json", data: enc.encode(JSON.stringify(manifest)) },
    ...files,
  ];
  return zipStore(entries);
}

export function parseBackupZip(arrayBuffer) {
  const u8 = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
  const files = unzipStore(u8);
  const dec = new TextDecoder("utf-8", { fatal: true });
  const backup = files.get("backup.json");
  if (!backup) throw new Error("backup.json 없음");
  let text;
  try { text = dec.decode(backup); }
  catch (_) { throw new Error("backup.json 형식 오류"); }
  const backupTokens = new Set(text.match(/\[\[5E-ZIPIMG:\d+\]\]/g) || []);
  const manRaw = files.get("manifest.json");
  if (!manRaw) throw new Error("manifest.json 없음");
  let manifest;
  try { manifest = JSON.parse(dec.decode(manRaw)); }
  catch (_) { throw new Error("manifest.json 형식 오류"); }
  if (!Array.isArray(manifest)) throw new Error("manifest.json 형식 오류");
  const manifestTokens = new Set();
  const manifestNames = new Set();
  // 토큰 → data URL 재수화(치환은 문자열 리터럴로, 정규식 특수문자 이슈 없이 split/join).
  for (const m of manifest) {
    if (!m || typeof m !== "object" || typeof m.token !== "string" || typeof m.name !== "string" ||
        typeof m.mediaType !== "string" || !/^\[\[5E-ZIPIMG:\d+\]\]$/.test(m.token) ||
        !/^images\/img\d+\.[a-z0-9]+$/i.test(m.name) || !/^image\/[a-z0-9.+-]+$/i.test(m.mediaType) ||
        manifestTokens.has(m.token) || manifestNames.has(m.name) || !files.has(m.name)) {
      throw new Error("이미지 manifest 항목 오류");
    }
    manifestTokens.add(m.token);
    manifestNames.add(m.name);
    const bytes = files.get(m.name);
    const dataUrl = `data:${m.mediaType};base64,${bytesToB64(bytes)}`;
    text = text.split(m.token).join(dataUrl);
  }
  const unresolved = text.match(/\[\[5E-ZIPIMG:\d+\]\]/g);
  if (unresolved || backupTokens.size !== manifestTokens.size ||
      [...backupTokens].some((token) => !manifestTokens.has(token))) {
    throw new Error("필수 이미지 payload가 없습니다");
  }
  try { return JSON.parse(text); }
  catch (_) { throw new Error("backup.json 형식 오류"); }
}
