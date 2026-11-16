import test from 'node:test';import assert from 'node:assert/strict';
import {buildFiveEProject,parseFiveEProject} from '../js/fivee-project.js?v=1.7.0-four-session-integration';
import {buildExamProject,buildLegacyExamProject,parseExamProject} from '../js/rhwp-exam-project.js?v=1.7.0-four-session-integration';
import {zipStore,unzipStore} from '../js/backup-zip.js?v=1.7.0-four-session-integration';
const bytes=async blob=>new Uint8Array(await blob.arrayBuffer());
const png='data:image/png;base64,AQID';
const drawing={version:'0.17',activePageId:'page',pages:[{id:'page',name:'그림',objects:[{id:'img',type:'image',src:png}]}]};
const figure={id:'revision',name:'그림',version:1,source:drawing};
const project={kind:'exam',projectId:'project-a',name:'시험지',documentBytes:new Uint8Array([80,75,3,4]),figures:[figure],workspace:{drawing:structuredClone(drawing),ai:{workspaces:[{tabs:[{id:'task',generated:[{data:png},{data:png}],input:'미반영 요청',workState:'busy'}]}],activeWorkspace:0}}};
project.workspace.drawing.pages[0].objects[0].x=23;
test('one .5e container separates committed document sources from unapplied drafts and keeps AI history',async()=>{
 const packed=await bytes(buildExamProject(project));const restored=parseExamProject(packed);
 const {kind,...expected}=project;assert.deepEqual(restored,expected);
 assert.equal(restored.figures[0].source.pages[0].objects[0].x,undefined);
 assert.equal(restored.workspace.drawing.pages[0].objects[0].x,23);
 const files=unzipStore(packed);assert.equal([...files.keys()].filter(k=>k.startsWith('assets/')).length,1,'repeated bitmaps stored once');
});
test('drawing container and legacy drawing JSON route by content',async()=>{
 const modern=parseFiveEProject(await bytes(buildFiveEProject({projectId:'drawing-a',drawing})));
 assert.equal(modern.kind,'drawing');assert.deepEqual(modern.drawing,drawing);
 assert.deepEqual(parseFiveEProject(new TextEncoder().encode(JSON.stringify(drawing))),{kind:'drawing',drawing});
});
test('legacy .5exam still opens and modern missing assets cannot alter document state',async()=>{
 assert.deepEqual(parseExamProject(await bytes(buildLegacyExamProject({name:'시험지',documentBytes:project.documentBytes,figures:[figure]}))).figures,[figure]);
 const files=unzipStore(await bytes(buildExamProject(project)));files.delete('assets/0');
 assert.throws(()=>parseExamProject(new Uint8Array()),/형식/);
 await assert.rejects(async()=>parseExamProject(await bytes(zipStore([...files].map(([name,data])=>({name,data}))))),/이미지/);
});
test('unsupported package version, corrupted source and invalid figure identities fail before recovery',async()=>{
 assert.throws(()=>buildExamProject({...project,figures:[figure,figure]}),/연결 정보/);
 const files=unzipStore(await bytes(buildExamProject(project))),manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));manifest.version=9;
 files.set('manifest.json',new TextEncoder().encode(JSON.stringify(manifest)));
 await assert.rejects(async()=>parseExamProject(await bytes(zipStore([...files].map(([name,data])=>({name,data}))))),/지원/);
 const packed=await bytes(buildExamProject(project));packed[60]^=1;assert.throws(()=>parseExamProject(packed),/CRC|손상|일치/);
});
