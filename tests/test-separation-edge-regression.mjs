import assert from 'node:assert/strict';
import { encodeScopedPng } from '../preview/js/ai-scoped-edit-png.js';
import { prepareSeparatedAssets } from '../preview/js/ai-separated-assets.js';
const w=100,h=80;
async function separate(transparent) {
 const data=new Uint8Array(w*h*4).fill(255);
 if(transparent) for(let p=3;p<data.length;p+=4)data[p]=0;
 for(const [x0,y0,x1,y1] of [[0,25,12,40],[55,20,70,40]]) for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) data.set([0,0,0,255],(y*w+x)*4);
 const png=await encodeScopedPng({width:w,height:h,data});
 return prepareSeparatedAssets(`data:image/png;base64,${Buffer.from(png).toString('base64')}`);
}
for(const transparent of [false,true]) {
 const result=await separate(transparent);
 assert.equal(result.assets.length,2);
 assert.equal(result.stats.unassignedForegroundPixelCount,0);
 assert.equal(result.stats.rgbaVerified,true);
}
for(const checker of [false,true]) {
 const data=new Uint8Array(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=checker&&((x+y)%2)?255:100;data.set([v,v,v,255],(y*w+x)*4);}
 const png=await encodeScopedPng({width:w,height:h,data});
 await assert.rejects(prepareSeparatedAssets(`data:image/png;base64,${Buffer.from(png).toString('base64')}`), /체크무늬나 어두운 배경/);
}
console.log('Edge-touching objects: white/transparent separation and unsupported background rejection passed');
const { insertEditableAssets } = await import('../preview/js/ai-editable-assets.js');
const prepared = await separate(false);
prepared.labelsDisabled = true;
const original = {id:'original',type:'image',src:'original-data'};
const draft = {objects:[original],artboard:{w:90,h:60},activePageId:'page1',activeLayerId:'layer1',undoStack:[],redoStack:[],groups:[]};
const result = insertEditableAssets({get:()=>draft,update:fn=>fn(draft)}, prepared, {isCurrent:()=>true,aiTaskId:'task1',aiCandidateId:'candidate1'});
assert.equal(result.added,2);
assert.deepEqual(result.groupIds,[]);
assert.ok(draft.objects.slice(1).every(item=>item.groupId===null && item.editableAssetRegionId));
assert.deepEqual(draft.objects[0],original);
assert.deepEqual(draft.undoStack[0],[original]);
console.log('Insertion: two independent image objects, original and undo snapshot preserved');
