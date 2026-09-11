const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const generator = path.join(root, "tools", "build_parts_manifest.py");

function withLibrary(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "5e-parts-library-"));
  const library = path.join(directory, "assets", "parts-library");
  fs.mkdirSync(path.join(library, "svg"), { recursive: true });
  for (const id of ["kept", "unreviewed"]) {
    fs.writeFileSync(path.join(library, "svg", `${id}.svg`), "<svg><path /></svg>");
  }
  const rows = ["kept", "unreviewed"].map((id) => ({ id, subject: "x", name: id }));
  fs.writeFileSync(path.join(library, "meta.json"), JSON.stringify(rows));
  fs.writeFileSync(path.join(library, "harvest.json"), JSON.stringify(rows));
  fs.writeFileSync(path.join(library, "manifest.json"), JSON.stringify({
    version: 1,
    items: [{ id: "kept" }],
  }));
  try {
    return run({ directory, library });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function runGenerator(library) {
  return spawnSync("python3", [generator, "--library", library, "--check"], {
    cwd: root,
    encoding: "utf8",
  });
}

function writeCompleteTriage(directory) {
  const triage = path.join(directory, "_work", "triage");
  fs.mkdirSync(triage, { recursive: true });
  fs.writeFileSync(path.join(triage, "marks.json"), "{}");
  fs.writeFileSync(path.join(triage, "clusters.json"), "{}");
  fs.writeFileSync(path.join(triage, "grades.json"), JSON.stringify({
    "kept.svg": "A",
    "unreviewed.svg": "A",
  }));
  fs.writeFileSync(path.join(triage, "scores.json"), "{}");
}

test("Given no triage, when check uses the preserved manifest selection, then it keeps its IDs and writes nothing", () => {
  withLibrary(({ library }) => {
    const manifest = path.join(library, "manifest.json");
    const before = fs.readFileSync(manifest);
    const result = runGenerator(library);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /보존된 manifest 선택/);
    assert.deepEqual(fs.readFileSync(manifest), before);
  });
});

test("Given neither triage nor a preserved manifest, when check runs, then it fails closed", () => {
  withLibrary(({ library }) => {
    fs.rmSync(path.join(library, "manifest.json"));
    const result = runGenerator(library);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /triage 결과와 보존된 manifest가 모두 없어/);
  });
});

test("Given an incomplete triage result, when check runs, then it fails instead of using a partial decision", () => {
  withLibrary(({ directory, library }) => {
    const triage = path.join(directory, "_work", "triage");
    fs.mkdirSync(triage, { recursive: true });
    fs.writeFileSync(path.join(triage, "marks.json"), "{}");
    const manifest = path.join(library, "manifest.json");
    const before = fs.readFileSync(manifest);
    const result = runGenerator(library);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /triage 결과가 불완전합니다/);
    assert.deepEqual(fs.readFileSync(manifest), before);
  });
});

test("Given malformed preserved selection data, when check runs, then it rejects without changing the file", () => {
  withLibrary(({ library }) => {
    const manifest = path.join(library, "manifest.json");
    fs.writeFileSync(manifest, "{");
    const before = fs.readFileSync(manifest);
    const result = runGenerator(library);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JSON 형식이 잘못되었습니다/);
    assert.deepEqual(fs.readFileSync(manifest), before);
  });
});

test("Given complete triage that selects an extra SVG, when check runs, then it reports the ID mismatch without mutation", () => {
  withLibrary(({ directory, library }) => {
    writeCompleteTriage(directory);
    const manifest = path.join(library, "manifest.json");
    const before = fs.readFileSync(manifest);
    const result = runGenerator(library);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /unexpected=unreviewed/);
    assert.deepEqual(fs.readFileSync(manifest), before);
  });
});

function filesBelow(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? filesBelow(path.join(directory, entry.name), relative)
      : [relative];
  });
}

function globPattern(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character !== "*") {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      continue;
    }
    if (pattern[index + 1] === "*") {
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

function expandBuildFiles() {
  const config = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).build;
  const files = filesBelow(root).filter((file) => !file.startsWith("node_modules/"));
  const patterns = config.files.map(globPattern);
  return new Set(files.filter((file) => patterns.some((pattern) => pattern.test(file))));
}

test("Given the package allowlist, when it is expanded against the repository, then runtime files and credits are selected while development material is excluded", () => {
  const selected = expandBuildFiles();
  for (const required of [
    "index.html",
    "manifest.json",
    "LICENSE",
    "desktop/main.cjs",
    "desktop/preload.cjs",
    "assets/parts-library/manifest.json",
    "assets/parts-library/svg/b_201305_dissecting_scissors.svg",
    "assets/exam-library/manifest.json",
    "assets/exam-library/synonyms.json",
    "assets/exam-parts/manifest.json",
    "assets/svg_object/1.svg",
    "fonts/lmroman10-regular.woff2",
    "docs/credits.html",
  ]) {
    assert.equal(selected.has(required), true, `missing runtime package file: ${required}`);
  }
  for (const excluded of [
    "desktop/run-unit-tests.cjs",
    "desktop/benchmark-local-assets.cjs",
    "assets/parts-library/harvest.json",
    "assets/parts-library/meta.json",
    "assets/parts-library/approved/index.html",
  ]) {
    assert.equal(selected.has(excluded), false, `unexpected development file: ${excluded}`);
  }
});
