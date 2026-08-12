const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const moduleUrl = pathToFileURL(path.join(__dirname, "..", "js", "pdf-search.mjs"));

test("rankPdfPages orders matching PDF pages by BM25 relevance", async () => {
  // Given
  const { rankPdfPages } = await import(moduleUrl.href);
  const pages = [
    { id: "a:1", documentId: "a", name: "교과서.pdf", pageNumber: 1, text: "빛은 직진한다." },
    { id: "a:2", documentId: "a", name: "교과서.pdf", pageNumber: 2, text: "볼록 렌즈는 빛을 굴절시킨다. 렌즈에서 빛의 굴절을 관찰한다." },
    { id: "b:3", documentId: "b", name: "기출.pdf", pageNumber: 3, text: "렌즈를 통과한 빛의 경로를 그린다." },
  ];

  // When
  const results = rankPdfPages(pages, "빛 렌즈");

  // Then
  assert.deepEqual(results.map((item) => item.id), ["a:2", "b:3"]);
  assert.equal(results[0].matchPercent, 100);
  assert.ok(results[1].matchPercent < 100);
});

test("rankPdfPages returns a readable snippet around every query term", async () => {
  // Given
  const { rankPdfPages } = await import(moduleUrl.href);
  const pages = [{
    id: "a:7", documentId: "a", name: "교과서.pdf", pageNumber: 7,
    text: "관찰 결과를 정리한다. 프리즘을 통과한 빛은 여러 색으로 분산된다. 실험을 마친다.",
  }];

  // When
  const [result] = rankPdfPages(pages, "프리즘 분산");

  // Then
  assert.match(result.snippet, /프리즘/);
  assert.match(result.snippet, /분산/);
});
