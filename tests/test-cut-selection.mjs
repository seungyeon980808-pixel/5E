import assert from "node:assert/strict";
import { preferredCutSelectionIds } from "../js/cut-tool.js";

const remainder = { id: "remainder", cutouts: [{ type: "poly", points: [] }] };
const extracted = { id: "extracted", cutouts: [{ type: "outside-poly", points: [] }] };
assert.deepEqual(preferredCutSelectionIds([remainder, extracted]), ["extracted"]);
assert.deepEqual(preferredCutSelectionIds([{ id: "left" }, { id: "right" }]), ["left", "right"]);

console.log("도려낸 내부 조각 단독 선택 테스트 통과");
