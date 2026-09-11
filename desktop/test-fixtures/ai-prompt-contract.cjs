const assert = require("node:assert/strict");

const OPERATION_ATTRIBUTES = Object.freeze({
  generate: { "change-scope": "new-output" },
  transform: { "change-scope": "requested-source-transform" },
  "scoped-edit": { "change-scope": "selected-pixels", "outside-scope-rgba": "exact" },
  separate: { "change-scope": "inter-asset-layout", "preserve-scope": "asset-internal" },
});
const BACKGROUND_POLICIES = ["white", "transparent", "preserve"];
const ARROW_POLICIES = ["scientific-only", "preserve", "none"];
const PRIORITY_ORDER = ["explicit-change", "operation", "explicit-preserve", "shared-invariants", "style"];

function parseFields(source, context) {
  if (!source) return {};
  const fields = source.split(/\s+/).map((field) => {
    const separator = field.indexOf("=");
    assert.ok(separator > 0 && separator < field.length - 1, `${context} has a malformed field`);
    return [field.slice(0, separator), field.slice(separator + 1)];
  });
  assert.equal(new Set(fields.map(([key]) => key)).size, fields.length, `${context} has duplicate fields`);
  return Object.fromEntries(fields);
}

function promptTags(prompt) {
  return prompt.split("\n").flatMap((line, lineIndex) => {
    const match = line.match(/^\[([^\s\]]+)(?: ([^\]]+))?\](?: (.*))?$/);
    if (!match) return [];
    return [{
      name: match[1],
      attributes: parseFields(match[2] || "", match[1]),
      value: match[3] || "",
      lineIndex,
    }];
  });
}

function tagEntries(prompt, name) {
  return promptTags(prompt).filter((entry) => entry.name === name);
}

function onlyTag(prompt, name) {
  const entries = tagEntries(prompt, name);
  assert.equal(entries.length, 1, `${name} contract must occur exactly once`);
  return entries[0];
}

function namespaceEntries(prompt, namespace) {
  return promptTags(prompt).filter((entry) => entry.name.startsWith(`${namespace}:`));
}

function imageContract(prompt) {
  return parseFields(onlyTag(prompt, "image-contract").value, "image-contract");
}

function priorityOrder(prompt) {
  return onlyTag(prompt, "priority").value.split(/\s*>\s*/).filter(Boolean);
}

function imagegenTokenCount(prompt) {
  return (prompt.match(/\bimagegen\b/g) || []).length;
}

function occurrenceCount(value, sentinel) {
  return value.split(sentinel).length - 1;
}

function sharedInvariantValues(prompt) {
  return tagEntries(prompt, "shared-invariant").map((entry) => entry.value);
}

function assertResolvedContracts(prompt, expected) {
  assert.deepEqual(imageContract(prompt), expected);
  assert.deepEqual(
    namespaceEntries(prompt, "operation").map((entry) => entry.name),
    [`operation:${expected.operation}`],
  );
  assert.deepEqual(
    namespaceEntries(prompt, "background").map((entry) => entry.name),
    [`background:${expected.backgroundPolicy}`],
  );
  assert.deepEqual(
    namespaceEntries(prompt, "arrows").map((entry) => entry.name),
    [`arrows:${expected.arrowPolicy}`],
  );
  assert.deepEqual(onlyTag(prompt, `operation:${expected.operation}`).attributes, OPERATION_ATTRIBUTES[expected.operation]);
  assert.deepEqual(onlyTag(prompt, `background:${expected.backgroundPolicy}`).attributes, {
    "apply-within": "operation-change-scope",
  });
  assert.deepEqual(onlyTag(prompt, `arrows:${expected.arrowPolicy}`).attributes, {
    "apply-within": "operation-change-scope",
  });
  assert.deepEqual(onlyTag(prompt, "explicit-change").attributes, { scope: "named-only" });
  assert.deepEqual(priorityOrder(prompt), PRIORITY_ORDER);

  const invariants = sharedInvariantValues(prompt);
  assert.ok(invariants.length >= 4, "shared invariant contracts must remain present");
  assert.equal(invariants.every(Boolean), true, "shared invariant contracts must not be empty");
  assert.equal(new Set(invariants).size, invariants.length, "shared invariant contracts must be distinct");
  assert.equal(imagegenTokenCount(prompt), 1, "imagegen call token count must remain one");
}

module.exports = {
  ARROW_POLICIES,
  BACKGROUND_POLICIES,
  OPERATION_ATTRIBUTES,
  assertResolvedContracts,
  imagegenTokenCount,
  namespaceEntries,
  occurrenceCount,
  onlyTag,
  sharedInvariantValues,
  tagEntries,
};
