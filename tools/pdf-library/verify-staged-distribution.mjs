import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node tools/pdf-library/verify-staged-distribution.mjs STAGE_DIRECTORY");
const requirePdfPackBaseUrl = process.argv.includes("--require-pdf-pack-base-url");

const stage = path.resolve(directory);
const manifest = JSON.parse(await readFile(path.join(stage, "stage-manifest.json"), "utf8"));
if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error("Invalid stage manifest.");
if (manifest.retained?.tutorialAsset !== "assets/exam-library/images/p2_2027_06_13.png") throw new Error("Tutorial PNG retention is missing.");
if (!Array.isArray(manifest.retained?.fixtureFiles) || manifest.retained.fixtureFiles.length !== 6) throw new Error("Expected six retained QA fixtures.");
if (manifest.retained?.sampleCatalog !== "assets/exam-library/sample-catalog.json" || !Array.isArray(manifest.retained.sampleAssets) || manifest.retained.sampleAssets.length !== 7) {
  throw new Error("Expected the partial offline sample catalog and seven sample assets.");
}
const sampleCatalog = JSON.parse(await readFile(path.join(stage, manifest.retained.sampleCatalog), "utf8"));
const catalogAssets = sampleCatalog.items?.map((item) => item.url).sort();
if (sampleCatalog.version !== "exam-library-v1" || sampleCatalog.complete !== false || catalogAssets?.length !== 7
  || JSON.stringify(catalogAssets) !== JSON.stringify([...manifest.retained.sampleAssets].sort())) {
  throw new Error("Staged offline sample catalog does not match its retained assets.");
}
if (!manifest.files.some((file) => file.path.startsWith("vendor/pdfjs/"))) throw new Error("PDF.js runtime is missing.");
if (!manifest.files.some((file) => file.path.startsWith("vendor/ocr/"))) throw new Error("OCR runtime is missing.");
if (manifest.files.some((file) => file.path.split("/").some((segment) => [".omo", "node_modules", ".cache", "cache"].includes(segment)))) {
  throw new Error("Generated evidence, dependency, or cache output is staged.");
}
const sourceLegacyPngCount = manifest.excluded?.sourceLegacyPngCount;
if (!Number.isInteger(sourceLegacyPngCount) || sourceLegacyPngCount < 1) throw new Error("Stage manifest has an invalid legacy PNG source count.");
if (manifest.excluded?.legacyExamPngCount !== sourceLegacyPngCount - manifest.retained.sampleAssets.length) throw new Error("Stage manifest has an invalid excluded legacy PNG count.");
const packagedLegacyPngs = manifest.files.filter((file) => file.path.startsWith("assets/exam-library/images/") && file.path.endsWith(".png"));
if (packagedLegacyPngs.length !== manifest.retained.sampleAssets.length || packagedLegacyPngs.some((file) => !manifest.retained.sampleAssets.includes(file.path))) {
  throw new Error("Stage exam PNGs do not match the offline sample catalog.");
}
if (requirePdfPackBaseUrl) {
  const configuredBaseUrl = manifest.pdfPack?.baseUrl;
  if (typeof configuredBaseUrl !== "string" || configuredBaseUrl === "") throw new Error("Staged PDF pack base URL is missing.");
  const index = await readFile(path.join(stage, "index.html"), "utf8");
  const expected = `window.FIVE_E_PDF_PACK_BASE_URL = ${JSON.stringify(configuredBaseUrl)}`;
  if (!index.includes("<!-- staged-pdf-library-default -->") || !index.includes(expected)) throw new Error("Staged HTML does not configure the PDF pack base URL.");
}
for (const file of manifest.files) {
  const target = path.join(stage, file.path);
  const [details, bytes] = await Promise.all([stat(target), readFile(target)]);
  if (details.size !== file.bytes) throw new Error(`Byte mismatch: ${file.path}`);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== file.sha256) throw new Error(`SHA-256 mismatch: ${file.path}`);
}
process.stdout.write(`${JSON.stringify({ valid: true, stage, files: manifest.totals.files, bytes: manifest.totals.bytes, retainedFixtures: manifest.retained.fixtureFiles.length, excludedLegacyPngs: manifest.excluded.legacyExamPngCount, configuredPdfPackBaseUrl: manifest.pdfPack?.baseUrl || null })}\n`);
