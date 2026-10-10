const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createAnalysisContext, createFrozenObservationRecord, resolveFrozenObservation } = require('./frozen-source-observation.cjs');
const digest = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const input = { prompt: 'Observe labels and geometry; retain uncertainties.',
    attachments: [{ name: 'science source', data: 'data:image/png;base64,c291cmNl' }],
    model: 'gpt-6.1-sol', effort: 'medium', serviceTier: null,
    workflow: { version: '1.0.0', imageKind: 'general', labelResult: 'restore-editable', scientificArrows: 'keep' },
    sourcePolicyVersion: 4, analysisImplementationSha256: digest('frozen implementation') };
  const context = createAnalysisContext(input);
  const plan = { frozen: true, policyVersion: 4, labels: [{ id: 'unknown', text: 'unreadable', scope: 'unknown' }],
    uncertainties: [{ reason: 'Do not invent the obscured charge.' }], rejectedCount: 1,
    geometryLock: { version: 1, objects: [{ id: 'particle', bounds: { x: .1, y: .2, w: .3, h: .4 } }] },
    sourceBindings: [{ transportSha256: context.attachments[0].transportSha256 }] };
  const observation = { workflowVersion: '1.0.0', sourceSha256: context.attachments[0].transportSha256,
    planSha256: digest(JSON.stringify(plan)), plan, localRestoreAttempted: true };
  return { input, context, observation, record: createFrozenObservationRecord(context, observation) };
}
test('reuse preserves the full observation and uncertainties without aliasing or acceptance', () => {
  const f = fixture(), resolved = resolveFrozenObservation(f.record, f.context);
  assert.deepEqual(resolved, f.observation); resolved.plan.uncertainties.length = 0;
  assert.equal(f.record.observation.plan.uncertainties.length, 1);
  assert.equal(resolved.accepted, undefined); assert.equal(resolved.data, undefined);
  assert.equal(resolved.localRestoreAttempted, true);
});
test('rendering and review variants reuse the same analysis when analysis inputs are identical', () => {
  const f = fixture();
  const other = createAnalysisContext({ ...f.input, renderingVariant: 'different flat gray', reviewVariant: 'different prose' });
  assert.deepEqual(other, f.context); assert.deepEqual(resolveFrozenObservation(f.record, other), f.observation);
});
for (const [name, change] of [
  ['prompt', f => ({ ...f.input, prompt: 'New ownership request' })],
  ['source', f => ({ ...f.input, attachments: [{ ...f.input.attachments[0], data: 'data:image/png;base64,bmV3' }] })],
  ['name', f => ({ ...f.input, attachments: [{ ...f.input.attachments[0], name: 'different reference role' }] })],
  ['model', f => ({ ...f.input, model: 'another-model' })],
  ['effort', f => ({ ...f.input, effort: 'low' })],
  ['tier', f => ({ ...f.input, serviceTier: 'priority' })],
  ['workflow', f => ({ ...f.input, workflow: { ...f.input.workflow, scientificArrows: 'remove' } })],
  ['policy', f => ({ ...f.input, sourcePolicyVersion: 5 })],
  ['implementation', f => ({ ...f.input, analysisImplementationSha256: digest('changed implementation') })],
]) test(`changed ${name} causes an analysis cache miss`, () => {
  const f = fixture(); assert.equal(resolveFrozenObservation(f.record, createAnalysisContext(change(f))), null);
});
test('tampered observations, stale versions and missing transport bindings cannot be reused', () => {
  const f = fixture();
  for (const change of [r => { r.observation.plan.uncertainties = []; }, r => { r.version = 0; },
    r => { r.observation.plan.sourceBindings = []; }, r => { r.observation.planSha256 = digest('different plan'); }]) {
    const r = structuredClone(f.record); change(r); assert.equal(resolveFrozenObservation(r, f.context), null);
    assert.deepEqual(resolveFrozenObservation(f.record, f.context), f.observation);
  }
});
test('unbound or incomplete inputs fail before a record can be created', () => {
  const f = fixture();
  assert.throws(() => createAnalysisContext({ ...f.input, prompt: '' }), TypeError);
  assert.throws(() => createAnalysisContext({ ...f.input, analysisImplementationSha256: '' }), TypeError);
  assert.throws(() => createFrozenObservationRecord(f.context, { ...f.observation, planSha256: 'wrong' }), TypeError);
});
