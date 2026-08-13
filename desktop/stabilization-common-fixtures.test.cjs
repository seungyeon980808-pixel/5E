const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("canonical fixture JSON and hashes ignore object insertion order", () => {
  // Given
  const { canonicalJson, stableFixtureHash } = require("../tests/stabilization/harness/common-fixtures.cjs");
  const first = { z: 2, nested: { b: true, a: [3, 1] } };
  const second = { nested: { a: [3, 1], b: true }, z: 2 };

  // When / Then
  assert.equal(canonicalJson(first), '{"nested":{"a":[3,1],"b":true},"z":2}');
  assert.equal(stableFixtureHash(first), stableFixtureHash(second));
});

test("temporary fixture directories are removed after asynchronous use", async () => {
  // Given
  const { withTemporaryDirectory } = require("../tests/stabilization/harness/common-fixtures.cjs");
  let usedPath;

  // When
  await withTemporaryDirectory("5e-common-fixture-", async (directory) => {
    usedPath = directory;
    fs.writeFileSync(path.join(directory, "marker.txt"), "synthetic", "utf8");
    assert.equal(fs.existsSync(directory), true);
  });

  // Then
  assert.equal(fs.existsSync(usedPath), false);
});
