// 11-12 사용자: 라이브러리 별표 = 북마크. 문항·PDF 쪽·PDF 파일(이미지 파일)을 각각 별표할 수 있고, 같은 자료가 여러 단위로 겹쳐도 된다.
// 별표 목록에서는 무엇을 별표했는지 위계(파일 › 쪽 › 문항)가 보여야 헷갈리지 않는다.
// 저장: 이 컴퓨터의 앱 저장소(localStorage). 설치판은 앱 프로필 안이라 껐다 켜도 남는다.
const PREFIX = /^\/preview(?:\/|$)/u.test(globalThis.location?.pathname || "") ? "5e.preview:" : "";
export const BOOKMARK_STORAGE_KEY = `${PREFIX}5e.library.bookmarks.v1`;
export const BOOKMARK_EVENT = "5e:library-bookmarks";
export const BOOKMARK_LEVELS = Object.freeze({
  file: Object.freeze({ label: "파일", rank: 0 }),
  page: Object.freeze({ label: "쪽", rank: 1 }),
  question: Object.freeze({ label: "문항", rank: 2 }),
});

// 결과 하나가 어느 단위인지: 기출 문항(자른 문항) → 문항, PDF 쪽 카드 → 쪽, PDF 파일·이미지 파일 → 파일.
export function bookmarkLevel(result) {
  if (!result) return null;
  if (result.kind === "crop") return result.cropType === "question" ? "question" : "page";
  if (result.kind === "pdf") return /:page:\d+$/u.test(String(result.id || "")) ? "page" : "file";
  if (result.kind === "page") return "page";
  return "file";
}

const fileNameOf = (result) => String(result?.provenance?.displayName || result?.provenance?.locator || result?.sourceLabel || "").split(/[\\/]/u).pop();
// 위계 줄의 맨 앞 이름은 카드 제목과 같은 사람이 읽는 이름(「물리1 26년 9평」)으로 — 파일 이름(p1_2026_09.pdf)은 이름이 없을 때만.
const fileTitleOf = (result) => {
  const title = String(result?.title || "").trim();
  if (result?.kind === "crop" && result?.cropType === "question" && /\d+번$/u.test(title)) return title.replace(/\s*\d+번$/u, "");
  if (result?.kind === "pdf" && title) return title.replace(/\s*·\s*\d+쪽$/u, "").replace(/\.pdf$/iu, "");
  if (title && result?.kind !== "crop") return title;
  return fileNameOf(result).replace(/\.[a-z0-9]+$/iu, "") || title || "자료";
};

// 별표 한 개에 남기는 것: 다시 찾을 열쇠(결과 id)와 위계를 보여 줄 이름들. 썸네일은 남기지 않는다(저장 공간).
export function bookmarkFor(result, now = Date.now()) {
  const level = bookmarkLevel(result);
  if (!level || !result?.id) return null;
  const pageNumber = Number(result.provenance?.pageNumber ?? result.metadata?.pageNumber) || null;
  const itemNumber = Number(result.metadata?.itemNumber) || null;
  return {
    key: `${level}:${result.id}`, level, resultId: String(result.id), kind: result.kind || "",
    title: String(result.title || fileTitleOf(result)), file: String(fileTitleOf(result)),
    page: level === "file" ? null : pageNumber, item: level === "question" ? itemNumber : null,
    documentId: result.provenance?.documentId || result.documentId || null, at: now,
  };
}

// 위계 줄: 「물리1 27년 10월 학평 › 3쪽 › 14번」. 파일 별표는 파일 이름만.
export function bookmarkPath(bookmark) {
  const parts = [bookmark?.file || bookmark?.title || "자료"];
  if (bookmark?.level !== "file" && bookmark?.page) parts.push(`${bookmark.page}쪽`);
  if (bookmark?.level === "question" && bookmark?.item) parts.push(`${bookmark.item}번`);
  return parts.join(" › ");
}

export function loadBookmarks(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(BOOKMARK_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.key === "string" && BOOKMARK_LEVELS[item.level]).sort((a, b) => (b.at || 0) - (a.at || 0)) : [];
  } catch { return []; }
}

function saveBookmarks(list, storage) {
  try { storage?.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(list.slice(0, 2000))); return true; } catch { return false; }
}

export function isBookmarked(result, storage = globalThis.localStorage, list = loadBookmarks(storage)) {
  const level = bookmarkLevel(result);
  return Boolean(level && result?.id && list.some((item) => item.key === `${level}:${result.id}`));
}

// 켜기/끄기. 돌려줌: { on, ok }. 바뀌면 창에 알린다(카드·미리보기·별표 상자가 함께 바뀌게).
export function toggleBookmark(result, { storage = globalThis.localStorage, on = null, now = Date.now() } = {}) {
  const bookmark = bookmarkFor(result, now);
  if (!bookmark) return { on: false, ok: false };
  const list = loadBookmarks(storage);
  const exists = list.some((item) => item.key === bookmark.key);
  const want = on === null ? !exists : Boolean(on);
  const next = want ? [bookmark, ...list.filter((item) => item.key !== bookmark.key)] : list.filter((item) => item.key !== bookmark.key);
  const ok = saveBookmarks(next, storage);
  if (ok) try { globalThis.dispatchEvent?.(new CustomEvent(BOOKMARK_EVENT, { detail: { key: bookmark.key, on: want } })); } catch {}
  return { on: ok ? want : exists, ok };
}

export function removeBookmark(key, storage = globalThis.localStorage) {
  const list = loadBookmarks(storage), next = list.filter((item) => item.key !== key);
  const ok = saveBookmarks(next, storage);
  if (ok) try { globalThis.dispatchEvent?.(new CustomEvent(BOOKMARK_EVENT, { detail: { key, on: false } })); } catch {}
  return ok;
}
