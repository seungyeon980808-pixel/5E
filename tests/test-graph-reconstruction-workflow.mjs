import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { buildEphemeralThreadStartParams } = createRequire(import.meta.url)('../desktop/ai-thread-profile.cjs');
const { resolveTurnPlan } = createRequire(import.meta.url)('../desktop/codex-turn-runtime.cjs');
import { createGraphReconstructionWorkflow, graphSourceHash, graphCacheKey, GRAPH_JOB_SCHEMA, GRAPH_PIPELINE_VERSION } from '../js/graph/reconstruction-workflow.js';

const evidence = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : path.resolve(import.meta.dirname, '../.omo/evidence/graph-reconstruction-20261004/workflow');
fs.mkdirSync(evidence, { recursive: true });
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=';
const source = { id: 'source-1', hash: await graphSourceHash(png), width: 1, height: 1 };
const selection = { model: 'fixture-model', effort: 'low', serviceTier: null };
const catalog = [{ id: selection.model, supportedReasoningEfforts: ['low', 'high'], serviceTiers: ['priority'] }, { id: 'other-model', supportedReasoningEfforts: ['low'], serviceTiers: [] }];
const args = () => ({ source: structuredClone(source), attachment: { data: png, name: 'graph.png' }, selection: { ...selection }, catalog });
const plan = (src = source) => ({ schema: '5e.graph-reconstruction/v1', source: { ...src, plotBox: { x: 0, y: 0, w: 1, h: 1 } }, axes: {
  x: { scale: 'linear', title: '', unit: '', min: 0, max: 2, step: 1, ticks: [] },
  y: { scale: 'linear', title: '', unit: '', min: 0, max: 2, step: 1, ticks: [] },
}, series: [{ id: 'curve', kind: 'points', axis: 'y', certainty: 'observed', coordinateSpace: 'normalized', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], breaks: [] }], annotations: [], review: [] });
const signals = new Set();
const notify = () => { for (const signal of [...signals]) signal(); };
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const outcome = promise => promise.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
function until(check) {
  return new Promise((resolve, reject) => {
    const done = error => { clearTimeout(timer); signals.delete(signal); error ? reject(error) : resolve(); };
    const signal = () => { try { if (check()) done(); } catch (error) { done(error); } };
    const timer = setTimeout(() => done(Error('Harness state signal exceeded 500ms')), 500);
    signals.add(signal); signal();
  });
}
const contexts = [];
function setup({ store, send, timeoutMs = 500 } = {}) {
  const records = new Map(), calls = [], interrupts = [], changes = [];
  const memory = { get: async key => structuredClone(records.get(key)), put: async value => { records.set(value.key, structuredClone(value)); notify(); } };
  const backend = store ? store(memory, records) : memory;
  const observedStore = Object.fromEntries(Object.entries(backend).map(([key, fn]) => [key, async (...args) => {
    const pending = fn(...args); queueMicrotask(notify);
    try { return await pending; } finally { notify(); }
  }]));
  const transport = { send: async request => { calls.push(structuredClone(request)); notify(); return send ? send(request, calls.length) : { turnId: `turn-${calls.length}`, threadId: `thread-${calls.length}` }; }, interrupt: async target => { interrupts.push(target); notify(); } };
  const workflow = createGraphReconstructionWorkflow({ transport, store: observedStore, timeoutMs, onChange: value => { changes.push(value); notify(); } });
  const ctx = { workflow, records, calls, interrupts, changes }; contexts.push(ctx); return ctx;
}
async function sent(ctx, options = args()) { const pending = outcome(ctx.workflow.analyze(options)); await until(() => ctx.calls.length > 0); return { pending }; }
function complete(ctx, value = plan(), turnId = `turn-${ctx.calls.length}`) {
  ctx.workflow.handleEvent({ method: 'item/completed', params: { turnId, item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(value) } } });
  ctx.workflow.handleEvent({ method: 'turn/completed', params: { turn: { id: turnId, status: 'completed' } } });
}
const results = [];
async function test(name, run) {
  const first = contexts.length;
  try { const details = await run(); results.push({ name, pass: true, details }); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); }
  finally { for (const ctx of contexts.slice(first)) if (ctx.workflow.isActive()) await ctx.workflow.cancel(); }
}

