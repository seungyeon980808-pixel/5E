import {normalizeMarkPolicy} from '../js/ai-mark-policy.js';
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isWhitePngWorkflow} from "../js/ai-white-png.js";
import {resolveGeneratedRaster} from "../js/ai-raster-output.js";
import {candidateUsesAutomaticSeparation} from "../js/ai-panel.js";
const source=await readFile(new URL("../js/ai-panel.js",import.meta.url),"utf8");
const previewSource=source.slice(source.indexOf("  const addPreview ="),source.indexOf("  const addScenePreview ="));
function setup(mode="diagram"){
 const ctx={normalizeMarkPolicy,panel:{dataset:{}},selectedCandidateId:null,syncWhitePngUi(){},inspectPngDataUrl:async()=>({opaque:true,strictlyAchromatic:true}),latestGeneratedSrc:null,imageSerial:0,currentRunInput:{mode,outputEngine:"raster"},isWhitePngWorkflow,resolveGeneratedRaster,transparentizeGeneratedImage:async()=>{throw Error("legacy transform failed");},emptyReviewReport:()=>({verdict:"uncertain",checks:[],issues:[]}),addLog(){},previews:{querySelector:()=>null,prepend(){}},generatedImages:[],makeImageCard:x=>x,candidateUsesAutomaticSeparation,startAutomaticSeparation(){}};
 return {ctx,run:new Function("ctx",`with(ctx){${previewSource};return addPreview;}`)(ctx)};
}
test("actual addPreview rejects non-PNG with no preview mutation",async()=>{
 const {ctx,run}=setup();await assert.rejects(run("data:image/jpeg;base64,AA=="),/PNG/);assert.equal(ctx.generatedImages.length,0);assert.equal(ctx.latestGeneratedSrc,null);
});
test("actual addPreview preserves PNG bytes, legacy failure still falls back",async()=>{
 const png="data:image/png;base64,iVBORw0KGgo=";const a=setup();assert.equal((await a.run(png)).data,png);assert.equal(a.ctx.generatedImages.length,1);
 const b=setup("complete");assert.equal((await b.run("legacy-src")).data,"legacy-src");
});
test("output error survives late completed terminal state",()=>{
 const fn=source.slice(source.indexOf("  const finishCurrentTurnUi ="),source.indexOf("  const dispatchAiEvent ="));let lastStatus,taskState;
 const ctx={currentRequestEpoch:1,serverTurnFinished:true,previewPending:false,currentImageOutputError:"invalid PNG",currentTerminalOutcome:"completed",pendingCacheOutput:{data:"bad"},currentTurnDone:false,currentTurnUsage:null,advanceGenerationClock(){},setTaskState:value=>taskState=value,setGenerating(){},setBusy(){},setStatus:(...v)=>lastStatus=v,addTokenFooter(){}};
 const finish=new Function("ctx",`with(ctx){${fn};return finishCurrentTurnUi;}`)(ctx);finish(1);assert.equal(ctx.currentTerminalOutcome,"failed");assert.equal(ctx.pendingCacheOutput,null);assert.equal(taskState,"failed");assert.equal(lastStatus[1],"error");assert.match(lastStatus[0],/invalid PNG/);
});
test("actual addPreview keeps renderer prompt separately without changing PNG bytes",async()=>{
 const {run}=setup();const png="data:image/png;base64,iVBORw0KGgo=";const item=await run(png,{rendererPrompt:"two medium circles"});assert.equal(item.data,png);assert.equal(item.rendererPrompt,"two medium circles");
});
