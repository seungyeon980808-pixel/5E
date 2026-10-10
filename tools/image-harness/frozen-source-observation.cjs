// Analysis reuse for experiments. This stores observations, never image outputs
// or acceptance decisions. Rendering/review settings are not analysis inputs.
const { createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

function createAnalysisContext({ prompt, attachments, model, effort, serviceTier = null,
  workflow, sourcePolicyVersion, analysisImplementationSha256 }) {
  if (typeof prompt !== 'string' || !prompt.trim() || !Array.isArray(attachments)
    || !attachments.length || attachments.some(a => typeof a.name !== 'string'
      || typeof a.data !== 'string' || !a.data.startsWith('data:image/'))
    || typeof model !== 'string' || !model || typeof effort !== 'string' || !effort
    || !workflow?.version || !Number.isInteger(sourcePolicyVersion)
    || !/^[a-f0-9]{64}$/.test(analysisImplementationSha256 || '')) {
    throw new TypeError('Complete analysis inputs are required for reuse.');
  }
  return { version: 1, promptSha256: digest(prompt),
    attachments: attachments.map(a => ({ name: a.name, transportSha256: digest(a.data) })),
    model, effort, serviceTier, workflow: copy(workflow), sourcePolicyVersion,
    analysisImplementationSha256 };
}

function resolveFrozenObservation(record, context) {
  try {
    const observation = record?.observation;
    if (record?.version !== 1 || context?.version !== 1 || record.contextSha256 !== digest(JSON.stringify(context))
      || JSON.stringify(record.context) !== JSON.stringify(context)
      || record.observationSha256 !== digest(JSON.stringify(observation))
      || !observation?.plan?.frozen
      || observation.workflowVersion !== context.workflow.version
      || observation.plan.policyVersion !== context.sourcePolicyVersion
      || observation.sourceSha256 !== context.attachments[0].transportSha256
      || observation.planSha256 !== digest(JSON.stringify(observation.plan))
      || observation.plan.sourceBindings?.length !== context.attachments.length
      || observation.plan.sourceBindings.some((b, i) => b.transportSha256 !== context.attachments[i].transportSha256)) return null;
    return copy(observation);
  } catch { return null; }
}

function createFrozenObservationRecord(context, observation) {
  const record = { version: 1, context: copy(context), contextSha256: digest(JSON.stringify(context)),
    observation: copy(observation), observationSha256: digest(JSON.stringify(observation)) };
  if (!resolveFrozenObservation(record, context)) throw new TypeError('Observation does not match analysis inputs.');
  return record;
}

module.exports = { createAnalysisContext, createFrozenObservationRecord, resolveFrozenObservation };
