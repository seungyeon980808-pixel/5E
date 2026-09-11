import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  AI_IMAGE_MAX_GENERATIONS,
  AI_IMAGE_REVIEW_EFFORT,
  AI_IMAGE_REVIEW_MODEL,
  buildImageReviewPrompt,
  buildImageCorrectionRequest,
  readReviewPngDimensions,
  createAiImageReviewController,
  parseImageReviewReport,
} from "../js/ai-image-review.js";

const requiredChecks = (status = "pass") => [
  { id: "object-counts", label: "객체·부품 수", status, detail: "확인" },
  { id: "inside-outside", label: "안/밖 및 포함 관계", status, detail: "확인" },
  { id: "liquid-occupancy", label: "액체 점유와 경계", status, detail: "확인" },
  { id: "connections", label: "연결·접촉·분기", status, detail: "확인" },
  { id: "composition-state", label: "방향·상대 배치·패널 상태", status, detail: "확인" },
  { id: "black-fill-meaning", label: "검은 채움의 의미 구분", status, detail: "확인" },
  { id: "presentation", label: "문자·질감·배경 표현", status, detail: "확인" },
  { id: "request-scope", label: "요청 반영·요청 외 보존", status, detail: "요청과 요청 밖 부분 확인" },
];
const reportText = (verdict, status = verdict === "pass" ? "pass" : verdict) => JSON.stringify({
  verdict,
  checks: requiredChecks(status),
  issues: verdict === "pass" ? [] : [{ message: "구조 불일치", severity: "major", bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }],
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (predicate) => {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await tick();
  }
  assert.fail("condition was not reached");
};

function harness() {
  const sends = [];
  const states = [];
  const accepted = [];
  let turn = 0;
  const transport = {
    async send(payload) {
      const id = `turn-${++turn}`;
      sends.push({ id, payload });
      return { turnId: id, threadId: `thread-${turn}` };
    },
  };
  const controller = createAiImageReviewController({ transport, onState: (detail) => states.push(detail) });
  const start = (overrides = {}) => controller.start({
    candidate: { id: "candidate-1", name: "1차 후보", data: "data:image/png;base64,ONE" },
    request: "원본 구조를 보존",
    structuralInventory: "객체 2개, 관 1개",
    referenceNames: ["원본 A", "원본 B"],
    originalAttachments: [{ name: "원본 A", data: "a" }, { name: "원본 B", data: "b" }],
    generationCount: 1,
    modelAvailable: true,
    prepareCandidateAttachment: async (candidate) => ({ name: candidate.name, data: candidate.data }),
    makeCorrectionPayload: async ({ report, candidate }) => ({
      text: `correct:${report.verdict}`,
      attachments: [{ name: "original", data: "a" }, { name: candidate.name, data: candidate.data }],
      conversationId: null,
      purpose: "image",
      model: AI_IMAGE_REVIEW_MODEL,
      effort: "medium",
    }),
    acceptCorrectionImage: async (src) => {
      accepted.push(src);
      return { id: "candidate-2", name: "2차 후보", data: src };
    },
    ...overrides,
  });
  const event = (kind, extra = {}, turnId = sends.at(-1)?.id) => controller.handleEvent({ kind, turnId, ...extra });
  return { controller, sends, states, accepted, start, event };
}

test("review prompt is fresh-turn strict JSON visual review with named hard gates and no tools", () => {
  const prompt = buildImageReviewPrompt({ request: "요청", referenceNames: ["원본"], candidateName: "후보" });
  for (const pattern of [/새 대화/, /원본 참고 이미지 전부가 먼저/, /마지막 첨부가 현재 후보/, /object-counts/, /inside-outside/, /liquid-occupancy/, /connections/, /composition-state/, /black-fill-meaning/, /presentation/, /색 자체는 충실도 기준이 아니다/, /imagegen 또는 다른 이미지 생성·편집 도구를 호출하지 않는다/, /엄격한 JSON 객체 하나만/]) {
    assert.match(prompt, pattern);
  }
  assert.match(prompt, /임의의 95점 기준을 만들지 않는다/);
});

test("parser never upgrades missing, malformed, uncertain, or contradictory hard gates to pass", () => {
  assert.equal(parseImageReviewReport("```json\n{}\n```").ok, false);
  assert.equal(parseImageReviewReport(JSON.stringify({ verdict: "pass", checks: [], issues: [] })).ok, false);
  const uncertain = parseImageReviewReport(reportText("uncertain", "uncertain"));
  assert.equal(uncertain.ok, true);
  assert.equal(uncertain.report.verdict, "uncertain");
  const contradictory = parseImageReviewReport(JSON.stringify({ verdict: "pass", checks: requiredChecks("pass").map((check, index) => index ? check : { ...check, status: "uncertain" }), issues: [] }));
  assert.equal(contradictory.ok, true);
  assert.equal(contradictory.report.verdict, "uncertain");
  const emptyEvidence = { verdict: "pass", checks: requiredChecks(), issues: [] };
  emptyEvidence.checks[0].detail = "";
  assert.equal(parseImageReviewReport(JSON.stringify(emptyEvidence)).ok, false);
  const duplicate = { verdict: "pass", checks: [{ ...requiredChecks()[0], status: "fail" }, ...requiredChecks()], issues: [] };
  assert.equal(parseImageReviewReport(JSON.stringify(duplicate)).ok, false);
  const extraFailure = { verdict: "pass", checks: [...requiredChecks(), { id: "surface-texture", label: "질감", status: "fail", detail: "해칭이 과도함" }], issues: [] };
  assert.equal(parseImageReviewReport(JSON.stringify(extraFailure)).report.verdict, "uncertain");
  const unknownIssue = { verdict: "pass", checks: requiredChecks(), issues: [{ message: "액체 위치가 다름" }] };
  assert.equal(parseImageReviewReport(JSON.stringify(unknownIssue)).report.verdict, "uncertain");
  const zeroBox = { verdict: "fail", checks: requiredChecks("fail"), issues: [{ message: "누락", bbox: { x: 0, y: 0, width: 0, height: 0.2 } }] };
  assert.equal(parseImageReviewReport(JSON.stringify(zeroBox)).ok, false);
});

test("mocked transport: pass stops after one independent Sol high review", async () => {
  const h = harness();
  await h.start();
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].payload.model, AI_IMAGE_REVIEW_MODEL);
  assert.equal(h.sends[0].payload.effort, AI_IMAGE_REVIEW_EFFORT);
  assert.equal(h.sends[0].payload.conversationId, null);
  assert.equal(h.sends[0].payload.resetConversation, true);
  assert.equal(h.sends[0].payload.purpose, "chat", "desktop maps chat + ephemeral review to actual image purpose");
  assert.equal(h.sends[0].payload.ephemeralRender, true);
  assert.equal(h.sends[0].payload.attachments.at(-1).name, "1차 후보");
  h.event("assistant", { text: reportText("pass") });
  h.event("done", { status: "completed" });
  await waitFor(() => h.states.at(-1)?.state === "passed");
  assert.equal(h.sends.length, 1);
  assert.equal(h.states.at(-1).generationCount, 1);
  assert.equal(h.states.at(-1).reviewCount, 1);
});

