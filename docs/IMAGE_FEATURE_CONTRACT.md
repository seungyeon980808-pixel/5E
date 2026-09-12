# Image feature processing contract

This document fixes the option names, allowed values, defaults, and failure
behavior for the image-processing work on `codex/image-features`. It is a core
module contract, not a product UI specification. `js/ai-panel.js` remains owned
by the image UI/UX work.

## Shared invariants

- A requested change overrides preservation only where the request explicitly
  identifies the changed object, relation, or selected pixels.
- Unmentioned object count, connections, contacts, directions, relative
  placement, and source RGBA must be preserved.
- Scientific arrows that encode force, motion, flow, or direction are content.
  Decorative arrows are styling.
- An uncertain operation fails closed or returns a review-required result. It
  must not silently erase source pixels or claim exact semantic separation.
- Actual AI generation is outside this branch's validation. Tests use fixtures
  and mocks and must not increase the existing generation-call count.

## Prompt options (`buildImagePrompt`)

| option | allowed values | default | invalid/failure behavior |
|---|---|---|---|
| `operation` | `generate`, `transform`, `scoped-edit`, `separate` | `revision ? transform : generate` | unknown value falls back to the legacy default |
| `backgroundPolicy` | `white`, `transparent`, `preserve` | `white` for `generate`; `preserve` otherwise | unknown value uses the operation default |
| `arrowPolicy` | `scientific-only`, `preserve`, `none` | `scientific-only` | unknown value uses `scientific-only` |
| `preserve` | array of non-empty statements | built-in structural invariants | empty/invalid entries are ignored; built-in invariants remain |

Priority is: explicit user change > operation-specific instruction > explicit
preservation list > shared invariants > style rules. `transparent` must never
coexist with an instruction to render a white background. `scientific-only`
must preserve scientific arrows while forbidding decorative arrows.

## Background-removal options

The existing public paths remain distinct:

- `makeNearWhiteTransparent`: explicitly removes all qualifying near-white
  pixels, including enclosed pixels.
- `removeConnectedLightBackground`: removes only qualifying pixels connected
  to the outer frame and preserves enclosed whites and light grays.
- `removeEmbeddedCheckerboard`: removes a detected baked checkerboard, not a
  genuinely transparent frame.
- `transparentizeGeneratedImage`: defaults to edge-connected removal followed
  by optional exam-palette quantization.

`transparentizeGeneratedImage` gains:

| option | allowed values | default | invalid/failure behavior |
|---|---|---|---|
| `backgroundPolicy` | `connected`, `all-near-white`, `checkerboard`, `preserve` | `connected` | reject with `RangeError` |
| `preserveMask` | binary mask matching source dimensions, or absent | absent | reject malformed mask; protected pixels retain exact RGBA |
| `examPalette` | boolean | `false` | palette conversion runs only when explicitly enabled; preserve/change masks still apply |

Ambiguous light pixels stay preserved under `connected`. Callers that mean
"remove every white pixel" must explicitly choose `all-near-white`.

Background processing does not simplify colors by default. `preserve` with
omitted options keeps all source RGBA unchanged; an explicit `examPalette: true`
requests color conversion in addition to the selected background policy.
Callers must not enable palette conversion implicitly when the user requests
only background removal or original preservation.

## Separation options and review result

`prepareSeparatedAssets` gains:

| option | allowed values | default | invalid/failure behavior |
|---|---|---|---|
| `layout` | `auto`, `grid` | `auto` | reject with `RangeError` |
| `maxAssets` | integer `1..256`, or `null` | `null` | reject invalid values with `RangeError`; the effective limit is `min(maxAssets ?? 128, 128)` |
| `maxDurationMs` | finite number `0..8000` | `8000` | reject invalid values with `RangeError`; return the original fallback after the next cooperative deadline checkpoint |
| `signal` | `AbortSignal`, or absent | absent | reject malformed signals with `TypeError`; an aborted signal rejects with `AbortError` |

Each returned asset keeps exact source RGBA and reports source bounds and
assigned foreground-pixel count. The top-level result reports total,
assigned, and unassigned foreground pixels plus `reviewRequired` and
machine-readable `reviewReasons`. Pixel preservation is a verifiable fact;
semantic correctness is not. Ambiguous groupings remain available to the
existing manual-region path for correction.

Automatic layout uses 8-connected foreground components followed by one
conservative proximity pass over the original component bounds. It does not
derive object ownership from the 4×4 grid or row/column whitespace. Explicit
`grid` layout remains available for the legacy atlas workflow. Neither layout
claims semantic grouping or vectorization.

Successful analysis reports `stats.rgbaVerified: true`,
`stats.assignmentVerified: true`, and `stats.analysisCompleted: true`. A pixel,
region, decoder, or deadline limit returns a structured fallback with
`assets: []`, byte-identical `originalData`, `fallbackToOriginal: true`,
`manualCorrectionAvailable: true`, one reason in `reviewReasons`, and
`stats.rgbaVerified: false`, `stats.assignmentVerified: false`, and
`stats.analysisCompleted: false`. Limit fallback never exposes partial crops.
Current fallback reasons are `analysis-input-limit-exceeded`,
`analysis-decoder-limit-exceeded`, `analysis-time-limit-exceeded`, and
`region-limit-exceeded`.

The input ceiling is 16,000,000 pixels and the returned-region ceiling is 128.
The PNG codec also bounds both the actual filtered scanline payload and the
expanded RGBA buffer to 64 MiB before inflation or allocation. Standard `sBIT`
metadata from `@napi-rs/canvas` is validated, normalized to RGBA when an RGB
source gains an opaque alpha channel, and preserved without rescaling stored
pixel values.

