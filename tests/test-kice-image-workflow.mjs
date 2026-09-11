import assert from "node:assert/strict";
import test from "node:test";
import { enforceKiceImageRunInput, kiceImageRequest, KICE_REFERENCE_CLEANUP_REQUEST } from "../js/kice-image-workflow.js";
import { resolveGeneratedRaster } from "../js/ai-raster-output.js";
test("white diagram ignores stale complex preference, asset and complete remain opt-in legacy", () => {
  assert.equal(enforceKiceImageRunInput({qualityMode:"complex"}).qualityMode, "simple");
  assert.equal(enforceKiceImageRunInput({qualityMode:"complex",complexPass:2}).complexPass, 1);
  assert.equal(enforceKiceImageRunInput({mode:"complete",qualityMode:"complex"}).qualityMode,"complex");
  assert.equal(enforceKiceImageRunInput({outputEngine:"asset"}).outputEngine,"asset");
});
test("reference-only generation needs no typed request", () => {
  assert.equal(kiceImageRequest("",{hasImage:true}),KICE_REFERENCE_CLEANUP_REQUEST);
  assert.equal(kiceImageRequest("",{hasImage:false}),"");
  assert.equal(kiceImageRequest("  관만 남겨 줘  "),"관만 남겨 줘");
});
test("white output bypasses even destructive transform and keeps exact bytes",async()=>{
  const src="data:image/png;base64,iVBORw0KGgo="; let calls=0;
  assert.equal(await resolveGeneratedRaster(src,{whitePng:true,transform:()=>{calls++;throw Error("must not run");}}),src);
  assert.equal(calls,0);
  assert.equal(await resolveGeneratedRaster(src,{transform:()=>"legacy"}),"legacy");
  await assert.rejects(resolveGeneratedRaster("data:image/jpeg;base64,AA==",{whitePng:true}),/PNG/);
});
test("HTTPS PNG preserves downloaded bytes and rejects mislabeled files",async()=>{
 const bytes=Uint8Array.from([137,80,78,71,13,10,26,10]);
 const png=await resolveGeneratedRaster("https://example.test/result.png",{whitePng:true,fetcher:async()=>({ok:true,arrayBuffer:async()=>bytes.buffer})});
 assert.equal(png,"data:image/png;base64,iVBORw0KGgo=");
 await assert.rejects(resolveGeneratedRaster("data:image/png;base64,AA==",{whitePng:true}),/서명/);
 await assert.rejects(resolveGeneratedRaster("https://example.test/result.png",{whitePng:true,fetcher:async()=>({ok:false})}),/내려받지/);
});
