import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tutorialSource = await readFile(new URL("../js/tutorial-courses.js", import.meta.url), "utf8");
const paletteSource = await readFile(new URL("../js/command-palette.js", import.meta.url), "utf8");

function section(start, end) {
  return tutorialSource.slice(tutorialSource.indexOf(start), tutorialSource.indexOf(end));
}

test("Given the unified Library, when the exam tutorial opens and inserts its retained fixture, then it uses the real import and result controls", () => {
  const examCourse = section("const EXAM_SEARCH", "const TRIM_EXAM");
  const trimCourse = section("const TRIM_EXAM", "const ALIGN_SPACE");

  for (const course of [examCourse, trimCourse]) {
    assert.match(course, /\[data-unilib-query\]/u);
    assert.match(course, /\[data-unilib-results\]/u);
    assert.match(course, /\[data-unilib-insert\]/u);
    assert.match(course, /importTutorialExamImage/u);
    assert.doesNotMatch(course, /examlib-|parts-library-open/u);
  }
  assert.match(tutorialSource, /p2_2027_06_13\.png/u);
  assert.match(tutorialSource, /\[data-unilib-files\]/u);
  assert.match(tutorialSource, /\[data-result-id\]/u);
  assert.match(tutorialSource, /DataTransfer/u);
});

test("Given the curated-parts tutorial, when it searches and inserts an asset, then it uses unified Library result controls", () => {
  const assetsCourse = section("const ADVANCED_ASSETS", "const ADVANCED_FILES");

  assert.match(assetsCourse, /#exam-library-open/u);
  assert.match(assetsCourse, /\[data-unilib-query\]/u);
  assert.match(assetsCourse, /\[data-result-id\]/u);
  assert.match(assetsCourse, /\[data-unilib-insert\]/u);
  assert.doesNotMatch(assetsCourse, /parts-library-open|partslib-/u);
});

test("Given the command palette, when the Library command is shown, then it uses the unified name", () => {
  assert.match(paletteSource, /label: "라이브러리 열기"/u);
  assert.doesNotMatch(paletteSource, /label: "기출 라이브러리 열기"/u);
});
