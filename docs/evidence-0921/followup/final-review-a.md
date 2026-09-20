# Final independent visual gate A

## recommendation

**APPROVE (PASS)**

The five approved follow-ups are present in the current worktree and the regenerated evidence supports the intended user-visible outcomes in Chromium and WebKit. The two previously reported defects—WebKit library-card overlap and the duplicate mobile panel close control—are resolved.

Reviewed product commit: `09f9858877746aeaf2a1cf51a14d8fb83d7b026a`.

## blockers

None.

## originalIntent

Approve only these five bounded follow-ups without reopening the earlier repair scope:

1. `L8-library60batch`: mount the first 60 library results, append later results near the end, and preserve order, selection, DOM identity, scrolling, filtering, and keyboard traversal.
2. `U6-inspector-rightfixed/controlscanvasleft`: keep the inspector fixed to the right edge while resizing from its left boundary; keep canvas controls left of that boundary and keep the horizontal ruler visible.
3. `S2-timestamp-directsave`: invoke native Save As directly under user activation with a timestamp `.5e` suggestion; use the in-app filename prompt only for the download fallback.
4. `U7-ai-togglesheaderstable`: keep both AI panel toggles in the header and in the same positions through open/close transitions at desktop and mobile widths.
5. `M4-copy88px-orbit/copiedgreen`: make the copy button 88 px wide, animate its idle border, retain hover/focus/reduced-motion behavior, and stop in a green copied state.

## desiredOutcome

Users should see a stable editor and AI-panel header across 1440, 1024, 768, and 375 px; a right-anchored resizable inspector that does not cover canvas controls; a responsive library that does not mount thousands of cards initially or overlap card rows; a one-step native save flow with a timestamp name; and a compact, visibly interactive copy control with clear copied feedback.

## userOutcomeReview

### L8-library60batch — PASS

- The production implementation mounts 60 results, appends another batch near the scroll end, retains existing nodes, and materializes an off-DOM next card before keyboard focus moves to it (`preview/js/unified-library-ui.js`, `renderedResultCount` / `appendResultBatch` / `focusResultCard`).
- Both DOM artifacts record `mounted: 60` initially and `mounted: 80` after scrolling, with total `80개`, first-card selection preserved, and nonzero bottom scroll positions.
- The regenerated WebKit geometry has `cardBottom == rowBottom`, `labelBottom < rowBottom`, `thumbBottom < labelTop`, and positive ~200 px thumbnail height. This directly disproves the prior row-overlap failure. Chromium records the same relationships.
- The six full screenshots show intact cards and labels at initial/top/bottom states in both engines.

### U6-inspector-rightfixed/controlscanvasleft — PASS

- `layout-check.cjs` exercises both engines at 1440/1024/768/375, plus 150% UI zoom at 1440. Its assertions cover right-edge anchoring after resize, exact drag displacement, canvas controls staying left of the inspector, ruler height, and no document-width overflow.
- `layout.log` reports PASS with no page errors. The regenerated contact sheets and full editor screenshots show the right inspector anchored and the toolbar/canvas controls on the canvas side.
- At 375 px, the editor header shows only the intended left/right panel controls; the former duplicate internal close control is absent.

### S2-timestamp-directsave — PASS

- `saveProject` computes the timestamp first and calls the desktop bridge or `showSaveFilePicker` without awaiting an app prompt. The fallback prompt occurs only after native APIs are unavailable.
- Independently rerun `node --test desktop/preview-project-save.test.cjs`: 11/11 passed. This includes synchronous picker invocation under activation, timestamp format, native/desktop no-prompt behavior, cancellation, write failure, fallback download, and filename normalization.
- `native-results.log` records an active user gesture, zero name prompts, and `suggestedName: 20260921_0607.5e`. Chromium and WebKit fallback logs both record download-and-reopen PASS. The fallback screenshot shows the timestamp value and Safari download-location guidance.

### U7-ai-togglesheaderstable — PASS

- The layout suite asserts both toggle rectangles remain inside the AI header and return to the exact starting coordinates after each side transition.
- `layout-results.json` contains eight engine/width records with empty error arrays; toggle rectangles are stable and 32×32 at every width.
- All eight contact sheets and their full-size source captures show the toggles in the header at open, mid-transition, and settled states. The 375 px WebKit sheet shows one modal close button plus the two distinct panel toggles, without a duplicate internal panel-close control.

