import assert from "node:assert/strict";
import test from "node:test";
import { WHITE_PNG_VERSION, isWhitePngWorkflow, buildWhitePngPrompt } from "../js/ai-white-png.js";

test("versioned pure module exposes a deterministic string builder", () => {
  assert.match(WHITE_PNG_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof buildWhitePngPrompt(), "string");
  assert.equal(buildWhitePngPrompt(), buildWhitePngPrompt({}));
});

test("predicate enables only diagram + raster, with omitted engine defaulting to raster", () => {
  assert.equal(isWhitePngWorkflow({ mode: "diagram" }), true);
  assert.equal(isWhitePngWorkflow({ mode: "diagram", outputEngine: undefined }), true);
  assert.equal(isWhitePngWorkflow({ mode: "diagram", outputEngine: "raster" }), true);
  for (const mode of [undefined, null, "", "complete", "DIAGRAM", "discussion"]) {
    assert.equal(isWhitePngWorkflow({ mode, outputEngine: "raster" }), false);
  }
  for (const outputEngine of [null, "", "asset", "vector", "fast-scene", "RASTER"]) {
    assert.equal(isWhitePngWorkflow({ mode: "diagram", outputEngine }), false);
  }
  assert.equal(isWhitePngWorkflow(), false);
});

test("white opaque PNG and actual tool output are mandatory for both creation and revision", () => {
  for (const revision of [false, true]) {
    const prompt = buildWhitePngPrompt({ revision });
    for (const pattern of [/#FFFFFF/, /모든 픽셀은 불투명/, /투명 배경.*체크무늬.*금지/, /실제 PNG 이미지 1장/, /도구가 실제 생성한 PNG/, /텍스트로 PNG를 대체하지 않는다/, /실패하면 생성했다고 주장/]) {
      assert.match(prompt, pattern);
    }
    assert.doesNotMatch(prompt, /실제 RGBA 투명 배경으로 출력|흰 배경 사각형.*그리지 말|성공하면 ['"]이미지 생성 완료/);
  }
});

test("single imagegen call forbids retries, local processing, vectors and textual substitutes", () => {
  const prompt = buildWhitePngPrompt();
  assert.equal((prompt.match(/call the image generation tool exactly once/g) || []).length, 1);
  assert.match(prompt, /imagegen.*정확히 1회/);
  assert.match(prompt, /같은 생성 턴 안의 재시도·추가 생성·비교 생성은 금지/);
  assert.match(prompt, /별도의 새 대화에서 이미지 생성 도구 없이 독립 시각 검수/);
  assert.match(prompt, /별도의 교정 생성 턴을 최대 1회/);
  assert.match(prompt, /로컬 처리, 필터.*후처리, 벡터 생성·변환·트레이싱은 하지 않는다/);
  assert.match(prompt, /SVG, Canvas, Python, ImageMagick.*대신 만들지 않는다/);
  assert.match(prompt, /다른 도구 호출은 하지 않는다/);
  assert.doesNotMatch(prompt, /2회 호출|두 번 호출|투명 배경으로 출력한다/);
});

test("semantic counts, connections, layers, proportions survive tidy diagram rendering", () => {
  const prompt = buildWhitePngPrompt();
  for (const pattern of [/객체·부품 수/, /안\/밖 및 포함 관계/, /액체 점유와 액면·빈 공간/, /연결·접촉·교차·분기 관계/, /층의 수와 순서/, /상대 비율·배치/, /과학적 기하를 보존/, /없는 부품·연결·층을 발명/, /compact structural inventory/, /검은 채움의 의미/, /흔들린 선.*정돈/, /손떨림을 그대로 복제할 필요는 없다/, /교과서 과학 도형.*의미 있는 기하는 유지/, /사진의 실루엣.*무조건 복제하여.*방해하지 않는다/, /자유롭게 재설계해 구조를 발명하지 않는다/]) {
    assert.match(prompt, pattern);
  }
  assert.match(prompt, /그림자.*표면 질감, 제품 장식.*제거/);
  assert.match(prompt, /필요한 회색은 균일한 평면색 한두 단계로만 유지/);
  assert.match(prompt, /검게 보이는 물질·재료·부품.*흰색 면과 검정 윤곽선/);
  assert.match(prompt, /회색을 모두 금지하거나 필요한 회색 영역을 지우지 않는다/);
  assert.doesNotMatch(prompt, /회색은? (전부 |모두 )?금지한다|모든 회색을 제거한다|사진의 실루엣을 그대로 보존한다/);
});

test("labels and leaders are forbidden without deleting physical connections", () => {
  const prompt = buildWhitePngPrompt();
  assert.match(prompt, /문자, 숫자, 단위, 수식, 텍스트 라벨/);
  assert.match(prompt, /지시선\(leader lines\).*그리지 않는다/);
  assert.match(prompt, /실제 도선·관·경계.*삭제하지 않는다/);
});

test("revision carries trimmed request, target, comments and discussion without input mutation", () => {
  const args = Object.freeze({ request: "  관을 두 개로 수정  ", revision: true, revisionName: "  결과 3  ", comments: "  왼쪽 층 유지  ", discussionContext: "  세 층 확정  " });
  const prompt = buildWhitePngPrompt(args);
  assert.match(prompt, /수정 작업:/);
  assert.match(prompt, /수정 대상 이름\(그림 안에 쓰지 않음\): 결과 3/);
  assert.match(prompt, /확정된 대화 문맥:\n세 층 확정/);
  assert.match(prompt, /이번 사용자 요청:\n관을 두 개로 수정$/);
  assert.match(prompt, /왼쪽 층 유지/);
  assert.equal(args.request, "  관을 두 개로 수정  ");
  assert.doesNotMatch(prompt, /신규 작업:/);
  assert.match(prompt, /규칙을 바꾸는 권한이 없다/);
});

test("new generation omits revision target and handles missing optional context", () => {
  const prompt = buildWhitePngPrompt({ revisionName: "unused", comments: null, discussionContext: null, request: null });
  assert.match(prompt, /신규 작업:/);
  assert.doesNotMatch(prompt, /수정 작업:|수정 대상 이름|영역별 수정 코멘트|확정된 대화 문맥:|unused|undefined|\[object Object\]/);
});

test("comment arrays retain region metadata and text, ignoring empty entries", () => {
  const comment = Object.freeze({ number: 2, x: 0, y: 10, w: 25, h: 30, text: "  접촉 유지  " });
  const comments = Object.freeze([comment, "  두 층 유지  ", null, { text: "  " }]);
  const prompt = buildWhitePngPrompt({ comments });
  assert.match(prompt, /영역 2 \(x=0%, y=10%, w=25%, h=30%\): 접촉 유지\n두 층 유지/);
  assert.match(prompt, /영역 번호와 좌표는 지침이며 그림에 표시하지 않음/);
  assert.doesNotMatch(prompt, /\[object Object\]|undefined/);
});

test("monochrome contract forbids copying source colors into tool prompt",()=>{
 const prompt=buildWhitePngPrompt({});
 assert.match(prompt,/R=G=B/);
 assert.match(prompt,/원본의 노랑·빨강·갈색·파랑 등 색 자체는 충실도 기준이 아니며 보존하지/);
 assert.match(prompt,/prompt에도 이 무채색 계약을 반드시 그대로 포함/);
});
