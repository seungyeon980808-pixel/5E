import { GRAPH_PLAN_SCHEMA, GRAPH_ENGINE_PROMPT_VERSION, buildGraphExtractionPrompt, buildGraphCorrectionPrompt, parseGraphPlanResponse, validateGraphPlan } from './reconstruction-contract.js?v=1.7.0-four-session-integration';
import { parseAiEvent } from '../ai-events.js?v=1.7.0-four-session-integration';
import { resolveAIModelSelection } from '../ai-model-capabilities.js?v=1.7.0-four-session-integration';
import { decodeGraphSourceRaster, matchSourceAxisArrowSize, SOURCE_ARROW_SIZE_VERSION } from './source-arrow-size.js?v=1.7.0-four-session-integration';
import { preferAnalyticGraphPlan, ANALYTIC_FIT_VERSION } from '../function-graph/analytic-fit.js?v=1.7.0-four-session-integration';
import { matchSourceGrid, SOURCE_GRID_VERSION } from './source-grid.js?v=1.7.0-four-session-integration';
import { matchSourceGuideDashes, SOURCE_GUIDE_STYLE_VERSION } from './source-guide-style.js?v=1.7.0-four-session-integration';
import { matchSourceFrame, SOURCE_FRAME_VERSION } from './source-frame.js?v=1.7.0-four-session-integration';
import { PHYSICS_FIT_VERSION } from '../function-graph/physics-fit.js?v=1.7.0-four-session-integration';
import { RELATION_ANALYTIC_FIT_VERSION } from '../function-graph/relation-analytic-fit.js?v=1.7.0-four-session-integration';
import { RELATION_FIT_VERSION } from '../function-graph/physics-relations.js?v=1.7.0-four-session-integration';
import { describeGraphFailure } from './reconstruction-error.js?v=1.7.0-four-session-integration';
import { auditGraphReconstructionQuality, GRAPH_RECONSTRUCTION_QUALITY_VERSION } from './reconstruction-quality.js?v=1.7.0-four-session-integration';
import { GRAPH_LABEL_RENDER_VERSION } from '../render/graph-label.js?v=1.7.0-four-session-integration';

export const GRAPH_JOB_SCHEMA = '5e.graph-reconstruction-job/v1';
export const GRAPH_EXTRACTION_VERSION = GRAPH_ENGINE_PROMPT_VERSION;
export const GRAPH_PIPELINE_VERSION = ['graph-pipeline-v4', SOURCE_FRAME_VERSION, SOURCE_GRID_VERSION, SOURCE_GUIDE_STYLE_VERSION, SOURCE_ARROW_SIZE_VERSION, ANALYTIC_FIT_VERSION, PHYSICS_FIT_VERSION, RELATION_FIT_VERSION, RELATION_ANALYTIC_FIT_VERSION, GRAPH_RECONSTRUCTION_QUALITY_VERSION, GRAPH_LABEL_RENDER_VERSION].join('/');
// Actual dense-source observations took 165–183s; keep each bounded request
// within the same four-minute ceiling as the authenticated acceptance runner.
export const GRAPH_ANALYSIS_TIMEOUT_MS = 240000;
const copy = value => structuredClone(value);
const binding = ({ id, hash, width, height }) => ({ id, hash, width, height });
const cancelled = () => Object.assign(new Error('그래프 분석을 취소했습니다.'), { code: 'GRAPH_CANCELLED' });
const auditResult = result => {
  result.quality = auditGraphReconstructionQuality(result.plan);
  result.review = [...result.review, ...result.quality.issues.map(i => ({ path: i.path, reason: i.message }))];
  return result;
};

