/* ===== EXPORT DIR (내보내기 저장 폴더 — 한 번 연결하면 계속 쓴다) =====
 *
 * 왜 따로 떼어 놓나: 폴더 핸들을 쓰는 곳이 둘이다 —
 *   · js/export-batch.js  (페이지 일괄 내보내기)
 *   · js/svg-export.js    (단일 이미지 내보내기)
 * 그런데 export-batch 는 svg-export 를 import 한다. 폴더 코드를 둘 중 하나에 두면
 * import 가 순환한다. 그래서 아무것도 import 하지 않는 이 모듈에 모아 둔다.
 *
 * 동작: File System Access API(showDirectoryPicker)로 폴더를 한 번 고르면 그 핸들을
 * IndexedDB 에 넣어 다음 세션에도 기억한다. 권한은 만료될 수 있으므로 쓰기 직전에
 * 다시 확인한다(사용자 제스처 안에서). 지원하지 않는 브라우저(Firefox/Safari)에서는
 * 이 모듈이 조용히 '없음'을 돌려주고, 부르는 쪽은 기존 다운로드 경로로 떨어진다 —
 * 기능이 사라지지는 않는다.
 */

import { idbAvailable, idbGet, idbSet, idbDel } from "./idb-store.js?v=1.4.0";

const DIR_KEY = "export-dir-handle";

export const FS_DIR_SUPPORTED =
  typeof window !== "undefined" && !!window.showDirectoryPicker;

let dirHandle = null;

/* 저장해 둔 폴더 핸들을 되살린다(권한 요청은 하지 않는다 — 제스처가 없으므로). */
export async function loadSavedDir() {
  if (dirHandle || !FS_DIR_SUPPORTED || !idbAvailable()) return dirHandle;
  try {
    const h = await idbGet(DIR_KEY);
    if (h && typeof h.queryPermission === "function") dirHandle = h;
  } catch (_) { /* 저장된 핸들이 깨졌으면 없는 것으로 본다 */ }
  return dirHandle;
}

export function currentDir() { return dirHandle; }
export function currentDirName() { return dirHandle ? (dirHandle.name || "") : ""; }

export async function ensureDirPermission(handle = dirHandle) {
  if (!handle || typeof handle.queryPermission !== "function") return false;
  try {
    if (await handle.queryPermission({ mode: "readwrite" }) === "granted") return true;
    return await handle.requestPermission({ mode: "readwrite" }) === "granted";
  } catch (_) { return false; }
}

/* 폴더 고르기. 사용자 제스처(클릭) 안에서 불러야 한다. */
export async function pickDir() {
  if (!FS_DIR_SUPPORTED) return null;
  try {
    const h = await window.showDirectoryPicker({ id: "5e-export", mode: "readwrite" });
    if (!h) return null;
    dirHandle = h;
    if (idbAvailable()) { try { await idbSet(DIR_KEY, h); } catch (_) {} }
    return h;
  } catch (_) {
    return null; // 취소 또는 미지원
  }
}

/* 연결 해제 — 다음 내보내기부터는 다시 '저장 위치 묻기'로 돌아간다. */
export async function clearDir() {
  dirHandle = null;
  if (idbAvailable()) { try { await idbDel(DIR_KEY); } catch (_) {} }
}

/* 연결된 폴더에 파일 하나를 쓴다. 성공하면 true.
 * 폴더가 없거나 권한이 거절되면 false — 부르는 쪽이 다운로드로 떨어지면 된다. */
export async function writeToDir(filename, blob) {
  const h = await loadSavedDir();
  if (!h) return false;
  if (!(await ensureDirPermission(h))) return false;
  try {
    const fh = await h.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return true;
  } catch (_) {
    return false;
  }
}
