const assert = require("node:assert/strict");
const test = require("node:test");
const { installSvgDom } = require("../tests/stabilization/harness/svg-dom.cjs");

test("PDF crop provenance is explicit, normalized and omits absolute paths", async () => {
  const { buildReferenceProvenance } = await import("../js/reference-provenance.mjs");
  const result = buildReferenceProvenance({
    id: "desktop:C:\\Users\\teacher\\과학시험.pdf:4", sourceId: "desktop:C:\\Users\\teacher\\과학시험.pdf",
    name: "과학시험.pdf", relativePath: "C:\\Users\\teacher\\과학시험.pdf",
    pageNumber: 4, metadata: { question: "12번" },
  }, { x: .2, y: .3, w: .5, h: .4, selectionKind: "figure-suggestion", sourceWidth: 1200, sourceHeight: 1600 });

  assert.equal(result.fileName, "과학시험.pdf");
  assert.match(result.documentId, /^local-document-[0-9a-f]{8}$/);
  assert.equal(result.pageNumber, 4);
  assert.deepEqual(result.questionInfo, { value: "12번", source: "pdf-metadata", confirmedByUser: false });
  assert.deepEqual(result.crop, { units: "normalized", x: .2, y: .3, w: .5, h: .4,
    selectionKind: "figure-suggestion", sourceWidth: 1200, sourceHeight: 1600 });
  assert.doesNotMatch(JSON.stringify(result), /Users|teacher|C:\\/);

  const bounded = buildReferenceProvenance({ name: "시험.pdf", id: "pdf" },
    { x: -.2, y: .9, w: 2, h: .5, sourceWidth: 0, sourceHeight: -4 });
  assert.deepEqual({ ...bounded.crop, h: Math.round(bounded.crop.h * 10) / 10 },
    { units: "normalized", x: 0, y: .9, w: 1, h: .1,
      selectionKind: "manual", sourceWidth: 1, sourceHeight: 1 });
});

test("manual label candidates require explicit complete confirmation", async () => {
  const { createEditableLabelSession } = await import("../js/editable-labels.mjs");
  const session = createEditableLabelSession();
  const candidate = session.add({ text: "A" });
  assert.equal(candidate.confirmed, false);
  assert.equal(session.confirm(candidate.id), false);
  session.setOriginal(candidate.id, { x: .1, y: .2, w: .08, h: .05 });
  session.setTarget(candidate.id, { x: .4, y: .5 });
  session.setLabelPosition(candidate.id, { x: .6, y: .3 });
  assert.equal(session.confirm(candidate.id), true);
  assert.equal(session.ready(), true);
  session.updateText(candidate.id, "수정 A");
  assert.equal(session.get(candidate.id).confirmed, false, "editing invalidates confirmation");
});

test("confirmed candidates compile to rendered editable labeler objects with separate provenance", async () => {
  const { labelObjectsForImage } = await import("../js/editable-labels.mjs");
  installSvgDom();
  const labels = labelObjectsForImage([{ id: "c1", text: "A", confirmed: true,
    original: { x: .1, y: .2, w: .08, h: .05 }, target: { x: .4, y: .5 }, labelPosition: { x: .6, y: .3 },
    detector: "manual", confidence: null }], { id: "img-1", x: 10, y: 20, w: 100, h: 80, layerId: 1, order: 0,
    referenceProvenance: { schema: "5e-reference-provenance@1", fileName: "과학시험.pdf", pageNumber: 4 } }, "bundle-1");
  assert.equal(labels.length, 1);
  assert.equal(labels[0].type, "labeler");
  assert.equal(labels[0].text, "A");
  assert.deepEqual(labels[0].p1, { x: 50, y: 60 });
  assert.deepEqual(labels[0].p2, { x: 70, y: 44 });
  assert.equal(labels[0].sourceLabel.confirmation.confirmedByUser, true);
  assert.deepEqual(labels[0].sourceLabel.original.bounds, { units: "normalized", x: .1, y: .2, w: .08, h: .05 });
  assert.deepEqual(labels[0].sourceLabel.sourceReference,
    { schema: "5e-reference-provenance@1", fileName: "과학시험.pdf", pageNumber: 4 });
  const { renderObject, singleObjBBox } = await import("../js/render.js");
  const rendered = renderObject(labels[0]);
  assert.equal(rendered.tagName, "g");
  assert.equal(rendered.querySelectorAll("line").length > 0, true);
  assert.equal(singleObjBBox(labels[0], null).w > 0, true);
});
