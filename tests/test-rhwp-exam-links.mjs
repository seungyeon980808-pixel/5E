import test from 'node:test';import assert from 'node:assert/strict';
import {forkExamFigure,normalizeExamFigure,validateExamContext,validateExamLink} from '../js/rhwp-exam-links.js?v=1.7.0-four-session-integration';
import {buildLegacyExamProject as buildExamProject,parseExamProject} from '../js/rhwp-exam-project.js?v=1.7.0-four-session-integration';
import {unzipStore,zipStore} from '../js/backup-zip.js?v=1.7.0-four-session-integration';
const source={version:'0.17',activePageId:'page',pages:[{id:'page',name:'그림',meta:{},objects:[{id:'image',type:'image',aiTaskId:'task-a'}]}]};
const figure={id:'revision',version:1,name:'그림',link:{tabId:'tab-a',assetId:'asset-a'},source,context:{version:1,pageId:'page',viewBox:{x:-20,y:-20,w:40,h:40},selectedIds:['image'],ai:{scope:'',taskId:'task-a',snapshot:{key:'workspace',tabs:[{id:'task-a',generated:[],attachments:[],input:'원래 요청',conversationMessages:[{content:'이력'}]}],activeTaskTabId:'task-a'}}}};
test('document copies fork the tab, figure, page and AI history without touching the original',()=>{
 const copied=forkExamFigure(figure);assert.notEqual(copied.link.tabId,figure.link.tabId);assert.notEqual(copied.link.assetId,figure.link.assetId);assert.notEqual(copied.context.ai.taskId,figure.context.ai.taskId);
 assert.equal(copied.source.pages[0].objects[0].aiTaskId,copied.context.ai.taskId);assert.equal(copied.context.ai.snapshot.activeTaskTabId,copied.context.ai.taskId);assert.deepEqual(copied.context.ai.snapshot.tabs[0].examLink,copied.link);
 copied.context.ai.snapshot.tabs[0].conversationMessages[0].content='새 이력';assert.equal(figure.context.ai.snapshot.tabs[0].conversationMessages[0].content,'이력');assert.equal(source.activePageId,'page');
});
test('old portable figures can acquire an independent tab identity',()=>{const old={id:'old',version:1,name:'예전 그림',source};const next=normalizeExamFigure(old);assert.equal(next.link.assetId,'old');assert.equal(next.context.ai,null);assert.equal(old.link,undefined);});
test('workspace bundles retain complete one-task contexts separately from the manifest',async()=>{
 const input={name:'시험지',documentBytes:new Uint8Array([80,75,3,4]),figures:[figure]};const bytes=new Uint8Array(await buildExamProject(input).arrayBuffer());assert.deepEqual(parseExamProject(bytes),input);
 const entries=unzipStore(bytes);assert.ok(entries.has('workspaces/revision.json'));entries.delete('workspaces/revision.json');const incomplete=new Uint8Array(await zipStore([...entries].map(([name,data])=>({name,data}))).arrayBuffer());assert.throws(()=>parseExamProject(incomplete),/작업 탭 원본/);
});
test('mixed AI tabs, invalid IDs and invalid zoom cannot enter a linked picture',()=>{
 assert.throws(()=>validateExamLink({tabId:'../unsafe',assetId:'asset'}),/연결 정보/);
 const invalid=structuredClone(figure.context);invalid.ai.snapshot.tabs.push({id:'task-b'});assert.throws(()=>validateExamContext(invalid),/AI 작업 탭/);
 invalid.ai= null;invalid.viewBox.w=0;assert.throws(()=>validateExamContext(invalid),/배율/);
});

test('renaming changes portable titles without touching image identity or source history',async () => {
 const {renameExamFigure}=await import('../js/rhwp-exam-links.js');
 const figure={id:'revision',version:3,name:'old',link:{tabId:'tab',assetId:'asset'},source:{activePageId:'page',pages:[{id:'page',name:'old',objects:[{id:'shape'}],meta:{examRevisionId:'revision'}}]},context:{ai:{snapshot:{tabs:[{title:'old',generated:[{id:'candidate'}],uiMessages:[{text:'history'}]}]}}}};
 const before=structuredClone(figure);assert.equal(renameExamFigure(figure,'new'),true);
 assert.equal(figure.source.pages[0].name,'new');assert.equal(figure.context.ai.snapshot.tabs[0].title,'new');
 const namesRestored=structuredClone(figure);renameExamFigure(namesRestored,'old');assert.deepEqual(namesRestored,before);
 assert.equal(renameExamFigure(figure,'new'),false);
});
