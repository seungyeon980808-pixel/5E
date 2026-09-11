#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";
import { FIXTURES, FIXTURE_SCHEMA, FONT } from "./fixture-spec.mjs";

const experimentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDirectory, "../..");
const fixtureDirectory = path.join(repositoryRoot, "tests/fixtures/image-ocr");
const fontPath = path.join(fixtureDirectory, FONT.file);
const writeMode = process.argv.includes("--write");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fixtureSvg(fixture) {
  const baseline = Math.round((fixture.height + fixture.fontSize * 0.72) / 2);
  const content = fixture.svgMarkup || xml(fixture.expected);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fixture.width}" height="${fixture.height}" viewBox="0 0 ${fixture.width} ${fixture.height}">
  <rect width="${fixture.width}" height="${fixture.height}" fill="#ffffff"/>
  <text x="14" y="${baseline}" fill="${fixture.fill}" font-family="${FONT.family}" font-size="${fixture.fontSize}" font-weight="400" xml:space="preserve">${content}</text>
</svg>
`;
}

async function expectedFile(file, bytes) {
  if (writeMode) {
    await writeFile(file, bytes);
    return;
  }
  let current;
  try {
    current = await readFile(file);
  } catch {
    throw new Error(`Fixture is missing: ${path.relative(repositoryRoot, file)}`);
  }
  if (!current.equals(Buffer.from(bytes))) {
    throw new Error(`Fixture is stale: ${path.relative(repositoryRoot, file)} (run npm run fixtures:write)`);
  }
}

const font = await readFile(fontPath);
if (font.byteLength !== FONT.bytes || sha256(font) !== FONT.sha256) {
  throw new Error(`Fixture font does not match the pinned ${FONT.file} bytes.`);
}

const manifestFixtures = [];
for (const fixture of FIXTURES) {
  const svg = fixtureSvg(fixture);
  const rendered = new Resvg(svg, {
    background: "#ffffff",
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false,
      defaultFontFamily: FONT.family,
    },
  }).render();
  const png = rendered.asPng();
  const svgFile = `${fixture.id}.svg`;
  const pngFile = `${fixture.id}.png`;
  await expectedFile(path.join(fixtureDirectory, svgFile), svg);
  await expectedFile(path.join(fixtureDirectory, pngFile), png);
  manifestFixtures.push({
    ...fixture,
    svg: svgFile,
    png: pngFile,
    svgSha256: sha256(svg),
    pngSha256: sha256(png),
    pngBytes: png.byteLength,
  });
}

const manifest = `${JSON.stringify({
  schema: FIXTURE_SCHEMA,
  normalization: "NFC; CRLF to LF; trim lines; remove blank lines; collapse horizontal whitespace",
  font: FONT,
  generator: {
    runtime: "Node.js >=20",
    renderer: "@resvg/resvg-js@2.6.2",
    systemFonts: false,
  },
  fixtures: manifestFixtures,
}, null, 2)}\n`;
await expectedFile(path.join(fixtureDirectory, "manifest.json"), manifest);
console.log(`${writeMode ? "Wrote" : "Verified"} ${FIXTURES.length} deterministic OCR fixtures.`);
