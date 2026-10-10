import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegacyExamProject as buildExamProject, parseExamProject } from '../js/rhwp-exam-project.js?v=1.7.0-four-session-integration';
import { zipStore, unzipStore } from '../js/backup-zip.js?v=1.7.0-four-session-integration';

const bytes = async blob => new Uint8Array(await blob.arrayBuffer());
const documentBytes = new Uint8Array([80, 75, 3, 4, 9, 8, 7]);
const original = { id:'diagram_1', name:'속력 그래프', version:1, source:{ version:'0.17', pages:[{id:'page', objects:[{id:'line', type:'line', p1:{x:0,y:0}, p2:{x:10,y:10}}]}], activePageId:'page' } };
const project = { name:'물리 시험지', documentBytes, figures:[original] };

test('exam bundle retains document, editable source and earlier undo versions', async () => {
  const revised = structuredClone(original); revised.id = 'diagram_2'; revised.version = 2;
  revised.render = {bounds:{x:-5,y:-5,w:20,h:10},options:{includeReferenceImages:false,excludeAllImages:true}};
  revised.source.pages[0].objects[0].p2.y = 20;
  const input = { ...project, figures:[original, revised] };
  const restored = parseExamProject(await bytes(buildExamProject(input)));
  assert.deepEqual(restored, input);
  restored.figures[0].source.pages[0].objects[0].p2.y = 100;
  assert.equal(restored.figures[1].source.pages[0].objects[0].p2.y, 20);
  assert.equal(original.source.pages[0].objects[0].p2.y, 10);
});

test('all source files are validated before a caller receives a document', async () => {
  let validated = 0;
  assert.throws(() => parseExamProject(new Uint8Array([0,1,2])), /ZIP|zip|파일|손상|형식/);
  const input = await bytes(buildExamProject(project));
  assert.throws(() => parseExamProject(input, () => { validated++; throw new Error('invalid drawing'); }), /invalid drawing/);
  assert.equal(validated, 1);
});

test('duplicate identities, unsupported versions and missing source are rejected', async () => {
  assert.throws(() => buildExamProject({ ...project, figures:[original, original] }), /연결 정보/);
  assert.throws(() => buildExamProject({ ...project, figures:[{...original,render:false}] }), /영역 정보/);
  const files = unzipStore(await bytes(buildExamProject(project)));
  const pack = () => bytes(zipStore([...files].map(([name,data]) => ({ name,data }))));
  files.delete('figures/diagram_1.5e');
  await assert.rejects(async () => parseExamProject(await pack()), /원본/);
  const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))); manifest.version = 2;
  files.set('manifest.json', new TextEncoder().encode(JSON.stringify(manifest)));
  await assert.rejects(async () => parseExamProject(await pack()), /지원/);
});

test('corrupt archive payload cannot silently change the drawing source', async () => {
  const data = await bytes(buildExamProject(project));
  const pattern = new TextEncoder().encode('속력 그래프');
  const start = data.findIndex((_, index) => pattern.every((value, offset) => data[index+offset] === value));
  assert.ok(start > 0); data[start] ^= 1;
  assert.throws(() => parseExamProject(data), /CRC|손상|일치/);
});
