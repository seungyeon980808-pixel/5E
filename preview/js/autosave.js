import { previewStorage as localStorage } from './preview-storage.js?v=1.6.0-preview-labeler-0917-1111';
/* ===== AUTOSAVE (자동 저장 · 크래시 복구) =====
 *
 * 작업 중인 도해를 디바운스(2.5초)로 IndexedDB에 자동 저장하고, 브라우저 강제
 * 종료·탭 닫힘 후 재실행 시 확인 모달로 되살린다. 최근 스냅샷을 롤링 보관한다.
 *
 * 저장 형식은 project-io.js의 serialize()를 그대로 재사용하므로(단일 출처),
 * 수동 저장(.json)과 자동 저장이 언제나 동일한 편집 소스 스키마를 쓴다. 복원은
 * migrate() + applyLoaded()로 파일 열기와 같은 경로를 탄다.
 *
 * localStorage가 아니라 IndexedDB를 쓰는 이유: 이미지 객체의 dataURL 때문에
 * 스냅샷이 수 MB에 달할 수 있어 localStorage(≈5MB, 문자열 전용) 용량이 부족하다.
 */

import { serialize, migrate, applyLoaded } from "./project-io.js?v=1.6.0-workbench-polish-0928-final";
import { showAlert, showConfirm } from "./ui-dialogs.js?v=1.6.0-preview-labeler-0917-1111";

import { captureProjectStatus, markProjectStatus } from "./project-status.js?v=1.6.0-preview-project-launcher-0918-1508";

const DB_NAME = "5e-preview-autosave";
const DB_VERSION = 1;
const STORE = "snapshots";
const CHECKPOINT_STORE = "checkpoints";
const LEGACY_DB_NAME = "5e-autosave";

// 롤링 보관 개수: 최근 N개를 넘으면 가장 오래된 것부터 제거.
const MAX_SNAPSHOTS = 8;
// 마지막 변경 이후 이만큼 조용하면 한 번 저장(연속 편집을 한 번으로 합침).
const DEBOUNCE_MS = 2500;
const MAX_DIRTY_WAIT_MS = 10000;

/* ----- IndexedDB open ----- */
function openDB() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // autoIncrement 키는 항상 오름차순 → keys[0]이 가장 오래된 스냅샷.
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
        db.createObjectStore(CHECKPOINT_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function getById(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function saveCheckpoint(db, data, reason) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHECKPOINT_STORE, "readwrite");
    const ts = Date.now();
    const summary = snapshotSummary(data);
    const req = tx.objectStore(CHECKPOINT_STORE).add({ ts, reason, ...summary, data });
    let id = null;
    req.onsuccess = () => { id = req.result; };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve({ id, ts, ...summary });
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException("복구 checkpoint 저장이 중단되었습니다.", "AbortError"));
  });
}

function snapshotSummary(data) {
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  const active = pages.find(page => page?.id === data.activePageId) || pages[0];
  return { label: active?.name || "이전 작업", pageCount: pages.length };
}

async function openLegacyDB() {
  if (typeof indexedDB.databases === "function") {
    try {
      const databases = await indexedDB.databases();
      if (!databases.some(database => database.name === LEGACY_DB_NAME)) return null;
    } catch {}
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 1);
    let absent = false;
    req.onupgradeneeded = event => {
      if (event.oldVersion !== 0) return;
      absent = true;
      req.transaction.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => absent ? resolve(null) : reject(req.error);
  });
}

export async function inspectLegacyRecovery() {
  let legacy;
  try {
    legacy = await openLegacyDB();
  } catch (error) {
    return { status: "unavailable", checkpoints: [], error: error?.message || String(error) };
  }
  if (!legacy) return { status: "empty", checkpoints: [] };
  try {
    if (!legacy.objectStoreNames.contains(STORE)) {
      return { status: "empty", checkpoints: [] };
    }
    const rows = await getAll(legacy, STORE);
    return {
      status: "available",
      checkpoints: rows.filter(row => row?.data && snapshotHasWork(row.data)).map(row => ({
        id: row.id, source: "legacy", reason: "legacy-shared-autosave", ts: row.ts,
        ...snapshotSummary(row.data),
      })),
    };
  } catch (error) {
    return { status: "unavailable", checkpoints: [], error: error?.message || String(error) };
  } finally {
    legacy.close();
  }
}

