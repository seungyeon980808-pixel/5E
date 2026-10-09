# Memo shared workspace surface

Mode: Operate. Scope: ordinary shared-service extension of the approved night desktop; no new design, seed, detector or polish pass. `PRODUCT.md` owns product intent, `README.md` owns setup status, `DESIGN.md` owns visual tokens, and `.impeccable/design.json` extends that system. Artifact sources are `index.html`, `style.css`, `app.js` and `cloud.js` in this directory.

## Direction and provenance

THESIS: A low, wide quick-memo tool surrounded by freely placed editable sticky notes on a quiet night-colored desktop.

OWN-WORLD: Night indigo and violet, pale lavender controls, compact Pretendard typography, and flat dark paper in muted lilac, amber, slate and rose. Faint stationary radial color pools provide atmosphere. Preserve the rejected tall mobile-style card as an anti-reference.

STORY: Paste and save with an optional title; copy or pin recent notes, add and edit paper, and arrange it on desktop. Shared records replace the prototype's local-only board persistence. Browser storage retains draft text and pending changes for failure recovery. The implemented Google owner archive distinguishes signed-out, non-owner and owner states. Actual Google/Supabase credentials remain unconnected.

FIRST VIEWPORT: Preserve the 600px desktop memo and 212px paper width, with content-driven memo height. Production starts empty, without fabricated server notes; populated screenshots are isolated test fixtures. Below 1200px use the existing two-column editable board; at max-width 560px use one column. Phone composer and sticky inputs are 16px to avoid Safari zoom. Account, archive and connection/retry additions reuse existing colors and controls.

FORM: Preserve seed 661c54bf, grounded candidate 6, and the user-pinned “night desktop”. The incumbent prototype retains its original direction contract and candidate/challenger rationale locally; this file records their seed and approved design decisions without publishing machine-specific provenance paths. These are historical provenance, not current service-state specifications. No new selection or replacement world.

SIGNATURE: Directly editable paper with 3px corners, restrained tilt, normalized positions and persistent stacking around a compact memo. Focus outlines preserve layer order. Shared persistence now travels through the Workers/D1 connection; local pending edits do not imply a saved server record.

## Comparison evidence and limits

The six supplied captures in `../_work/memo-review/` are `desktop.png`, `mobile.png`, `owner-archive.png`, `webkit.png`, `draft-preserved.png` and `retry-failed.png`. This documentation pass inspected their pixels and compared source with the incumbent; it did not open a browser or rerun integration tests. The browser test source uses an isolated workerd/D1 engine with signed Google test identity. Its captures are not evidence of live Google or Cloudflare production access.

Current source retains newer composer text when an earlier save resolves and preserves connection error/retry when refresh fails (the supplied review's F1/F2 scenarios). The supplied reports describe successful local checks; this pass makes no independent runtime-success claim and no final score. Documentation-only checks and captured source hashes are in `../.omo/evidence/memo-documentation/validation.json`.

Uncanonized pre-existing drift: the approximate 400px direction height and reported 445px populated-prototype height are not fixed layout rules; inherited sidecar specimens are excerpts rather than full responsive screen replicas. PRODUCT.md lacks the current Impeccable schema stamp; migration belongs to `init` and is outside this assignment.
