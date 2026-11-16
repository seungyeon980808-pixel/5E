import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { APPROVED_FIRST_PROMPT, approvedFirstRequestText } from '../js/ai-approved-first-png.js';
import { executeImageLabelRun, imageLabelDigest, IMAGE_LABEL_GENERATION_HARNESS, REDRAW_TEXTBOOK_PROMPT } from '../js/ai-image-label-run.js';
import { SOURCE_LABEL_POLICY_VERSION } from '../js/ai-editable-image-labels.js';
import { SOURCE_LEADER_OBSERVATION_VERSION, SOURCE_OBSERVATION_CONTRACT_REVISION } from '../js/ai-source-observation-wire.js';
import { buildImageReviewPrompt } from '../js/ai-image-review.js';
const baseline = JSON.parse(await readFile(new URL('./fixtures/rhwp-approved-first-contract.json', import.meta.url)));
const png = 'data:image/png;base64,iVBORw0KGgo=';
const checks = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','kice-flat-style','flat-gray-regions'];

test('the actual approved image prompt matches the pinned RHWP baseline byte for byte', () => {
  assert.equal(createHash('sha256').update(APPROVED_FIRST_PROMPT).digest('hex'), baseline.promptSha256);
  assert.equal(approvedFirstRequestText(), APPROVED_FIRST_PROMPT);
  assert.equal(approvedFirstRequestText({ instructions: '도선만 수정' }), APPROVED_FIRST_PROMPT + '\n\n사용자 수정 요청:\n도선만 수정');
  assert.match(APPROVED_FIRST_PROMPT, /음영을 무조건 없애지는/);
});

async function run({ labelResult = 'remove', geometry = 'old geometry', instructions = '', data = png, marks = {} } = {}) {
  const payloads = [];
  const source = { name: '분석 원본', data: png };
  const plan = { version: 4, observationVersion: 1, policyVersion: SOURCE_LABEL_POLICY_VERSION,
    leaderObservationVersion: SOURCE_LEADER_OBSERVATION_VERSION, observationContractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION,
    frozen: true, labels: [], excludedLabels: [], uncertainties: [], geometryLock: { note: geometry },
    sourceBindings: [{ transportSha256: await imageLabelDigest(png) }] };
  // 11-10: 라벨 복원 요청 검사는 예전 계약 경로(내부 플래그)에서 본다. 기본 라벨 복원은 짧은 그림 요청을 쓴다.
  const result = await executeImageLabelRun({ source, workflow: { imageKind: 'general', labelResult, ...marks }, legacyLabelPipeline: labelResult === 'restore-editable',
    request: '관찰 전용 요청', generationInstructions: instructions, generationSource: { name: baseline.attachmentName, data },
    selection: { model: 'gpt-6.1-sol', effort: 'high', serviceTier: 'priority' },
    observer: { analyze: async args => {
      assert.equal(args.attachments[0].data, source.data);
      assert.equal(args.model, 'gpt-6-luna');
      return structuredClone(plan);
    }, review: async () => ({ verdict: 'pass', checks: checks.map(id => ({ id, status: 'pass', detail: 'Controlled contract fixture' })), issues: [] }) },
    raster: { generate: async payload => { payloads.push(payload); return { src: png, rendererPrompt: 'Preserved raw', imageToolCalls: 1 }; } } });
  return { payload: payloads[0], result, source, count: payloads.length };
}

