# Task 4 — AI workbench cleanup

## 1. Goal and files

The AI workbench now clears tasks through a counted confirmation, waits for a real cancellation acknowledgement, retains failed or unacknowledged tasks, edits and deletes image comments inline, keeps comparison controls available through generation, hides deferred output choices without removing their capability, and inserts separated raster outputs as independent objects.

Production files changed by Task 4:

- `js/ai-task-workspaces.js`
- `js/ai-editable-assets.js`
- `js/ai-editable-assets-dialog.js`
- `js/ai-image-comments.js`
- `js/ai-panel.js`
- `index.html` (AI workbench markup only; released to Task 7 after validation)
- `css/ai-panel.css`

Focused tests and QA driver:

- `tests/test-ai-workbench-cleanup.mjs`
- `tests/test-ai-comment-controller.mjs`
- `tests/test-ai-editable-assets.mjs`
- `tests/test-ai-separated-assets.mjs`
- `tests/test-ai-separated-product-flow.mjs`
- `tests/test-ai-workbench-ui.mjs`
- `tests/manual-ai-workbench-qa.mjs`

## 2. PIN and RED

PIN preserved the prior cancellation, comment geometry, comparison, task persistence, source-byte, and separated-asset behavior before production edits. The existing suite also documented the old singleton auto-group seam so its requested contract change was explicit.

RED was demonstrated by `tests/test-ai-workbench-cleanup.mjs`: the requested `clearTaskWorkspaces` and `createUngroupedSplitOutputs` exports did not exist. The new cases pin counted confirmation order, cancellation rejection retention, failed-task retention, source-byte immutability, independent unique split IDs, and rejection of a misleading duplicate ID factory.

## 3. Constraints and coordination

- Preserved Task 3's `openPdfReferencePicker` and `createUnifiedAiSourceConsumer` seams in `js/ai-panel.js`.
- Did not edit `main.js`, editor rendering, PDF, unified-library runtime, or shared application behavior.
- Released `index.html` and shared `css/style.css` ownership to Task 7 after the full AI suite passed; Task 4 made no later edits there.
- Published the split contract to Task 5: ordered cloned outputs, unique `objectId`, `groupId: null`, no group record, and no source mutation. Explicit `groupMode: 'single'` remains available for contexts that request grouping.
- No paid AI call, install, deployment, commit, or push was performed.

## 4. Automated verification

`node --test tests/test-ai-*.mjs` passed **504/504** with zero failures. The complete transcript is `automated-tests.txt` in this evidence folder.

Additional checks passed:

- The actual independent insertion path requires every inserted image and label to own an explicit `groupId: null`; the focused split suite passed **51/51** after this production-path assertion was added (`explicit-null-focused-tests.txt`). Explicit `groupMode: 'single'` continues to assign its string group ID.
- Syntax checks for the changed AI model/controller modules.
- `git diff --check`.
- Source contract assertions for the exact `AI 이미지 변환` label, one logic-owned control per role, hidden deferred controls, removed global comment editor, comparison availability, and reduced-motion behavior.

## 5. Manual real-UI verification

A real Chromium session loaded the workbench from the owned port 19612. `tests/manual-ai-workbench-qa.mjs` supplied a deterministic local desktop transport and tiny local PNGs, so no paid generation was used.

Verified scenarios:

- Three independent source tasks display and the clear dialog confirms `3개 작업`.
- Confirmed clear removes all eligible tasks and leaves the workspace empty and ready for a new task.
- Before the first result, compare is disabled with a reason.
- During deterministic generation, original and compare controls remain visible and enabled.
- After the first result, compare becomes enabled and the result remains available.
- A point comment is edited and deleted in its single inline row; no duplicate global editor exists.
- Asset/full-label and complete-output choices remain hidden while their DOM/runtime capability remains intact.
- Wide, narrow, and reduced-motion layouts render without script errors. Reduced-motion uses the existing 0 ms disclosure transition.

Artifacts:

- `browser/manual-qa.json`
- `browser/wide.png`
- `browser/narrow.png`
- `browser/reduced-motion.png`

## 6. Adversarial coverage

- **Malformed/misleading:** duplicate split IDs are rejected before insertion.
- **Stale:** the existing AI suite confirms stale and late cancelled image events cannot register results.
- **Cancel:** only `{ acknowledged: true }` permits deletion; rejection, exception, or a misleading non-ack response retains the task.
- **Dirty/shared:** scoped diffs and serialized markup handoff preserved concurrent owners' work.
- **Long:** task clearing is sequential and awaits each running cancellation; comment text remains an inline textarea rather than a truncated secondary editor.
- **Flaky:** failed tasks remain visible for retry/recovery and are excluded from deletion.
- **Interruption:** restored provider work and cancelled late decode paths remain covered by the full suite.

Explicit skip: no production provider was invoked because deterministic transport covered the same UI lifecycle without a paid or externally variable generation. Native desktop fullscreen and editor selection are owned and verified by Tasks 7 and 5 respectively.

## 7. Cleanup receipt

- QA server: port 19612, owned process stopped after capture.
- Port 19613: reserved/check-only; no server created.
- Browser: Playwright contexts and browser closed by the successful QA run.
- Temporary inputs: generated in the process temporary directory and removed with process cleanup.
- Existing shared ports/profiles 19515, 19518, 19554, and 19555 were not touched.
- No commit was created; root verification remains the commit gate.
