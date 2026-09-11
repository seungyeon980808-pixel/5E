import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");

async function loadReferenceWindow() {
  return import(`${pathToFileURL(path.join(root, "js", "reference-window.js")).href}?snapshot-test`);
}

test("Given a materialized PDF PNG snapshot, when a Reference Window is rendered, then its original data URL bytes are used", async () => {
  // Given
  const { referenceWindowMarkup } = await loadReferenceWindow();
  const source = "data:image/png;base64,iVBORw0KGgo=";

  // When
  const markup = referenceWindowMarkup({ items: [{ id: "pdf-1", title: "PDF crop", snapshotSrc: source }] });

  // Then
  assert.match(markup, new RegExp(`src="${source}"`));
  assert.match(markup, /data-item="pdf-1"/);
  assert.doesNotMatch(markup, /assets\/exam-library\/images/);
});

test("Given a legacy PNG item, when a Reference Window is rendered, then its existing relative image source is preserved", async () => {
  // Given
  const { referenceWindowMarkup } = await loadReferenceWindow();

  // When
  const markup = referenceWindowMarkup({ items: [{ id: "legacy-1", file: "p1_2025_11_05.png", title: "Legacy" }] });

  // Then
  assert.match(markup, /src="assets\/exam-library\/images\/p1_2025_11_05\.png"/);
});

test("Given a materialized blob image snapshot, when a Reference Window is rendered, then the blob source survives a minimize-and-reopen entry", async () => {
  // Given
  const { referenceWindowMarkup } = await loadReferenceWindow();
  const source = "blob:https://5e.example/515d33d9-80e0-4c59-8f96-b4e4b60777a7";

  // When
  const markup = referenceWindowMarkup({ items: [{ id: "pdf-blob", title: "PDF crop", snapshotSrc: source }] });

  // Then
  assert.match(markup, new RegExp(`src="${source}"`));
});

test("Given an unsafe snapshot source, when a Reference Window is rendered, then it never becomes executable child-window markup", async () => {
  // Given
  const { referenceWindowMarkup } = await loadReferenceWindow();
  const injected = 'javascript:alert(1)" onerror="alert(2)';

  // When
  const markup = referenceWindowMarkup({ items: [{ id: "unsafe-1", file: "p1_2025_11_05.png", title: "<unsafe>", snapshotSrc: injected }] });

  // Then
  assert.doesNotMatch(markup, /javascript:|onerror=/i);
  assert.match(markup, /src="assets\/exam-library\/images\/p1_2025_11_05\.png"/);
  assert.match(markup, /&lt;unsafe&gt;/);
});