test("mocked transport: explicit fail generates one correction, preserves both candidates, then pass", async () => {
  const h = harness();
  await h.start();
  h.event("assistant", { text: reportText("fail", "fail") });
  h.event("done", { status: "completed" });
  await waitFor(() => h.sends.length === 2);
  assert.equal(h.sends[1].payload.purpose, "image");
  h.event("image", { src: "data:image/png;base64,TWO" });
  h.event("done", { status: "completed" });
  await waitFor(() => h.sends.length === 3);
  assert.deepEqual(h.accepted, ["data:image/png;base64,TWO"]);
  assert.equal(h.sends[2].payload.attachments.at(-1).name, "2차 후보");
  assert.equal(h.sends[2].payload.conversationId, null);
  h.event("assistant", { text: reportText("pass") });
  h.event("done", { status: "completed" });
  await waitFor(() => h.states.at(-1)?.state === "passed");
  assert.equal(h.states.at(-1).candidateId, "candidate-2");
  assert.equal(h.states.at(-1).generationCount, AI_IMAGE_MAX_GENERATIONS);
  assert.equal(h.states.at(-1).reviewCount, 2);
  assert.equal(h.sends.length, 3);
});

test("mocked transport: duplicate done is idempotent while correction payload is pending", async () => {
  const sends = [];
  const states = [];
  let releaseCorrection;
  const controller = createAiImageReviewController({
    transport: { send: async (payload) => { sends.push(payload); return { turnId: `dup-${sends.length}` }; } },
    onState: (detail) => states.push(detail),
  });
  await controller.start({
    candidate: { id: "candidate-1" }, request: "요청", modelAvailable: true,
    originalAttachments: [], referenceNames: [],
    prepareCandidateAttachment: async () => ({ data: "candidate" }),
    makeCorrectionPayload: () => new Promise((resolve) => { releaseCorrection = resolve; }),
    acceptCorrectionImage: async () => ({ id: "candidate-2" }),
  });
  controller.handleEvent({ kind: "assistant", turnId: "dup-1", text: reportText("fail", "fail") });
  controller.handleEvent({ kind: "done", turnId: "dup-1", status: "completed" });
  controller.handleEvent({ kind: "done", turnId: "dup-1", status: "completed" });
  await tick();
  releaseCorrection({ purpose: "image" });
  await waitFor(() => sends.length === 2);
  assert.equal(sends.length, 2);
  assert.equal(controller.getState().generationCount, 2);
  assert.equal(controller.isActive(), true);
});

