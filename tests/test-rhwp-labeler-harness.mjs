import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { APPROVED_FIRST_PROMPT, approvedFirstRequestText } from '../js/ai-approved-first-png.js';
import { executeImageLabelRun, imageLabelDigest, IMAGE_LABEL_GENERATION_HARNESS } from '../js/ai-image-label-run.js';
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
  const result = await executeImageLabelRun({ source, workflow: { imageKind: 'general', labelResult, ...marks },
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

test('label restore, observer geometry and semantic guesses cannot change the image generation request', async () => {
  const a = await run();
  const b = await run({ labelResult: 'restore-editable', geometry: 'Invented gradient and moved frame' });
  assert.deepEqual(a.payload, b.payload);
  assert.ok(a.payload.text.includes('\n\n'+APPROVED_FIRST_PROMPT+'\n\n[SOURCE-GRID-TRACING:'),'the approved style body remains byte-identical between the geometry contract and final check');
  assert.match(a.payload.text,/^\[SOURCE-GRID-TRACING:/);
  assert.match(a.payload.text,/5e-source-tracing v1\.2\.0/);
  assert.match(a.payload.text,/원본 첨부 없이 텍스트만으로 새 그림을 생성하지 않는다/);
  assert.match(a.payload.text,/명암 스타일 계약을 덮어쓰지 않는다/);
  assert.equal(a.count, 1); assert.equal(b.count, 1);
  assert.equal(a.payload.model, 'gpt-6.1-sol'); assert.equal(a.payload.effort, 'high');
  assert.equal(a.payload.serviceTier, 'priority');
  assert.equal(a.result.data, png);
  assert.equal(a.result.metrics.generationHarness.id, IMAGE_LABEL_GENERATION_HARNESS);
  assert.doesNotMatch(a.payload.text, /geometryLock|5e-image-label-workflow|5e-kice-flat-style/);
});

test('the prepared generation copy is separate from the original analysis binding', async () => {
  const prepared = 'data:image/png;base64,iVBORw0KGgpBQkM=';
  const { payload, result, source } = await run({ data: prepared, instructions: '도선만 수정' });
  assert.deepEqual(payload.attachments, [{ name: 'INPUT_SOURCE.png', data: prepared }]);
  assert.equal(source.data, png);
  assert.equal(result.sourceSha256, await imageLabelDigest(png));
  assert.equal(result.metrics.generationHarness.sourceSha256, await imageLabelDigest(prepared));
  assert.ok(payload.text.includes('\n\n'+APPROVED_FIRST_PROMPT+'\n\n[SOURCE-GRID-TRACING:'));
  assert.ok(payload.text.includes('\n\n사용자 수정 요청:\n도선만 수정'));
  assert.match(payload.text, /사용자가 보조선 제거를 껐습니다/, 'the default preserves auxiliary marks alongside the explicit request');
  assert.match(payload.text,/사용자가 대상·속성을 명시해 변경을 요청한 부분만 예외/);
});

test('review permits the same restrained shading as the RHWP generation harness', () => {
  const prompt = buildImageReviewPrompt({ request: '', references: [], candidate: { name: 'candidate' } });
  assert.match(prompt, /음영을 무조건 없애지 않는다/);
  assert.match(prompt, /도르래.*절제된 회색 음영/);
  assert.doesNotMatch(prompt, /같은 범주 안에서 회색이 밝고 어둡게 변해 입체감을 만들면 fail/);
});

test('explicit marker controls travel as content requests without replacing the approved image style', async () => {
  const { payload } = await run({ marks: { scientificArrows: 'remove', auxiliaryMarks: 'keep' } });
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
  const verify = previousCandidate => executeImageLabelRun({ source, workflow: result.workflow, verifyOnly: true,
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
