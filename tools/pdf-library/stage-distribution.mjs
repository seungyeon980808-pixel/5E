import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tutorialAsset = "assets/exam-library/images/p2_2027_06_13.png";
const sampleCatalogPath = "assets/exam-library/sample-catalog.json";
const fixtureRoot = "docs/qa-fixtures/exam-library";
const excludedStageSegments = new Set([".omo", "node_modules", ".cache", "cache"]);

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Usage: node tools/pdf-library/stage-distribution.mjs --output EXTERNAL_DIRECTORY`);
  return path.resolve(value);
}

function optionalPackUrl(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Usage: node tools/pdf-library/stage-distribution.mjs --output EXTERNAL_DIRECTORY [${name} URL]`);
  if (!/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  const parsed = new URL(value);
  const loopback = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error(`${name} must use HTTPS or a relative candidate path.`);
  return parsed.href;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isStageExcluded(relativePath) {
  return relativePath.split("/").some((segment) => excludedStageSegments.has(segment));
}

function globPattern(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character !== "*") expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    else if (pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") { index += 1; expression += "(?:.*/)?"; }
      else expression += ".*";
    } else expression += "[^/]*";
  }
  return new RegExp(`${expression}$`);
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (relative === ".git" || relative === "node_modules") return [];
    if (entry.isDirectory()) return filesBelow(path.join(directory, entry.name), relative);
    return entry.isFile() ? [relative] : [];
  }));
  return found.flat();
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

async function copyWithDigest(relativePath, stage) {
  const source = path.join(root, relativePath);
  const destination = path.join(stage, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const [details, bytes] = await Promise.all([stat(source), import("node:fs/promises").then(({ readFile }) => readFile(source))]);
  return { path: relativePath, bytes: details.size, sha256: sha256(bytes) };
}

async function configurePdfPack(stage, files, baseUrl) {
  if (!baseUrl) return null;
  const relativePath = "index.html";
  const destination = path.join(stage, relativePath);
  const marker = "<!-- staged-pdf-library-default -->";
  const escapedUrl = JSON.stringify(baseUrl).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
  const injection = `${marker}\n  <script>window.FIVE_E_PDF_PACK_BASE_URL = ${escapedUrl};</script>\n  `;
  const source = await (await import("node:fs/promises")).readFile(destination, "utf8");
  if (source.includes(marker)) throw new Error("Stage HTML already has a PDF pack configuration marker.");
  const configured = source.replace(/<script type="module" src="js\/main\.js[^>]*><\/script>/, (script) => `${injection}${script}`);
  if (configured === source) throw new Error("Unable to place the staged PDF pack configuration before js/main.js.");
  await writeFile(destination, configured);
  const details = await stat(destination);
  const bytes = await (await import("node:fs/promises")).readFile(destination);
  const record = files.find((file) => file.path === relativePath);
  if (!record) throw new Error("Stage does not include index.html.");
  record.bytes = details.size;
  record.sha256 = sha256(bytes);
  return baseUrl;
}

async function stage() {
  const output = argument("--output");
  const pdfPackBaseUrl = optionalPackUrl("--pdf-pack-base-url");
  if (isInside(root, output)) throw new Error("Stage output must be outside the repository checkout.");
  try { await stat(output); throw new Error(`Stage output already exists: ${output}`); } catch (error) { if (error?.code !== "ENOENT") throw error; }

  const packageJson = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(root, "package.json"), "utf8"));
  const sampleCatalog = JSON.parse(await (await import("node:fs/promises")).readFile(path.join(root, sampleCatalogPath), "utf8"));
  const sampleAssets = sampleCatalog.items.map((item) => item.url);
  const patterns = packageJson.build.files.map(globPattern);
  const allFiles = await filesBelow(root);
  const packageFiles = allFiles.filter((file) => !isStageExcluded(file) && patterns.some((pattern) => pattern.test(file)));
  const fixtureFiles = allFiles.filter((file) => !isStageExcluded(file) && file.startsWith(`${fixtureRoot}/`) && file.endsWith(".png"));
  const selected = new Set([...packageFiles, ...fixtureFiles]);
  if (sampleCatalog.version !== "exam-library-v1" || sampleCatalog.complete !== false || sampleAssets.length === 0) {
    throw new Error("Offline sample catalog must describe an explicitly partial exam-library-v1 set.");
  }
  if (!sampleAssets.includes(tutorialAsset) || sampleAssets.some((file) => !selected.has(file))) {
    throw new Error("Offline sample catalog references an unstaged asset.");
  }

  const stage = `${output}.building-${randomUUID()}`;
  await mkdir(stage, { recursive: true });
  try {
    const files = [];
    for (const file of [...selected].sort()) files.push(await copyWithDigest(file, stage));
    const configuredPdfPackBaseUrl = await configurePdfPack(stage, files, pdfPackBaseUrl);
    const legacyImageCount = allFiles.filter((file) => file.startsWith("assets/exam-library/images/") && file.endsWith(".png")).length;
    const excludedLegacyPngCount = allFiles.filter((file) => file.startsWith("assets/exam-library/images/") && file.endsWith(".png") && !sampleAssets.includes(file)).length;
    const manifest = {
      schemaVersion: 1,
      sourcePackageVersion: packageJson.version,
      files,
      retained: { tutorialAsset, sampleCatalog: sampleCatalogPath, sampleAssets: sampleAssets.sort(), fixtureFiles: fixtureFiles.sort() },
      excluded: {
        legacyExamPngCount: excludedLegacyPngCount,
        sourceLegacyPngCount: legacyImageCount,
        sourcePath: "assets/exam-library/images",
      },
      pdfPack: { baseUrl: configuredPdfPackBaseUrl },
      totals: { files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0) },
    };
    await writeFile(path.join(stage, "stage-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(stage, output);
    process.stdout.write(`${JSON.stringify({ staged: output, files: manifest.totals.files, bytes: manifest.totals.bytes, excludedLegacyPngs: manifest.excluded.legacyExamPngCount })}\n`);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

stage().catch((error) => { // no-excuse-ok: boundary reporting
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