test("mocked transport: uncertain review does not spend correction generation", async () => {
  const h = harness();
  await h.start();
  h.event("assistant", { text: reportText("uncertain", "uncertain") });
  h.event("done", { status: "completed" });
  await waitFor(() => h.states.at(-1)?.state === "needs-attention");
  assert.equal(h.sends.length, 1);
  assert.equal(h.states.at(-1).generationCount, 1);
});

test("mocked transport: unexpected image during review fails closed", async () => {
  const h = harness();
  await h.start();
  h.event("image", { src: "data:image/png;base64,UNEXPECTED" });
  await waitFor(() => h.states.at(-1)?.state === "failed");
  h.event("assistant", { text: reportText("pass") });
  h.event("done", { status: "completed" });
  await tick();
  assert.equal(h.states.at(-1).state, "failed");
  assert.match(h.states.at(-1).report.issues.at(-1).message, /예기치 않은 이미지/);
});

test("mocked transport: rejected candidate preparation settles as failed without sending", async () => {
  const states = [];
  const controller = createAiImageReviewController({
    transport: { send: async () => assert.fail("transport must not be called") },
    onState: (detail) => states.push(detail),
  });
  await controller.start({
    candidate: { id: "candidate-reject" }, modelAvailable: true,
    prepareCandidateAttachment: async () => { throw new Error("prepare rejected"); },
    makeCorrectionPayload: async () => ({}), acceptCorrectionImage: async () => ({}),
  });
  assert.equal(controller.isActive(), false);
  assert.equal(states.at(-1).state, "failed");
  assert.match(states.at(-1).report.issues.at(-1).message, /prepare rejected/);
});

test("mocked transport: malformed review cannot succeed or trigger correction", async () => {
  const h = harness();
  await h.start();
  h.event("assistant", { text: "검수 완료" });
  h.event("done", { status: "completed" });
  await waitFor(() => h.states.at(-1)?.state === "failed");
  assert.equal(h.states.at(-1).report.verdict, "uncertain");
  assert.equal(h.sends.length, 1);
});

test("mocked transport: cancellation retires turn and ignores late success", async () => {
  const h = harness();
  await h.start();
  assert.equal(h.controller.cancel(), true);
  assert.equal(h.states.at(-1).state, "cancelled");
  assert.equal(h.event("assistant", { text: reportText("pass") }, "turn-1"), true);
  assert.equal(h.event("done", { status: "completed" }, "turn-1"), true);
  await tick();
  assert.equal(h.states.at(-1).state, "cancelled");
  assert.equal(h.sends.length, 1);
});