The duration is a cooperative budget whose clock includes PNG decode and
encode time. Full-frame analysis and crop-verification loops yield and check
the signal/deadline. The browser compression streams and synchronous PNG
reconstruction do not expose a preemption hook, so cancellation or an 8-second
deadline can be observed only at the checkpoint immediately after that codec
operation returns. This may make wall-clock settlement exceed the requested
budget; no partial result is returned after the budget has expired.

## Scoped-edit contract

No new UI option is introduced. Candidate, selection mask, source identity,
dimensions, and application state are snapshotted. Applying fails closed when
any snapshot is stale, malformed, discarded, or already applied. Exact RGBA,
including hidden RGB under alpha zero, remains unchanged outside the mask.
Post-processing such as background removal or palette conversion must not run
over the full composited image.

## OCR experiment contract

The experiment module exposes:

| option | allowed values | default | invalid/failure behavior |
|---|---|---|---|
| `mode` | `off`, `suggest` | `off` | reject with `RangeError` |
| `language` | `kor`, `kor+eng` | `kor` | reject unsupported values |
| `preserveOriginal` | `true` only in this experiment | `true` | `false` is rejected |

OCR returns suggestions and evidence only. It never mutates
`js/image-objectify.js`, never auto-replaces text, and preserves the original
text image for unavailable engines, failures, or uncertain recognition.
Product enablement requires fixture accuracy acceptable to a human reviewer;
confidence numbers alone cannot enable replacement.

## UI handoff boundary

The UI owner may wire these public options and review metadata into
`js/ai-panel.js` and `js/image-objectify.js`. This branch will provide concrete
function signatures, fixtures, and isolated QA, but will not claim product UI
integration until those owner files are changed and verified separately.

### Concrete wiring contract

The UI owner should retain the current task/candidate identity before starting
any asynchronous operation and compare it again immediately before committing:

```js
{
  taskId,
  candidateId,
  epoch,
  selectionRevision,
  sourcePng,
}
```

The processing calls and state transitions are:

1. Prompt construction:

   ```js
   buildImagePrompt({
     request,
     qualityMode,
     revision,
     operation,          // generate | transform | scoped-edit | separate
     backgroundPolicy,   // white | transparent | preserve
     arrowPolicy,        // scientific-only | preserve | none
     preserve,
   })
   ```

   Do not append a second background or arrow instruction after this call.

2. Background processing:

   ```js
   processImageBackgroundPixels(rgba, width, height, {
     backgroundPolicy,   // connected | all-near-white | checkerboard | preserve
     preserveMask,
     changeMask,
     examPalette,
   })
   ```

   The existing UI labels map to `all-near-white`, `connected` (default), and
   `preserve`, respectively. Store the returned `source` bytes with the
   candidate so changing this option always reprocesses the original, not the
   previous result. Display `reviewRequired`, `reviewReasons`, and `reviewMask`;
   never silently apply review pixels. `changeMask` is mandatory when this runs
   after a scoped edit.

3. Automatic separation:

   ```js
   const prepared = await prepareSeparatedAssets(candidatePngDataUrl, {
     layout: "auto",
     maxAssets: null,
     maxDurationMs: 8000,
     signal: candidateAbortController.signal,
   });
   ```

   If `prepared.fallbackToOriginal` is true, keep `prepared.originalData` as the
   usable image and offer the manual correction path; do not treat this as an
   image-generation failure. Otherwise show each `asset`, `manualRegions`,
   `reviewReasons`, and the assigned versus unassigned foreground counts.
   `semanticGroupingVerified` remains `false`.
   The manual correction path passes edited `manualRegions` to
   `prepareEditableAssets`; final insertion uses:

   ```js
   insertEditableAssets(state, prepared, {
     isCurrent,
     aiTaskId: taskId,
     aiCandidateId: candidateId,
   });
   ```

   `isCurrent` must verify the active page and candidate both before and inside
   the atomic state update. One call inserts all groups and creates one undo
   snapshot.

4. Scoped edit lifecycle:

   ```js
   const session = await createScopedEditSession({
     taskId, candidateId, epoch, selectionRevision, sourcePng, rectangles,
   });
   confirmScopedEditSession(session, getCurrent);
   const proposal = await prepareScopedEditProposal(session, candidatePng, getCurrent);
   // explicit user decision:
   acceptScopedEditProposal(session, proposal, getCurrent);
   // or:
   discardScopedEditProposal(session, proposal);
   ```

   A task/candidate/epoch/selection/source mismatch, duplicate apply, or apply
   after discard is a stale-result error and must not mutate editor state.

5. OCR remains an experiment:

   ```js
   suggestImageText(crop, {
     mode: "off",        // only a future explicit UI action may use "suggest"
     language: "kor",
     preserveOriginal: true,
   }, {
     engine,
     signal,
     timeoutMs,
   });
   ```

   Future UI state may display `status`, `suggestions`, `error`,
   `reviewRequired`, and `elapsedMs`, but there is deliberately no apply or
   replace function. Every state retains the original crop and
   `replacementAllowed` is always `false`.

### Real-AI validation deferred by this branch

After product UI wiring, with an explicitly authorized active subscription
session and no automatic retry, a minimal live quality check would use six
image-generation calls:

1. two new diagrams (closed and open vessel assemblies);
2. two source transforms (transparent-background request and an edit that must
   preserve scientific arrows);
3. one separated-asset atlas;
4. one scoped-edit candidate crossing a protected boundary.

Those calls must compare object count, connections, contacts, directions,
relative placement, internal whites/grays, and semantic grouping against the
source. Unit tests and fixture QA do not establish those visual-quality facts.
No live call was made in this branch.