/* ----- 최신 스냅샷 1개 읽기(커서 역방향) ----- */
function getLatest(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      resolve(cursor ? cursor.value : null);
    };
    req.onerror = () => reject(req.error);
  });
}

/* ----- 스냅샷 저장 + 오래된 것 정리 ----- */
function saveSnapshot(db, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.add({ ts: Date.now(), data });
    // 초과분 삭제: 가장 오래된 키부터.
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result || [];
      const excess = keys.length - MAX_SNAPSHOTS;
      for (let i = 0; i < excess; i++) store.delete(keys[i]);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new DOMException("자동 저장 트랜잭션이 중단되었습니다.", "AbortError"));
  });
}

// Preserve document setup even before the first object is drawn.
function snapshotHasWork(data) {
  if (!Array.isArray(data.pages)) return false;
  if (data.pages.length > 1) return true;
  return data.pages.some(p => p && (
    p.objects?.length || p.guides?.length ||
    (p.name && p.name !== '페이지 1') || p.meta?.number || p.meta?.points ||
    (p.artboard && (p.artboard.w !== 90 || p.artboard.h !== 60)) ||
    (p.layers && JSON.stringify(p.layers) !== JSON.stringify(
      [1, 2, 3].map(id => ({ id, name: `레이어 ${id}`, visible: true }))
    ))
  ));
}

/* ----- 복구 모달용 시각 포맷 ----- */
function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ----- initAutosave: 부팅 복구 → 디바운스 자동 저장 구독 ----- */
export async function initAutosave(state, { selectRecoveryCheckpoint } = {}) {
  let db;
  try {
    db = await openDB();
  } catch {
    void showAlert("이 환경에서는 자동 저장을 사용할 수 없습니다. 작업이 끝나면 파일로 저장해 주세요.", {
      title: "자동 저장을 사용할 수 없음",
    });
    return;
  }

  let recoveryChoice = "none";

  // (1) 부팅 복구: 남아 있는 스냅샷이 있으면 복원 여부를 묻는다. 아직 자동 저장
  //     구독을 걸기 전이라, 사용자가 결정하는 동안 빈 초기 상태가 스냅샷을
  //     덮어쓰지 않는다.
  try {
    let checkpointRecovered = false;
    if (typeof selectRecoveryCheckpoint === "function") {
      const [previewCheckpoints, legacy] = await Promise.all([
        listRecoveryCheckpoints({ includeLegacy: false }),
        inspectLegacyRecovery(),
      ]);
      const checkpoints = [...previewCheckpoints, ...legacy.checkpoints]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
      const selected = await selectRecoveryCheckpoint(checkpoints, { legacyStatus: legacy.status });
      if (selected) {
        await restoreRecoveryCheckpoint(state, selected);
        recoveryChoice = "restore";
        checkpointRecovered = true;
      }
    }

    if (!checkpointRecovered) {
      const latest = await getLatest(db);
      if (latest && latest.data && snapshotHasWork(latest.data)) {
        const ok = await showConfirm(
          `이전에 작업하던 도해가 남아 있습니다.\n(${formatTime(latest.ts)})\n\n이전 작업을 복구할까요?`,
          { title: "작업 복구", okText: "복구", cancelText: "새로 시작" }
        );
        recoveryChoice = ok ? "restore" : "fresh";
        if (ok) {
          applyLoaded(state, migrate(latest.data));
          markProjectStatus(state, captureProjectStatus(state), "recovery");
        }
      }
    }
  } catch {
    void showAlert("이전 자동 저장 작업을 복구하지 못했습니다. 새 작업은 계속할 수 있습니다.", {
      title: "자동 저장 복구 실패",
    });
  }

  // (2) 디바운스 자동 저장. serialize 결과 JSON이 직전과 같으면(뷰 이동·도구
  //     전환 등 도면 무변화) 저장을 건너뛴다. 빈 도면은 복구 가치가 없으므로
  //     저장하지 않아, 실수로 좋은 스냅샷을 덮어쓰지 않는다.
  let timer = null;
  let dirtySince = null;
  let lastSavedJson = "";
  let lastQueuedJson = "";
  let failureNotified = false;
  let writeQueue = Promise.resolve();

  const schedule = () => {
    const now = Date.now();
    if (dirtySince === null) dirtySince = now;
    const due = Math.min(now + DEBOUNCE_MS, dirtySince + MAX_DIRTY_WAIT_MS);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      dirtySince = null;
      captureAndQueue();
    }, Math.max(0, due - now));
  };

  const captureAndQueue = () => {
    const statusToken = captureProjectStatus(state);
    const snap = serialize(state.get());
    if (!snapshotHasWork(snap)) return;
    const json = JSON.stringify(snap);
    if (json === lastSavedJson || json === lastQueuedJson) return;
    const data = JSON.parse(json);
    lastQueuedJson = json;
    const write = async () => {
      try {
        await saveSnapshot(db, data);
        lastSavedJson = json;
        markProjectStatus(state, statusToken, "recovery");
        if (lastQueuedJson === json) lastQueuedJson = "";
        failureNotified = false;
      } catch {
        if (lastQueuedJson === json) lastQueuedJson = "";
        if (!failureNotified) {
          failureNotified = true;
          void showAlert("자동 저장에 실패했습니다. 자동으로 다시 시도하며, 작업이 끝나면 파일로도 저장해 주세요.", {
            title: "자동 저장 실패",
          });
        }
        schedule();
      }
    };
    writeQueue = writeQueue.then(write, write);
  };

  const flush = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    dirtySince = null;
    captureAndQueue();
  };

  state.subscribe(schedule);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
  return recoveryChoice;
}

