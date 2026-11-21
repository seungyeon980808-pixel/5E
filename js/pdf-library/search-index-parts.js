// 11-20: 「5E 공유 자료」 검색 색인 나눠 받기.
// 앱은 JSON 파일 하나를 32MiB까지만 받는데(remote-pack.js MAX_JSON_BYTES), search-index.json이 2027 수능까지 넣고 33.18MB라
// 시험 하나(약 65만 바이트)도 더 들어가지 않았다. 그래서 첫 색인(search-index.json)은 그대로 두고, 새 시험은 조각 파일
// (search-index-2.json, search-index-3.json …)에 넣는다. 조각 목록은 search-index-parts.json에 두고 checksums.json에 해시를 적는다.
// - 옛 판(1.7.1 이하)은 pack.json·search-index.json만 읽으므로 그대로 동작한다(조각에 든 시험만 본문 검색에 안 나온다).
// - pack.json 모양은 바꾸지 않는다(옛 판 pack-store가 정해진 칸만 남겨 해시를 맞추기 때문).
// - 32MiB 한도는 조각마다. 조각이 차면 다음 번호 조각을 만든다.
export const SEARCH_INDEX_PARTS_PATH = "search-index-parts.json";
export const SEARCH_INDEX_PARTS_SCHEMA = "pdf-search-index-parts-v1";
export const MAX_SEARCH_INDEX_PARTS = 64;
const PART_PATTERN = /^search-index-(\d+)\.json$/;

export function searchIndexPartName(number) {
  if (!Number.isInteger(number) || number < 2 || number > MAX_SEARCH_INDEX_PARTS + 1) throw new RangeError("search index part number is invalid");
  return `search-index-${number}.json`;
}

// 목록 파일을 검사하고 조각 경로 배열을 돌려준다. 경로는 묶음 맨 위의 search-index-<n>.json만 허용한다.
export function searchIndexPartPaths(manifest, label = SEARCH_INDEX_PARTS_PATH) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.schemaVersion !== SEARCH_INDEX_PARTS_SCHEMA
    || !Array.isArray(manifest.parts) || manifest.parts.length > MAX_SEARCH_INDEX_PARTS) {
    throw new TypeError(`${label}: unsupported search index parts manifest`);
  }
  const seen = new Set();
  return manifest.parts.map((part, index) => {
    if (typeof part !== "string" || !PART_PATTERN.test(part) || seen.has(part)) throw new TypeError(`${label}.parts[${index}] is invalid`);
    seen.add(part);
    return part;
  });
}

// 정적 거울(5e-exam-pdf)에 조각으로 올리는 색인 파일 이름: 첫 색인과 조각들.
export function isSearchIndexFile(name) {
  return name === "search-index.json" || PART_PATTERN.test(name);
}