### M4-copy88px-orbit/copiedgreen — PASS

- `results.json` records 88 px copy width in both the 378 px desktop action row and 295 px mobile action row; the orbit angle changes from `16.26deg` to `38.805deg`; hover is `brightness(1.12)`; copied foreground/border are `rgb(63, 185, 80)`; reduced-motion and copied animation states are `none`; clipboard contents match the displayed URL; page errors are empty.
- Screenshots 09–15 show rest, moving orbit, hover, focus-visible, reduced motion, mobile copied, and mobile orbit states. The copied button is green and stationary, and the 375 px dialog fits the viewport.

## direct remove-ai-slops / programming pass

I inspected the production diff and tests directly under the required perspectives.

- No deletion-only or requested-removal-only tests were added.
- The browser checks assert observable behavior: mounted counts, retained DOM identity, unique IDs, preserved selection, keyboard traversal, geometry, user activation, clipboard value, animation state, and viewport bounds. These are not tautological projections of the implementation.
- The implementation reuses the existing render-card path and native file-picker API. It does not add a speculative abstraction or parser/normalizer for these follow-ups.
- The 60-card implementation adds one batch function and one scroll listener at the existing UI boundary. It does not replace the full result collection, so ordering/filter semantics remain owned by the existing result pipeline.
- The save test harness uses source slicing and contains a stale local `projectNames` declaration. That is brittle test plumbing, but it does not create false evidence for a stated criterion: the independent browser-native fixture also verifies synchronous activation and zero prompt count. NOTE only.
- `tests/library-followup-browser.cjs` is highly compressed and broad. Its assertions remain behavior-bearing, but maintainability is weak. NOTE only; no stated success criterion requires test formatting or module size.
- No explicit code-review report was found that records the same skill-perspective coverage. Per gate rules, this is not a blocker because the direct pass above and the referenced execution artifacts support completion.

## notes

- The AI contact fixture visibly shows `연결 실패: undefined` in some desktop AI captures after the test’s local status substitution. This is outside the approved toggle-placement criterion and is not evidence of toggle instability; record it as a fixture-quality note if these images are reused for broader product approval.
- The save fallback screenshot is an application prompt because WebKit/Safari lacks the native File System Access picker. The native-flow evidence is API instrumentation, not an OS-dialog screenshot, and the README correctly avoids claiming OS UI coverage.
- Static LSP output is absent because the prior runner rejected the external worktree path. I independently reran syntax checks for all changed production JS files, `git diff --check`, and the 11 save tests; all passed.

## checked artifact paths

- `docs/evidence-0921/followup/README.md`
- `docs/evidence-0921/followup/capture-manifest.json`
- `docs/evidence-0921/followup/layout-check.cjs`
- `docs/evidence-0921/followup/layout-results.json`
- `docs/evidence-0921/followup/layout.log`
- `docs/evidence-0921/followup/contact-{chromium,webkit}-{1440,1024,768,375}.png`
- `docs/evidence-0921/followup/{chromium,webkit}-*-{editor,editor-left-closed,editor-right-closed,resized,zoom150-resized,ai,ai-left-mid,ai-left-toggled,ai-right-mid,ai-right-toggled}.png`
- `docs/evidence-0921/followup/library-{chromium,webkit}-{initial60-top,appended80-bottom,appended80-top}.png`
- `docs/evidence-0921/followup/library-{chromium,webkit}-dom.json`
- `docs/evidence-0921/library/progressive-rendering.md`
- `docs/evidence-0921/save-direct/native-results.log`
- `docs/evidence-0921/save-direct/unit-results.log`
- `docs/evidence-0921/save/{chromium,webkit}-save.png`
- `docs/evidence-0921/followup/save.log`
- `docs/evidence-0921/share/09-copy-rest.png` through `15-mobile-orbit.png`
- `docs/evidence-0921/share/results.json`
- `docs/evidence-0921/share/copy-qa.md`
- `docs/evidence-0921/followup/share.log`
- Current `git diff` for the production and test files named by the five follow-ups.

## exact evidence gaps

- No external code-review report explicitly documents the remove-ai-slops/programming perspectives. Direct gate inspection supplies that coverage.
- No native OS Save As dialog image exists. The required direct-call behavior is evidenced by user-activation instrumentation and zero app-prompt count; OS chrome itself is not claimed.
- No LSP report exists for this external worktree. Syntax checks, browser execution, focused unit tests, and diff validation are present and green.
