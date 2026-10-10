const test = require("node:test");
const assert = require("node:assert/strict");

const api = Promise.all([
  import("../js/ai-scoped-edit-context.js"),
  import("../js/ai-scoped-edit-png.js"),
  import("../tests/helpers/box-edit-png-fixture.mjs"),
]);

test("compact context preserves source scale, permissions, hidden RGBA and metadata through an actual PNG roundtrip", async () => {
  const [{ prepareScopedEditContext, restoreScopedEditContext }, { decodeScopedPng, encodeScopedPng }, codec] = await api;
  const width = 40, height = 30, data = new Uint8Array(width * height * 4);
  for (let n = 0; n < data.length; n++) data[n] = n % 251;
  const source = codec.encodeTestRgbaPng({ width, height, data });
  const rectangles = [{ x0: 10, y0: 8, x1: 15, y1: 12 }];
  const context = await prepareScopedEditContext(source, rectangles);
  rectangles[0].x0 = 0;
  assert.deepEqual([context.width, context.height], [1536, 1024]);
  assert.deepEqual(context.originalRectangles, [{ x0: 10, y0: 8, x1: 15, y1: 12 }]);
  const input = await decodeScopedPng(context.inputPng);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = ((y - context.origin.y) * context.width + x - context.origin.x) * 4;
    assert.deepEqual(input.data.slice(at, at + 4), data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
  }
  const candidateData = new Uint8Array(input.data);
  const box = context.rectangles[0];
  const at = (box.y0 * context.width + box.x0) * 4;
  candidateData.set([0, 0, 0, 255], at);
  candidateData.set([1, 1, 1, 255], 0); // An unwanted tool edit outside the box must be discarded.
  const candidate = await encodeScopedPng({ ...input, data: candidateData }, { metadata: input.metadata });
  const restored = await decodeScopedPng(await restoreScopedEditContext(context, candidate));
  assert.deepEqual([restored.width, restored.height], [width, height]);
  for (let p = 0; p < width * height; p++) {
    assert.deepEqual(restored.data.slice(p * 4, p * 4 + 4),
      p === 8 * width + 10 ? Uint8Array.from([0, 0, 0, 255]) : data.slice(p * 4, p * 4 + 4));
  }
  assert.deepEqual(restored.metadata, (await decodeScopedPng(source)).metadata);
});

test("oversized sources use an integer crop containing every permission box, without resampling", async () => {
  const [{ prepareScopedEditContext }, { decodeScopedPng }, codec] = await api;
  const width = 1600, height = 1100, data = new Uint8Array(width * height * 4).fill(255);
  data.set([13, 29, 41, 0], (1050 * width + 1550) * 4);
  const source = codec.encodeTestRgbaPng({ width, height, data });
  const context = await prepareScopedEditContext(source, [{ x0: 1500, y0: 1000, x1: 1590, y1: 1090 }]);
  assert.ok(context.origin.x > 0 && context.origin.y > 0);
  assert.ok(context.rectangles[0].x1 <= 1536 && context.rectangles[0].y1 <= 1024);
  const input = await decodeScopedPng(context.inputPng);
  const at = ((1050 - context.origin.y) * input.width + 1550 - context.origin.x) * 4;
  assert.deepEqual(input.data.slice(at, at + 4), Uint8Array.from([13, 29, 41, 0]));
  await assert.rejects(prepareScopedEditContext(source, [{ x0: 0, y0: 0, x1: 1600, y1: 10 }]));
  await assert.rejects(prepareScopedEditContext(source, [{ x0: 0, y0: 0, x1: 10.5, y1: 10 }]));
});

test("tight context changes only the crop and padding, never target scale or permission", async () => {
  const [{ prepareScopedEditContext, restoreScopedEditContext }, { decodeScopedPng }, codec] = await api;
  const width=300,height=200,data=new Uint8Array(width*height*4).fill(255);
  const rect={x0:120,y0:70,x1:140,y1:90};
  data.set([13,29,41,0],(80*width+130)*4);
  const source=codec.encodeTestRgbaPng({width,height,data});
  const context=await prepareScopedEditContext(source,[rect],{contextMargin:48});
  const input=await decodeScopedPng(context.inputPng);
  assert.deepEqual([input.width,input.height],[1536,1024]);
  assert.deepEqual(context.originalRectangles,[rect]);
  for(let y=rect.y0;y<rect.y1;y++)for(let x=rect.x0;x<rect.x1;x++){
    const at=((y-context.origin.y)*input.width+x-context.origin.x)*4;
    assert.deepEqual(input.data.slice(at,at+4),data.slice((y*width+x)*4,(y*width+x)*4+4));
  }
  const restored=await decodeScopedPng(await restoreScopedEditContext(context,context.inputPng));
  assert.deepEqual(restored.data,data);
  await assert.rejects(prepareScopedEditContext(source,[rect],{contextMargin:-1}));
  await assert.rejects(prepareScopedEditContext(source,[rect],{contextMargin:0.5}));
});