await test('real source digest, selected catalog parameters and raw event success', async () => {
  assert.match(source.hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(await graphSourceHash(png), source.hash);
  const ctx = setup(), { pending } = await sent(ctx); complete(ctx); const result = await pending;
  assert.equal(result.ok, true); assert.equal(result.value.metrics.analysisCalls, 1); assert.equal(result.value.metrics.requestedImageCalls, 0);
  assert.equal(ctx.calls[0].model, selection.model); assert.equal(ctx.calls[0].effort, 'low'); assert.equal(ctx.calls[0].purpose, 'scene'); assert.equal(ctx.calls[0].ephemeralRender, true);
  const desktopPlan = resolveTurnPlan(ctx.calls[0]); assert.equal(desktopPlan.purpose, 'scene'); assert.equal(desktopPlan.ephemeralRender, true); assert.equal(desktopPlan.resumeConversationId, null);
  const profile = buildEphemeralThreadStartParams({ purpose: desktopPlan.purpose, ...selection });
  assert.equal(profile.ephemeral, true); assert.equal(profile.serviceName, '5e-fast-scene');
  assert.deepEqual(profile.environments, []); assert.deepEqual(profile.selectedCapabilityRoots, []);
  assert.match(profile.baseInstructions, /single-purpose JSON/); assert.match(profile.developerInstructions, /Never call image generation/);
  assert.equal(ctx.calls[0].attachments[0].data, png); assert.ok(result.value.review.length > 0);
  fs.writeFileSync(path.join(evidence, 'successful-observation.json'), JSON.stringify(result.value, null, 2));
  return { calls: ctx.calls.length, observedReview: result.value.review.length };
});
await test('unknown model, invalid effort and source hash fail before send', async () => {
  const ctx = setup();
  for (const change of [a => { a.selection.model = 'unavailable'; }, a => { a.selection.effort = 'unsupported'; }, a => { a.source.hash = 'sha256:wrong'; }]) {
    const a = args(); change(a); const result = await outcome(ctx.workflow.analyze(a)); assert.equal(result.ok, false); assert.equal(ctx.workflow.isActive(), false);
  }
  assert.equal(ctx.calls.length, 0); assert.equal(ctx.records.size, 0); return { calls: 0 };
});
await test('cache hit performs no send and forced retry performs one new send', async () => {
  const ctx = setup(), { pending } = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true);
  const cached = await ctx.workflow.analyze(args()); assert.equal(cached.metrics.cacheHits, 1); assert.equal(cached.metrics.analysisCalls, 0); assert.equal(ctx.calls.length, 1);
  const forced = outcome(ctx.workflow.analyze({ ...args(), force: true })); await until(() => ctx.calls.length === 2); complete(ctx); assert.equal((await forced).ok, true); assert.equal(ctx.calls.length, 2);
  return { totalCalls: 2, cacheCalls: cached.metrics.analysisCalls };
});
await test('cache separates source identity and model selection', async () => {
  const a = args(), b = args(); b.source.id = 'source-2'; const c = args(); c.selection.model = 'other-model';
  assert.notEqual(graphCacheKey(a.source, a.selection), graphCacheKey(b.source, b.selection)); assert.notEqual(graphCacheKey(a.source, a.selection), graphCacheKey(c.source, c.selection));
  const ctx = setup(); ctx.records.set(graphCacheKey(source, selection), { plan: plan() });
  for (const options of [b, c]) {
    const oldCount = ctx.calls.length, pending = outcome(ctx.workflow.analyze(options)); await until(() => ctx.calls.length === oldCount + 1); complete(ctx, plan(options.source)); assert.equal((await pending).ok, true);
  }
  assert.equal(ctx.calls.length, 2); return { calls: 2 };
});
await test('older extraction prompt cache is not reused', async () => {
  const ctx = setup();
  const oldKey = JSON.parse(graphCacheKey(source, selection)); oldKey[1] = 'graph-observation-v4';
  ctx.records.set(JSON.stringify(oldKey), { plan: plan() });
  const { pending } = await sent(ctx); complete(ctx);
  assert.equal((await pending).ok, true); assert.equal(ctx.calls.length, 1);
  assert.ok(ctx.records.has(JSON.stringify(oldKey)));
});
await test('poisoned cached source is not reused', async () => {
  const ctx = setup(); ctx.records.set(graphCacheKey(source, selection), { plan: plan({ ...source, hash: 'wrong' }) });
  const { pending } = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true); assert.equal(ctx.calls.length, 1);
});
await test('interrupted recovery never automatically sends', async () => {
  const ctx = setup(); ctx.records.set('draft', { snapshot: { schema: GRAPH_JOB_SCHEMA, id: 1, status: 'running', source, attachment: { data: png }, selection, plan: null } });
  const recovered = await ctx.workflow.recover(); assert.equal(recovered.status, 'interrupted'); assert.equal(ctx.calls.length, 0);
  ctx.records.set('draft', { snapshot: { ...recovered, plan: plan({ ...source, hash: 'wrong' }) } }); assert.equal(await ctx.workflow.recover(), null);
});
await test('checkpoint storage failure prevents paid request', async () => {
  const ctx = setup({ store: memory => ({ ...memory, put: async () => { throw Error('storage unavailable'); } }) });
  const result = await outcome(ctx.workflow.analyze(args())); assert.equal(result.ok, false); assert.match(result.error.message, /storage unavailable/); assert.equal(ctx.calls.length, 0); assert.equal(ctx.workflow.isActive(), false);
});
await test('concurrent preflight calls reserve the workflow synchronously', async () => {
  const gate = defer(); const ctx = setup({ store: memory => ({ ...memory, get: () => gate.promise }) });
  const first = outcome(ctx.workflow.analyze(args())), second = await outcome(ctx.workflow.analyze(args()));
  assert.equal(second.ok, false); assert.match(second.error.message, /이미 진행/); assert.equal(ctx.workflow.isActive(), true);
  gate.resolve(null); await until(() => ctx.calls.length === 1); complete(ctx); assert.equal((await first).ok, true); assert.equal(ctx.calls.length, 1);
});
await test('cancel pending cache read prevents request', async () => {
  const gate = defer(); let reading = false; const ctx = setup({ store: memory => ({ ...memory, get: () => { reading = true; return gate.promise; } }) });
  const pending = outcome(ctx.workflow.analyze(args())); await until(() => reading); assert.equal(await ctx.workflow.cancel(), true); gate.resolve(null);
  assert.equal((await pending).error.code, 'GRAPH_CANCELLED'); assert.equal(ctx.calls.length, 0);
});
await test('cancel pending checkpoint persists interruption with zero actual calls', async () => {
  const gate = defer(); let writes = 0; const ctx = setup({ store: memory => ({ ...memory, put: async value => { writes++; if (writes === 1) await gate.promise; await memory.put(value); } }) });
  const pending = outcome(ctx.workflow.analyze(args())); await until(() => writes === 1); await ctx.workflow.cancel(); gate.resolve();
  assert.equal((await pending).error.code, 'GRAPH_CANCELLED'); assert.equal(ctx.calls.length, 0);
  const draft = ctx.records.get('draft').snapshot; assert.equal(draft.status, 'interrupted'); assert.equal(draft.metrics.analysisCalls, 0);
});
await test('late acknowledgement after cancellation interrupts only its own turn', async () => {
  const ack = defer(); const ctx = setup({ send: () => ack.promise }); const { pending } = await sent(ctx);
  await ctx.workflow.cancel(); assert.equal((await pending).error.code, 'GRAPH_CANCELLED'); assert.equal(ctx.interrupts.length, 0);
  ack.resolve({ turnId: 'late-turn', renderThreadId: 'late-thread' }); await until(() => ctx.interrupts.length === 1);
  assert.deepEqual(ctx.interrupts[0], { turnId: 'late-turn', threadId: 'late-thread' });
  complete(ctx, plan(), 'late-turn'); assert.equal(ctx.workflow.snapshot().status, 'interrupted');
});
await test('wrong turn events and retired late completion do not change active job', async () => {
  const ctx = setup(), first = await sent(ctx); let acknowledged = false;
  ctx.workflow.handleEvent({ kind: 'assistant', turnId: 'turn-1', get text() { acknowledged = true; notify(); return ''; } });
  await until(() => acknowledged);
  assert.equal(ctx.workflow.handleEvent({ kind: 'error', turnId: 'foreign', text: 'foreign' }), false);
  complete(ctx); assert.equal((await first.pending).ok, true);
  const second = outcome(ctx.workflow.analyze({ ...args(), force: true })); await until(() => ctx.calls.length === 2);
  assert.equal(ctx.workflow.handleEvent({ kind: 'error', turnId: 'turn-1', text: 'late' }), true); assert.equal(ctx.workflow.snapshot().status, 'running');
  complete(ctx); assert.equal((await second).ok, true);
});
await test('matching events queued before ACK are replayed, unrelated queue ignored', async () => {
  const ack = defer(); const ctx = setup({ send: () => ack.promise }); const { pending } = await sent(ctx);
  ctx.workflow.handleEvent({ kind: 'error', turnId: 'foreign', text: 'unrelated' }); complete(ctx, plan(), 'early');
  ack.resolve({ turnId: 'early', threadId: 'early-thread' }); assert.equal((await pending).ok, true);
});
await test('image generation start, result and image-call metrics are forbidden', async () => {
  for (const event of [{ method: 'item/started', params: { turnId: 'turn-1', item: { type: 'imageGeneration' } } }, { kind: 'image', turnId: 'turn-1', src: png }, { kind: 'performance', turnId: 'turn-1', metrics: { imageCallCount: 1 } }]) {
    const ctx = setup(), { pending } = await sent(ctx); ctx.workflow.handleEvent(event); const result = await pending;
    assert.equal(result.ok, false); assert.match(result.error.message, /이미지 생성/); assert.equal(ctx.workflow.snapshot().metrics.forbiddenImageEvents, 1); assert.equal(ctx.interrupts.length, 1);
  }
});
await test('timeout and provider error fail once without retry', async () => {
  const timeout = setup({ timeoutMs: 15 }), pending = outcome(timeout.workflow.analyze(args())); const result = await pending;
  assert.equal(result.ok, false); assert.match(result.error.message, /초과/); assert.equal(timeout.calls.length, 1); assert.equal(timeout.interrupts.length, 1);
  const rejection = setup({ send: async () => { throw Error('provider offline'); } }); const failed = await outcome(rejection.workflow.analyze(args())); assert.equal(failed.ok, false); assert.match(failed.error.message, /provider offline/); assert.equal(rejection.calls.length, 1);
});
await test('invalid JSON and wrong source response cannot become insertable plans', async () => {
  for (const response of ['not json', JSON.stringify(plan({ ...source, id: 'wrong' }))]) {
    const ctx = setup(), { pending } = await sent(ctx); ctx.workflow.handleEvent({ kind: 'assistant', turnId: 'turn-1', text: response }); ctx.workflow.handleEvent({ kind: 'done', turnId: 'turn-1', status: 'completed' });
    assert.equal((await pending).ok, false); assert.equal(ctx.workflow.snapshot().plan, null);
  }
});
await test('source-bound invalid observations retain a blocked recoverable review draft', async () => {
  const ctx = setup(), { pending } = await sent(ctx), invalid = plan(); invalid.axes.x.max = invalid.axes.x.min;
  complete(ctx, invalid); assert.equal((await pending).ok, false);
  const failed = ctx.workflow.snapshot(); assert.equal(failed.plan, null); assert.equal(failed.blocked, true);
  assert.deepEqual(failed.unvalidatedPlan.series, invalid.series); assert.ok(failed.rawResponse.length); assert.ok(failed.validationErrors.length);
  assert.equal(ctx.records.has(graphCacheKey(source, selection)), false);
  const recovered = await ctx.workflow.recover(); assert.equal(recovered.blocked, true); assert.ok(recovered.unvalidatedPlan);
  const reviewed = structuredClone(recovered.unvalidatedPlan); reviewed.axes.x.max = plan().axes.x.max;
  assert.equal(await ctx.workflow.saveReview(reviewed), true); assert.equal(ctx.workflow.snapshot().unvalidatedPlan, null);
  assert.equal(ctx.workflow.snapshot().error, null); assert.equal(ctx.calls.length, 1);
});
await test('unsupported plans remain review-blocked and are not cached', async () => {
  const ctx = setup(), { pending } = await sent(ctx), value = plan(); value.variant = 'nonuniform'; complete(ctx, value);
  const result = await pending; assert.equal(result.ok, true); assert.equal(result.value.blocked, true); assert.ok(result.value.review.length); assert.equal(ctx.records.has(graphCacheKey(source, selection)), false);
});
await test('stale recover cannot replace a newer finished result', async () => {
  const gate = defer(); const ctx = setup({ store: memory => ({ ...memory, get: key => key === 'draft' ? gate.promise : memory.get(key) }) });
  const recovery = ctx.workflow.recover(), { pending } = await sent(ctx); ctx.workflow.fail('NEW FAILURE'); assert.equal((await pending).ok, false);
  gate.resolve({ snapshot: { schema: GRAPH_JOB_SCHEMA, id: 99, status: 'failed', source, attachment: { data: png }, selection, plan: null, error: 'OLD FAILURE' } });
  await recovery; assert.equal(ctx.workflow.snapshot().error, 'NEW FAILURE');
});

