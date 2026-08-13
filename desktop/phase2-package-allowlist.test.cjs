const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PACKAGE = require(path.join(ROOT, "package.json"));
const SOURCE_POLICY = require(path.join(ROOT, "scripts", "stabilization", "package-assets-policy.json"));
const { auditPackageSources } = require(path.join(ROOT, "scripts", "stabilization", "package-assets-audit.cjs"));

const APPROVED_BUILD_FILES = Object.freeze([
  "index.html",
  "css/**/*",
  "js/**/*",
  "desktop/main.cjs",
  "desktop/preload.cjs",
  "desktop/splash.html",
  "desktop/codex-turn-runtime.cjs",
  "desktop/ai-thread-profile.cjs",
  "desktop/codex-process-failure.cjs",
  "desktop/local-assets.cjs",
  "fonts/**/*",
  "vendor/pdfjs/LICENSE",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/pdfjs/cmaps/**/*",
  "vendor/pdfjs/standard_fonts/**/*",
  "assets/apple-touch-icon.png",
  "assets/favicon.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/icon.ico",
  "assets/logo.svg",
  "assets/og-image.png",
  "assets/svg_object/**/*",
]);

test("production package uses only the approved runtime file set", () => {
  // Given
  const configuredFiles = PACKAGE.build.files;

  // When
  const sortedConfiguredFiles = [...configuredFiles].sort();

  // Then
  assert.deepEqual(sortedConfiguredFiles, [...APPROVED_BUILD_FILES].sort());
});

test("production package source policy passes with every required runtime included", () => {
  // Given
  const expectedRuntimePaths = [...SOURCE_POLICY.requiredRuntime].sort();

  // When
  const report = auditPackageSources({ root: ROOT, policy: SOURCE_POLICY });

  // Then
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.requiredRuntime.map(({ path: relativePath }) => relativePath), expectedRuntimePaths);
  assert.equal(report.requiredRuntime.every(({ present, included }) => present && included), true);
});
