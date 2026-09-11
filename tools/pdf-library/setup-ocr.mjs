import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_PACKAGES = Object.freeze([
  Object.freeze({ name: "tesseract.js", version: "7.0.0", license: "Apache-2.0" }),
  Object.freeze({ name: "tesseract.js-core", version: "7.0.0", license: "Apache-2.0" }),
  Object.freeze({ name: "@tesseract.js-data/eng", version: "1.0.0", license: "MIT" }),
  Object.freeze({ name: "@tesseract.js-data/kor", version: "1.0.0", license: "MIT" }),
]);
const require = createRequire(import.meta.url);

async function packageRoot(expected) {
  const metadataPath = require.resolve(`${expected.name}/package.json`);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (metadata.version !== expected.version || metadata.license !== expected.license) {
    throw new Error(`Expected ${expected.name} ${expected.version} under ${expected.license}`);
  }
  return dirname(metadataPath);
}

const roots = new Map();
for (const expected of EXPECTED_PACKAGES) roots.set(expected.name, await packageRoot(expected));

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const destination = join(repositoryRoot, "vendor", "ocr");
await rm(destination, { recursive: true, force: true });
await mkdir(join(destination, "lang"), { recursive: true });

const tesseractRoot = roots.get("tesseract.js");
const coreRoot = roots.get("tesseract.js-core");
await cp(join(tesseractRoot, "LICENSE.md"), join(destination, "LICENSE-tesseract.md"));
await cp(join(tesseractRoot, "dist", "tesseract.esm.min.js"), join(destination, "tesseract.esm.min.js"));
await cp(join(tesseractRoot, "dist", "worker.min.js"), join(destination, "worker.min.js"));
await cp(join(coreRoot, "LICENSE"), join(destination, "LICENSE-tesseract-core"));
for (const entry of ["tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm"]) {
  await cp(join(coreRoot, entry), join(destination, entry));
}
for (const language of ["eng", "kor"]) {
  const source = join(roots.get(`@tesseract.js-data/${language}`), "4.0.0_best_int", `${language}.traineddata.gz`);
  await cp(source, join(destination, "lang", `${language}.traineddata.gz`));
}

const assetPaths = [
  "tesseract.esm.min.js",
  "worker.min.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "lang/eng.traineddata.gz",
  "lang/kor.traineddata.gz",
];
const assets = [];
for (const path of assetPaths) {
  const bytes = await readFile(join(destination, path));
  assets.push(Object.freeze({ path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }));
}
await writeFile(join(destination, "manifest.json"), `${JSON.stringify({
  schemaVersion: "pdf-ocr-assets-v1",
  packages: EXPECTED_PACKAGES,
  assets,
}, null, 2)}\n`);