await test('successful result survives final draft persistence failure', async () => {
  const ctx = setup({ store: memory => ({ ...memory, put: async value => {
    if (value.key === 'draft' && value.snapshot.status === 'complete') throw Error('disk full');
    return memory.put(value);
  } }) });
  const { pending } = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true);
  await until(() => ctx.workflow.snapshot().persistenceError);
  assert.equal(ctx.workflow.snapshot().status, 'complete'); assert.ok(ctx.workflow.snapshot().plan); assert.equal(ctx.calls.length, 1);
});
await test('serialized draft writes cannot overwrite the next run', async () => {
  const delayed = defer(); let finishing = false;
  const ctx = setup({ store: memory => ({ ...memory, put: async value => {
    if (value.key === 'draft' && value.snapshot.id === 1 && value.snapshot.status === 'complete') { finishing = true; await delayed.promise; }
    return memory.put(value);
  } }) });
  const first = await sent(ctx); complete(ctx); assert.equal((await first.pending).ok, true); await until(() => finishing);
  const second = outcome(ctx.workflow.analyze({ ...args(), force: true })); assert.equal(ctx.calls.length, 1);
  delayed.resolve(); await until(() => ctx.calls.length === 2); complete(ctx); assert.equal((await second).ok, true);
  await until(() => ctx.records.get('draft')?.snapshot.id === 2 && ctx.records.get('draft')?.snapshot.status === 'complete');
  assert.equal(ctx.records.get('draft').snapshot.id, 2);
});
await test('bounded cache pruning preserves draft and latest observation', async () => {
  const ctx = setup({ store: (memory, records) => ({ ...memory, getAll: async () => [...records.values()], delete: async key => records.delete(key) }) });
  for (let i = 0; i < 30; i++) ctx.records.set('old-' + i, { key: 'old-' + i, createdAt: i, plan: plan() });
  const { pending } = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true);
  await until(() => [...ctx.records.keys()].filter(key => key !== 'draft').length === 24);
  assert.equal(ctx.records.has(graphCacheKey(source, selection)), true); assert.equal(ctx.records.has('draft'), true); assert.equal(ctx.records.has('old-0'), false);
});
await test('recovery revalidates review and unsupported-variant insertion block', async () => {
  const ctx = setup(), original = plan(); original.variant = 'nonuniform';
  ctx.records.set('draft', { snapshot: { schema: GRAPH_JOB_SCHEMA, id: 1, status: 'complete', source, attachment: { data: png }, selection, plan: original, review: [], blocked: false } });
  const recovered = await ctx.workflow.recover(); assert.equal(recovered.blocked, true); assert.ok(recovered.review.length); assert.equal(ctx.calls.length, 0);
});

