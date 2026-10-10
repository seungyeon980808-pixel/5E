import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolveAIModelSelection } from '../js/ai-model-capabilities.js';

// Execute the modal's actual model-loading and busy-state handlers against a
// small DOM/transport substitute. No provider call or browser is needed.
const source = readFileSync(new URL('../js/graph/reconstruction-modal.js', import.meta.url), 'utf8');
const loader = source.slice(source.indexOf('async function readModels()'), source.indexOf('function renderAttemptHistory('));
const busyHandler = source.slice(source.indexOf('function setBusy('), source.indexOf('function renderPreview('));
assert(source.includes("import { GRAPH_WORKBENCH_SELECTION } from './workbench-result.js?v=1.7.0-four-session-integration'"));
assert(!source.includes("byId('model').onchange")); assert(!source.includes("byId('effort').onchange"));
const selection = Object.freeze({ model: 'gpt-6.1-sol', effort: 'medium', serviceTier: null });
const entry = (model, efforts, isDefault = false) => ({ model, supportedReasoningEfforts: efforts, serviceTiers: [], defaultReasoningEffort: efforts.at(-1), isDefault });

async function load(catalog, hasTransport = true) {
  const fields = Object.fromEntries(['model','effort','history','cancel','close','insert','edit','analyze','reanalyze'].map(id => [id, { disabled: false, replaceChildren(...children) { this.children = children; }, querySelectorAll() { return []; } }]));
  const context = vm.createContext({
    GRAPH_WORKBENCH_SELECTION: selection, resolveAIModelSelection,
    bridge: hasTransport ? { models: async () => catalog } : null,
    document: { createElement: () => ({}) }, byId: id => fields[id],
    overlay: { querySelectorAll: () => Object.values(fields), querySelector: () => null },
    workflow: null, plan: null, source: {}, busy: false, selection: null, catalog: null,
    fallbackBlocked: () => false, message(text) { context.messageText = text; },
  });
  vm.runInContext(busyHandler + '\n' + loader, context);
  await context.readModels();
  // Returning to idle must not re-enable the fixed model controls.
  context.setBusy(true); context.setBusy(false);
  assert(fields.model.disabled); assert(fields.effort.disabled);
  assert.equal(fields.model.value, selection.model); assert.equal(fields.effort.value, 'medium');
  assert.equal(fields.model.children.length, 1); assert.equal(fields.model.children[0].textContent, 'Sol 6.1');
  return { fields, context };
}

const ready = await load([entry('gpt-6-astra', ['high'], true), entry(selection.model, ['medium', 'high'])]);
assert.deepEqual(ready.context.selection, selection);
assert.equal(ready.fields.analyze.disabled, false);
for (const catalog of [[entry('gpt-6-astra', ['high'], true)], [entry(selection.model, ['high'])]]) {
  const unavailable = await load(catalog);
  assert.equal(unavailable.context.selection, null);
  assert(unavailable.fields.analyze.disabled); assert(unavailable.fields.reanalyze.disabled);
  assert.match(unavailable.context.messageText, /사용할 수 없습니다/);
}
const disconnected = await load([], false);
assert.equal(disconnected.context.selection, null); assert(disconnected.fields.analyze.disabled);
assert.match(disconnected.context.messageText, /AI 연결/);
console.log('PASS standalone graph modal fixes Sol 6.1 medium, remains locked at idle and blocks unavailable selections');
