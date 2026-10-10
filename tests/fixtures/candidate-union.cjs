function mixedCandidate(data) {
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
    graphResult: { version: 1, source: { id: 'source-9', plotBox: { x: .1, y: .2, w: .7, h: .6 } }, objects: [{ id: 'plane-4', type: 'coordplane', groupId: 'graph-8' }, { id: 'curve-5', type: 'funcgraph', planeId: 'plane-4', points: [{ x: 1, y: 2 }] }] },
    graphEdit: { parentCandidateId: 'graph-parent-3', createdAt: 987, revision: { id: 'native-7', comparison: { wipePosition: .31 } } },
    sourceReferenceId: 'source-9', sourceReferenceName: 'Original crop',
    generationMode: 'single', markPolicy: { arrows: 'keep', trendLines: 'remove', leaders: 'keep' },
    nextCommentNumber: 8, comments: [{ id: 'comment-7', number: 7, imageId: 'mixed-revision-17', type: 'point', x: 31, y: 41, text: 'Check this', review: { state: 'open', provenance: ['source-doc-7'] } }],
  };
}

function assertCandidateUnion(assert, actual, expected) {
  for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `candidate union field ${key}`);
}

module.exports = { mixedCandidate, assertCandidateUnion };
