import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isImageCommentTarget} from '../js/ai-image-comments.js';
const panel=readFileSync(new URL('../js/ai-panel.js',import.meta.url),'utf8');
const comments=readFileSync(new URL('../js/ai-image-comments.js',import.meta.url),'utf8');
test('comment module itself excludes style and corrupt roles even without caller filtering',()=>{
 for(const role of ['STYLE_REFERENCE','unrecognized',null]) assert.equal(isImageCommentTarget({id:'ref',kind:'reference',referenceRole:role},'ref'),false);
 for(const role of [undefined,'INPUT_SOURCE']) assert.equal(isImageCommentTarget({id:'ref',kind:'reference',referenceRole:role},'other'),true);
 assert.equal(isImageCommentTarget({id:'candidate',kind:'generated'},'candidate'),true);
 assert.equal(isImageCommentTarget({id:'old',kind:'generated'},'candidate'),false);
 assert.equal(isImageCommentTarget(null,null),false);
 assert.match(comments,/!allowed\(\)\.includes\(item\)/);
});
test('panel separates source comments and observation from style-aware generation/cache/review',()=>{
 assert.match(panel,/!needsReferenceComposite \? roleGroups\.inputs : \[\]/);
 assert.match(panel,/requestWithVisualPlan \+= commentPrompt\(\[referenceComposite\]\)/);
 assert.match(panel,/const analysisAttachments = observationAttachments \|\| outgoingAttachments/);
 assert.match(panel,/structureAnalysis\.analyze\(\{request:renderRequest, attachments:analysisAttachments/);
 assert.match(panel,/references: \[\.\.\.planningReferences, \.\.\.roleGroups\.styleReferences\]/);
 assert.match(panel,/const styleAttachments = await Promise\.all\(reviewGroups\.styleReferences\.map\(prepareTransportItem\)\)/);
 assert.match(panel,/originalAttachments,\s*styleAttachments,/);
});
test('unsupported style chat/manual revision/batch fail before creating new requests',()=>{
 const guard=panel.indexOf('roleGroups.styleReferences.length && (!whiteRun');
 assert.ok(guard>0&&guard<panel.indexOf('const requestEpoch = ++currentRequestEpoch'));
 assert.match(panel,/!roleGroups\.inputs\.length \|\| runInput\.generated\.length/);
 assert.match(panel,/표현 참고가 있는 일괄 변환은 아직 지원하지 않습니다/);
 assert.match(panel,/이미지 역할 · \$\{item\.name\}/);
 assert.match(panel,/roleSelect\.disabled=busy \|\| generatedImages\.length > 0 \|\| conversationMessages\.length > 0/);
});

test('role selector uses theme input contrast and details content fills the reference pane',()=>{
 const css=readFileSync(new URL('../css/ai-panel.css',import.meta.url),'utf8');
 const roleRule=css.match(/select\[data-ai-reference-role\]\s*\{([^}]+)\}/)[1];
 assert.match(roleRule,/background:\s*var\(--bg-input\)/);
 assert.match(roleRule,/color:\s*var\(--text-primary\)/);
 assert.match(css,/\.ai-reference-section\[open\]::details-content\s*\{[^}]*flex:\s*1 1 0/);
});