await test('manual review changes recover without modifying the observation cache', async () => {
  const ctx = setup(), { pending } = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true);
  const reviewed = ctx.workflow.snapshot().plan; reviewed.axes.x.title = '사용자 확인';
  assert.equal(await ctx.workflow.saveReview(reviewed), true);
  const recovered = await ctx.workflow.recover(); assert.equal(recovered.plan.axes.x.title, '사용자 확인'); assert.equal(ctx.calls.length, 1);
  assert.equal(ctx.records.get(graphCacheKey(source, selection)).plan.axes.x.title, '');
  const invalid = structuredClone(reviewed); invalid.axes.x.max = invalid.axes.x.min;
  assert.equal(await ctx.workflow.saveReview(invalid), false); assert.equal(ctx.workflow.snapshot().plan.axes.x.title, '사용자 확인');
});


await test('bounded corrections send original and actual render twice, ceiling three and isolated cache', async()=>{
 const ctx=setup(), seen=[];const options={...args(),maxAttempts:3,renderCandidate:async(p,meta)=>{seen.push(meta);return{attachment:{data:png,name:'native.png'},issues:['style check']};}};
 const {pending}=await sent(ctx,options);complete(ctx);await until(()=>ctx.calls.length===2);const second=plan();second.axes.x.title='second';complete(ctx,second);await until(()=>ctx.calls.length===3);const third=plan();third.axes.x.title='third';complete(ctx,third);
 const r=await pending;assert(r.ok);assert.equal(ctx.calls.length,3);assert.equal(seen.length,2);assert.equal(r.value.attempts.length,3);assert.equal(r.value.firstPlan.axes.x.title,'');assert.equal(r.value.plan.axes.x.title,'third');assert.equal(r.value.visualStatus,'user-review-required');
 for(const c of ctx.calls.slice(1)){assert.equal(c.attachments.length,2);assert.equal(c.attachments[0].data,png);assert.equal(c.attachments[1].data,png);assert.equal(c.purpose,'scene');assert.equal(c.ephemeralRender,true);assert.match(c.text,/GRAPH_PREVIOUS_PLAN_JSON/);}
 const cached=await ctx.workflow.analyze(options);assert.equal(cached.metrics.cacheHits,1);assert.equal(ctx.calls.length,3);assert.equal(cached.attempts.length,3);assert(!ctx.records.has(graphCacheKey(source,selection)));
});
await test('invalid correction options fail before any send',async()=>{
 for(const maxAttempts of [0,4,2.5,'3']){const c=setup();await assert.rejects(c.workflow.analyze({...args(),maxAttempts,renderCandidate:async()=>({attachment:{data:png}})}));assert.equal(c.calls.length,0);}
 const c=setup();await assert.rejects(c.workflow.analyze({...args(),maxAttempts:3}));assert.equal(c.calls.length,0);
});
await test('cancel while async rendering prevents any later correction send',async()=>{
 const gate=defer(),ctx=setup();const{pending}=await sent(ctx,{...args(),maxAttempts:3,renderCandidate:()=>gate.promise});complete(ctx);await until(()=>ctx.workflow.snapshot().attempts?.length===1);await ctx.workflow.cancel();gate.resolve({attachment:{data:png}});const r=await pending;await gate.promise;assert(!r.ok);assert.equal(ctx.calls.length,1);assert.equal(ctx.workflow.snapshot().status,'interrupted');assert.equal(ctx.workflow.snapshot().attempts.length,1);
});
await test('structurally invalid source-bound candidate corrects from original without invented render',async()=>{
 const ctx=setup();let renders=0;const{pending}=await sent(ctx,{...args(),maxAttempts:3,renderCandidate:async()=>{renders++;return{attachment:{data:png}};}});const invalid=plan();invalid.axes.x.step=-1;complete(ctx,invalid);await until(()=>ctx.calls.length===2);assert.equal(ctx.calls[1].attachments.length,1);assert.match(ctx.calls[1].text,/GRAPH_VALIDATION_ERRORS_JSON/);complete(ctx);await until(()=>ctx.calls.length===3);complete(ctx);const r=await pending;assert(r.ok);assert.equal(renders,1);assert.equal(r.value.attempts[0].valid,false);
});
await test('later invalid final preserves first and last accepted instead of discarding graph',async()=>{
 const ctx=setup();const{pending}=await sent(ctx,{...args(),maxAttempts:2,renderCandidate:async()=>({attachment:{data:png}})});complete(ctx);await until(()=>ctx.calls.length===2);const invalid=plan();invalid.axes.x.step=-1;complete(ctx,invalid);const r=await pending;assert(!r.ok);const snap=ctx.workflow.snapshot();assert(snap.plan);assert(snap.firstPlan);assert.equal(snap.finalAttemptSucceeded,false);assert.equal(snap.attempts.length,2);assert.equal(snap.attempts[1].valid,false);
});
await test('mismatched source stops corrections immediately and retired previous turn cannot complete next',async()=>{
 const ctx=setup();const{pending}=await sent(ctx,{...args(),maxAttempts:3,renderCandidate:async()=>({attachment:{data:png}})});complete(ctx);await until(()=>ctx.calls.length===2);complete(ctx,plan(),'turn-1');assert.equal(ctx.calls.length,2);const wrong=plan({...source,hash:'other'});complete(ctx,wrong);const r=await pending;assert(!r.ok);assert.equal(ctx.calls.length,2);assert.equal(ctx.workflow.snapshot().attempts[1].plan,null);
});
await test('PNG callback failure preserves candidate and never makes a paid retry',async()=>{
 const ctx=setup();const{pending}=await sent(ctx,{...args(),maxAttempts:3,renderCandidate:async()=>({attachment:{data:'not-png'}})});complete(ctx);const r=await pending;assert(!r.ok);assert.equal(ctx.calls.length,1);assert(ctx.workflow.snapshot().plan);assert.match(r.error.message,/PNG/);
});


