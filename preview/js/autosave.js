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

import { serialize, migrate, applyLoaded } from "./project-io.js?v=1.6.0-preview-web-native-project-0918-1617";
import { showAlert, showConfirm } from "./ui-dialogs.js?v=1.6.0-preview-labeler-0917-1111";

import { captureProjectStatus, markProjectStatus } from "./project-status.js?v=1.6.0-preview-project-launcher-0918-1508";

const DB_NAME = "5e-autosave";
const DB_VERSION = 1;
const STORE = "snapshots";

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
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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

/* ----- snapshotHasObjects: 페이지 여러 개 중 하나라도 객체가 있는지 -----
 * serialize()가 다중 페이지(pages[]) 형식을 내보내므로(단일 objects[] 아님),
 * "빈 도면" 판정은 모든 페이지를 훑어야 한다. */
function snapshotHasObjects(data) {
  return Array.isArray(data.pages) && data.pages.some(
    (p) => p && Array.isArray(p.objects) && p.objects.length
  );
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
export async function initAutosave(state) {
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
    const latest = await getLatest(db);
    if (latest && latest.data && snapshotHasObjects(latest.data)) {
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
    if (!snapshotHasObjects(snap)) return;
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
