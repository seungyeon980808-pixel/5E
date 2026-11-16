import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_BRIEF_PROFILE, prepareExamBriefRunInput, buildExamBriefPrompt } from '../js/ai-exam-brief.js';
import { recoverTaskWorkspaceSnapshot } from '../js/ai-task-workspaces.js';
import { snapshotImageItem } from '../js/ai-candidate-snapshot.js';
import { requiresRawImageOutput, resolveImageOutput } from '../js/ai-output-processing.js';
import { resolveGeneratedRaster } from '../js/ai-raster-output.js';

test('brief generation needs no reference and cannot fall into source-only conversion or label removal', () => {
  const input = { examBriefProfile: EXAM_BRIEF_PROFILE, mode: 'diagram', outputEngine: 'asset',
    attachments: [], generated: [], imageLabelWorkflow: { explicit: true, imageKind: 'exam' },
    preserveSourceLabels: true, approvedFirstPng: true, model: 'test-model' };
  const before = structuredClone(input), run = prepareExamBriefRunInput(input);
  assert.deepEqual(input, before);
  assert.equal(run.mode, 'complete'); assert.equal(run.outputEngine, 'raster');
  assert.equal(run.approvedFirstPng, false); assert.equal(run.preserveSourceLabels, false);
  assert.equal(run.imageLabelWorkflow, null, 'new drawings never claim source-label verification');
  assert.equal(run.model, input.model); assert.deepEqual(run.attachments, []);
  const ordinary = { mode: 'diagram', attachments: [{ id: 'source' }] };
  assert.equal(prepareExamBriefRunInput(ordinary), ordinary, 'ordinary conversions retain their policy');
});

test('short scene and explicit 2D/3D conditions survive without fabricated subject details', () => {
  for (const request of ['빗면 위 네모 A, 아래 각도 θ', '입체 비커 두 개, 왼쪽 절반 물', '평면 회로, 저항 둘 병렬', '입자는 양쪽 각각 6개']) {
    const prompt = buildExamBriefPrompt({ request });
    assert.ok(prompt.endsWith(request));
    assert.equal(prompt.split(request).length, 2);
    assert.ok(!prompt.includes('뷰렛'), 'unrelated apparatus is not added by the compiler');
    assert.ok(prompt.includes('평면은 끝까지 평면') && prompt.includes('입체는 끝까지 입체'));
  }
  assert.throws(() => buildExamBriefPrompt({ request: '  ' }), /한 줄/);
});

test('revision and references enter the rendering contract without changing the teacher draft', () => {
  const request = 'A를 오른쪽으로 옮겨 줘';
  const source = '[reference-role] INPUT_SOURCE';
  const prompt = buildExamBriefPrompt({ request, referenceRoleContract: source, revision: true });
  assert.ok(prompt.includes(source)); assert.ok(prompt.includes('요청한 부분만 수정'));
  assert.ok(prompt.endsWith(request));
});

test('saved brief profile and short text survive workspace recovery; ordinary tasks do not inherit it', () => {
  const value = { activeTaskTabId: 'brief', tabs: [
    { id: 'brief', input: '네모 A가 빗면 위', examBriefProfile: EXAM_BRIEF_PROFILE },
    { id: 'ordinary', input: '원본 변환' },
  ] };
  const restored = recoverTaskWorkspaceSnapshot(value);
  assert.equal(restored.tabs[0].input, value.tabs[0].input);
  assert.equal(restored.tabs[0].examBriefProfile, EXAM_BRIEF_PROFILE);
  assert.equal(restored.tabs[1].examBriefProfile, undefined);
});

test('brief PNG remains byte-identical through rendering, save/recovery and output preferences', async () => {
  const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
  const forbiddenTransform = () => { throw new Error('exam brief must not remove its white background'); };
  const raw = await resolveGeneratedRaster(data, { whitePng: true, transform: forbiddenTransform });
  assert.equal(raw, data);
  const saved = snapshotImageItem({ id: 'brief-png', kind: 'generated', data: raw, examBriefProfile: EXAM_BRIEF_PROFILE });
  assert.equal(saved.examBriefProfile, EXAM_BRIEF_PROFILE);
  assert.equal(requiresRawImageOutput(saved), true);
  assert.equal(await resolveImageOutput(saved, { backgroundPolicy: 'connected', examPalette: true, lineThickness: 2 }, forbiddenTransform), data);
  assert.equal(requiresRawImageOutput({ kind: 'generated', data }), false, 'ordinary historical PNG keeps existing output controls');
});

test('recovered early brief output drops accidental source-label authority while ordinary conversion keeps it', () => {
  const workflow = { explicit: true, imageKind: 'exam' };
  const early = { id: 'old-brief', kind: 'generated', data: 'data:image/png;base64,AA==',
    examBriefProfile: EXAM_BRIEF_PROFILE, imageLabelWorkflow: workflow };
  const saved = snapshotImageItem(early);
  assert.equal(saved.imageLabelWorkflow, null);
  assert.equal(early.imageLabelWorkflow, workflow, 'snapshot does not mutate the live candidate');
  assert.deepEqual(snapshotImageItem({ ...early, examBriefProfile: undefined }).imageLabelWorkflow, workflow);
});

test('시작 복원은 검사에 걸린 후보만 빼고 나머지 작업을 살린다(M43)', () => {
  const good = { id: 'c1', name: '좋은 후보', data: 'data:image/png;base64,AAAA' };
  const bad = { id: 'c2', name: '나쁜 후보', data: 'data:image/png;base64,AAAA', labelPlan: ['배열이면 안 됨'] };
  const value = { tabs: [{ id: 't1', generated: [good, bad] }, { id: 't2', generated: [good] }] };
  assert.throws(() => recoverTaskWorkspaceSnapshot(value), '파일에서 열 때는 지금처럼 거부');
  const restored = recoverTaskWorkspaceSnapshot(value, { dropInvalid: true });
  assert.deepEqual(restored.tabs.map(tab => tab.generated.map(item => item.id)), [['c1'], ['c1']]);
  assert.equal(restored.droppedCandidates.length, 1);
  assert.equal(restored.droppedCandidates[0].item.id, 'c2');
});
