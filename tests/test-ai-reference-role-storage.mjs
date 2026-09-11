import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotImageItem} from '../js/ai-panel.js';
import {getReferenceRole,partitionReferenceItems,planImageReferences} from '../js/ai-reference-roles.js';
import {buildExactOutputCacheDescriptor,createExactOutputCacheKey,pruneOutgoingAttachments,createRemoteImageInputPlan} from '../js/ai-remote-input-plan.js';
const image=(role='INPUT_SOURCE',data='AA==')=>({id:role,name:role,referenceRole:role,data:`data:image/png;base64,${data}`,kind:'reference'});
const key=references=>createExactOutputCacheKey(buildExactOutputCacheDescriptor({references,prompt:'same request',mode:'diagram'}));

test('task image snapshot and JSON restore preserve role without reclassifying by filename',()=>{
 const original=[{...image(),name:'STYLE_REFERENCE is only a filename'},image('STYLE_REFERENCE','AQ==')];
 const restored=JSON.parse(JSON.stringify(original.map(snapshotImageItem))).map(snapshotImageItem);
 assert.deepEqual(restored.map(getReferenceRole),['INPUT_SOURCE','STYLE_REFERENCE']);
 assert.deepEqual(restored.map(i=>i.data),original.map(i=>i.data));
 assert.equal(partitionReferenceItems(restored).inputs.length,1);
 assert.equal(partitionReferenceItems(restored).styleReferences.length,1);
});

test('legacy missing role stays input; malformed saved role is retained and blocked, not silently input',()=>{
 const legacy=snapshotImageItem({name:'legacy',data:'data:image/png;base64,AA=='});
 assert.equal(getReferenceRole(JSON.parse(JSON.stringify(legacy))),'INPUT_SOURCE');
 const invalid=JSON.parse(JSON.stringify(snapshotImageItem(image('unrecognized'))));
 assert.equal(invalid.referenceRole,'unrecognized');
 assert.throws(()=>partitionReferenceItems([invalid]));assert.throws(()=>key([invalid]));
});

test('cache identity distinguishes equal pixels with changed role, style bytes and attachment order',()=>{
 const a=image(),s=image('STYLE_REFERENCE','AQ==');
 assert.notEqual(key([a]),key([{...a,referenceRole:'STYLE_REFERENCE'}]));
 assert.notEqual(key([a,s]),key([a,image('STYLE_REFERENCE','Ag==')]));
 assert.notEqual(key([a,s]),key([s,a]));
 assert.equal(key([a]),key([{...a,referenceRole:undefined}]));
 const d=buildExactOutputCacheDescriptor({references:[a,s]});
 assert.equal(d.schema,'5e-ai-output-v3');
 assert.deepEqual(d.referenceSignatures.map(s=>s.referenceRole),['INPUT_SOURCE','STYLE_REFERENCE']);
});

test('deduplication never merges equal source and style pixels or their comments',()=>{
 const a={...image(),comments:[{text:'source comment'}]};
 const s={...image('STYLE_REFERENCE'),comments:[{text:'style comment'}]};
 const result=pruneOutgoingAttachments([a,{...a,id:'duplicate'},s]);
 assert.equal(result.items.length,2);assert.equal(result.removed.length,1);
 assert.deepEqual(result.items[0].comments.map(c=>c.text),['source comment']);
 assert.deepEqual(result.items[1].comments.map(c=>c.text),['style comment']);
 assert.notEqual(key([a]),key([a,s]));
 // Cache identity is not permission to render ambiguous cross-role duplicates.
 assert.throws(()=>planImageReferences(partitionReferenceItems(result.items)));
});

test('legacy contact sheets reject active style references instead of mixing them into source geometry',()=>{
 assert.throws(()=>createRemoteImageInputPlan({references:[image(),image('STYLE_REFERENCE','AQ==')]}),/separate-role/);
 assert.doesNotThrow(()=>createRemoteImageInputPlan({references:[image(),{...image('STYLE_REFERENCE','AQ=='),active:false}]}));
});

test('direct planner calls cannot bypass invalid or contradictory explicit role metadata',()=>{
 for(const role of ['unrecognized',null,'CANDIDATE','STYLE_REFERENCE']){
   assert.throws(()=>planImageReferences({inputs:[image(role)]}));
 }
 assert.throws(()=>getReferenceRole({referenceRole:null}));
 assert.throws(()=>planImageReferences({inputs:[image()],styleReferences:[image('INPUT_SOURCE','AQ==')]}));
 assert.doesNotThrow(()=>planImageReferences({inputs:[image()],styleReferences:[image('STYLE_REFERENCE','AQ==')]}));
 assert.doesNotThrow(()=>planImageReferences({inputs:[image()],candidate:{...image('CANDIDATE','Ag==')}}));
});
