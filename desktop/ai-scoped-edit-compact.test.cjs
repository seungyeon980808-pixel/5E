const test = require("node:test");
const assert = require("node:assert/strict");

test("compact requests bind unchanged user comments and corrections to selected pixel boxes", async () => {
  const { buildCompactScopedEditPrompt } = await import("../js/ai-scoped-edit-compact.js");
  const comments = [
    { type: "area", imageId: "selected", number: 7, x: 10, y: 20, w: 30, h: 40, text: "오른쪽으로 150픽셀 이동" },
    { type: "area", imageId: "selected", number: 2, x: 60, y: 20, w: 20, h: 40, text: "구를 두 개 추가" },
  ];
  const rectangles = [
    { x0: 100, y0: 200, x1: 400, y1: 600 },
    { x0: 600, y0: 200, x1: 800, y1: 600 },
  ];
  const before = structuredClone(comments);
  const prompt = buildCompactScopedEditPrompt({ session: { width: 1000, height: 1000, rectangles },
    comments, candidateId: "selected", correction: "  Previous centers were 27 pixels left.  " });
  const spec = JSON.parse(prompt.split("<5e-scoped-edit-spec>\n")[1].split("\n</5e-scoped-edit-spec>")[0]);
  assert.deepEqual(spec.canvas_pixels, [1000, 1000]);
  assert.deepEqual(spec.edits, [
    { box: 7, allowed_pixels: rectangles[0], instruction: comments[0].text },
    { box: 2, allowed_pixels: rectangles[1], instruction: comments[1].text },
  ]);
  assert.equal(spec.previous_error, "Previous centers were 27 pixels left.");
  assert.deepEqual(comments, before);
});

test("compact requests reject unrelated comments and missing rectangle bindings", async () => {
  const { buildCompactScopedEditPrompt } = await import("../js/ai-scoped-edit-compact.js");
  const comments = [{ type: "area", imageId: "other", x: 0, y: 0, w: 10, h: 10, text: "move" }];
  assert.throws(() => buildCompactScopedEditPrompt({ session: { rectangles: [] }, comments, candidateId: "selected" }));
  assert.throws(() => buildCompactScopedEditPrompt({ session: { rectangles: [] },
    comments: [{ ...comments[0], imageId: "selected" }], candidateId: "selected" }));
});

test("verified machine fields use attached coordinates exactly once and retain user copy",async()=>{
  const {buildVerifiedScopedEditPrompt}=await import("../js/ai-scoped-edit-compact.js");
  const rectangle={x0:100,y0:200,x1:400,y1:600};
  const comments=[{type:"area",imageId:"s",x:10,y:20,w:30,h:40,text:"중심 (250,350)에 구 하나 추가"}];
  const checks=[{box:0,kind:"circles",diameter:100,centers:[{x:250,y:350}],search:rectangle}];
  const before=structuredClone({comments,checks});
  const prompt=buildVerifiedScopedEditPrompt({session:{width:1000,height:1000,rectangles:[rectangle]},
    comments,candidateId:"s",context:{width:1536,height:1024,origin:{x:-50,y:16}},checks});
  const spec=JSON.parse(prompt.split("<5e-verified-edit-spec>\n")[1].split("\n</5e-verified-edit-spec>")[0]);
  assert.deepEqual(spec.canvas_pixels,[1536,1024]);
  assert.deepEqual(spec.edits[0].allowed_pixels,{x0:150,y0:184,x1:450,y1:584});
  assert.deepEqual(spec.edits[0].required_edit.centers_pixels,[[300,334]]);
  assert.equal(spec.edits[0].required_edit.diameter_pixels,100);
  assert.equal(spec.edits[0].original_user_instruction,comments[0].text);
  assert.deepEqual({comments,checks},before);
  const movePrompt=buildVerifiedScopedEditPrompt({session:{width:1000,height:1000,rectangles:[rectangle]},
    comments,candidateId:"s",context:{width:1536,height:1024,origin:{x:-50,y:16}},
    checks:[{box:0,kind:"move",dx:50,dy:-8,search:rectangle}],
    sourceMeasurements:[{sourceBounds:{x0:150,y0:250,x1:200,y1:270}}]});
  const moveSpec=JSON.parse(movePrompt.split("<5e-verified-edit-spec>\n")[1].split("\n</5e-verified-edit-spec>")[0]);
  assert.deepEqual(moveSpec.edits[0].required_edit.source_bounds_pixels,{x0:200,y0:234,x1:250,y1:254});
  assert.deepEqual(moveSpec.edits[0].required_edit.destination_bounds_pixels,{x0:250,y0:226,x1:300,y1:246});
  assert.throws(()=>buildVerifiedScopedEditPrompt({session:{rectangles:[rectangle]},comments,candidateId:"s",checks:[]}));
});
