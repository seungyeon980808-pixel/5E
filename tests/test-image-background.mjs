import assert from "node:assert/strict";
import { makeNearWhiteTransparent, removeConnectedLightBackground, removeEmbeddedCheckerboard } from "../js/image-background.js";

const px = new Uint8ClampedArray([
  255, 255, 255, 255,
  248, 248, 248, 255,
  210, 210, 210, 255,
  0, 0, 0, 255,
  250, 245, 230, 255,
]);

makeNearWhiteTransparent(px);
assert.equal(px[3], 0, "pure white must become transparent");
assert.equal(px[4], 0, "near-white antialias color must become black");
assert.ok(px[7] > 0 && px[7] < 20, "near-white antialias must become partial alpha");
assert.deepEqual(Array.from(px.slice(8, 12)), [210, 210, 210, 255], "gray fill must be preserved");
assert.deepEqual(Array.from(px.slice(12, 16)), [0, 0, 0, 255], "black line must be preserved");
assert.deepEqual(Array.from(px.slice(16, 20)), [250, 245, 230, 255], "non-neutral light color must be preserved");

console.log("AI 생성 이미지 흰 배경 투명화 테스트 통과");

// 가장자리와 연결된 연회색 체크무늬는 제거하되 검은 테두리 안의 회색 채움은 보존한다.
const w = 5, h = 5;
const checker = new Uint8ClampedArray(w * h * 4);
for (let p = 0; p < w * h; p += 1) checker.set((p + Math.floor(p / w)) % 2 ? [224, 224, 224, 255] : [250, 250, 250, 255], p * 4);
// 중앙 회색 한 픽셀을 검은 십자 테두리로 가둔다.
for (const [x, y] of [[2, 1], [1, 2], [3, 2], [2, 3]]) checker.set([0, 0, 0, 255], (y * w + x) * 4);
checker.set([220, 220, 220, 255], (2 * w + 2) * 4);
removeConnectedLightBackground(checker, w, h);
assert.equal(checker[3], 0, "가장자리 체크무늬는 투명해져야 함");
assert.equal(checker[(2 * w + 2) * 4 + 3], 255, "테두리 안 회색 채움은 보존해야 함");
console.log("AI 생성 이미지 체크무늬 배경 제거 테스트 통과");

// 검은 테두리 안에 갇혀 바깥 flood-fill로는 닿지 않는 체크무늬도 제거한다.
const ew = 8, eh = 8;
const enclosed = new Uint8ClampedArray(ew * eh * 4);
for (let p = 0; p < ew * eh; p += 1) enclosed.set([0, 0, 0, 255], p * 4);
for (let y = 1; y < 7; y += 1) {
  for (let x = 1; x < 7; x += 1) {
    enclosed.set((x + y) % 2 ? [224, 224, 224, 255] : [248, 248, 248, 255], (y * ew + x) * 4);
  }
}
removeEmbeddedCheckerboard(enclosed, ew, eh);
assert.equal(enclosed[(3 * ew + 3) * 4 + 3], 0, "테두리 안쪽 체크무늬도 투명해져야 함");
assert.equal(enclosed[3], 255, "검은 테두리는 보존되어야 함");
console.log("AI 생성 이미지 내부 체크무늬 제거 테스트 통과");
