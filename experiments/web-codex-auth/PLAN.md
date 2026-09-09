# Local authenticated editor experiment

No update_plan tool is exposed; this file tracks execution. Stable source and original19382 remain unchanged. No commit, push or remote deployment.

- Completed: isolated browser-session ChatGPT authentication, real login/logout and synthetic lifecycle/isolation checks.
- Completed: authenticated gateway19385, editor entry and account screen.
- Completed: authenticated image-generation jobs with pinned gpt-5.6-sol/medium/priority; first raw PNG, no automatic review/retry/correction.
- Completed: in-editor dialog, optional reference upload, recent-result recovery, rawPNG download link, byte-preserving insertion at worldorigin(0,0).
- Completed:14 synthetic boundary/integration tests and467 product tests; syntax checks without installing previously declined LSP.
- Completed: one authorized actual text-only image generation; firstPNG593171bytes; real insertion, mouse movement, width edit, undo/redo and PNGbyte equality.
- Completed: found and fixed off-center insertion, then reused the original server result to verify correct centered placement without another generation.
- Superseded: custom generation modal and its visual approvals; user requires the original AI workspace UI.
- Completed: original AI workspace connected through authenticated browser transport; replacement modal interception removed.
- Completed: original UI upload, generation result, rectangular comment, scoped edit confirmation/candidate/apply/versioning, persistence and centered canvas insertion verified with synthetic transport and existing real PNG.
- Completed: live19385 reauthenticated with existing account; original workbench opened, existing user workspace tabs/results restored, real model list and AI-ready status observed.

Limits outside this verification: remote hosting, real reference-image conversion, generative revision, long-term sessions across server restarts. Current editor treats generated PNG as an image object, not editable vector parts. Further assistant generation tests require a new explicitly authorized scope; this verification used one generation request.

## Background policy request
- Completed: outer-only transparency default and white-original choice added to existing output UI; raw PNG remains intact.
- Completed:21 experiment tests, real flask pixel comparison, browser toggle/save/insert/undo, three viewport captures and visual QA.

## Three background options
- Completed: exact requested labels and order; new all-white removal mode, outer remains default.
- Completed: separate mode caches; original PNG retained;22 experiment tests pass; browser all/white/outer switching verified on flask.
- Completed: fresh visual A/B reviews PASS for all nine mode/viewport captures.

## Comment movement / output controls / scoped status
- Completed: existing comment dragging, removal of standalone PNG save, original-preserving line thickness, and visible scoped generation/errors.
- Completed: browser drag and reload persistence, thickness change/restoration, scoped candidate/validation/cancel/failure QA; 35 tests pass; dual visual review PASS. Actual user tab reloaded and recovered.

## Clear review / multi-result comparison / selected canvas reference
- Completed: before/after review with optional details, responsive auto-fit.
- Completed: latest-default results, multi-version grid, selected canvas reference with deduplication.
- Completed:44 tests and browser multi/single selection, canvas reference/reopen dedup, candidate details and responsive review; final visual reports in evidence/compare-reference.

## Mac cut clipboard
- Completed: Cmd/Ctrl+X and native clipboard event routing, write-before-delete, shared editable clipboard module.
- Completed: browser image and rectangle cuts, other-page editable paste, AI reference and objectify paste, Cmd+Z restoration;52 tests pass.

## Repeated logout
- Completed: fixed cookie30minute absolute expiry to renew with valid session requests; editor navigation forwards renewal too.
- Completed: failing-first gateway regression,52 passing tests, live19385 HTTP same-session renewal200 confirmed. Auth/gateway restarted with fix. Existing expired browser session requires login once.

## 2026-09-09: browser login without device-code entry
- Completed: session login now requests managed ChatGPT browser auth; validates the returned HTTPS OpenAI URL before exposing it.
- Completed: login click opens authentication in a new tab; a visible link handles blocked popups. Existing polling returns the original tab to the editor after successful authentication.
- Verified: 55 tests pass, including browser-auth completion, cancellation and rejected URL boundaries; client/session syntax checks pass. Existing module-type warning remains.
- Manual QA: clicked actual 19385 login button, selected the existing account, continued personal workspace consent, observed local success page and original editor displaying ChatGPT connected. No device code was entered. Closed the completed authentication tab.
- Current editor displays the existing work-recovery dialog; left the user's recovery choice untouched.
- Auth process restarted using updated source (exec session 93593); gateway remains session 51926. Server restart still clears ephemeral sessions.

## Live usage verification, 2026-09-09
- In progress: actual reference-image conversion, output background/stroke settings, canvas insertion and scoped AI edit.
- Pending: comparison, clipboard/page movement and reload recovery; fresh evidence review.
- Observed boundary: empty original workbench disables generation even with chat draft text. Chat-only transport is explicitly unsupported; current validation uses a reference-image conversion.
- Completed live validation: actual reference conversion and actual scoped circle-to-square edit; background/thickness, two-version comparison, canvas insertion/drag, Cmd+X/V across pages and into AI reference, reload recovery, comment movement.
- Found/fixed off-viewport clipboard paste target; failing-first regression,56 tests green, real repeat centered on page5.
- Desktop visual reviewer live_usage_visual PASS including fresh paste-fixed.jpg. Report: evidence/live-usage/report.md.
- No pending live-validation steps from the above list; limits explicitly recorded. Current gateway exec session72458, auth93593.
