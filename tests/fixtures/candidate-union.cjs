const fs = require('node:fs');
const { createHash } = require('node:crypto');
// Node 24 synchronous ESM loading is fixture-only. Use the actual pure builder;
// its application dependencies retain their canonical queries; no store is injected.
const { buildWorkbenchGraph, validateWorkbenchGraph } = require('../../js/graph/workbench-result.js');
const sourcePixels = fs.readFileSync(require.resolve('./rights-clear-smoke.png'));
const graphPlan = structuredClone(require('./graph-reconstruction/linear.json'));
const width = sourcePixels.readUInt32BE(16), height = sourcePixels.readUInt32BE(20);
graphPlan.source = { id: 'source-9', hash: createHash('sha256').update(sourcePixels).digest('hex'), width, height,
  plotBox: { x: .1 * width, y: .2 * height, w: .7 * width, h: .6 * height } };
graphPlan.series[0].curveStyle = 'smooth';
graphPlan.series[0].analyticFitFailure = 'Retain incomplete analytic reconstruction';
graphPlan.review.push({ path: 'series.0', reason: 'Retain source review obligation' });
const nativeGraph = buildWorkbenchGraph(graphPlan, graphPlan.source);
const fixtureIds = ['plane-4', 'curve-5'];
nativeGraph.objects.forEach((object, index) => {
  object.id = fixtureIds[index]; object.groupId = 'graph-8'; object.layerId = 'source-layer';
  if (object.type === 'funcgraph') object.planeId = fixtureIds[0];
});
nativeGraph.groups = [{ id: 'graph-8', memberIds: fixtureIds }];
nativeGraph.version = 1; // Retained sentinel; the native schema controls validation.
validateWorkbenchGraph(nativeGraph);

function mixedCandidateTemplate(data, graphResult) {
  return {
    id: 'mixed-revision-17', name: 'Mixed native revision', data, kind: 'generated',
    sourceKind: 'pdf', source: { documentId: 'source-doc-7', pageNumber: 3, rect: [.1, .2, .6, .5], lineage: { crop: 'crop-9' } },
    referenceRole: 'input', primary: true, active: true, stale: false, superseded: false,
    createdAt: 123, updatedAt: 456, sentConversationId: 'conversation-3', sentSource: 'source-9',
    sceneSource: '{"source":7}', sceneCompileSource: '{"compiled":9}', sceneResult: { objects: [{ id: 'native-scene-4' }] },
    engine: 'native', postprocessOk: true, workspaceBatch: { jobId: 'batch-4', owner: { taskId: 'task-mixed' } },
    pixelInspection: { opaque: true, strictlyAchromatic: true, width: 512, height: 384 },
    pixelInspectionError: null, separatedAssetsError: '', reviewState: 'needs-attention',
    reviewReport: { verdict: 'uncertain', issues: [{ message: 'Retain review', evidence: { label: 'label-9' } }] },
    reviewMeta: { source: 'review-8', checks: [{ id: 'shape', detail: { revision: 7 } }] },
    structureRecord: { objects: [{ id: 'source-object-4', relationships: ['native-scene-4'] }] },
    rendererPrompt: 'preserve source geometry',
    labelPlan: { version: 1, labels: [{ id: 'label-9', text: 'm_B', typography: { role: 'quantity', scriptStyles: [{ start: 2, end: 3, kind: 'sub', role: 'name' }] } }] },
    imageLabelWorkflow: { version: 1, imageKind: 'general', labels: true, leaders: true },
    sourceLabelPlan: { version: 1, frozen: true, labels: [{ id: 'label-9', text: 'm_B', sourceRef: 1 }], sourceBindings: [{ sourceRef: 1, sourceSha256: 'a'.repeat(64) }] },
    editableDraft: { status: 'needs-review', annotationDrafts: [{ id: 'draft-6', before: { x: .2 }, after: { x: .3 } }] },
    targetPlacement: { version: 1, candidateSha256: 'b'.repeat(64), planSha256: 'c'.repeat(64), labels: [{ id: 'label-9', targetIdentity: { sourceObjectId: 'source-object-4' }, position: { x: .3, y: .4 } }] },
    workflowMetrics: { generationHarness: { id: 'harness-5', key: 'request-7', promptSha256: 'd'.repeat(64) }, observationMs: 71 },
    scopedEditHistory: [{ parentCandidateId: 'prior-revision-2', createdAt: 89, comments: [{ id: 'old-comment', geometry: { x: 4 } }] }],
    scopedPrecisionVerification: { outsidePixelsEqual: true, delta: { changed: 13 } },
    removalReport: { retained: ['label-2'], removed: [{ id: 'label-9', ownership: 'confirmed' }] },
    sourceSha256: 'a'.repeat(64), candidateSha256: 'b'.repeat(64), planSha256: 'c'.repeat(64),
    sourceFrame: { id: 'source-9', name: 'Crop 3', width: 512, height: 384 }, candidateFrame: { width: 512, height: 384 },
    finalLabelComposite: 'data:image/png;base64,AQID',
    graphResult,
    graphEdit: { parentCandidateId: 'graph-parent-3', createdAt: 987, revision: { id: 'native-7', comparison: { wipePosition: .31 } } },
    sourceReferenceId: 'source-9', sourceReferenceName: 'Original crop',
    generationMode: 'single', markPolicy: { arrows: 'keep', trendLines: 'remove', leaders: 'keep' },
    nextCommentNumber: 8, comments: [{ id: 'comment-7', number: 7, imageId: 'mixed-revision-17', type: 'point', x: 31, y: 41, text: 'Check this', review: { state: 'open', provenance: ['source-doc-7'] } }],
  };
}

// Browser fixtures serialize this function into the page. Embed only the trusted,
// builder-produced data so each call is independent and needs no Node/browser globals.
const mixedCandidate = new Function(`return function mixedCandidate(data) {
  return (${mixedCandidateTemplate.toString()})(data, ${JSON.stringify(nativeGraph)});
}`)();

function assertCandidateUnion(assert, actual, expected) {
  for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `candidate union field ${key}`);
}

module.exports = { mixedCandidate, assertCandidateUnion };