// 11-10: 라벨 복원(베타)은 예전 계약 프롬프트를 그대로 쓴다. 기본 라벨 삭제 요청은 아래 짧은 프롬프트 테스트가 본다.
test('label restore, observer geometry and semantic guesses cannot change the beta restore request', async () => {
  const a = await run({ labelResult: 'restore-editable' });
  const b = await run({ labelResult: 'restore-editable', geometry: 'Invented gradient and moved frame' });
  assert.deepEqual(a.payload, b.payload);
  assert.ok(a.payload.text.includes('\n\n'+APPROVED_FIRST_PROMPT+'\n\n[SOURCE-GRID-TRACING:'),'the approved style body remains byte-identical between the geometry contract and final check');
  assert.match(a.payload.text,/^\[SOURCE-GRID-TRACING:/);
  assert.match(a.payload.text,/5e-source-tracing v1\.2\.0/);
  assert.match(a.payload.text,/원본 첨부 없이 텍스트만으로 새 그림을 생성하지 않는다/);
  assert.match(a.payload.text,/명암 스타일 계약을 덮어쓰지 않는다/);
  assert.equal(a.count, 1); assert.equal(b.count, 1);
  // 11-10 사용자 선택 「그림은 처음부터 Luna로」: 그림 그리기 첫 시도는 고른 모델(Sol 6.1)과 상관없이 Luna(medium)다.
  assert.equal(a.payload.model, 'gpt-6-luna'); assert.equal(a.payload.effort, 'medium');
  assert.equal(a.payload.serviceTier, 'priority');
  assert.equal(a.result.data, png);
  assert.equal(a.result.metrics.generationHarness.id, IMAGE_LABEL_GENERATION_HARNESS);
  assert.doesNotMatch(a.payload.text, /geometryLock|5e-image-label-workflow|5e-kice-flat-style/);
});

// 11-10: 기본 라벨 삭제 요청은 짧은 문단 하나이며, 관찰 기하·의미 추측으로 바뀌지 않는다.
test('default label removal sends only the short redraw prompt and ignores observer geometry', async () => {
  const a = await run();
  const b = await run({ geometry: 'Invented gradient and moved frame' });
  assert.deepEqual(a.payload, b.payload);
  assert.equal(a.payload.text, REDRAW_TEXTBOOK_PROMPT);
  assert.equal(a.payload.model, 'gpt-6-luna'); assert.equal(a.payload.effort, 'medium');
  assert.doesNotMatch(a.payload.text, /SOURCE-GRID|geometryLock|5e-image-label-workflow|5e-kice-flat-style|INPUT_SOURCE/);
  assert.equal(a.count, 1); assert.equal(a.result.data, png);
});

test('the prepared generation copy is separate from the original analysis binding', async () => {
  const prepared = 'data:image/png;base64,iVBORw0KGgpBQkM=';
  const { payload, result, source } = await run({ data: prepared, instructions: '도선만 수정' });
  assert.deepEqual(payload.attachments, [{ name: 'INPUT_SOURCE.png', data: prepared }]);
  assert.equal(source.data, png);
  assert.equal(result.sourceSha256, await imageLabelDigest(png));
  assert.equal(result.metrics.generationHarness.sourceSha256, await imageLabelDigest(prepared));
  // 11-10: 기본 라벨 삭제 요청은 짧은 프롬프트 + 「사용자 요청:」 한 줄이다.
  assert.equal(payload.text, REDRAW_TEXTBOOK_PROMPT + '\n\n사용자 요청: 도선만 수정');
});

test('review permits the same restrained shading as the RHWP generation harness', () => {
  const prompt = buildImageReviewPrompt({ request: '', references: [], candidate: { name: 'candidate' } });
  assert.match(prompt, /음영을 무조건 없애지 않는다/);
  assert.match(prompt, /도르래.*절제된 회색 음영/);
  assert.doesNotMatch(prompt, /같은 범주 안에서 회색이 밝고 어둡게 변해 입체감을 만들면 fail/);
});

test('explicit marker controls travel as content requests without replacing the approved image style', async () => {
  // 11-10: 표시 설정(화살표·보조선)은 예전 계약 문장으로만 전달되므로 라벨 복원(베타) 경로에서 검사한다.
  const { payload } = await run({ labelResult: 'restore-editable', marks: { scientificArrows: 'remove', auxiliaryMarks: 'keep' } });
  const approvedIndex=payload.text.indexOf(APPROVED_FIRST_PROMPT);
  assert.ok(approvedIndex>0);
  const content = payload.text.slice(payload.text.lastIndexOf('\n\n사용자 수정 요청:\n'));
  assert.match(content, /사용자가 화살표 제거를 켰습니다/);
  assert.match(content, /사용자가 보조선 제거를 껐습니다/);
  assert.match(content, /라벨 글자와.*지시선·끝점.*함께 제거/);
  assert.doesNotMatch(content, /스타일|음영|SOURCE-GRID|geometryLock/);
});

test('reviewing a saved candidate retains its actual generation provenance without a new image call', async () => {
  const { result, source } = await run({ labelResult: 'restore-editable', data: 'data:image/png;base64,iVBORw0KGgpBQkM=' });
  const verify = previousCandidate => executeImageLabelRun({ source, workflow: result.workflow, verifyOnly: true, legacyLabelPipeline: true,
    previousCandidate, selection: { model: 'gpt-6.1-sol', effort: 'high', serviceTier: 'priority' },
    observer: { reviewFinal: async () => ({ verdict: 'uncertain', checks: [], issues: [] }) },
    raster: { generate: () => assert.fail('Optional review must never generate another image') } });
  const verified = await verify(result);
  assert.equal(verified.metrics.calls.fullGeneration, 0);
  assert.deepEqual(verified.metrics.generationHarness, result.metrics.generationHarness);
  const oldCandidate = structuredClone(result);
  delete oldCandidate.metrics.generationHarness;
  assert.equal((await verify(oldCandidate)).metrics.generationHarness, null, 'Do not assign the current harness to an unknown older generation');
});
