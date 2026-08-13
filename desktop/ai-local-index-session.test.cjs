const test = require("node:test");
const assert = require("node:assert/strict");

const sessionModule = import("../js/ai-local-index-session.js");

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("a superseded local PDF selection cannot publish late progress pages or status", async () => {
  // Given two overlapping folder selections whose first PDF finishes last.
  const { createLocalIndexSession } = await sessionModule;
  const pending = new Map();
  const progress = new Map();
  const published = [];
  const loadPages = (pdf, onProgress) => {
    const operation = deferred();
    pending.set(pdf.id, operation);
    progress.set(pdf.id, onProgress);
    return operation.promise;
  };
  const session = createLocalIndexSession(loadPages, (state) => published.push(state), assert.fail);
  const first = session.accept({ images: [{ id: "image-a" }], pdfs: [{ id: "a", name: "a.pdf", relativePath: "A/a.pdf" }] }, "A");
  const second = session.accept({ images: [{ id: "image-b" }], pdfs: [{ id: "b", name: "b.pdf", relativePath: "B/b.pdf" }] }, "B");

  // When the new selection completes and the stale selection reports afterward.
  progress.get("b")({ pageNumber: 1, pageCount: 1 });
  pending.get("b").resolve([{ id: "b:1", text: "new" }]);
  assert.equal(await second, true);
  const publishedAfterSecond = published.length;
  progress.get("a")({ pageNumber: 1, pageCount: 1 });
  pending.get("a").resolve([{ id: "a:1", text: "stale" }]);

  // Then only the newest selection remains observable.
  assert.equal(await first, false);
  assert.equal(published.length, publishedAfterSecond, "stale progress or completion rendered after the new folder");
  assert.deepEqual(published.at(-1), {
    images: [{ id: "image-b" }],
    pages: [{ id: "b:1", text: "new" }],
    folderLabel: "B · PDF 1개 / 검색 가능 페이지 1쪽",
    indexing: false,
  });
});
