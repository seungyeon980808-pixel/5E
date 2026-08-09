# AI remote input fast path

`js/ai-remote-input-plan.js` is a storage/UI-independent planner for the
subscription-backed image-generation path. It never invokes a model or image
server.

## Integration sequence

1. Call `createRemoteImageInputPlan` with active reference cards, the current
   prompt, and the latest generated result.
2. Render each returned `visuals` descriptor:
   - `overview`: reuse the source transport image.
   - `crop`: crop `rect` percentages from `source`.
   - `contact-sheet`: compose `tiles` into the requested `columns`.
   `composeRemoteImageInputPlan` in `js/ai-remote-compositor.js` implements
   these steps. It accepts injected Canvas/image dependencies for testing and
   never writes text into a contact sheet.
3. Send only the rendered descriptors, in returned order. Defaults cap the
   remote request at four visual inputs.
4. Before generation, call `buildExactOutputCacheDescriptor` and
   `createExactOutputCacheKey`. Query IndexedDB or the desktop disk cache with
   that key. Large image data should not be placed in `localStorage`.
5. Cache only entries accepted by `createExactOutputCacheEntry`. Run
   `pruneExactOutputCacheEntries` after insert/access to enforce TTL, LRU count,
   and byte limits.

`js/ai-output-cache-store.js` supplies the complete async store layer. It uses
IndexedDB by default and also exports `MemoryOutputCacheBackend` for tests.
`ExactOutputCacheStore` serializes access, refuses failed/partial output, updates
LRU access time on hits, and removes expired or corrupt entries.

The exact key includes style version, output mode, normalized prompt, ordered
reference pixel hashes, all non-empty comments and regions, latest-result pixel
hash, model/effort/service tier, engine version, input-plan options, and output
options. Changing any of them invalidates the result. Pass
`primaryReferenceId` when the UI explicitly overrides the automatically chosen
primary source.

`pruneOutgoingAttachments` removes missing, explicitly stale, expired,
superseded-generated, and duplicate sources. Duplicate comments are merged
without mutating UI-owned cards.

## Measurement

The plan result contains local timing/count/byte metrics. Wrap crop and contact
sheet rendering with `measurePreparationStage` and append its measurement to
the existing AI performance record. A local synthetic benchmark is available:

```powershell
node tests/benchmark-ai-remote-input-plan.mjs
```

This benchmark does not call an image model and consumes no quota.
