import { normalizeImageLabelWorkflow } from './ai-image-label-workflow.js?v=1.7.0-four-session-integration';
import { removeExamLabelsFromDataUrl } from './ai-exam-label-removal.js?v=1.7.0-four-session-integration';
import { resolveGeneratedRaster } from './ai-raster-output.js?v=1.7.0-four-session-integration';
import { createEditableLabelComposite } from './ai-label-composite.js?v=1.7.0-four-session-integration';
import { APPROVED_FIRST_PROMPT, approvedFirstRequestText } from './ai-approved-first-png.js?v=1.7.0-four-session-integration';
import { encodeScopedPng } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';
import { validateLabelTargetPlacement, bindLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { buildExactOutputCacheDescriptor, createExactOutputCacheKey } from './ai-remote-input-plan.js?v=1.7.0-four-session-integration';
import { enforceImageLabelAcceptance } from './ai-image-review.js?v=1.7.0-four-session-integration';
import { STYLE_CONTRACT_VERSION } from './ai-image-style-contract.js?v=1.7.0-four-session-integration';
import { SOURCE_OBSERVATION_VERSION, SOURCE_LEADER_OBSERVATION_VERSION, SOURCE_OBSERVATION_CONTRACT_REVISION } from './ai-source-observation-wire.js?v=1.7.0-four-session-integration';
import { prepareJointLabelVerification, retainFinalVerification } from './ai-label-verification.js?v=1.7.0-four-session-integration';
import { SOURCE_LABEL_POLICY_VERSION } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { externalLabelDraftIds } from './ai-label-review-draft.js?v=1.7.0-four-session-integration';
import { imageLabelBackgroundContract, resolveImageLabelBackground } from './ai-label-background.js?v=1.7.0-four-session-integration';

export const IMAGE_LABEL_RUN_VERSION = '1.6.1';
export const IMAGE_LABEL_GENERATION_HARNESS = 'rhwp-approved-first-v1';
function selectedMarkInstructions(workflow) {
  return [
    workflow.scientificArrows === 'remove'
      ? '사용자가 화살표 제거를 켰습니다. 이번 작업의 기본 표시선 선택을 대체하여 과학적 힘·운동·혈류·전류 화살표도 제거하세요. 실제 관·혈관·도선·물체 윤곽·눈금은 보존하세요.' : '',
    workflow.auxiliaryMarks === 'keep'
      ? '사용자가 보조선 제거를 껐습니다. 이번 작업의 기타 보조선·확대 연결선·강조틀은 유지하세요. 라벨 글자와 그 글자에 소속된 설명 지시선·끝점은 계속 함께 제거하세요.' : '',
  ].filter(Boolean).join('\n');
}
const clone = value => structuredClone(value);
const cancelled = signal => { if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError'); };
export const imageLabelDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
const imageFrame = async (dataUrl, signal) => {
  // The browser owns decoding; headless controller unit tests have no Image.
  if (typeof Image === 'undefined') return null;
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지 원본 크기를 확인하지 못했습니다.')); img.src = dataUrl;
  });
  cancelled(signal);
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('이미지 원본 크기가 올바르지 않습니다.');
  return { width: image.naturalWidth, height: image.naturalHeight, coordinateSystem: 'normalized-0-1' };
};

