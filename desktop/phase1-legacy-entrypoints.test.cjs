const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const searchModule = import("../js/search.js");
const commandPaletteModule = import("../js/command-palette.js");
const examLibraryModule = import("../js/exam-library.js");
const tutorialCoursesModule = import("../js/tutorial-courses.js");

function collectRuntimeText(value, output = []) {
  if (typeof value === "string" || typeof value === "function") output.push(String(value));
  else if (Array.isArray(value)) value.forEach((item) => collectRuntimeText(item, output));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectRuntimeText(item, output));
  }
  return output;
}

test("legacy library UI capability is closed by default and has explicit development opt-ins", async () => {
  // Given
  const { resolveLegacyLibraryUiEnabled } = await searchModule;
  const desktopWithoutCapability = {
    fiveEDesktop: {},
    location: new URL("http://localhost/?__5e_dev_legacy_library_ui=1"),
  };
  const desktopWithCapability = {
    fiveEDesktop: { capabilities: { legacyLibraryUiEnabled: true } },
    location: new URL("file:///C:/5E/index.html"),
  };

  // When / Then
  assert.equal(resolveLegacyLibraryUiEnabled({}), false);
  assert.equal(resolveLegacyLibraryUiEnabled({ location: new URL("https://5e.example/?__5e_dev_legacy_library_ui=1") }), false);
  assert.equal(resolveLegacyLibraryUiEnabled({ location: new URL("http://localhost/?__5e_dev_legacy_library_ui=true") }), false);
  assert.equal(resolveLegacyLibraryUiEnabled({ location: new URL("http://localhost/?__5e_dev_legacy_library_ui=1") }), true);
  assert.equal(resolveLegacyLibraryUiEnabled({ location: new URL("http://127.0.0.1/?__5e_dev_legacy_library_ui=1") }), true);
  assert.equal(resolveLegacyLibraryUiEnabled(desktopWithoutCapability), false);
  assert.equal(resolveLegacyLibraryUiEnabled(desktopWithCapability), true);
});

test("production command and tutorial registries omit bundled library entry points", async () => {
  // Given
  const [{ getCommandPaletteCommands }, { getTutorialCourses, getCourse }] = await Promise.all([
    commandPaletteModule,
    tutorialCoursesModule,
  ]);
  const legacyCourseIds = ["exam-search", "trim-exam", "advanced-assets", "task-exam-incline"];

  // When
  const productionCommands = getCommandPaletteCommands();
  const developmentCommands = getCommandPaletteCommands({ legacyLibraryUiEnabled: true });
  const productionCourses = getTutorialCourses();
  const developmentCourses = getTutorialCourses({ legacyLibraryUiEnabled: true });

  // Then
  assert.equal(productionCommands.some(({ id }) => id === "examSearch"), false);
  assert.equal(developmentCommands.some(({ id }) => id === "examSearch"), true);
  for (const id of legacyCourseIds) {
    assert.equal(productionCourses.some((course) => course.id === id), false, id);
    assert.equal(developmentCourses.some((course) => course.id === id), true, id);
    assert.equal(getCourse(id), null, id);
    assert.equal(getCourse(id, { legacyLibraryUiEnabled: true })?.id, id);
  }
  assert.doesNotMatch(
    productionCourses.flatMap((course) => [course.id, ...(course.next || [])]).join(" "),
    /exam-search|trim-exam|advanced-assets|task-exam-incline/,
  );
  const productionFootprint = collectRuntimeText(productionCourses).join("\n");
  for (const entrypoint of [
    "#exam-library-open",
    "#examlib",
    "#parts-library-open",
    "#partslib",
    "assets/exam-library",
    "assets/parts-library",
  ]) {
    assert.equal(productionFootprint.includes(entrypoint), false, entrypoint);
  }
});

test("disabled exam library initialization does not touch the DOM or register its shortcut", async () => {
  // Given
  const { initExamLibrary } = await examLibraryModule;
  const previousDocument = globalThis.document;
  delete globalThis.document;

  try {
    // When / Then
    assert.doesNotThrow(() => initExamLibrary({}));
    assert.doesNotThrow(() => initExamLibrary({}, { legacyLibraryUiEnabled: false }));
  } finally {
    if (previousDocument !== undefined) globalThis.document = previousDocument;
  }
});

test("main gates only bundled libraries and keeps ordinary image and graph-capable paths initialized", () => {
  // Given
  const main = source(path.join("js", "main.js"));
  const tutorial = source(path.join("js", "tutorial.js"));

  // When / Then
  assert.match(main, /const legacyLibraryUiEnabled = resolveLegacyLibraryUiEnabled\(window\);/);
  assert.match(main, /if \(legacyLibraryUiEnabled\) \{[\s\S]*initExamLibrary\([\s\S]*initPartsLibrary\([\s\S]*\}/);
  assert.match(main, /initImageObjectify\(state\);/);
  assert.match(main, /initImagePaste\(state, svg\);/);
  assert.match(main, /initImageCutout\(state, svg\);/);
  assert.match(main, /initTemplates\(svg\);/);
  assert.match(main, /initObjectSearch\(\);/);
  assert.match(main, /initCommandPalette\(\{ legacyLibraryUiEnabled \}\);/);
  assert.match(main, /initTutorial\(\{ legacyLibraryUiEnabled \}\);/);
  assert.match(tutorial, /if \(!_legacyLibraryUiEnabled\) return;/);
});

test("changed module imports share the Phase 1 cache identity", () => {
  // Given
  const main = source(path.join("js", "main.js"));
  const tutorial = source(path.join("js", "tutorial.js"));

  // When / Then
  assert.match(main, /\.\/exam-library\.js\?v=1\.5\.15-phase4-labels/, "exam-library");
  for (const moduleName of ["search", "command-palette", "tutorial"]) {
    assert.match(main, new RegExp(`\\./${moduleName}\\.js\\?v=1\\.5\\.14-phase1-legacy-ui`), moduleName);
  }
  assert.match(tutorial, /\.\/tutorial-courses\.js\?v=1\.5\.14-phase1-legacy-ui/);
});
