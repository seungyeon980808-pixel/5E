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

import { serialize, migrate, applyLoaded } from "./project-io.js?v=1.0.4";
import { showConfirm } from "./ui-dialogs.js?v=1.0.4";

const DB_NAME = "5e-autosave";
const DB_VERSION = 1;
const STORE = "snapshots";

// 롤링 보관 개수: 최근 N개를 넘으면 가장 오래된 것부터 제거.
const MAX_SNAPSHOTS = 8;
// 마지막 변경 이후 이만큼 조용하면 한 번 저장(연속 편집을 한 번으로 합침).
const DEBOUNCE_MS = 2500;

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
    // IndexedDB를 못 열면(사생활 모드 등) 자동 저장 기능만 조용히 비활성화.
    return;
  }

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
      if (ok) applyLoaded(state, migrate(latest.data));
    }
  } catch {
    // 복구 실패는 치명적이지 않다 — 그냥 새 세션으로 진행.
  }

  // (2) 디바운스 자동 저장. serialize 결과 JSON이 직전과 같으면(뷰 이동·도구
  //     전환 등 도면 무변화) 저장을 건너뛴다. 빈 도면은 복구 가치가 없으므로
  //     저장하지 않아, 실수로 좋은 스냅샷을 덮어쓰지 않는다.
  let timer = null;
  let lastJson = "";
  const schedule = (s) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const snap = serialize(s);
      if (!snapshotHasObjects(snap)) return;
      const json = JSON.stringify(snap);
      if (json === lastJson) return;
      // JSON.parse로 라이브 참조를 끊은 순수 스냅샷을 저장한다.
      // lastJson 갱신은 저장 성공 후에만 한다 — 실패 시에도 미리 갱신해버리면
      // 다음 변경까지 "이미 저장됨"으로 오인해 그 상태가 영구히 유실된다.
      saveSnapshot(db, JSON.parse(json))
        .then(() => { lastJson = json; })
        .catch(() => { /* 실패 시 lastJson 갱신 안 함 → 다음 변경 시 재시도됨 */ });
    }, DEBOUNCE_MS);
  };
  state.subscribe(schedule);
}
