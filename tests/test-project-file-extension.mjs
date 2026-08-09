import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "js", "project-io.js"), "utf8");

test("project files save as .5e and keep legacy .json import support", () => {
  assert.match(source, /DEFAULT_FILENAME = "physics_drawing\.5e"/);
  assert.match(source, /PROJECT_FILE_ACCEPT = "\.5e,\.json,application\/json"/);
  assert.match(source, /"application\/json": \["\.5e"\]/);
  assert.match(source, /\\\.\(\?:5e\|json\)\$\/i/);
});