// Explicit checkpoint before replacing a document; never discard work on failure.
export async function createRecoveryCheckpoint(state, { reason = "mode-switch" } = {}) {
  const snapshot = JSON.parse(JSON.stringify(serialize(state.get())));
  if (!snapshotHasWork(snapshot)) return null;
  const db = await openDB();
  try {
    const saved = await saveCheckpoint(db, snapshot, reason);
    return { ...saved, source: "preview", reason };
  } finally {
    db.close();
  }
}

export async function listRecoveryCheckpoints({ includeLegacy = true } = {}) {
  const checkpoints = [];
  const db = await openDB();
  try {
    const rows = await getAll(db, CHECKPOINT_STORE);
    checkpoints.push(...rows.map(row => ({
      id: row.id, source: "preview", reason: row.reason || "mode-switch", ts: row.ts,
      label: row.label || snapshotSummary(row.data).label,
      pageCount: Number.isInteger(row.pageCount) ? row.pageCount : snapshotSummary(row.data).pageCount,
    })));
  } finally {
    db.close();
  }
  if (includeLegacy) {
    const legacy = await inspectLegacyRecovery();
    checkpoints.push(...legacy.checkpoints);
  }
  return checkpoints.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export async function restoreRecoveryCheckpoint(state, checkpoint) {
  if (!checkpoint || !Number.isInteger(checkpoint.id)
      || (checkpoint.source !== "preview" && checkpoint.source !== "legacy")) {
    throw new Error("복구 checkpoint 식별자가 올바르지 않습니다.");
  }
  const db = checkpoint.source === "preview" ? await openDB() : await openLegacyDB();
  if (!db) throw new Error("기존 복구 저장소를 찾을 수 없습니다.");
  try {
    const storeName = checkpoint.source === "preview" ? CHECKPOINT_STORE : STORE;
    if (!db.objectStoreNames.contains(storeName)) throw new Error("복구 저장소를 찾을 수 없습니다.");
    const row = await getById(db, storeName, checkpoint.id);
    if (!row?.data) throw new Error("복구 checkpoint를 찾을 수 없습니다.");
    applyLoaded(state, migrate(row.data));
    markProjectStatus(state, captureProjectStatus(state), "recovery");
    return { id: checkpoint.id, source: checkpoint.source };
  } finally {
    db.close();
  }
}

export async function checkpointBeforeModeSwitch(state) {
  return createRecoveryCheckpoint(state, { reason: "mode-switch" });
}
