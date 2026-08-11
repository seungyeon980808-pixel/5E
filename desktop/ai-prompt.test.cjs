const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function loadPromptModule() {
  const moduleUrl = pathToFileURL(path.join(__dirname, "..", "js", "ai-prompt.js"));
  moduleUrl.searchParams.set("test", String(Date.now()));
  return import(moduleUrl.href);
}

test("image prompt is self-contained and invokes imagegen exactly once", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  const prompt = buildImagePrompt({ request: "심장 구조를 보존해 줘", mode: "diagram" });

  assert.doesNotMatch(prompt, /docs\//);
  assert.doesNotMatch(prompt, /EXAM_SCIENTIFIC_DIAGRAM_STYLE\.md/);
  assert.match(prompt, /파일·저장소·문서·웹을 검색하거나 읽지 말고/);
  assert.match(prompt, /추가 질문도 하지 않는다/);
  assert.match(prompt, /imagegen 이미지 생성 도구를 정확히 1회 호출한다/);
  assert.equal((prompt.match(/imagegen/g) || []).length, 1);
  assert.match(prompt, /성공하면 '이미지 생성 완료'/);
  assert.match(prompt, /실패하면 '이미지 생성 실패: 짧은 이유'/);
});

test("all quality modes preserve the mandatory structure invariant", async () => {
  const { buildImagePrompt } = await loadPromptModule();
  for (const qualityMode of ["simple", "standard", "complex"]) {
    const prompt = buildImagePrompt({ request: "참고 이미지를 재구성해 줘", mode: "diagram", qualityMode });
    assert.match(prompt, /객체 종류·개수·실루엣·연결·접촉·겹침·좌우\/상하 순서와 상대 비율/);
    assert.match(prompt, /어떤 경우에도 바꾸지 않는다/);
    assert.match(prompt, /문자, 숫자, 단위, 수식, 기호, 라벨, 로고, 워터마크, 지시선과 화살표를 절대 생성하지 않는다/);
    assert.match(prompt, /실제 RGBA 투명 배경/);
    assert.ok(prompt.length < 2400, `image prompt is unexpectedly long: ${prompt.length}`);
  }
});

test("complex revision is a correction pass and discussion never renders", async () => {
  const { buildDiscussionPrompt, buildImagePrompt } = await loadPromptModule();
  const revision = buildImagePrompt({ request: "틀린 구조만 교정", mode: "diagram", revision: true, qualityMode: "complex" });
  const discussion = buildDiscussionPrompt({ request: "심장의 위치를 정리하자", mode: "complete" });

  assert.match(revision, /복잡 모드 교정 단계/);
  assert.match(revision, /맞는 영역은 그대로 보존/);
  assert.match(revision, /잘못된 부분만 변경/);
  assert.match(discussion, /대화형 설계 보조자/);
  assert.doesNotMatch(discussion, /imagegen/);
  assert.ok(discussion.length < 700, `discussion prompt is unexpectedly long: ${discussion.length}`);
});
