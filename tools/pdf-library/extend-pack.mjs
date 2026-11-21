// 「5E 공유 자료」 묶음(5e.shared.drive)에 새 시험지 PDF를 더한다(11-19, 2027학년도 수능 과탐 8과목).
// 옛 도구 tools/pdf-library/build-pack.mjs(d982c73a, 1.6.x)와 같은 앱 코드(pdf-runtime·search·figure-candidates)로
// 새 PDF만 색인하고, 기존 문서·검색 항목·그림 후보는 그대로 두고 뒤에 붙인다.
// 검색 색인은 앱이 파일 하나를 32MiB(remote-pack.js MAX_JSON_BYTES)까지만 받는다. 첫 색인 search-index.json은
// 2027 수능까지 넣고 33.18MB(11-19에 모든 줄 상자를 소수 셋째 자리로 줄여 맞춤)라 더 넣을 수 없다.
// 11-20부터: 첫 색인은 건드리지 않고, 새 시험의 항목은 조각 색인(search-index-2.json …)에 넣는다
// (js/pdf-library/search-index-parts.js, 목록 search-index-parts.json). 마지막 조각에 들어가면 거기에, 넘치면 새 조각을 만든다.
// 1.7.1 이하 앱은 첫 색인만 읽으므로 조각에 든 시험만 본문 검색에 안 나온다(목록·미리보기는 됨).
// spec.compactWordsDigits(기본 4)는 새 항목에만 쓴다.
// 원본 묶음 폴더는 읽기만 한다. 결과는 --output 폴더에 pack.json·checksums.json·catalog.json·색인 파일 전부와 새 PDF만 쓴다.
//
// 실행: node tools/pdf-library/extend-pack.mjs --pack <기존 묶음 폴더> --spec <spec.json> --output <새 폴더>
// spec.json: { "version": "1.1.0", "documents": [{ "source": "<PDF 경로>", "destination": "기출문제/물리1/p1_2027_11.pdf", "id": "kice-p1_2027_11" }] }
//   source는 spec.json 위치 기준 상대 경로도 된다. title은 파일 이름(기존 묶음과 같음).
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPdfRuntime } from "../../js/pdf-library/pdf-runtime.js";
import { buildSearchIndex } from "../../js/pdf-library/search.js";
import { SEARCH_INDEX_PARTS_PATH, SEARCH_INDEX_PARTS_SCHEMA, searchIndexPartName, searchIndexPartPaths } from "../../js/pdf-library/search-index-parts.js";

const round4 = (value) => Math.round(value * 10000) / 10000;
const MAX_JSON_BYTES = 32 * 1024 * 1024; // js/pdf-library/remote-pack.js와 같은 값
// 줄 상자 좌표를 digits 자리로. 폭·높이가 0이 되면 앱이 색인 전체를 거부하므로 최소 한 칸(10^-digits)은 남긴다.
function roundCompactWords(words, digits) {
  const unit = 10 ** digits, round = (value) => Math.round(value * unit) / unit;
  return words.map(([text, x, y, width, height]) => [text, round(x), round(y), Math.max(1 / unit, round(width)), Math.max(1 / unit, round(height))]);
}
// 그림 후보 안 숫자(좌표)도 기존 묶음처럼 소수 넷째 자리로.
const roundDeep = (value) => typeof value === "number" ? round4(value)
  : Array.isArray(value) ? value.map(roundDeep)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, roundDeep(inner)])) : value;