/** Isolated image turn: one tool execution, no unsolicited replacement or retry. */
export function createImageLabelRasterController({ transport, timeoutMs = 600000 } = {}) {
  let active = null;
  const retired = new Set();
  const interrupt = r => {
    if (!r.turnId && !r.threadId) { r.interruptPending = true; return; }
    if (r.interrupted) return;
    r.interrupted = true;
    void Promise.resolve().then(() => transport.interrupt?.({ turnId: r.turnId, threadId: r.threadId })).catch(() => {});
  };
  const finish = (r, error) => {
    if (r.done) return;
    r.done = true; clearTimeout(r.timer);
    if (r.turnId) retired.add(r.turnId);
    if (r.threadId) retired.add(r.threadId);
    if (error) r.reject(error);
    else r.resolve({ src: r.src, rendererPrompt: r.rendererPrompt, imageToolCalls: Math.max(r.started, r.images) });
  };
  const route = (r, e) => {
    if (r.done) return;
    const seen = e.kind === 'progress' ? r.startedIds : e.kind === 'image' ? r.imageIds : null;
    if (seen && e.itemId) { if (seen.has(e.itemId)) return; seen.add(e.itemId); }
    if (e.kind === 'progress' && ++r.started > 1 || e.kind === 'image' && ++r.images > 1) {
      interrupt(r);
      return finish(r, new Error('한 번의 이미지 처리에서 추가 생성이 감지되어 중단했습니다.'));
    }
    if (e.kind === 'image') { r.src = e.src; r.rendererPrompt = e.rendererPrompt || ''; }
    if (e.kind === 'assistant' && /usage.?limit|rate.?limit|quota|사용량\s*제한|한도\s*(초과|제한)|429/i.test(e.text || '')) {
      r.failureMessage = '이미지 생성이 계정 사용량 제한으로 거절되었습니다. 크레딧 잔여 여부와 별도로 이미지 생성 이용 상태를 확인해 주세요.';
    }
    if (e.kind === 'error') finish(r, new Error(e.text || '이미지 처리 오류'));
    if (e.kind === 'done') finish(r, e.status !== 'completed' || e.error || !r.src ? new Error(e.error || r.failureMessage || '이미지 처리 완료를 확인하지 못했습니다.') : null);
  };
  const matches = (r, e) => Boolean((e.turnId || e.threadId) && (!e.turnId || e.turnId === r.turnId) && (!e.threadId || e.threadId === r.threadId));
  return {
    isActive: () => Boolean(active && !active.done),
    cancel() { if (active && !active.done) { interrupt(active); finish(active, new DOMException('작업이 취소되었습니다.', 'AbortError')); } },
    fail(message) { if (active && !active.done) finish(active, new Error(message || '이미지 연결 종료')); },
    handleEvent(e) {
      if (retired.has(e.turnId) || retired.has(e.threadId)) return true;
      const r = active;
      if (!r || r.done || (!e.turnId && !e.threadId)) return false;
      if (r.awaiting) { if (r.queue.length >= 512) finish(r, new Error('이미지 이벤트 한도 초과')); else r.queue.push(e); return true; }
      if (!matches(r, e)) return false;
      route(r, e); return true;
    },
    generate(payload, { imageKind = 'general', local = false, signal } = {}) {
      cancelled(signal);
      if (imageKind === 'exam' && !local) return Promise.reject(new Error('기출 전체 이미지 생성은 허용되지 않습니다.'));
      if (active && !active.done) return Promise.reject(new Error('이미지 처리가 이미 진행 중입니다.'));
      return new Promise((resolve, reject) => {
        const r = { resolve, reject, awaiting: true, queue: [], done: false, started: 0, images: 0, startedIds: new Set(), imageIds: new Set() }; active = r;
        const abort = () => { interrupt(r); finish(r, new DOMException('작업이 취소되었습니다.', 'AbortError')); };
        signal?.addEventListener('abort', abort, { once: true });
        r.resolve = value => { signal?.removeEventListener('abort', abort); resolve(value); };
        r.reject = error => { signal?.removeEventListener('abort', abort); reject(error); };
        r.timer = setTimeout(() => { interrupt(r); finish(r, new Error('이미지 처리 시간 초과')); }, timeoutMs);
        const { models, ...providerPayload } = payload;
        Promise.resolve().then(() => r.done ? null : transport.send({ ...providerPayload, conversationId: null, resetConversation: false, purpose: 'image', ephemeralRender: true })).then(result => {
          r.turnId = result?.turnId; r.threadId = result?.renderThreadId || result?.threadId; r.awaiting = false;
          if (r.interruptPending && (r.turnId || r.threadId)) interrupt(r);
          if (r.done) { if (r.turnId) retired.add(r.turnId); if (r.threadId) retired.add(r.threadId); return; }
          if (!r.turnId && !r.threadId) return finish(r, new Error('이미지 턴 식별자가 없습니다.'));
          for (const e of r.queue) if (matches(r, e)) route(r, e);
          r.queue = [];
        }, error => finish(r, error));
      });
    },
  };
}

/** Same policy and frozen observation for every UI, batch, retry and recovery entry. */
export async function executeImageLabelRun(options = {}) {
  const abort = () => { options.observer?.cancel?.(); options.raster?.cancel?.(); };
  cancelled(options.signal);
  options.signal?.addEventListener('abort', abort, { once: true });
  try { return await executeBoundImageLabelRun(options); }
  catch (error) { cancelled(options.signal); throw error; }
  finally { options.signal?.removeEventListener('abort', abort); }
}