test("mocked transport: an early stale primary event is swallowed but cannot become the review verdict", async () => {
  let resolveSend;
  const states = [];
  const transport = { send: () => new Promise((resolve) => { resolveSend = resolve; }) };
  const controller = createAiImageReviewController({ transport, onState: (detail) => states.push(detail) });
  const startPromise = controller.start({
    candidate: { id: "candidate-1", name: "후보", data: "one" },
    request: "요청",
    originalAttachments: [],
    referenceNames: [],
    modelAvailable: true,
    prepareCandidateAttachment: async () => ({ name: "후보", data: "one" }),
    makeCorrectionPayload: async () => ({}),
    acceptCorrectionImage: async () => ({}),
  });
  await tick();
  assert.equal(controller.handleEvent({ kind: "assistant", turnId: "old-primary", text: reportText("pass") }), true);
  resolveSend({ turnId: "review-turn", threadId: "review-thread" });
  await startPromise;
  controller.handleEvent({ kind: "done", turnId: "review-turn", status: "completed" });
  await waitFor(() => states.at(-1)?.state === "failed");
  assert.equal(states.at(-1).report.verdict, "uncertain");
});

test("mocked transport: cancelled async preparation cannot leak a send into a replacement run", async () => {
  const sends = [];
  const states = [];
  let releaseOld;
  const controller = createAiImageReviewController({
    transport: { send: async (payload) => { sends.push(payload); return { turnId: `replacement-${sends.length}` }; } },
    onState: (detail) => states.push(detail),
  });
  const base = {
    request: "요청", modelAvailable: true, originalAttachments: [], referenceNames: [],
    makeCorrectionPayload: async () => ({}), acceptCorrectionImage: async () => ({ id: "corrected" }),
  };
  const oldStart = controller.start({
    ...base, candidate: { id: "old" },
    prepareCandidateAttachment: () => new Promise((resolve) => { releaseOld = resolve; }),
  });
  await tick();
  controller.cancel();
  await controller.start({ ...base, candidate: { id: "replacement" }, prepareCandidateAttachment: async () => ({ data: "new" }) });
  releaseOld({ data: "old" });
  await oldStart;
  await tick();
  assert.equal(sends.length, 1);
  assert.equal(controller.getState().candidateId, "replacement");
});

test("mocked transport: second failed review never starts a third generation", async () => {
  const h = harness();
  await h.start();
  h.event("assistant", { text: reportText("fail", "fail") });
  h.event("done", { status: "completed" });
  await waitFor(() => h.sends.length === 2);
  h.event("image", { src: "data:image/png;base64,TWO" });
  h.event("done", { status: "completed" });
  await waitFor(() => h.sends.length === 3);
  h.event("assistant", { text: reportText("fail", "fail") });
  h.event("done", { status: "completed" });
  await waitFor(() => h.states.at(-1)?.state === "needs-attention");
  assert.equal(h.states.at(-1).generationCount, 2);
  assert.equal(h.sends.length, 3, "only one correction generation is allowed");
});