await test('raw external tools fail closed before final and unrelated tools do not interrupt',async()=>{
 for(const type of ['commandExecution','mcpToolCall','webSearch','fileChange','command_execution','file_change']){
  const ctx=setup(),{pending}=await sent(ctx);
  ctx.workflow.handleEvent({method:'item/started',params:{turnId:'unrelated',item:{type}}});assert(ctx.workflow.isActive());
  ctx.workflow.handleEvent({method:'item/started',params:{turnId:'turn-1',item:{type}}});
  complete(ctx);assert(!(await pending).ok);assert.equal(ctx.workflow.snapshot().metrics.forbiddenToolEvents,1);assert.equal(ctx.calls.length,1);assert.equal(ctx.interrupts.length,1);
 }
});
await test('recover preserves failed final block with accepted fallback',async()=>{
 const ctx=setup();const{pending}=await sent(ctx,{...args(),maxAttempts:2,renderCandidate:async()=>({attachment:{data:png}})});
 complete(ctx);await until(()=>ctx.calls.length===2);const invalid=plan();invalid.axes.x.step=-1;complete(ctx,invalid);assert(!(await pending).ok);
 await until(()=>ctx.records.get('draft')?.snapshot.status==='failed');const recovered=await ctx.workflow.recover();assert.equal(recovered.blocked,true);assert.equal(recovered.finalAttemptSucceeded,false);assert.equal(recovered.status,'failed');assert(recovered.error);
 assert.equal(recovered.attempts[0].renderedHash,source.hash);assert.deepEqual(recovered.attempts[0].sourceBinding,source);
 fs.writeFileSync(path.join(evidence,'failed-final-recovered.json'),JSON.stringify(recovered,null,2));
});
await test('graph edit instructions are bound to the request and cache identity', async () => {
  const ctx = setup(), instructions = 'B 곡선의 점선을 더 굵게';
  const options = { ...args(), instructions };
  const { pending } = await sent(ctx, options);
  assert.match(ctx.calls[0].text, /B 곡선의 점선을 더 굵게/);
  complete(ctx); assert.equal((await pending).ok, true);
  assert.equal(ctx.records.has(graphCacheKey(source, selection, 1, instructions)), true);
  assert.equal(ctx.records.has(graphCacheKey(source, selection)), false);
  const cached = await ctx.workflow.analyze(options);
  assert.equal(cached.metrics.cacheHits, 1); assert.equal(ctx.calls.length, 1);
  assert.notEqual(graphCacheKey(source, selection, 1, instructions), graphCacheKey(source, selection, 1, '다른 요청'));
});
await test('current edited preview and style references remain separate from the bound original', async () => {
  const ctx = setup(), contextAttachment = { id: 'current', name: 'current.png', data: png };
  const styleAttachment = { id: 'style', name: 'style.png', data: png };
  const { pending } = await sent(ctx, { ...args(), contextAttachment, styleAttachments: [styleAttachment] });
  assert.equal(ctx.calls[0].attachments.length, 3);
  assert.equal(ctx.calls[0].attachments[0].data, png);
  assert.equal(ctx.calls[0].attachments[1].id, 'current');
  assert.equal(ctx.calls[0].attachments[2].id, 'style');
  assert.match(ctx.calls[0].text, /사용자가 편집한 현재 그래프/);
  assert.match(ctx.calls[0].text, /데이터나 좌표를 섞지/);
  complete(ctx); assert.equal((await pending).ok, true);
  assert.equal(ctx.records.has(graphCacheKey(source, selection)), false);
});
await test('formula-first result preserves raw observations, first result, cache and recovery', async () => {
  const observed = plan();
  observed.series[0].curveStyle = 'smooth';
  observed.series[0].points = Array.from({length: 12}, (_,i) => ({ x:i/11, y:0.2+0.5*i/11 }));
  observed.coordinateMode='observed';
  observed.axes.x={...observed.axes.x,scale:'unknown',min:null,max:null,step:null,ticks:[{label:'0',position:0,value:null},{label:'1',position:1,value:null}]};
  observed.axes.y={...observed.axes.y,scale:'unknown',min:null,max:null,step:null,ticks:[{label:'0.2',position:.2,value:null},{label:'0.7',position:.7,value:null}]};
  observed.series[0].candidateFamily='linear';
  observed.series[0].relationAnchors=[{xTickLabel:'0',yTickLabel:'0.2'},{xTickLabel:'1',yTickLabel:'0.7'}];
  const ctx = setup(), {pending} = await sent(ctx); complete(ctx, observed);
  const result = (await pending).value;
  assert.equal(result.plan.series[0].kind, 'expression');
  assert.equal(result.plan.series[0].certainty, 'observed');
  assert.equal(result.plan.series[0].approximation.provenance, 'image-fit');
  assert.equal(result.plan.series[0].expression,'0.5*x+0.2');
  result.plan.series[0].observedPoints.forEach((p,i)=>{assert(Math.abs(p.x-observed.series[0].points[i].x)<1e-4);assert(Math.abs(p.y-observed.series[0].points[i].y)<1e-4);});
  assert.deepEqual(result.attempts[0].plan.series, observed.series);
  assert.deepEqual(result.attempts[0].plan.axes, observed.axes);
  assert.equal(result.attempts[0].rawResponse, JSON.stringify(observed));
  assert.equal(result.firstPlan.series[0].kind, 'expression');
  assert.equal(result.attempts[0].analyticFit.conversions[0].family, 'linear');
  assert.equal((await ctx.workflow.recover()).plan.series[0].kind, 'expression');
  const cached = await ctx.workflow.analyze(args());
  assert.equal(cached.metrics.cacheHits, 1);
  assert.deepEqual(cached.plan, result.plan);
  assert.equal(cached.firstPlan.series[0].kind, 'expression');
  assert.equal(ctx.calls.length, 1);
});
await test('scatter observations retain discrete data rather than a fitted curve', async () => {
  const observed = plan();
  Object.assign(observed.series[0], {lineVisible:false, markerShape:'circle', curveStyle:'smooth'});
  const ctx = setup(), {pending} = await sent(ctx); complete(ctx, observed);
  const result = (await pending).value;
  assert.equal(result.plan.series[0].kind, 'points');
  assert.deepEqual(result.plan.series[0].points, observed.series[0].points);
  assert.equal(result.attempts[0].analyticFit.conversions.length, 0);
});

