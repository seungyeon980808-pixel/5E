/* ===== CHECK-SYNC — 레지스트리 드리프트 검사 =====
 *
 * 타입 목록(21종)은 앱에서 직접 import 하므로 어긋날 수 없지만, kind/element 이름은
 * 렌더러 함수 이름으로만 존재해 import 할 수 없다 → lib/schema.js에 손으로 적혀 있다.
 * 5E에 새 소자·심볼이 추가되면 이 스크립트가 알려준다.
 *
 *   node tools/mcp-5e/check-sync.mjs
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { OPTICS_KINDS, APPARATUS_KINDS, CIRCUIT_ELEMENTS, SVG_ASSET_IDS } from "./lib/schema.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

// `const NAME = {` 다음부터 짝이 맞는 닫는 중괄호까지의 2칸 들여쓴 함수 이름들
function objectLiteralKeys(src, constName) {
  const start = src.indexOf(`const ${constName} = {`);
  if (start < 0) return null;
  const body = src.slice(start);
  const end = body.indexOf("\n};");
  return [...body.slice(0, end).matchAll(/^ {2}([a-z_][a-z0-9_]*)\(/gim)].map((m) => m[1]);
}

function diff(name, expected, actual) {
  if (!actual) return `⚠ ${name}: 소스에서 목록을 찾지 못했습니다 (렌더러 구조가 바뀐 듯 — 수동 확인 필요)`;
  const missing = actual.filter((k) => !expected.includes(k));
  const extra = expected.filter((k) => !actual.includes(k));
  if (!missing.length && !extra.length) return `✅ ${name}: ${actual.length}개 일치`;
  return [
    `❌ ${name} 불일치`,
    missing.length ? `   앱에만 있음(schema.js에 추가할 것): ${missing.join(", ")}` : "",
    extra.length ? `   schema.js에만 있음(앱에서 사라짐): ${extra.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

const circuitSrc = await read("js/render/circuit.js");
const opticsSrc = await read("js/render/optics-apparatus.js");
const assetsSrc = await read("js/svg-assets.js");

const results = [
  diff("circuit element", CIRCUIT_ELEMENTS, objectLiteralKeys(circuitSrc, "CIRCUIT_ELEMENTS")),
  diff("optics kind", OPTICS_KINDS, objectLiteralKeys(opticsSrc, "OPTICS_KINDS")),
  diff("apparatus kind", APPARATUS_KINDS,
    [...opticsSrc.matchAll(/kind === "([a-z_]+)"/g)].map((m) => m[1])
      .filter((k, i, a) => a.indexOf(k) === i && k !== "node")),
  diff("svgAsset id", SVG_ASSET_IDS,
    [...assetsSrc.matchAll(/^\s*id: "([a-z_]+)"/gm)].map((m) => m[1])),
];

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("❌")) ? 1 : 0);
