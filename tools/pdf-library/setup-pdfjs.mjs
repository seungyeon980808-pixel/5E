import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_VERSION = "6.3.289";
const require = createRequire(import.meta.url);
const packagePath = require.resolve("pdfjs-dist/package.json");
const packageRoot = dirname(packagePath);
const packageMetadata = JSON.parse(await readFile(packagePath, "utf8"));
if (packageMetadata.version !== EXPECTED_VERSION || packageMetadata.license !== "Apache-2.0") {
  throw new Error(`Expected pdfjs-dist ${EXPECTED_VERSION} under Apache-2.0`);
}

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const destination = join(repositoryRoot, "vendor", "pdfjs");
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(join(packageRoot, entry), join(destination, entry), { recursive: true });
}
for (const entry of ["LICENSE", "legacy/build/pdf.mjs", "legacy/build/pdf.worker.mjs"]) {
  await cp(join(packageRoot, entry), join(destination, entry.replace("legacy/build/", "")));
}
