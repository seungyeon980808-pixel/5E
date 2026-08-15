const test = require("node:test");
const assert = require("node:assert/strict");

const modulePath = "../scripts/stabilization/strict-json.cjs";

for (const [name, json] of [
  ["duplicate top-level violations", '{"violations":[],"violations":[{"code":"X"}]}'],
  ["duplicate nested matches", '{"identity":{"matches":true,"matches":false}}'],
  ["duplicate deeply nested identity key", '{"identity":{"web":{"version":"1","version":"2"}}}'],
  ["escaped-equivalent duplicate key", '{"violations":[],"vi\\u006flations":[]}'],
]) {
  test(`Given ${name}, When strict JSON is parsed, Then the report is rejected`, () => {
    const { parseStrictJson } = require(modulePath);
    assert.throws(() => parseStrictJson(json), /JSON_DUPLICATE_KEY/);
  });
}

test("Given equal keys in distinct nested objects and string punctuation, When parsed, Then valid JSON remains accepted", () => {
  const { parseStrictJson } = require(modulePath);
  const json = '{"identity":{"web":{"version":"{\\\"version\\\":1}"},"desktop":{"version":"same"}},"items":[{"key":1},{"key":2}]}';
  assert.deepEqual(parseStrictJson(json), {
    identity: { web: { version: '{"version":1}' }, desktop: { version: "same" } },
    items: [{ key: 1 }, { key: 2 }],
  });
});