async function executeBoundImageLabelRun({ source, workflow: rawWorkflow, request = '', observer, raster, selection,
  artboard, signal, observation, onObservation = () => {}, onPhase = () => {}, onSourceCandidates, onRaster = () => {}, cache,
  bypassCache = false, preciseRestore = false, verifyOnly = false, previousCandidate, localRestore,
  generationInstructions = request, generationSource, backgroundCache, previousCandidates = [] } = {}) {
  const started = performance.now();
  const labelSelection = { ...selection, model: 'gpt-6-luna', effort: 'medium' };
  const workflow = normalizeImageLabelWorkflow(rawWorkflow, { requireExplicit: true });
  const draftFirst = workflow.labelResult === 'restore-editable'
    && workflow.verificationMode === 'draft-first' && !verifyOnly;
  if (!source?.data?.startsWith('data:image/')) throw new Error('원본 이미지를 확인해야 합니다.');
  if (workflow.imageKind === 'exam' && preciseRestore) throw new Error('기출에는 전체 그림 정밀 복원을 적용할 수 없습니다.');
  const sourceSha256 = await imageLabelDigest(source.data);
  const sourceFrame = { id: source.id || sourceSha256, name: source.name || '원본', ...(await imageFrame(source.data, signal)) };
  const metrics = { version: IMAGE_LABEL_RUN_VERSION, timings: {}, calls: { sourceAnalysis: 0, fullGeneration: 0, localRestore: 0, localReview: 0, targetMapping: 0, review: 0 },
    attempts: { fullGeneration: 0, localRestore: 0 }, cacheHit: false, observationReused: false };
  const phase = async (name, action) => {
    cancelled(signal); onPhase(name); const t = performance.now();
    try { return await action(); }
    catch(error) {
      metrics.timings[name]=Math.round(performance.now()-t);
      metrics.timings.total=Math.round(performance.now()-started);
      error.aiPhase=name; error.workflowMetrics=clone(metrics);
      throw error;
    } finally { metrics.timings[name] = Math.round(performance.now() - t); }
  };
  const attachments = [{ name: source.name || '원본', data: source.data }];
  // Analysis owns the original. Image generation uses RHWP's prepared copy and
  // approved prompt, never the observer's geometry, typography or style guesses.
  const imageSource = generationSource || { name: 'INPUT_SOURCE.png', data: source.data };
  if (!imageSource.data?.startsWith('data:image/')) throw new Error('이미지 생성 입력을 확인해야 합니다.');
  const generationPromptSha256 = await imageLabelDigest(APPROVED_FIRST_PROMPT);
  metrics.generationHarness = workflow.imageKind !== 'general' ? null
    : verifyOnly ? clone(previousCandidate?.workflowMetrics?.generationHarness || previousCandidate?.metrics?.generationHarness || null)
      : { id: IMAGE_LABEL_GENERATION_HARNESS, promptSha256: generationPromptSha256,
        sourceSha256: await imageLabelDigest(imageSource.data) };
  let generationPayload, backgroundContract;
  if (workflow.imageKind === 'general' && !verifyOnly) {
    const instructions = [generationInstructions, selectedMarkInstructions(workflow),
      preciseRestore ? '사용자가 그림 정밀 복원을 선택했습니다. 수정 전 선택 버전에서 요청한 구조 오류만 원본과 대조해 수정합니다.' : '',
    ].filter(Boolean).join('\n\n');
    generationPayload = { ...selection, text: approvedFirstRequestText({ instructions }),
      attachments: [{ ...imageSource }, ...(preciseRestore && previousCandidate ? [{ name: '수정 전 선택 버전', data: previousCandidate.data }] : [])] };
    backgroundContract = await imageLabelBackgroundContract({ payload: generationPayload, sourceSha256, harness: metrics.generationHarness });
    metrics.generationHarness = backgroundContract.harness;
  }
  if (verifyOnly) {
    const previousWorkflow = normalizeImageLabelWorkflow(previousCandidate?.imageLabelWorkflow || previousCandidate?.workflow, {requireExplicit:true});
    const savedPlan = previousCandidate?.sourceLabelPlan || observation?.plan;
    if (workflow.imageKind !== 'general' || workflow.labelResult !== 'restore-editable'
      || ['imageKind','labelResult','auxiliaryMarks','scientificArrows'].some(key => previousWorkflow[key] !== workflow[key])
      || previousCandidate?.sourceSha256 !== sourceSha256 || !savedPlan?.frozen
      || savedPlan.sourceBindings?.length !== 1 || savedPlan.sourceBindings[0].transportSha256 !== sourceSha256
      || previousCandidate?.planSha256 !== await imageLabelDigest(JSON.stringify(savedPlan))
      || previousCandidate?.candidateSha256 !== await imageLabelDigest(previousCandidate?.data || '')) {
      throw new Error('보존된 원본 관찰과 RAW 후보의 처리 정책·바인딩을 확인할 수 없습니다.');
    }
    // Optional review changes verification policy, never the original observation.
    // A saved candidate remains usable even when its tab checkpoint is absent.
    observation = {sourceSha256,workflowVersion:workflow.version,imageKind:previousWorkflow.imageKind,
      contractRevision:savedPlan.observationContractRevision,planSha256:previousCandidate.planSha256,plan:savedPlan,
      localRestoreAttempted:observation?.sourceSha256 === sourceSha256 && observation.localRestoreAttempted === true};
  }
  let plan;
  if (!(workflow.imageKind==='exam' && observation?.removalIncomplete) && observation?.sourceSha256 === sourceSha256 && observation.workflowVersion === workflow.version && observation.imageKind === workflow.imageKind && observation.contractRevision === SOURCE_OBSERVATION_CONTRACT_REVISION && observation.plan?.frozen
    && observation.plan.policyVersion === SOURCE_LABEL_POLICY_VERSION
    && observation.plan.observationVersion === SOURCE_OBSERVATION_VERSION
    && observation.plan.leaderObservationVersion === SOURCE_LEADER_OBSERVATION_VERSION
    && observation.plan.observationContractRevision === SOURCE_OBSERVATION_CONTRACT_REVISION
    && observation.plan.sourceBindings?.[0]?.transportSha256 === sourceSha256
    && observation.planSha256 === await imageLabelDigest(JSON.stringify(observation.plan))) {
    plan = clone(observation.plan); metrics.observationReused = true;
  } else {
    if (verifyOnly) throw new Error('최종 검수에는 같은 원본의 보존된 관찰이 필요합니다.');
    plan = await phase('sourceAnalysis', async () => {
      metrics.calls.sourceAnalysis++;
      return observer.analyze({ ...labelSelection, attachments:[{...attachments[0],sourceTextCandidates:source.sourceTextCandidates}], request, workflow,signal,
        onSourceCandidates:async receipt=>{metrics.timings.sourceCandidates=Math.round(receipt.totalMs);metrics.sourceCandidates={sets:receipt.candidateSets.map(set=>({sourceRef:set.sourceRef,count:set.candidates.length})),errors:receipt.errors};await onSourceCandidates?.(receipt);} });
    });
  }
  const planSha256 = await imageLabelDigest(JSON.stringify(plan));
  const observationState = { version: IMAGE_LABEL_RUN_VERSION, contractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, workflowVersion: workflow.version, imageKind: workflow.imageKind, sourceSha256, sourceFrame, planSha256, plan: clone(plan),
    localRestoreAttempted: observation?.sourceSha256 === sourceSha256 && observation.localRestoreAttempted === true };
  await onObservation(clone(observationState));
  cancelled(signal);
  if (workflow.imageKind === 'exam' && !plan.labels.length && !plan.removalOnlyItems?.length
    && (plan.excludedLabels?.length && plan.excludedLabels.every(label => label.scope === 'graph')
      && !plan.quarantinedItems?.some(item => item.scope === 'general')
      || !plan.rejectedCount && !plan.quarantinedItems?.length)) {
    metrics.cacheStored = false; metrics.cacheSkipReason = 'graph-out-of-scope';
    metrics.timings.total = Math.round(performance.now() - started);
    return { version: IMAGE_LABEL_RUN_VERSION, accepted: false, status: 'out-of-scope', data: source.data,
      workflow, sourceSha256, sourceFrame, planSha256, candidateSha256: sourceSha256, candidateFrame: sourceFrame,
      sourceLabelPlan: clone(plan), targetPlacement: null, labelPlan: null, editableDraft: null,
      removalReport: { status: 'out-of-scope', changedPixels: 0, removedLabelIds: [], deferredLabels: [],
        graphControl: true, unchanged: true, issues: [] },
      report: { verdict: 'uncertain', checks: [], issues: [], scopeOutcome: 'no-general-labels-source-preserved' },
      rendererPrompt: '', finalLabelComposite: null, labelVerificationPreview: null, labelProposals: null, metrics };
  }
  const descriptor = buildExactOutputCacheDescriptor({ engineVersion: IMAGE_LABEL_RUN_VERSION, styleVersion: workflow.imageKind === 'general' ? STYLE_CONTRACT_VERSION : workflow.version,
    mode: 'image-label-workflow', prompt: request, model: selection.model, effort: selection.effort, serviceTier: selection.serviceTier || null,
    outputOptions: { workflow, sourceSha256, planSha256, preciseRestore, sourceLabelPolicyVersion: SOURCE_LABEL_POLICY_VERSION, sourceObservationVersion: SOURCE_OBSERVATION_VERSION, sourceObservationContractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, labelModel: labelSelection.model, labelEffort: labelSelection.effort,
      generationHarness: metrics.generationHarness, generationInstructions, styleContractVersion: workflow.imageKind === 'general' ? STYLE_CONTRACT_VERSION : null,
      previousCandidateSha256: preciseRestore && previousCandidate?.data ? await imageLabelDigest(previousCandidate.data) : null } });
  const key = createExactOutputCacheKey(descriptor);
  if (cache && !bypassCache && !verifyOnly && !draftFirst) {
    const hit = await cache.get(key);
    const saved = hit?.hit && hit.entry?.output?.imageLabelRun;
    let valid = saved && saved.version === IMAGE_LABEL_RUN_VERSION && saved.accepted === true
      && saved.workflow?.version === workflow.version && JSON.stringify(saved.workflow) === JSON.stringify(workflow)
      && saved.sourceSha256 === sourceSha256 && saved.planSha256 === planSha256 && saved.candidateSha256 === await imageLabelDigest(saved.data)
      && enforceImageLabelAcceptance(saved.report, { workflow, candidateSha256: saved.candidateSha256 }).accepted
      && (workflow.imageKind === 'exam' || saved.report?.styleReview?.version === STYLE_CONTRACT_VERSION && saved.report.styleReview.candidateSha256 === saved.candidateSha256)
      && (workflow.labelResult !== 'restore-editable' || saved.targetPlacement && saved.labelPlan)
      && (!saved.targetPlacement || saved.targetPlacement.candidateSha256 === saved.candidateSha256 && saved.targetPlacement.planSha256 === planSha256);
    if (valid && saved.targetPlacement) {
      try { await validateLabelTargetPlacement({ plan, placement: saved.targetPlacement, candidateDataUrl: saved.data }); }
      catch (error) { cancelled(signal); valid = false; }
    }
    if (valid) {
      cancelled(signal); metrics.cacheHit = true; metrics.timings.total = Math.round(performance.now() - started);
      return { ...clone(saved), metrics, cachedMetrics: saved.metrics };
    }
    if (hit?.hit) await cache.delete(key);
  }
  let data, removalReport = null, rendererPrompt = '';
  if (verifyOnly) {
    if (workflow.imageKind !== 'general' || !metrics.observationReused
      || previousCandidate?.sourceSha256 !== sourceSha256 || previousCandidate?.planSha256 !== planSha256
      || previousCandidate?.candidateSha256 !== await imageLabelDigest(previousCandidate?.data || '')) {
      throw new Error('보존된 원본 관찰과 RAW 후보의 바인딩을 확인할 수 없습니다.');
    }
    data = previousCandidate.data; rendererPrompt = previousCandidate.rendererPrompt || '';
  } else if (workflow.imageKind === 'exam') {
    const local = await phase('pixelProcessing', () => removeExamLabelsFromDataUrl({ dataUrl: source.data, plan, workflow, signal,
      localRestore: localRestore && !observationState.localRestoreAttempted ? async args => {
        observationState.localRestoreAttempted = true;
        await onObservation(clone(observationState)); // Reserve the one attempt durably before dispatch.
        cancelled(signal); metrics.attempts.localRestore++;
        const t = performance.now();
        try { return await localRestore(args, { metrics, selection, signal }); }
        finally { metrics.timings.localRestore = Math.round(performance.now() - t); }
      } : undefined }));
    removalReport = local.report;
    observationState.removalIncomplete=local.report.status!=='complete';
    await onObservation(clone(observationState));
    // Retain only label-atomic deletions. Legacy/unbound partial candidates
    // cannot authorize overlays and still return the source unchanged.
    if(local.report.status!=='complete' && !local.report.removedLabelIds?.length) {
      data=source.data;
      removalReport={...local.report,verifiedInkPixels:local.report.changedPixels||0,partialCandidateDiscarded:local.report.changedPixels>0,changedPixels:0,unchanged:true};
    } else data=local.dataUrl;
  } else {
    const background = await phase('generation', () => resolveImageLabelBackground({ contract: backgroundContract,
      candidates: [previousCandidate, ...previousCandidates], cache: backgroundCache, signal,
      generate: async () => {
        metrics.attempts.fullGeneration++;
        const result = await raster.generate(generationPayload, { imageKind: workflow.imageKind, signal });
        metrics.calls.fullGeneration += result.imageToolCalls;
        return { data: await resolveGeneratedRaster(result.src, { whitePng: true }), rendererPrompt: result.rendererPrompt };
      } }));
    data = background.data; rendererPrompt = background.rendererPrompt;
    metrics.backgroundReused = background.reused;
  }
  cancelled(signal);
  const candidateSha256 = await imageLabelDigest(data);
  const candidateFrame = await imageFrame(data, signal);
  if (verifyOnly && (previousCandidate.sourceFrame && JSON.stringify(previousCandidate.sourceFrame) !== JSON.stringify(sourceFrame)
    || previousCandidate.candidateFrame && JSON.stringify(previousCandidate.candidateFrame) !== JSON.stringify(candidateFrame))) {
    throw new Error('보존된 RAW 후보의 이미지 프레임이 변경되었습니다.');
  }
  if(workflow.imageKind==='general') {
    // Persist and display the one real RAW before a slower label verification.
    // This is a pending diagnostic candidate, never an accepted/cache result.
    cancelled(signal);
    await onRaster({data,rendererPrompt,workflow,sourceSha256,sourceFrame,planSha256,candidateSha256,candidateFrame,sourceLabelPlan:clone(plan),metrics:clone(metrics)});
    cancelled(signal);
  }
  if (workflow.imageKind === 'exam' && removalReport?.status !== 'complete') {
    if (removalReport.removedLabelIds?.length) {
      const ids = removalReport.removedLabelIds;
      if (new Set(ids).size !== ids.length || ids.some(id => !plan.labels.some(label =>
        label.id === id && label.scope === 'general' && label.sourceRef === 1 && !label.ownershipReviewRequired))
        || removalReport.deferredLabels?.some(label => ids.includes(label.labelId))) {
        throw new Error('라벨별 제거 결과와 원본 계획의 소속이 다릅니다.');
      }
      const mask = removalReport.removalMasks;
      if (mask?.version !== 1 || mask.coordinateSpace !== 'source-pixels' || !Array.isArray(mask.regions)
        || sourceFrame.width && (mask.width !== sourceFrame.width || mask.height !== sourceFrame.height)
        || ids.some(id => !mask.regions.some(region => region.labelId === id && region.component === 'text'))) {
        throw new Error('완료된 라벨의 실제 제거 마스크를 확인할 수 없습니다.');
      }
      const removalBinding = { version: 1, sourceSha256, planSha256, candidateSha256,
        removedLabelIds: [...ids], restoredLabelIds: workflow.labelResult === 'restore-editable' ? [...ids] : [],
        maskSha256: await imageLabelDigest(JSON.stringify(mask)) };
      removalReport = { ...removalReport, removalBinding };
      const restorationPlan = { ...clone(plan), labels: plan.labels.filter(label => ids.includes(label.id)).map(clone),
        relationGroups: (plan.relationGroups || []).filter(group => group.labelIds.every(id => ids.includes(id))).map(clone),
        ...(plan.sourceAssociations ? { sourceAssociations: plan.sourceAssociations.filter(row => ids.includes(row.labelId)).map(clone) } : {}),
        ...(plan.sourceLeaderObservations ? { sourceLeaderObservations: plan.sourceLeaderObservations.filter(row => ids.includes(row.labelId)).map(clone) } : {}),
        removalBinding };
      let placement = null, composite = null;
      const issues = (removalReport.issues || []).map(issue => ({ ...issue, message: issue.message || issue.code, severity: 'major' }));
      if (workflow.labelResult === 'restore-editable') {
        placement = await bindLabelTargetPlacement({ plan: restorationPlan, candidateDataUrl: data, imageKind: 'exam',
          labels: restorationPlan.labels.map(label => ({ id: label.id, status: 'uncertain', reason: '안전하게 제거된 원본 위치이며 연결과 간격은 직접 확인해야 합니다.' })) });
        try { composite = await phase('labelPlacement', () => createEditableLabelComposite({
          plan: restorationPlan, placement, candidateDataUrl: data, artboard, signal })); }
        catch (error) { cancelled(signal); issues.push({ code: 'label-composite-unavailable', message: error.message, severity: 'major' }); }
      }
      const report = enforceImageLabelAcceptance({ verdict: 'uncertain', checks: [], issues,
        targetVerified: false, placementVerified: false }, { workflow, candidateSha256 }).report;
      report.mechanicalDiagnostics = [...clone(removalReport.issues || []), ...clone(composite?.report.issues || [])];
      if (composite) { report.compositeBindings = composite.bindings; report.compositeMeasurements = composite.report; }
      const labelPlan = workflow.labelResult === 'restore-editable' ? { ...clone(restorationPlan), sourcePlan: clone(restorationPlan),
        qualityReview: report, reviewRequired: true, targetPlacement: clone(placement), candidateSha256 } : null;
      if (placement) removalReport.restorationPlanSha256 = placement.planSha256;
      metrics.cacheStored = false; metrics.cacheSkipReason = 'exam-removal-partial';
      metrics.timings.total = Math.round(performance.now() - started);
      cancelled(signal);
      return { version: IMAGE_LABEL_RUN_VERSION, accepted: false, status: 'needs-attention', data, workflow,
        sourceSha256, sourceFrame, planSha256, candidateSha256, candidateFrame, sourceLabelPlan: clone(plan),
        targetPlacement: placement, labelPlan, removalReport, report, rendererPrompt,
        finalLabelComposite: composite?.attachment.data || null, labelVerificationPreview: null, labelProposals: null, metrics };
    }
    // No editable text is laid over undeleted source text. The original RAW
    // and precise removal diagnostics remain available for manual review.
    const issues = (removalReport?.issues || []).map(i=>({...i,message:i.message||i.code,severity:'major'}));
    const report = enforceImageLabelAcceptance({verdict:'uncertain',checks:[],issues}, {workflow,candidateSha256}).report;
    report.mechanicalDiagnostics = clone(removalReport?.issues || []);
    metrics.cacheStored=false; metrics.cacheSkipReason='exam-removal-incomplete';
    metrics.timings.total=Math.round(performance.now()-started);
    cancelled(signal);
    const labelIds = workflow.labelResult === 'restore-editable' ? externalLabelDraftIds(plan) : [];
    const editableDraft = labelIds.length ? {version:1,presentation:'external-list',sourceSha256,candidateSha256,planSha256,labelIds} : null;
    return {version:IMAGE_LABEL_RUN_VERSION,accepted:false,status:'needs-attention',data,workflow,sourceSha256,sourceFrame,planSha256,candidateSha256,candidateFrame,editableDraft,
      sourceLabelPlan:clone(plan),targetPlacement:null,labelPlan:null,removalReport,report,rendererPrompt,finalLabelComposite:null,labelVerificationPreview:null,labelProposals:null,metrics};
  }
  let targetPlacement = null, labelPlan = null, composite = null;
  const placementIssues = [];
  let jointReport = null, jointPreview = null;
  const useJoint = workflow.labelResult === 'restore-editable' && plan.observationVersion === SOURCE_OBSERVATION_VERSION;
  if (useJoint) {
    try {
      jointPreview = await phase('labelProposals', () => prepareJointLabelVerification({plan,candidateDataUrl:data,imageKind:workflow.imageKind,artboard,signal}));
      const checked = draftFirst ? { placement: jointPreview.placement, report: {
        verdict: 'uncertain', checks: [], targetVerified: false, placementVerified: false,
        issues: [{code:'optional-review-not-run',message:'초기 로컬 배치이며 최종 그림·대상·라벨 검수를 실행하지 않았습니다.',severity:'major'}],
      } } : await phase('finalVerification', () => {
        metrics.calls.review++;
        return observer.verifyPlacement({...labelSelection,attachments,plan,candidate:{name:'최종 RAW',data},workflow,request,preview:jointPreview});
      });
      targetPlacement = draftFirst ? {...clone(checked.placement), status:'needs-attention', verified:false,
        labels:checked.placement.labels.map(label=>({...clone(label),verified:false}))} : checked.placement;
      jointReport = checked.report;
      await validateLabelTargetPlacement({plan,placement:targetPlacement,candidateDataUrl:data});
    } catch (error) {
      cancelled(signal);
      const reason = '통합 최종 배치 검수 불확실: '+String(error.message).slice(0,300);
      targetPlacement = await bindLabelTargetPlacement({plan,candidateDataUrl:data,imageKind:workflow.imageKind,labels:plan.labels.map(l=>({id:l.id,status:'uncertain',reason}))});
      jointReport = {verdict:'uncertain',checks:[],issues:[{code:'joint-verification-unavailable',message:reason,severity:'major'}]};
    }
    try { composite = await phase('labelPlacement', () => createEditableLabelComposite({plan,placement:targetPlacement,candidateDataUrl:data,artboard,signal})); }
    catch (error) { cancelled(signal); placementIssues.push({code:'label-composite-unavailable',message:error.message,severity:'major'}); }
  } else if (draftFirst) {
    targetPlacement = await bindLabelTargetPlacement({plan,candidateDataUrl:data,imageKind:workflow.imageKind,
      labels:plan.labels.map(l=>({id:l.id,status:'uncertain',reason:'Optional review not run'}))});
    jointReport = {verdict:'uncertain',checks:[],targetVerified:false,placementVerified:false,
      issues:[{code:'optional-review-not-run',message:'최종 그림·대상·라벨 검수를 실행하지 않았습니다.',severity:'major'}]};
    try { composite = await phase('labelPlacement', () => createEditableLabelComposite({plan,placement:targetPlacement,candidateDataUrl:data,artboard,signal})); }
    catch (error) { cancelled(signal); placementIssues.push({code:'label-composite-unavailable',message:error.message,severity:'major'}); }
  } else if (workflow.labelResult === 'restore-editable') {
    try {
      targetPlacement = await phase('targetMapping', () => {
        if (workflow.imageKind === 'general' && plan.labels.length) metrics.calls.targetMapping++;
        return observer.mapTargets({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, workflow });
      });
      await validateLabelTargetPlacement({ plan, placement: targetPlacement, candidateDataUrl: data });
    } catch (error) {
      cancelled(signal);
      const reason = `최종 대상 대응을 확인하지 못했습니다: ${String(error.message).slice(0, 300)}`;
      targetPlacement = await bindLabelTargetPlacement({ plan, candidateDataUrl: data, imageKind: workflow.imageKind,
        labels: plan.labels.map(label => ({ id: label.id, status: 'uncertain', reason })) });
      placementIssues.push({ code: 'target-mapping-unavailable', message: reason, severity: 'major' });
    }
    try { composite = await phase('labelPlacement', () => createEditableLabelComposite({ plan, placement: targetPlacement, candidateDataUrl: data, artboard, signal })); }
    catch (error) {
      cancelled(signal);
      placementIssues.push({ code: 'label-composite-unavailable', message: `합성 미리보기를 만들지 못했습니다: ${String(error.message).slice(0, 300)}`, severity: 'major' });
    }
  }
  let report;
  if (useJoint || draftFirst) {
    report = jointPreview ? retainFinalVerification({report:jointReport,preview:jointPreview,composite,placement:targetPlacement}) : jointReport;
  } else try {
    report = await phase('review', () => {
      metrics.calls.review++;
      return workflow.labelResult === 'restore-editable'
        ? observer.reviewFinal({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, composite, placement: targetPlacement, request, workflow })
        : observer.review({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, request, workflow });
    });
  } catch (error) {
    cancelled(signal);
    report = { verdict: 'uncertain', checks: [], issues: [{ code: 'review-unavailable', message: error.message, severity: 'major' }] };
  }
  report.issues ||= [];
  if (draftFirst) {
    report.targetVerified = false; report.placementVerified = false;
    if (!report.issues.some(issue=>issue.code==='optional-review-not-run')) {
      report.issues.push({code:'optional-review-not-run',message:'최종 그림·대상·라벨 검수를 실행하지 않았습니다.',severity:'major'});
    }
  }
  report.issues.push(...placementIssues);
  if (placementIssues.length || removalReport && removalReport.status !== 'complete' || targetPlacement?.status === 'needs-attention') {
    if (report.verdict === 'pass') report.verdict = 'uncertain';
    for (const issue of removalReport?.issues || []) report.issues.push({ ...issue, message: issue.message || issue.code, severity: 'major' });
    if (targetPlacement?.status === 'needs-attention') report.issues.push({ code: 'target-correspondence-uncertain', message: '연결 대상 대응을 확인해야 합니다.', severity: 'major' });
  }
  const acceptance = enforceImageLabelAcceptance(report, { workflow, candidateSha256 });
  const mechanicalDiagnostics = [...placementIssues, ...(removalReport?.issues || []), ...(composite?.report.issues || []),
    ...report.issues.filter(issue=>issue.code==='final-composite-changed-after-review'||issue.code==='joint-verification-unavailable')];
  report = acceptance.report;
  report.mechanicalDiagnostics = mechanicalDiagnostics;
  if (workflow.labelResult === 'restore-editable') labelPlan = { ...clone(plan), sourcePlan: clone(plan), qualityReview: report, reviewRequired: !acceptance.accepted, targetPlacement: clone(targetPlacement), candidateSha256 };
  metrics.timings.total = Math.round(performance.now() - started);
  const result = { version: IMAGE_LABEL_RUN_VERSION, accepted: acceptance.accepted, status: acceptance.accepted ? 'complete' : 'needs-attention', data, workflow, sourceSha256, sourceFrame, planSha256, candidateSha256, candidateFrame, sourceLabelPlan: clone(plan), targetPlacement,
    labelPlan, removalReport, report, rendererPrompt, labelVerificationPreview: jointPreview?.composite.attachment.data || null, labelProposals: jointPreview?.proposals || null, finalLabelComposite: composite?.attachment.data || null, metrics };
  cancelled(signal);
  if (cache && acceptance.accepted) {
    const persistenceStarted = performance.now();
    const output = { imageLabelRun: clone(result) };
    // Count the complete persisted payload, including plans and composite PNGs.
    output.bytes = new TextEncoder().encode(JSON.stringify(output)).byteLength;
    const stored = await cache.put({ key, descriptor, output, status: 'complete' });
    metrics.timings.persistence = Math.round(performance.now() - persistenceStarted);
    metrics.cacheStored = stored?.stored === true;
    if (!metrics.cacheStored) metrics.cacheSkipReason = stored?.reason || 'storage-unavailable';
    if (signal?.aborted && stored?.stored) await cache.delete(key);
  } else if (cache) {
    metrics.cacheStored = false;
    metrics.cacheSkipReason = 'review-not-accepted';
  }
  metrics.timings.total = Math.round(performance.now() - started);
  cancelled(signal); return result;
}