export async function graphSourceHash(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (!/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)[;,]/i.test(dataUrl) || comma < 0) throw new Error('지원하는 원본 이미지가 아닙니다.');
  const header = dataUrl.slice(0, comma), payload = dataUrl.slice(comma + 1);
  const bytes = /;base64$/i.test(header) ? Uint8Array.from(atob(payload), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function graphCacheKey(source, selection, maxAttempts = 1, instructions = '', contextHash = '') {
  return JSON.stringify([GRAPH_PLAN_SCHEMA, GRAPH_EXTRACTION_VERSION, GRAPH_PIPELINE_VERSION, binding(source), selection, maxAttempts, ...(instructions ? [instructions] : []), ...(contextHash ? [{ contextHash }] : [])]);
}

/** Isolated JSON-scene observation. Cancellation never interrupts another workspace. */
export function createGraphReconstructionWorkflow({ transport, store, onChange = () => {}, clock = () => performance.now(), timeoutMs = GRAPH_ANALYSIS_TIMEOUT_MS } = {}) {
  if (!transport?.send) throw new TypeError('그래프 분석 연결이 필요합니다.');
  let active = null, preparing = null, snapshot = null, serial = 0, revision = 0, writes = Promise.resolve();
  const retired = new Set();
  const publish = value => { snapshot = copy(value); onChange(copy(snapshot)); };
  const persist = value => {
    const entry = { key: 'draft', snapshot: copy(value) };
    const write = writes.then(() => store?.put(entry));
    writes = write.catch(() => {});
    return write;
  };
  const cache = async (key, source, plan, attempts = []) => {
    if (!store) return;
    await store.put({ key, source: binding(source), plan, attempts: copy(attempts), createdAt: Date.now() });
    if (store.getAll && store.delete) {
      const entries = (await store.getAll()).filter(e => e.key !== 'draft').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      for (const entry of entries.slice(24)) await store.delete(entry.key);
    }
  };
  const retire = run => {
    for (const id of [run.turnId, run.threadId]) if (id) retired.add(id);
    while (retired.size > 128) retired.delete(retired.values().next().value);
  };
  const interrupt = run => {
    if (run.turnId || run.threadId) return Promise.resolve(transport.interrupt?.({ turnId: run.turnId, threadId: run.threadId })).catch(() => {});
    return Promise.resolve();
  };
  const matches = (run, event) => Boolean(event.turnId || event.threadId)
    && (!event.turnId || event.turnId === run.turnId) && (!event.threadId || event.threadId === run.threadId);
  const finish = (run, error, result) => {
    if (run.done) return;
    run.done = true; clearTimeout(run.timer); retire(run);
    if (active === run) active = null;
    if (error && run.snapshot.attempts.length < run.snapshot.metrics.analysisCalls) run.snapshot.attempts.push({ attempt: run.snapshot.metrics.analysisCalls, plan: null, valid: false, blocked: true, errors: [{ message: error.message }], rawResponse: run.text?.slice(0,1000000) || '' });
    const status = error ? (error.code === 'GRAPH_CANCELLED' ? 'interrupted' : 'failed') : 'complete';
    const invalidDraft = result && !result.ok && result.plan
      && !result.errors.some(e => e.code === 'SOURCE_MISMATCH' || e.path.startsWith('source.'))
      ? result.plan : null;
    const failure = error ? describeGraphFailure(error) : null;
    const value = { ...run.snapshot, status, plan: result?.ok ? result.plan : run.lastAccepted?.plan || null,
      firstPlan: run.snapshot.attempts?.find(a => a.plan)?.acceptedPlan || run.snapshot.attempts?.find(a => a.plan)?.plan || null, finalAttemptSucceeded: !error && result?.blocked !== true, visualStatus: 'user-review-required',
      quality: result?.quality || run.lastAccepted?.quality || null,
      unvalidatedPlan: invalidDraft, rawResponse: run.text?.slice(0, 1000000) || '',
      validationErrors: result?.errors || [], review: [...(result?.review || []), ...(!result?.ok ? run.lastAccepted?.review || [] : [])],
      blocked: result?.blocked || !!error, error: error?.message || null, failure,
      metrics: { ...run.snapshot.metrics, analysisMs: clock() - run.started, validationMs: run.validationMs || 0 } };
    publish(value);
    // A provider success remains available if cache persistence fails; the UI reports the limitation.
    void persist(value).catch(() => { if (snapshot?.id === value.id) publish({ ...snapshot, persistenceError: '복구 정보를 저장하지 못했습니다.' }); });
    if (error) run.reject(error); else run.resolve(copy(value));
  };
  const dispatch = (run, text, attachments) => {
    if (run.done || active !== run) return;
    run.text = ''; run.queue = []; run.awaiting = true; run.processing = false;
    run.turnId = null; run.threadId = null;
    Promise.resolve().then(() => {
      if (run.done || active !== run) return null;
      run.snapshot.metrics.analysisCalls += 1;
      clearTimeout(run.timer);
      run.timer = setTimeout(() => { void interrupt(run); finish(run, Object.assign(new Error('그래프 분석 시간이 초과되었습니다.'), { code: 'GRAPH_TIMEOUT' })); }, timeoutMs);
      return transport.send({ text, attachments: copy(attachments), conversationId: null, resetConversation: true, purpose: 'scene', sceneKind: 'graph', ephemeralRender: true, ...run.snapshot.selection });
    }).then(result => {
      if (!result) return;
      run.turnId = result.turnId; run.threadId = result.renderThreadId || result.threadId; run.awaiting = false;
      if (run.done) { retire(run); void interrupt(run); return; }
      if (!run.turnId && !run.threadId) return finish(run, new Error('분석 요청 식별자를 받지 못했습니다.'));
      const queued = run.queue; run.queue = [];
      for (const event of queued) if (matches(run, event)) route(run, event);
    }, error => finish(run, error));
  };
  const route = (run, event) => {
    if (run.done || run.processing) return;
    if (event.kind === 'forbiddenTool') {
      run.snapshot.metrics.forbiddenToolEvents += 1;
      void interrupt(run); finish(run, new Error('그래프 관찰 중 외부 도구 호출이 감지되어 중단했습니다.')); return;
    }
    if (event.kind === 'assistant') run.text = String(event.text || '');
    if (event.kind === 'image' || event.kind === 'progress' || (event.kind === 'performance' && event.metrics?.imageCallCount > 0)) {
      run.snapshot.metrics.forbiddenImageEvents += 1;
      void interrupt(run); finish(run, new Error('그래프 관찰 중 이미지 생성이 감지되어 중단했습니다.'));
    }
    if (event.kind === 'error') finish(run, new Error(event.text || '그래프 분석에 실패했습니다.'));
    if (event.kind === 'done') {
      if (event.status !== 'completed' || event.error) return finish(run, new Error(event.error?.message || event.error || '그래프 분석이 정상 완료되지 않았습니다.'));
      const before = clock();
      let result = parseGraphPlanResponse(run.text, { source: binding(run.snapshot.source) });
      run.processing = true;
      const safePlan = result.plan && !result.errors.some(e => e.code === 'SOURCE_MISMATCH' || e.path.startsWith('source.')) ? result.plan : null;
      run.snapshot.attempts.push({ attempt: run.snapshot.metrics.analysisCalls, plan: safePlan ? copy(safePlan) : null, valid: result.ok, blocked: result.blocked, errors: copy(result.errors), rawResponse: run.text.slice(0,1000000) });
      // Keep the provider's observation intact. Only a separately validated,
      // bounded approximation becomes the editable result and cached plan.
      if (result.ok && !result.blocked) {
        const attempt = run.snapshot.attempts.at(-1);
        try {
          const sourceFrame = run.sourceRaster ? matchSourceFrame(result.plan, run.sourceRaster) : null;
          if (sourceFrame?.applied) attempt.sourceFrame = { version: sourceFrame.version, measurements: sourceFrame.measurements, reason: sourceFrame.reason };
          const sourceGrid = run.sourceRaster ? matchSourceGrid(sourceFrame?.plan || result.plan, run.sourceRaster) : null;
          if (sourceGrid?.applied) attempt.sourceGrid = { version: sourceGrid.version, measurements: sourceGrid.measurements, transforms: sourceGrid.transforms, axisEvidence: sourceGrid.axisEvidence };
          const sourceGuides = run.sourceRaster ? matchSourceGuideDashes(sourceGrid?.plan || result.plan, run.sourceRaster) : null;
          if (sourceGuides?.applied) attempt.sourceGuideDashes = { measurements: sourceGuides.measurements };
          const sourceStyle = run.sourceRaster ? matchSourceAxisArrowSize(sourceGuides?.plan || sourceGrid?.plan || result.plan, run.sourceRaster) : null;
          if (sourceStyle?.applied) attempt.sourceArrowSize = { version: sourceStyle.version, measurements: sourceStyle.measurements };
          const styledPlan = sourceStyle?.plan || sourceGuides?.plan || sourceGrid?.plan || result.plan;
          const fitted = styledPlan.variant === 'axis-break' ? { plan: styledPlan, conversions: [], rejected: [] } : preferAnalyticGraphPlan(styledPlan, { requirePhysics: true, relativeDiagrams: true });
          const checked = validateGraphPlan(fitted.plan, { source: binding(run.snapshot.source) });
          if (checked.ok && !checked.blocked) {
            result = checked;
            attempt.analyticFit = { conversions: fitted.conversions, rejected: fitted.rejected };
            attempt.acceptedPlan = copy(result.plan);
          } else attempt.analyticFit = { conversions: [], rejected: fitted.rejected, validationErrors: checked.errors.slice(0, 12), error: '수식 검증을 통과하지 못해 원래 곡선을 유지했습니다.' };
        } catch (error) {
          attempt.analyticFit = { conversions: [], rejected: [], diagnostic: String(error?.message || 'Unknown fitting error').slice(0, 400), error: '수식 근사를 완료하지 못해 원래 곡선을 유지했습니다.' };
        }
      }
      if (result.ok) {
        auditResult(result);
        run.snapshot.attempts.at(-1).quality = copy(result.quality);
      }
      run.validationMs = clock() - before;
      const sourceMismatch = result.errors.some(e => e.code === 'SOURCE_MISMATCH' || e.path.startsWith('source.'));
      if (result.ok && !result.blocked) run.lastAccepted = result;
      if (sourceMismatch || run.snapshot.metrics.analysisCalls >= run.maxAttempts) {
        if (!result.ok) return finish(run, Object.assign(new Error(result.errors.map(e => `${e.path}: ${e.message}`).join('\n')), { code: 'GRAPH_INVALID_RESULT' }), result);
        if (!result.blocked) void cache(run.cacheKey, run.snapshot.source, result.plan, run.snapshot.attempts).catch(() => {});
        return finish(run, null, result);
      }
      retire(run);
      void (async () => {
        const attempt = run.snapshot.metrics.analysisCalls;
        run.snapshot.plan = result.ok ? copy(result.plan) : run.lastAccepted?.plan || null;
        run.snapshot.unvalidatedPlan = !result.ok && safePlan ? copy(safePlan) : null;
        publish(run.snapshot); await persist(run.snapshot);
        if (run.done) return;
        let image = null, issues = result.quality?.issues.map(i => `${i.path}: ${i.message}`) || [];
        if (result.ok && !result.blocked) {
          const rendered = await run.renderCandidate(copy(result.plan), { attempt, source: copy(run.snapshot.source) });
          if (run.done || active !== run) return;
          image = rendered?.attachment;
          if (!image || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image.data || '') || image.data.length > 16_000_000) throw new Error('실제 그래프의 PNG 비교 이미지를 준비하지 못했습니다.');
          issues = [...issues, ...(Array.isArray(rendered.issues) ? rendered.issues : [])];
          const renderedHash = await graphSourceHash(image.data);
          if (run.done || active !== run) return;
          Object.assign(run.snapshot.attempts.at(-1), { renderedAttachment: copy(image), renderedHash, sourceBinding: binding(run.snapshot.source) });
        }
        run.snapshot.attempts.at(-1).issues = copy(issues);
        await persist(run.snapshot);
        if (run.done || active !== run) return;
        publish(run.snapshot);
        dispatch(run, buildGraphCorrectionPrompt(run.snapshot.source, { previousPlan: result.ok ? result.plan : safePlan || null, issues, validationErrors: result.errors, hasPreviousRender: !!image, attempt: attempt + 1, maxAttempts: run.maxAttempts }), image ? [run.snapshot.attachment, image] : [run.snapshot.attachment]);
      })().catch(error => { if (!run.done) finish(run, error); });
    }
  };
  const workflow = {
    isActive: () => Boolean(preparing || (active && !active.done)),
    snapshot: () => snapshot ? copy(snapshot) : null,
    handleEvent(message) {
      const rawType = message?.params?.item?.type;
      const forbidden = /^(commandExecution|command_execution|mcpToolCall|mcp_tool_call|webSearch|web_search|fileChange|file_change|toolCall|web_search_call|function_call|custom_tool_call)$/i.test(rawType || '');
      const event = forbidden ? { kind: 'forbiddenTool', turnId: message.params.turnId || message.params.turn?.id, threadId: message.params.threadId } : message?.kind ? message : parseAiEvent(message);
      if ([event.turnId, event.threadId].some(id => id && retired.has(id))) return true;
      const run = active;
      if (!run || run.done || (!event.turnId && !event.threadId)) return false;
      if (run.awaiting) {
        if (run.queue.length >= 512) finish(run, new Error('그래프 분석 이벤트가 너무 많습니다.'));
        else run.queue.push(event);
        return true;
      }
      if (!matches(run, event)) return false;
      route(run, event); return true;
    },
    async cancel() {
      if (preparing) { preparing.cancelled = true; return true; }
      const run = active;
      if (!run || run.done) return false;
      finish(run, cancelled()); await interrupt(run); return true;
    },
    fail(message) { if (active) finish(active, new Error(message || '그래프 분석 연결이 종료되었습니다.')); },
    async saveReview(plan) {
      if (workflow.isActive() || !(snapshot?.plan || snapshot?.unvalidatedPlan)) return false;
      const checked = validateGraphPlan(plan, { source: binding(snapshot.source) });
      if (!checked.ok) return false;
      auditResult(checked);
      const value = { ...snapshot, plan: checked.plan, unvalidatedPlan: null, validationErrors: [], review: checked.review, blocked: checked.blocked, reviewedPlan: !checked.blocked, quality: checked.quality, status: 'complete', error: null, failure: null };
      const before = ++revision;
      await persist(value);
      if (revision === before && !workflow.isActive()) publish(value);
      return true;
    },
    async recover() {
      if (workflow.isActive()) throw new Error('진행 중인 그래프 분석을 먼저 마쳐 주세요.');
      const before = revision;
      const saved = await store?.get('draft');
      if (workflow.isActive() || revision !== before) return null;
      const value = saved?.snapshot;
      if (value?.schema !== GRAPH_JOB_SCHEMA || !value.source || !value.attachment || !value.selection) return null;
      if (value.plan) {
        const checked = validateGraphPlan(value.plan, { source: binding(value.source) });
        if (!checked.ok) return null;
        auditResult(checked);
        value.quality = checked.quality;
        // Older completed jobs treated relationship failures as failed final
        // attempts. Actual provider/structural failures retain failed status.
        if (value.status === 'complete' && !checked.blocked && value.reviewedPlan !== true) value.finalAttemptSucceeded = true;
        value.plan = checked.plan; value.review = checked.review; value.blocked = checked.blocked || value.finalAttemptSucceeded === false && value.reviewedPlan !== true || ['failed', 'interrupted', 'running'].includes(value.status);
      }
      if (value.unvalidatedPlan) {
        const checked = validateGraphPlan(value.unvalidatedPlan, { source: binding(value.source) });
        if (!checked.plan || checked.errors.some(e => e.code === 'SOURCE_MISMATCH' || e.path.startsWith('source.'))) return null;
        value.unvalidatedPlan = checked.plan; value.validationErrors = checked.errors;
        value.review = checked.review; value.blocked = true;
      }
      if (value.status === 'running') { value.status = 'interrupted'; value.error = '이전 분석이 중단되었습니다. 원본을 확인하고 다시 분석할 수 있습니다.'; }
      serial = Math.max(serial, Number.isSafeInteger(value.id) ? value.id : 0);
      publish(value); return copy(value);
    },
    async analyze({ source, attachment, selection, catalog, force = false, maxAttempts = 1, renderCandidate, instructions = '', contextAttachment = null, styleAttachments = [] } = {}) {
      if (active || preparing) throw new Error('그래프 분석이 이미 진행 중입니다.');
      const preparation = { cancelled: false };
      preparing = preparation;
      revision += 1;
      const checkPreparation = () => { if (preparation.cancelled) throw cancelled(); };
      try {
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3 || (maxAttempts > 1 && typeof renderCandidate !== 'function')) throw new Error('분석 횟수는 1~3회이며 비교 보정에는 그래프 렌더러가 필요합니다.');
      const selected = resolveAIModelSelection(selection, catalog);
      if (!source?.id || !source.hash || !Number.isInteger(source.width) || !Number.isInteger(source.height)
        || source.width <= 0 || source.height <= 0 || typeof attachment?.data !== 'string') throw new Error('원본 이미지와 크기를 확인해 주세요.');
      if (await graphSourceHash(attachment.data) !== source.hash) throw new Error('원본 이미지와 분석 정보가 일치하지 않습니다.');
      checkPreparation();
      instructions = String(instructions).trim().slice(0, 20000);
      if (contextAttachment && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(contextAttachment.data || '') || contextAttachment.data.length > 16_000_000)) throw new Error('현재 편집 그래프의 비교 이미지를 확인해 주세요.');
      if (!Array.isArray(styleAttachments) || styleAttachments.length > (contextAttachment ? 8 : 9) || styleAttachments.some(item => typeof item?.data !== 'string' || !item.data.startsWith('data:image/') || item.data.length > 16_000_000)) throw new Error('표현 참고 이미지를 확인해 주세요.');
      const hashes = await Promise.all([...(contextAttachment ? [contextAttachment] : []), ...styleAttachments].map(item => graphSourceHash(item.data)));
      const contextHash = hashes.length ? JSON.stringify(hashes) : '';
      checkPreparation();
      const cacheKey = graphCacheKey(source, selected, maxAttempts, instructions, contextHash);
      if (!force && store) {
        const cached = await store.get(cacheKey);
        checkPreparation();
        if (cached?.plan) {
          const checked = validateGraphPlan(cached.plan, { source: binding(source) });
          if (checked.ok) auditResult(checked);
          if (checked.ok && !checked.blocked) {
            const value = { schema: GRAPH_JOB_SCHEMA, id: ++serial, status: 'complete', source: copy(source), attachment: copy(attachment), selection: selected,
              plan: checked.plan, quality: checked.quality, attempts: copy(cached.attempts || []), firstPlan: cached.attempts?.find(a => a.plan)?.acceptedPlan || cached.attempts?.find(a => a.plan)?.plan || checked.plan, finalAttemptSucceeded: true, visualStatus: 'user-review-required', maxAttempts, review: checked.review, blocked: false, error: null,
              metrics: { analysisCalls: 0, cacheHits: 1, requestedImageCalls: 0, forbiddenImageEvents: 0, forbiddenToolEvents: 0, analysisMs: 0, validationMs: 0 } };
            await persist(value); checkPreparation(); publish(value); return copy(value);
          }
        }
      }
      // Preserve explicit edits/style references; measure only an original-source restoration.
      const sourceRaster = !instructions && !contextAttachment && !styleAttachments.length ? await decodeGraphSourceRaster(attachment.data, source) : null;
      checkPreparation();
      const value = { schema: GRAPH_JOB_SCHEMA, id: ++serial, status: 'running', source: copy(source), attachment: copy(attachment), selection: selected,
        plan: null, attempts: [], maxAttempts, instructions, contextAttachment: copy(contextAttachment), styleAttachments: copy(styleAttachments), review: [], blocked: false, error: null,
        metrics: { analysisCalls: 0, cacheHits: 0, requestedImageCalls: 0, forbiddenImageEvents: 0, forbiddenToolEvents: 0 } };
      // Checkpoint before sending: recovery failure cannot create an untracked paid request.
      await persist(value);
      if (preparation.cancelled) { await persist({ ...value, status: 'interrupted', error: cancelled().message }); checkPreparation(); }
      publish(value);
      return new Promise((resolve, reject) => {
        const run = { snapshot: value, cacheKey, resolve, reject, started: clock(), text: '', queue: [], awaiting: true, done: false, maxAttempts, renderCandidate };
        run.sourceRaster = sourceRaster;
        active = run;
        run.timer = setTimeout(() => { void interrupt(run); finish(run, Object.assign(new Error('그래프 분석 시간이 초과되었습니다. 자동 재시도하지 않았습니다.'), { code: 'GRAPH_TIMEOUT' })); }, timeoutMs);
        dispatch(run, buildGraphExtractionPrompt(source) + (instructions ? `\n\n사용자의 그래프 복원·수정 요청:\n${instructions}\n출력은 동일한 그래프 JSON 계약을 따르고, 요청하지 않은 축·계열·표기는 보존하십시오.` : '') + (contextAttachment ? '\n두 번째 이미지는 사용자가 편집한 현재 그래프다. 현재 그래프의 표기와 스타일을 유지하며 요청한 부분만 수정한다. 첫 번째 원본 이미지의 픽셀 프레임과 위 source 바인딩으로 결과를 반환한다.' : '') + (styleAttachments.length ? `\n${contextAttachment ? '세 번째' : '두 번째'}부터는 표현 참고 이미지다. 그 이미지의 데이터나 좌표를 섞지 말고, 선·점선·점·축의 표현만 참고한다. 원본 그래프의 관계와 source 바인딩은 유지한다.` : ''), [attachment, ...(contextAttachment ? [contextAttachment] : []), ...styleAttachments]);
      });
      } finally { if (preparing === preparation) preparing = null; }
    },
  };
  return workflow;
}
