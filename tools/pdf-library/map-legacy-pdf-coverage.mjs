import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const subjectPrefix = Object.freeze({ bio1: "b1", bio2: "b2", che1: "c1", che2: "c2", ear1: "e1", ear2: "e2", phy1: "p1", phy2: "p2" });
const sessionMonth = Object.freeze({ june: 6, september: 9, csat: 11 });

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Usage: node tools/pdf-library/map-legacy-pdf-coverage.mjs --output OUTPUT_JSON`);
  return path.resolve(value);
}

function parseDocumentPath(value) {
  const match = /^documents\/(\d{4})-(june|september|csat)-(bio1|bio2|che1|che2|ear1|ear2|phy1|phy2)\.pdf$/.exec(value);
  if (!match) throw new Error(`Unexpected pack document path: ${value}`);
  return { academicYear: Number(match[1]), session: match[2], subject: match[3] };
}

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function createMap() {
  const output = argument("--output");
  const packRoot = path.join(root, ".omo", "evidence", "pdf-library", "T5", "recent-three-pack");
  const corpusRoot = path.join(root, ".omo", "evidence", "pdf-library", "sources", "corpus");
  const [pack, checksums, legacy, catalogText] = await Promise.all([
    readFile(path.join(packRoot, "pack.json"), "utf8").then(JSON.parse),
    readFile(path.join(packRoot, "checksums.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "assets", "exam-library", "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(corpusRoot, "catalog_2024_2026.jsonl"), "utf8"),
  ]);
  if (pack.documentCount !== 72 || pack.pageCount !== 288 || !Array.isArray(pack.paths?.documents) || pack.paths.documents.length !== 72) {
    throw new Error("Expected the frozen 72-document, 288-page recent-three pack.");
  }
  const catalog = new Map(catalogText.trim().split("\n").map((line) => {
    const item = JSON.parse(line);
    return [path.basename(item.file), item.url];
  }));
  const sourceByHash = new Map();
  for (const name of (await readdir(corpusRoot)).filter((name) => name.endsWith(".pdf"))) sourceByHash.set(await digest(path.join(corpusRoot, name)), name);
  const legacyItems = legacy.items.filter((item) => item?.file && item.file.endsWith(".png"));
  const groups = pack.paths.documents.map((documentPath) => {
    const { academicYear, session, subject } = parseDocumentPath(documentPath);
    const digestValue = checksums.files[documentPath];
    const sourceFile = sourceByHash.get(digestValue);
    if (!sourceFile) throw new Error(`No corpus SHA-256 match for ${documentPath}`);
    const legacyPngIds = legacyItems
      .filter((item) => item.subject === subjectPrefix[subject] && item.year === academicYear - 1 && item.month === sessionMonth[session])
      .map((item) => item.id)
      .sort();
    return { documentPath, academicYear, session, subject, sha256: digestValue, sourceFile, sourceUrl: catalog.get(sourceFile) || null, legacyPngIds };
  });
  const covered = new Set(groups.flatMap((group) => group.legacyPngIds));
  const uncoveredPngIds = legacyItems.map((item) => item.id).filter((id) => !covered.has(id)).sort();
  const result = {
    schemaVersion: 1,
    pack: { id: pack.id, version: pack.version, documents: pack.documentCount, pages: pack.pageCount },
    recentThree: groups,
    legacy: {
      totalPngIds: legacyItems.length,
      coveredPngIds: [...covered].sort(),
      uncoveredPngIds,
      retainedTutorialPngIds: ["p2_2027_06_13"],
    },
  };
  if (covered.size + uncoveredPngIds.length !== legacyItems.length) throw new Error("Legacy PNG coverage is not a complete partition.");
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  const outputBytes = (await stat(output)).size;
  process.stdout.write(`${JSON.stringify({ output, groups: groups.length, coveredPngIds: covered.size, uncoveredPngIds: uncoveredPngIds.length, bytes: outputBytes })}\n`);
}

createMap().catch((error) => { // no-excuse-ok: boundary reporting
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
