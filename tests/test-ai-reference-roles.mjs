import test from 'node:test';
import assert from 'node:assert/strict';
import {planImageReferences} from '../js/ai-reference-roles.js';
import {buildWhitePngPrompt} from '../js/ai-white-png.js';
import {buildImageReviewPrompt,buildStructuralInventory} from '../js/ai-image-review.js';
const image=(name,b64)=>({name,data:`data:image/png;base64,${b64}`});
const source=()=>image('교과서','AA==');
const style=()=>image('평가원','AQ==');
const candidate=()=>image('현재 후보','Ag==');
test('style and candidate never enter source observation; attachment roles are explicit',()=>{
 const p=planImageReferences({inputs:[source()],styleReferences:[style()],candidate:candidate()});
 assert.deepEqual(p.analysisAttachments,[source()]);
 assert.deepEqual(p.attachments,[source(),style(),candidate()]);
 assert.deepEqual(p.bindings.map(b=>[b.attachmentIndex,b.role]),[[1,'INPUT_SOURCE'],[2,'STYLE_REFERENCE'],[3,'CANDIDATE']]);
 assert.deepEqual(p.sourceNames,['교과서']);
 assert.match(p.roleContract,/스타일 유사성이 INPUT_SOURCE의 구조 실패를 상쇄하지 않는다/);
 const inventory=buildStructuralInventory({references:p.analysisAttachments});assert.doesNotMatch(inventory,/평가원/);
});
test('no style keeps legacy attachments and no extra role instruction',()=>{
 const p=planImageReferences({inputs:[source()],candidate:candidate()});
 assert.deepEqual(p.attachments,[source(),candidate()]);assert.equal(p.roleContract,'');
 assert.equal(buildWhitePngPrompt({}),buildWhitePngPrompt({referenceRoleContract:p.roleContract}));
 assert.equal(buildImageReviewPrompt({}),buildImageReviewPrompt({referenceRoleContract:p.roleContract}));
});
test('reject style-only, malformed and cross-role reuse instead of treating style as source',()=>{
 for(const args of [{styleReferences:[style()]},{inputs:[source()],styleReferences:[source()]},{inputs:[source()],styleReferences:[style(),style()]},{inputs:[{name:'bad',data:'not an image'}]},{inputs:[source()],candidate:{data:'bad'}}]) assert.throws(()=>planImageReferences(args));
 assert.doesNotThrow(()=>planImageReferences({inputs:[source()],candidate:source()}));
});
test('role contract reaches generation, revision and review without conflicting positional assumption',()=>{
 const p=planImageReferences({inputs:[source()],styleReferences:[style()],candidate:candidate()});
 for(const revision of [false,true]){const prompt=buildWhitePngPrompt({revision,referenceRoleContract:p.roleContract});assert.ok(prompt.includes(p.roleContract));assert.match(prompt,/보존: 역할 계약의 INPUT_SOURCE/);}
 const review=buildImageReviewPrompt({referenceNames:p.sourceNames,referenceRoleContract:p.roleContract});
 assert.ok(review.includes(p.roleContract));assert.doesNotMatch(review,/첨부 순서는 원본 참고 이미지 전부가 먼저이고/);
});
test('filename is data, not a role classifier, and caller images are not mutated',()=>{
 const a=image('STYLE_REFERENCE in filename','Aw==');const b=style();const before=JSON.stringify([a,b]);
 const p=planImageReferences({inputs:[a],styleReferences:[b]});assert.equal(p.bindings[0].role,'INPUT_SOURCE');
 p.attachments[0].name='changed';assert.equal(JSON.stringify([a,b]),before);
});