// 기존 묶음의 compactWords는 낱말이 아니라 「같은 줄에 붙어 있는 낱말 묶음」 단위다(형광은 그 안에서 글자 비율로 나눈다).
// 같은 줄(위치 차 0.002 이하)이고 간격이 쪽 폭의 1.9% 이하이면 한 묶음으로 합친다 — 기존 묶음과 비교해 맞춘 값(11-19).
export function lineWords(words, { gap = 0.019, line = 0.002 } = {}) {
  const out = [];
  for (const word of words) {
    const [x, y, width, height] = word.rect;
    const last = out.at(-1);
    if (last && Math.abs(y - last.y) <= line && x >= last.x && x - (last.x + last.width) <= gap) {
      const right = Math.max(last.x + last.width, x + width), top = Math.min(last.top, y), bottom = Math.max(last.top + last.height, y + height);
      Object.assign(last, { text: `${last.text} ${word.text}`, width: right - last.x, top, height: bottom - top });
    } else out.push({ text: word.text, x, y, width, top: y, height });
  }
  return out.map((group) => [group.text, round4(group.x), round4(group.top), round4(group.width), round4(group.height)]);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 값이 없습니다.`);
  return path.resolve(value);
}

function safeDestination(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`안전하지 않은 경로: ${value}`);
  }
  return value;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function extendPack({ packDir, spec, specRoot, output, log = () => {} }) {
  const readJson = async (name) => JSON.parse(await readFile(path.join(packDir, name), "utf8"));
  const pack = await readJson("pack.json");
  const checksums = await readJson("checksums.json");
  // 기존 묶음이 스스로 맞는지 먼저 본다(pack.json 해시·catalog·search-index 해시).
  if (sha256(JSON.stringify(pack)) !== checksums.pack) throw new Error("기존 pack.json 해시가 checksums.json과 다릅니다.");
  const catalogBytes = await readFile(path.join(packDir, pack.paths.catalog));
  const indexBytes = await readFile(path.join(packDir, pack.paths.searchIndex));
  if (sha256(catalogBytes) !== checksums.files[pack.paths.catalog]) throw new Error("기존 catalog.json 해시가 다릅니다.");
  if (sha256(indexBytes) !== checksums.files[pack.paths.searchIndex]) throw new Error("기존 search-index.json 해시가 다릅니다.");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const searchIndex = JSON.parse(indexBytes.toString("utf8"));
  // 조각 색인이 이미 있으면 그 해시도 확인한다.
  const partPaths = checksums.files[SEARCH_INDEX_PARTS_PATH]
    ? searchIndexPartPaths(JSON.parse(await readFile(path.join(packDir, SEARCH_INDEX_PARTS_PATH), "utf8")))
    : [];
  if (partPaths.length && sha256(await readFile(path.join(packDir, SEARCH_INDEX_PARTS_PATH))) !== checksums.files[SEARCH_INDEX_PARTS_PATH]) throw new Error("기존 search-index-parts.json 해시가 다릅니다.");
  const parts = [];
  for (const partPath of partPaths) {
    const bytes = await readFile(path.join(packDir, partPath));
    if (sha256(bytes) !== checksums.files[partPath]) throw new Error(`기존 ${partPath} 해시가 다릅니다.`);
    parts.push({ path: partPath, index: JSON.parse(bytes.toString("utf8")) });
  }

  const existingPaths = new Set(pack.paths.documents);
  const existingIds = new Set(catalog.documents.map((document) => document.id));
  const runtime = createPdfRuntime();
  const added = [];
  try {
    for (const input of spec.documents) {
      const destination = safeDestination(input.destination);
      if (existingPaths.has(destination)) throw new Error(`이미 묶음에 있는 경로: ${destination}`);
      if (existingIds.has(input.id)) throw new Error(`이미 있는 문서 id: ${input.id}`);
      const sourcePath = path.resolve(specRoot, input.source);
      const bytes = new Uint8Array(await readFile(sourcePath));
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error(`PDF가 아닙니다: ${sourcePath}`);
      const title = input.title || path.basename(destination);
      const document = await runtime.openDocument({
        id: input.id, title,
        source: { kind: "pack", locator: `${pack.id}/${destination}`, displayName: path.basename(destination) },
        data: bytes,
      });
      const figureCandidates = {};
      for (const page of document.pages) {
        for (const item of page.items) {
          figureCandidates[item.id] = roundDeep(await runtime.detectFigureCandidates({ documentId: document.id, pageNumber: page.pageNumber, item }));
        }
      }
      const entries = buildSearchIndex([document]).entries.map((entry) => ({
        ...entry,
        words: [],
        source: { ...entry.source, rect: entry.source.rect.map(round4) },
        // 기존 묶음(9월 생성분)과 같은 모양: 줄 단위 낱말 상자, 소수 넷째 자리.
        compactWords: lineWords(entry.words),
        metadata: null,
        figureCandidates: entry.itemId ? figureCandidates[entry.itemId]?.candidates ?? [] : [],
      }));
      added.push({ destination, sourcePath, bytes, document: { ...document, pages: [] }, figureCandidates, entries });
      log(`${title}: ${document.pageCount}쪽 · 문항 ${entries.filter((entry) => entry.itemId).length}개`);
    }
  } finally {
    await runtime.clearCache?.();
  }

  const nextCatalog = {
    ...catalog,
    documents: [...catalog.documents, ...added.map((item) => item.document)],
    figureCandidates: Object.assign({}, catalog.figureCandidates, ...added.map((item) => item.figureCandidates)),
  };
  const digits = spec.compactWordsDigits ?? 4;
  const newEntries = added.flatMap((item) => item.entries)
    .map((entry) => digits === 4 || !entry.compactWords ? entry : { ...entry, compactWords: roundCompactWords(entry.compactWords, digits) });
  // 새 항목은 마지막 조각 뒤에 붙인다. 32MiB를 넘으면 새 조각으로.
  const indexText = (index) => `${JSON.stringify(index)}\n`;
  const last = parts.at(-1);
  const appended = last && { ...last, index: { ...last.index, entries: [...last.index.entries, ...newEntries] } };
  let nextParts;
  if (appended && Buffer.byteLength(indexText(appended.index)) <= MAX_JSON_BYTES) nextParts = [...parts.slice(0, -1), appended];
  else nextParts = [...parts, { path: searchIndexPartName(parts.length + 2), index: { schemaVersion: searchIndex.schemaVersion, entries: newEntries } }];
  for (const part of nextParts) {
    const bytes = Buffer.byteLength(indexText(part.index));
    if (bytes > MAX_JSON_BYTES) throw new Error(`${part.path}이 ${bytes}바이트로 앱 상한 ${MAX_JSON_BYTES}를 넘습니다. 시험을 나눠 넣으세요.`);
    log(`${part.path}: 항목 ${part.index.entries.length}개 · ${bytes}바이트 · 상한까지 ${MAX_JSON_BYTES - bytes}바이트 남음`);
  }
  const partsManifest = { schemaVersion: SEARCH_INDEX_PARTS_SCHEMA, parts: nextParts.map((part) => part.path) };
  const nextPack = {
    ...pack,
    version: spec.version || pack.version,
    documentCount: nextCatalog.documents.length,
    pageCount: pack.pageCount + added.reduce((sum, item) => sum + item.document.pageCount, 0),
    paths: { ...pack.paths, documents: [...added.map((item) => item.destination), ...pack.paths.documents] },
    createdAt: spec.createdAt || new Date().toISOString(),
  };

  await mkdir(output, { recursive: true });
  const catalogText = `${JSON.stringify(nextCatalog)}\n`;
  await writeFile(path.join(output, nextPack.paths.catalog), catalogText);
  // 첫 색인은 바이트 그대로 옮긴다(1.7.1 이하 앱이 받아 둔 것을 다시 받지 않게).
  await writeFile(path.join(output, nextPack.paths.searchIndex), indexBytes);
  const files = { ...checksums.files, [nextPack.paths.catalog]: sha256(catalogText) };
  for (const part of nextParts) {
    const text = indexText(part.index);
    await writeFile(path.join(output, part.path), text);
    files[part.path] = sha256(text);
  }
  const manifestText = `${JSON.stringify(partsManifest)}\n`;
  await writeFile(path.join(output, SEARCH_INDEX_PARTS_PATH), manifestText);
  files[SEARCH_INDEX_PARTS_PATH] = sha256(manifestText);
  await writeFile(path.join(output, "pack.json"), `${JSON.stringify(nextPack, null, 2)}\n`);
  for (const item of added) {
    files[item.destination] = sha256(item.bytes);
    const target = path.join(output, item.destination);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(item.sourcePath, target);
  }
  const sorted = Object.fromEntries(Object.keys(files).sort().map((key) => [key, files[key]]));
  await writeFile(path.join(output, "checksums.json"), `${JSON.stringify({ algorithm: "sha256", pack: sha256(JSON.stringify(nextPack)), files: sorted }, null, 2)}\n`);
  return { pack: nextPack, parts: partsManifest.parts, added: added.map((item) => ({ id: item.document.id, destination: item.destination, sha256: sha256(item.bytes), pageCount: item.document.pageCount, items: item.entries.filter((entry) => entry.itemId).length })) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const specPath = argument("--spec");
  const result = await extendPack({
    packDir: argument("--pack"),
    spec: JSON.parse(await readFile(specPath, "utf8")),
    specRoot: path.dirname(specPath),
    output: argument("--output"),
    log: (line) => process.stdout.write(`${line}\n`),
  });
  process.stdout.write(`${JSON.stringify({ version: result.pack.version, documents: result.pack.documentCount, pages: result.pack.pageCount, added: result.added }, null, 1)}\n`);
}
