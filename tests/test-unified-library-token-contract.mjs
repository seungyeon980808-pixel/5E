import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../css/unified-library.css", import.meta.url);

function liveDeclarations(css) {
  const rootStart = css.indexOf(".unified-library-overlay {");
  assert.notEqual(rootStart, -1, "Unified Library component root must exist");
  const rootEnd = css.indexOf("\n}", rootStart);
  assert.notEqual(rootEnd, -1, "Unified Library component root must close");
  return `${css.slice(0, rootStart)}${css.slice(rootEnd + 2)}`
    .replace(/@media\s*\([^)]*\)/g, "@media (documented-breakpoint)");
}

test("Unified Library live declarations consume semantic tokens for governed visual literals", async () => {
  const css = await readFile(cssUrl, "utf8");
  const liveCss = liveDeclarations(css);
  const forbidden = [
    /(?<![-\w.])\d*\.?\d+(?:px|rem|ms)\b/g,
    /#[\da-f]{3,8}\b/gi,
    /\brgba?\(/g,
    /\b(?:font-weight|line-height|stroke-width):\s*(?!var\()\d*\.?\d+/g,
  ];
  const literalViolations = forbidden.flatMap((pattern) => [...liveCss.matchAll(pattern)].map((match) => match[0]));
  const shadowViolations = [...liveCss.matchAll(/\bbox-shadow:\s*([^;}]+)/g)]
    .map((match) => match[1].trim())
    .filter((value) => !value.startsWith("var(--unilib-"));
  const violations = [...literalViolations, ...shadowViolations];
  assert.deepEqual(violations, [], `untokenized Unified Library literals: ${violations.join(", ")}`);
});

test("Unified Library root names the complete responsive geometry and interaction contract", async () => {
  const css = await readFile(cssUrl, "utf8");
  for (const token of [
    "--unilib-focus-outline-width",
    "--unilib-focus-outline-offset",
    "--unilib-border-width",
    "--unilib-header-height",
    "--unilib-desktop-columns",
    "--unilib-tablet-columns",
    "--unilib-search-height",
    "--unilib-result-card-height",
    "--unilib-stage-height",
    "--unilib-mobile-card-columns",
    "--unilib-mobile-thumb-height",
    "--unilib-dialog-width",
    "--unilib-lightbox-width",
    "--unilib-line-height-body",
    "--unilib-font-weight-strong",
    "--unilib-reduced-motion-duration",
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*[^;]+;`), `missing ${token}`);
    const usagePattern = new RegExp(`var\\(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`, "g");
    assert.ok([...css.matchAll(usagePattern)].length >= 1, `unused ${token}`);
  }
});