test("panel integration persists candidate review metadata, restores selected-tab state, and gates white cache", async () => {
  const panel = await readFile(new URL("../js/ai-panel.js", import.meta.url), "utf8");
  assert.match(panel, /reviewState: item\?\.reviewState/);
  assert.match(panel, /reviewReport: item\?\.reviewReport/);
  assert.match(panel, /reviewMeta: item\?\.reviewMeta/);
  assert.match(panel, /card\.dataset\.aiCandidateId = item\.id/);
  assert.match(panel, /card\.dataset\.aiReviewState/);
  assert.match(panel, /new CustomEvent\("5e:ai-review"/);
  assert.match(panel, /selectedCandidate\.reviewState/);
  assert.match(panel, /isWhitePngWorkflow\(currentRunInput \|\| \{\}\) && output\?\.reviewVerified !== true/);
  assert.match(panel, /const bypassCache = isWhitePngWorkflow\(runInput\)/);
  assert.match(panel, /if \(imageReview\?\.handleEvent\(event\)\) return/);
});

test("unavailable Sol review model fails explicitly without transport fallback", async () => {
  const h = harness();
  await h.controller.start({
    candidate: { id: "candidate-x", name: "후보", data: "x" },
    generationCount: 1,
    modelAvailable: false,
    prepareCandidateAttachment: async () => ({}),
    makeCorrectionPayload: async () => ({}),
    acceptCorrectionImage: async () => ({}),
  });
  assert.equal(h.sends.length, 0);
  assert.equal(h.states.at(-1).state, "failed");
  assert.match(h.states.at(-1).report.issues[0].message, /자동 대체하지 않았습니다/);
});

async function correctionHarness() {
  const h=harness();await h.start();h.event('assistant',{text:reportText('fail')});h.event('done',{status:'completed'});await waitFor(()=>h.sends.length===2);return h;
}
test('real desktop auto-interrupted correction continues to independent re-review',async()=>{
  const h=await correctionHarness();h.event('image',{src:'corrected-png'});h.event('finalization',{state:'interrupting'});h.event('done',{status:'interrupted'});
  await waitFor(()=>h.sends.length===3);assert.equal(h.controller.getState().reviewCount,2);assert.equal(h.controller.getState().report.issues.length,0);
  h.event('assistant',{text:reportText('pass')});h.event('done',{status:'completed'});await waitFor(()=>h.states.at(-1).state==='passed');
});
test('unmarked interruption remains cancelled even if a correction image arrived',async()=>{
  const h=await correctionHarness();h.event('image',{src:'corrected-png'});h.event('done',{status:'interrupted'});await tick();await tick();assert.equal(h.states.at(-1).state,'cancelled');assert.equal(h.sends.length,2);
});
test('explicit user cancel wins over automatic image finalization and late success',async()=>{
  const h=await correctionHarness();h.event('image',{src:'corrected-png'});h.event('finalization',{state:'interrupting'});h.controller.cancel();h.event('done',{status:'interrupted'});h.event('finalization',{state:'confirmed',status:'interrupted'});await tick();assert.equal(h.states.at(-1).state,'cancelled');assert.equal(h.sends.length,2);
});
test('only scoped image recovery may survive the expected stopped state',async()=>{
  const h=await correctionHarness();assert.equal(h.controller.isRecoveringImageTurn(),false);h.event('image',{src:'corrected-png'});h.event('finalization',{state:'interrupting'});h.event('finalization',{state:'recovering'});assert.equal(h.controller.isRecoveringImageTurn(),true);
  h.event('finalization',{state:'recovered',status:'interrupted'});await waitFor(()=>h.sends.length===3);assert.equal(h.controller.isRecoveringImageTurn(),false);
});
test('interrupted JSON review cannot use image-finalization to claim success',async()=>{
  const h=harness();await h.start();h.event('assistant',{text:reportText('pass')});h.event('finalization',{state:'interrupting'});h.event('done',{status:'interrupted'});await tick();assert.equal(h.states.at(-1).state,'cancelled');assert.equal(h.sends.length,1);
});

const styledOptions = () => ({
  originalAttachments: [{name:'교과서',data:'data:image/png;base64,AA=='}],
  styleAttachments: [{name:'평가원 표현 참고',data:'data:image/png;base64,AQ=='}],
  referenceNames: ['잘못된 외부 이름', '스타일을 원본으로 잘못 분류한 이름'],
  candidate: {id:'styled-1',name:'첫 후보',data:'data:image/png;base64,Ag=='},
  markPolicyContract: '표시선 고정: arrows=remove / trends=keep / leaders=remove',
});

test('styled controller snapshots source/style roles through review, correction and re-review', async()=>{
  const h=harness(); const options=styledOptions();
  await h.start(options);
  options.originalAttachments[0].data='data:image/png;base64,/w==';
  options.styleAttachments[0].name='changed';options.styleAttachments.length=0;
  const first=h.sends[0].payload;
  assert.deepEqual(first.attachments.map(a=>a.name),['교과서','평가원 표현 참고','첫 후보']);
  assert.doesNotMatch(first.text,/잘못된 외부 이름/);
  h.event('assistant',{text:reportText('fail')});h.event('done',{status:'completed'});
  await waitFor(()=>h.sends.length===2);
  const correction=h.sends[1].payload;
  assert.deepEqual(correction.attachments,first.attachments); // callback's incomplete image list is not authoritative
  h.event('image',{src:'data:image/png;base64,Aw=='});h.event('done',{status:'completed'});
  await waitFor(()=>h.sends.length===3);
  assert.equal(h.sends[2].payload.attachments.at(-1).data,'data:image/png;base64,Aw==');
  for(const {payload} of h.sends){
    assert.equal(payload.attachments.length,3);
    assert.equal(payload.attachments[0].data,'data:image/png;base64,AA==');
    assert.equal(payload.attachments[1].data,'data:image/png;base64,AQ==');
    assert.match(payload.text,/"attachmentIndex":1,"role":"INPUT_SOURCE"/);
    assert.match(payload.text,/"attachmentIndex":2,"role":"STYLE_REFERENCE"/);
    assert.match(payload.text,/"attachmentIndex":3,"role":"CANDIDATE"/);
    assert.ok(payload.text.includes(options.markPolicyContract));
  }
  h.event('assistant',{text:reportText('fail')});h.event('done',{status:'completed'});
  await waitFor(()=>h.states.at(-1)?.state==='needs-attention');
  assert.equal(h.sends.length,3);assert.equal(h.controller.getState().generationCount,2);
});

test('invalid styled start rejects before cancelling an existing review',async()=>{
  const h=harness();await h.start();const old=h.controller.getState();
  for(const patch of [{styleAttachments:'not-array'},{originalAttachments:[]},{styleAttachments:styledOptions().originalAttachments}]){
    await assert.rejects(h.start({...styledOptions(),...patch}));
    assert.deepEqual(h.controller.getState(),old);assert.equal(h.sends.length,1);assert.equal(h.controller.isActive(),true);
  }
  h.controller.cancel();
});

test('styled malformed candidate fails closed without transport',async()=>{
  const h=harness();await h.start({...styledOptions(),prepareCandidateAttachment:async()=>({data:'invalid'})});
  assert.equal(h.sends.length,0);assert.equal(h.controller.getState().state,'failed');
});

test('styled cancellation during candidate preparation does not send a correction',async()=>{
  const h=harness();let calls=0,release;
  await h.start({...styledOptions(),prepareCandidateAttachment:async candidate=>{
    if(++calls===1)return {name:candidate.name,data:candidate.data};
    return new Promise(resolve=>{release=()=>resolve({name:candidate.name,data:candidate.data});});
  }});
  h.event('assistant',{text:reportText('fail')});h.event('done',{status:'completed'});
  await waitFor(()=>Boolean(release));h.controller.cancel();release();await tick();await tick();
  assert.equal(h.sends.length,1);assert.equal(h.controller.getState().state,'cancelled');
});

for (const withStyle of [false,true]) test(`candidate mutation during preparation fails closed (style=${withStyle})`,async()=>{
  const h=harness();const options=styledOptions();if(!withStyle) options.styleAttachments=[];let release;
  const pending=h.start({...options,prepareCandidateAttachment:async candidate=>{
    await new Promise(resolve=>{release=resolve;});return {name:candidate.name,data:candidate.data};
  }});
  await waitFor(()=>Boolean(release));options.candidate.name='changed';options.candidate.data='data:image/png;base64,/w==';
  release();await pending;assert.equal(h.sends.length,0);assert.equal(h.controller.getState().state,'failed');
});

for (const withStyle of [false,true]) test(`candidate mutation after sending cannot receive a stale pass (style=${withStyle})`,async()=>{
  const h=harness();const options=styledOptions();if(!withStyle) options.styleAttachments=[];await h.start(options);
  options.candidate.data='data:image/png;base64,/w==';
  h.event('assistant',{text:reportText('pass')});h.event('done',{status:'completed'});
  await waitFor(()=>!h.controller.isActive());assert.equal(h.controller.getState().state,'failed');
  assert.ok(!h.states.some(s=>s.state==='passed'));assert.equal(h.sends.length,1);
});

// Synthetic IHDR-only fixtures test metadata parsing, not image validity.
const reviewHeaderFixture = (width, height) => {
  const b = Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(b);
  b.writeUInt32BE(width,16); b.writeUInt32BE(height,20);
  return `data:image/png;base64,${b.toString('base64')}`;
};
test('review metadata reads non-square PNG headers without processing pixels',()=>{
  for(const [width,height] of [[1536,735],[320,900],[1,1]])
    assert.deepEqual(readReviewPngDimensions(reviewHeaderFixture(width,height)),{width,height});
  for(const data of [null,'PNG','data:image/png;base64,AA==','data:image/png;base64,!!!!',reviewHeaderFixture(0,10),reviewHeaderFixture(10,2147483648),reviewHeaderFixture(12,20).replace('image/png','image/jpeg')])
    assert.equal(readReviewPngDimensions(data),null);
});
test('bbox coordinates separate horizontal and vertical denominators from shape comparison',()=>{
  const p=buildImageReviewPrompt({candidateAttachmentData:reviewHeaderFixture(1536,735)});
  assert.match(p,/x\/width는 1536, y\/height는 735/);
  assert.match(p,/형상 비교를 위해 폭을 맞춘 것과 bbox 좌표계는 별개/);
  assert.match(p,/불명확하면 bbox를 생략/);
  assert.match(buildImageReviewPrompt(),/해상도나 좌표 수치를 추측하지 않는다/);
});
test('review uses prepared candidate dimensions rather than native candidate or STYLE dimensions',async()=>{
  const h=harness(); const prepared=reviewHeaderFixture(750,500);
  await h.start({candidate:{id:'sized',name:'native',data:reviewHeaderFixture(1500,1000)},
    originalAttachments:[{name:'INPUT',data:reviewHeaderFixture(200,100)}],
    styleAttachments:[{name:'STYLE',data:reviewHeaderFixture(320,900)}],
    prepareCandidateAttachment:async()=>({name:'transport candidate',data:prepared})});
  const p=h.sends[0].payload;
  assert.match(p.text,/750×500px/); assert.doesNotMatch(p.text,/1500×1000px|320×900px/);
  assert.equal(p.attachments.at(-1).data,prepared); h.controller.cancel();
});
test('bbox parsing rejects coercible non-number coordinates instead of inventing zeroes',()=>{
  for(const x of [null,false,true,'',[],{},'0.1']){
    const r=JSON.parse(reportText('fail'));r.issues[0].bbox.x=x;
    assert.equal(parseImageReviewReport(JSON.stringify(r)).ok,false,JSON.stringify(x));
  }
  const r=JSON.parse(reportText('fail'));r.issues[0].bbox.width=null;r.issues[0].bbox.w=0.3;
  assert.equal(parseImageReviewReport(JSON.stringify(r)).ok,false);
  r.issues[0].bbox=[0.1,0.2,0.3,0.4];assert.equal(parseImageReviewReport(JSON.stringify(r)).ok,true);
});
test('malformed bbox prevents automatic correction and correction text treats valid boxes as hypotheses',async()=>{
  const h=harness();await h.start();const r=JSON.parse(reportText('fail'));r.issues[0].bbox.x=false;
  h.event('assistant',{text:JSON.stringify(r)});h.event('done',{status:'completed'});
  await waitFor(()=>h.states.at(-1)?.state==='failed');assert.equal(h.sends.length,1);
  assert.match(buildImageCorrectionRequest({report:JSON.parse(reportText('fail'))}),/검증된 마스크가 아니다/);
  assert.match(buildImageCorrectionRequest({report:JSON.parse(reportText('fail'))}),/임의 재척도/);
});

test('bbox rejects positive regions starting at or spilling past the image boundary',()=>{
  for(const bbox of [{x:1,y:0,width:0.0000005,height:0.1},{x:0,y:1,width:0.1,height:0.0000005},{x:0.9,y:0,width:0.1000005,height:0.1},{x:0,y:0.9,width:0.1,height:0.1000005}]){
    const r=JSON.parse(reportText('fail'));r.issues[0].bbox=bbox;
    assert.equal(parseImageReviewReport(JSON.stringify(r)).ok,false);
  }
  const r=JSON.parse(reportText('fail'));r.issues[0].bbox={x:0,y:0,width:1,height:1};
  assert.equal(parseImageReviewReport(JSON.stringify(r)).ok,true);
});
