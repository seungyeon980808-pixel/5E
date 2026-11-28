import assert from "node:assert/strict";
import test from "node:test";

import { answerHighlights } from "../js/unified-library-ui.js";

// 11-20: 공유 자료 묶음 문항은 문서 id가 「묶음 이름::원래 id」라 정답표에서 못 찾아 정답 형광이 안 보였다.
const keys = {
  papers: { "p1_2027_11.pdf": [[1]], "p1_2027_06.pdf": [[1], [2], [4]] },
  documents: { "kice-p1_2027_11": "p1_2027_11.pdf", "1lWXfCjJYnZUMGiY42fuqAjt_sTQNOC-2": "p1_2027_06.pdf" },
};
const choices = { text: "① ㄱ ② ㄴ ③ ㄱ, ㄷ ④ ㄴ, ㄷ ⑤ ㄱ, ㄴ, ㄷ", rect: [0.1, 0.8, 0.8, 0.02] };
const result = (documentId, itemNumber) => ({
  cropType: "question",
  documentId,
  provenance: { documentId, rect: [0, 0, 1, 1] },
  metadata: { itemNumber },
  searchWords: [choices],
});

test("finds answers for namespaced shared-pack documents (2027 수능·6월 모평)", () => {
  const suneung = answerHighlights(result("5e.shared.drive::kice-p1_2027_11", 1), keys);
  assert.equal(suneung.length, 1);
  assert.equal(suneung[0].answer, true);
  const june = answerHighlights(result("5e.shared.drive::1lWXfCjJYnZUMGiY42fuqAjt_sTQNOC-2", 3), keys);
  assert.equal(june.length, 1);
  assert.ok(june[0].rect[0] > suneung[0].rect[0], "④ is right of ①");
});

test("still finds answers for plain document ids and ignores unknown ones", () => {
  assert.equal(answerHighlights(result("kice-p1_2027_11", 1), keys).length, 1);
  assert.deepEqual(answerHighlights(result("5e.shared.drive::unknown", 1), keys), []);
  assert.deepEqual(answerHighlights({ ...result("kice-p1_2027_11", 1), cropType: "page" }, keys), []);
});