await test('failed terminal preserves provider rate-limit reason without retransmission', async () => {
 const ctx = setup(), { pending } = await sent(ctx);
 ctx.workflow.handleEvent({ kind: 'done', turnId: 'turn-1', status: 'failed', error: { message: '429 Too Many Requests' } });
 const result = await pending; assert.equal(result.ok, false);
 assert.equal(ctx.workflow.snapshot().failure.code, 'GRAPH_RATE_LIMIT');
 assert.match(ctx.workflow.snapshot().failure.detail, /429/); assert.equal(ctx.calls.length, 1);
 assert.equal(ctx.workflow.snapshot().failure.automaticRetry, false);
 complete(ctx); assert.equal(ctx.workflow.snapshot().status, 'failed');
});
await test('source processors and fit versions invalidate prior prompt-only caches', async () => {
 const ctx = setup();
 const oldKey = JSON.stringify(['5e.graph-reconstruction/v1', 'graph-observation-v22-preserve-elements', 'source-axis-arrow-size-v1', source, selection, 1]);
 ctx.records.set(oldKey, { key: oldKey, source, plan: plan() });
 const { pending } = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true);
 const key = JSON.parse(graphCacheKey(source, selection));
 assert.equal(key[2], GRAPH_PIPELINE_VERSION); assert.match(key[2], /source-grid/); assert.match(key[2], /source-frame/); assert.match(key[2], /simple-image-fit/);
 assert.equal(ctx.calls.length, 1);
});
await test('critical relationships retain editable cached recoverable native plans and visible review', async () => {
 const src = {...source, width: 400, height: 300}, ctx = setup(), { pending } = await sent(ctx, {...args(), source: src}), p = plan(src);
 p.source.plotBox = {x: 40, y: 20, w: 320, h: 240};
 p.annotations = [{ id: 'guide', kind: 'guide', text: '', x: .5, y: .5, to: {x: 0, y: 0}, coordinateSpace: 'normalized', orientation: 'horizontal' }];
 complete(ctx, p); const result = await pending; assert(result.ok);
 assert.equal(result.value.blocked, false); assert.equal(result.value.quality.status, 'fail');
 assert.equal(result.value.finalAttemptSucceeded, true); assert.equal(ctx.records.has(graphCacheKey(src, selection)), true);
 const critical = result.value.quality.issues.find(i => i.code === 'GUIDE_DIRECTION_MISMATCH');
 assert(critical); assert.equal(critical.severity, 'critical');
 assert(result.value.review.some(r => r.path === critical.path && r.reason === critical.message));
 await until(() => ctx.records.get('draft')?.snapshot.status === 'complete');
 const restored = await ctx.workflow.recover(); assert.equal(restored.blocked, false); assert.equal(restored.quality.status, 'fail');
 assert(restored.review.some(r => r.reason === critical.message));
 const cached = await ctx.workflow.analyze({...args(), source: src});
 assert.equal(cached.metrics.cacheHits, 1); assert.equal(cached.blocked, false); assert.equal(cached.quality.status, 'fail');
 assert(cached.review.some(r => r.reason === critical.message)); assert.equal(ctx.calls.length, 1);
 assert.equal(await ctx.workflow.saveReview(cached.plan), true);
 assert.equal(ctx.workflow.snapshot().reviewedPlan, true); assert.equal(ctx.workflow.snapshot().quality.status, 'fail');
 assert(ctx.workflow.snapshot().review.some(r => r.reason === critical.message));
 p.annotations[0].to.y = .5;
 assert.equal(await ctx.workflow.saveReview(p), true);
 const recovered = await ctx.workflow.recover(); assert.equal(recovered.blocked, false); assert.equal(recovered.reviewedPlan, true);
 assert.equal(recovered.finalAttemptSucceeded, true); assert.equal(recovered.quality.status, 'pass'); assert.equal(ctx.calls.length, 1);
});
await test('relationship failures still render corrections and remain accepted when later structure fails', async () => {
 const src = {...source, width: 400, height: 300}, ctx = setup(); let renders = 0;
 const p = plan(src); p.source.plotBox = {x: 40, y: 20, w: 320, h: 240};
 p.annotations = [{id:'guide',text:'',kind:'guide', x:.5, y:.5, to:{x:0,y:0}, coordinateSpace:'normalized', orientation:'horizontal'}];
 const {pending} = await sent(ctx, {...args(), source:src, maxAttempts:2, renderCandidate:async candidate => {
  renders++; assert.deepEqual(candidate.annotations, p.annotations); return {attachment:{data:png}};
 }});
 complete(ctx, p); await until(() => ctx.calls.length === 2);
 assert.equal(renders, 1); assert.equal(ctx.calls[1].attachments.length, 2);
 assert(ctx.workflow.snapshot().attempts[0].issues.some(i => i.startsWith('annotations.0.to:')));
 const invalid = structuredClone(p); invalid.axes.x.step = -1; complete(ctx, invalid);
 assert.equal((await pending).ok, false);
 const failed = ctx.workflow.snapshot(); assert.deepEqual(failed.plan.annotations, p.annotations);
 assert.equal(failed.blocked, true); assert.equal(failed.finalAttemptSucceeded, false);
 assert.equal(failed.quality.status, 'fail'); assert(failed.review.some(r => r.path === 'annotations.0.to'));
 assert(failed.validationErrors.some(e => e.path === 'axes.x' && e.code === 'RANGE')); assert(failed.error);
 await until(() => ctx.records.get('draft')?.snapshot.status === 'failed');
 assert.equal((await ctx.workflow.recover()).blocked, true);
});
await test('saving review cannot bypass source binding or structural validation', async () => {
 const ctx = setup(), {pending} = await sent(ctx); complete(ctx); assert.equal((await pending).ok, true);
 const before = ctx.workflow.snapshot();
 for (const mutate of [p => {p.source.hash = 'wrong';}, p => {p.axes.x.step = -1;}]) {
  const invalid = structuredClone(before.plan); mutate(invalid);
  assert.equal(await ctx.workflow.saveReview(invalid), false);
  assert.deepEqual(ctx.workflow.snapshot(), before);
 }
});
await test('legacy completed quality-blocked drafts recover without hiding critical relationships', async () => {
 const src = {...source, width:400, height:300}, p = plan(src), ctx = setup();
 p.source.plotBox = {x:40,y:20,w:320,h:240};
 p.annotations = [{id:'guide',text:'',kind:'guide',x:.5,y:.5,to:{x:0,y:0},coordinateSpace:'normalized',orientation:'horizontal'}];
 ctx.records.set('draft', {snapshot:{schema:GRAPH_JOB_SCHEMA,id:1,status:'complete',source:src,attachment:{data:png},selection,
  plan:p,blocked:true,finalAttemptSucceeded:false,review:[]}});
 const recovered = await ctx.workflow.recover();
 assert.equal(recovered.blocked, false); assert.equal(recovered.finalAttemptSucceeded, true);
 assert.equal(recovered.quality.status, 'fail');
 assert(recovered.review.some(r => r.path === 'annotations.0.to'));
 assert.equal(ctx.calls.length, 0);
});
fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ runtime: process.version, invocation: `${process.execPath} tests/test-graph-reconstruction-workflow.mjs`, mockProviderOnly: true, results }, null, 2));
for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? '\n' + result.error : ''}`);
console.log(`${results.filter(r => r.pass).length}/${results.length} passed; no paid provider calls`);
if (results.some(result => !result.pass)) process.exitCode = 1;
