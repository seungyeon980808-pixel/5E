const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

async function loadPromptModule() {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "ai-prompt.js"), "utf8");
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  return import(dataUrl);
}

test("image prompt is self-contained and invokes imagegen exactly once", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompt = buildImagePrompt({ request: "도르래 구조를 보존해 줘", mode: "diagram" });

  assert.doesNotMatch(prompt, /docs\//);
  assert.doesNotMatch(prompt, /EXAM_SCIENTIFIC_DIAGRAM_STYLE\.md/);
  assert.match(prompt, /파일·저장소·문서·웹을 검색하거나 읽지 말고/);
  assert.match(prompt, /추가 질문도 하지 않는다/);
  assert.match(prompt, /imagegen 이미지 생성 도구를 정확히 1회 호출한다/);
  assert.match(prompt, /결과를 다시 생성하거나 자가 수정하지 않는다/);
  assert.equal((prompt.match(/imagegen/g) || []).length, 1);
  assert.match(prompt, /성공하면 '이미지 생성 완료'/);
  assert.match(prompt, /실패하면 '이미지 생성 실패: 짧은 이유'/);
});

test("diagram prompt preserves the mandatory quality constraints", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompt = buildImagePrompt({ request: "참고 이미지를 재구성해 줘", mode: "diagram" });

  assert.match(prompt, /핵심 구조, 객체·부품 수, 연결·접촉 관계, 상대 비율·배치와 패널 순서/);
  assert.match(prompt, /과학적으로 정확하게 표현한다/);
  assert.match(prompt, /없는 장치·부품·구조는 추가하지 않는다/);
  assert.match(prompt, /문자, 숫자, 단위, 수식, 기호, 라벨, 로고, 워터마크, 지시선과 화살표를 절대 생성하지 않는다/);
  assert.match(prompt, /실제 RGBA 투명 배경/);
  assert.match(prompt, /회색은 물리적 구분이 필요한 영역에만/);
  assert.ok(prompt.length < 1400, `image prompt is unexpectedly long: ${prompt.length}`);
});

test("revision prompt limits edits while discussion prompt never renders", async () => {
  const { buildDiscussionPrompt, buildImagePrompt } = await loadPromptModule();
  const revision = buildImagePrompt({ request: "오른쪽 추만 이동", mode: "diagram", revision: true });
  const discussion = buildDiscussionPrompt({ request: "도르래 위치를 정리하자", mode: "complete" });

  assert.match(revision, /요청하지 않은 영역은 그대로 보존/);
  assert.match(revision, /지정한 부분만 변경/);
  assert.match(discussion, /요구사항을 정리하는 대화형 설계 보조자/);
  assert.match(discussion, /이미지 생성 도구와 다른 도구를 호출하지 않는다/);
  assert.doesNotMatch(discussion, /imagegen/);
  assert.doesNotMatch(discussion, /정확히 1회/);
  assert.match(discussion, /불명확할 때만 짧게 질문한다/);
  assert.ok(discussion.length < 700, `discussion prompt is unexpectedly long: ${discussion.length}`);
});
