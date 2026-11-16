export const AI_WORKFLOW_KINDS = Object.freeze(['image', 'image-create', 'graph', 'graph-create']);
export const isGraphWorkflow = kind => kind === 'graph' || kind === 'graph-create';
export const isCreationWorkflow = kind => kind === 'image-create' || kind === 'graph-create';
export function normalizeAIWorkflowKind(kind, brief = false) {
  if (kind === 'image' && brief) return 'image-create';
  return AI_WORKFLOW_KINDS.includes(kind) ? kind : 'image';
}