const pngUrl = async (data, width, height) => {
  const bytes = await encodeScopedPng({ data: new Uint8Array(data), width, height });
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
};
/** Send only the selected crop. Merge permission remains the caller's immutable mask. */
export function createExamLocalRestore({ observer, raster, onPhase = () => {} }) {
  return async ({ data, width, height, mask }, { metrics, selection, signal }) => {
    cancelled(signal); onPhase('localRestore');
    const source = await pngUrl(data, width, height);
    const rgbaMask = new Uint8Array(width * height * 4);
    for (let i = 0; i < mask.length; i++) { rgbaMask[i * 4] = rgbaMask[i * 4 + 1] = rgbaMask[i * 4 + 2] = mask[i] ? 255 : 0; rgbaMask[i * 4 + 3] = 255; }
    const maskUrl = await pngUrl(rgbaMask, width, height);
    const restored = await raster.generate({ ...selection, attachments: [{ name: '원본 국소 영역', data: source }, { name: '흰색 부분만 제거하는 마스크', data: maskUrl }],
      text: '기출 원본의 국소 주석 복원이다. 첨부 crop 크기·비율·과학 구조를 유지한다. 두 번째 마스크의 흰 영역에 소속된 글자·지시선·끝점만 제거하고 그 아래 확인 가능한 과학 구조를 복원한다. 마스크 밖 관·혈관·윤곽·눈금은 유지한다. 없는 구조를 추측하지 않는다. 이미지 생성 도구를 이 국소 영역에 한 번만 호출한다. 전체 그림 생성·스타일 변환·추가 재시도는 금지한다. PNG 하나를 반환한다.' }, { imageKind: 'exam', local: true, signal });
    metrics.calls.localRestore += restored.imageToolCalls;
    const src = await resolveGeneratedRaster(restored.src, { whitePng: true });
    const image = new Image(); image.src = src; await image.decode(); cancelled(signal);
    if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error('국소 복원 결과 크기가 원본 영역과 달라 적용하지 않았습니다.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data, candidate = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
    metrics.calls.localReview++; onPhase('localReview'); const reviewStarted = performance.now();
    let checked;
    try { checked = await observer.reviewLocalRestore({ ...selection, model:'gpt-6-luna',effort:'medium', source: { name: '원본 국소 영역', data: source }, candidate: { name: '국소 복원 결과', data: candidate }, mask: { name: '삭제 소속 마스크', data: maskUrl } }); }
    finally { metrics.timings.localReview = Math.round(performance.now() - reviewStarted); }
    cancelled(signal);
    return { data: pixels, width, height, verified: checked.verified === true };
  };
}
