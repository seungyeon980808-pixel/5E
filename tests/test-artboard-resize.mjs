import assert from "node:assert/strict";
import { artboardChangeFromBounds } from "../js/artboard-area.js";

assert.deepEqual(artboardChangeFromBounds({ x: 10, y: 20, w: 60, h: 40 }), {
  artboard: { w: 60, h: 40 }, dx: -40, dy: -40,
});
assert.deepEqual(artboardChangeFromBounds({ x: -30, y: -20, w: 60, h: 40 }), {
  artboard: { w: 60, h: 40 }, dx: 0, dy: 0,
});
assert.equal(artboardChangeFromBounds(null), null);

console.log("드래그 영역→아트보드 변환 테스트 통과");
