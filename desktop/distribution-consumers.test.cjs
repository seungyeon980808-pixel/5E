const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function globPattern(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character !== "*") {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    } else if (pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        expression += "(?:.*/)?";
      } else {
        expression += ".*";
      }
    } else {
      expression += "[^/]*";
    }
  }
  return new RegExp(`${expression}$`);
}

function filesOnDisk(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (relative === "node_modules") return [];
    return entry.isDirectory()
      ? filesOnDisk(path.join(directory, entry.name), relative)
      : [relative];
  });
}

function packageSelection(files, directory = root, filePatterns) {
  const { build } = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const patterns = (filePatterns || build.files).map(globPattern);
  return new Set(files.filter((file) => patterns.some((pattern) => pattern.test(file))));
}

function trackedFiles() {
  return execFileSync("git", ["--no-optional-locks", "ls-tree", "-r", "--name-only", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  }).trim().split("\n");
}

function assertSelected(selection, files, label) {
  for (const file of files) {
    assert.equal(selection.has(file), true, `${label} omits required runtime file: ${file}`);
  }
}

function localIndexReferences() {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  return [...index.matchAll(/(?:href|src)="([^"?#]+)(?:\?[^\"]*)?"/g)]
    .map((match) => match[1])
    .filter((value) => !value.startsWith("http") && !value.startsWith("#"));
}

function localFontReferences() {
  const stylesheet = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
  return [...stylesheet.matchAll(/url\("(\.\.\/fonts\/lmroman10-[^"]+)"\)/g)]
    .map((match) => path.posix.normalize(path.posix.join("css", match[1])));
}

test("Given a required runtime fixture is absent, when package selection is checked, then it fails and passes only after restoration", () => {
  const required = "assets/svg_object/1.svg";
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-distribution-fixture-"));
  const liveConfig = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ build: { files: liveConfig.build.files } }));
  try {
    const withoutFixture = packageSelection(filesOnDisk(fixture), fixture);
    assert.throws(() => assertSelected(withoutFixture, [required], "task fixture"), /omits required runtime file/);

    fs.mkdirSync(path.join(fixture, "assets", "svg_object"), { recursive: true });
    fs.writeFileSync(path.join(fixture, required), "<svg />");
    const restored = packageSelection(filesOnDisk(fixture), fixture);
    assert.doesNotThrow(() => assertSelected(restored, [required], "task fixture"));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("Given package allowlist expansion on disk and the sparse-aware tracked tree, when runtime consumers resolve files, then both package views retain their required inputs", () => {
  const disk = packageSelection(filesOnDisk(root));
  const tracked = packageSelection(trackedFiles());
  const parts = JSON.parse(fs.readFileSync(path.join(root, "assets/parts-library/manifest.json"), "utf8"));
  const exam = JSON.parse(fs.readFileSync(path.join(root, "assets/exam-library/manifest.json"), "utf8"));
  const examParts = JSON.parse(fs.readFileSync(path.join(root, "assets/exam-parts/manifest.json"), "utf8"));
  const webManifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const partAsset = `assets/parts-library/svg/${parts.items[0].file}`;
  const examAsset = `assets/exam-library/images/${exam.items[0].file}`;
  const examPartAssets = Object.values(examParts[0].files).map((file) => `assets/exam-parts/${file}`);
  const manifestIcons = webManifest.icons.map((icon) => icon.src);
  const fontAssets = localFontReferences();
  const desktopRuntime = ["desktop/main.cjs", "desktop/preload.cjs", "desktop/codex-turn-runtime.cjs", "desktop/codex-process-failure.cjs", "desktop/ai-thread-profile.cjs", "desktop/splash.html"];

  assertSelected(disk, ["index.html", "manifest.json", "LICENSE", "docs/credits.html", "assets/icon.ico", "assets/svg_object/1.svg", "assets/svg_object/2.svg", "assets/exam-library/manifest.json", "assets/exam-library/synonyms.json", "assets/exam-library/tag-vocab.json", "assets/exam-parts/manifest.json", "assets/parts-library/manifest.json", partAsset, ...examPartAssets, ...desktopRuntime], "disk expansion");
  assert.deepEqual(fontAssets.sort(), [
    "fonts/lmroman10-italic.otf",
    "fonts/lmroman10-italic.woff2",
    "fonts/lmroman10-regular.otf",
    "fonts/lmroman10-regular.woff2",
  ]);
  assertSelected(tracked, [examAsset, ...manifestIcons, ...fontAssets], "tracked expansion");
  assertSelected(disk, fontAssets, "stylesheet font consumers");
  assertSelected(disk, localIndexReferences(), "index.html links");
  assert.equal(disk.has(examAsset), fs.existsSync(path.join(root, examAsset)), "disk expansion must describe only materialized sparse files");
  assert.equal(tracked.has(examAsset), true, "tracked sparse source must remain packaged without downloading its blob");
});

test("Given a package mutation removes every stylesheet-consumed local font, when the expanded selection is checked, then it is rejected", () => {
  const fonts = localFontReferences();
  const livePatterns = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).build.files;
  const withoutFonts = livePatterns.filter((pattern) => !pattern.startsWith("fonts/"));
  const selected = packageSelection(trackedFiles(), root, withoutFonts);

  assert.equal(fonts.length, 4, "the stylesheet must declare all four runtime font inputs");
  assert.throws(() => assertSelected(selected, fonts, "fontless package mutation"), /omits required runtime file/);
});

test("Given the actual expanded package list, when developer and archived paths are checked, then they are excluded", () => {
  const selected = packageSelection(trackedFiles());
  for (const excluded of [
    "desktop/run-unit-tests.cjs",
    "desktop/benchmark-local-assets.cjs",
    "assets/parts-library/harvest.json",
    "assets/parts-library/meta.json",
    "assets/parts-library/approved/index.html",
  ]) {
    assert.equal(selected.has(excluded), false, `developer/archive output was packaged: ${excluded}`);
  }
});
