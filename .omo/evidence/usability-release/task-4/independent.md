# Task 4 independent verification — CONFIRMED

## Bound source

- Repository: `/Users/parkseungyeon/Documents/Codex/2026-09-06/x20/5E-usability-release`
- HEAD: `c4675b5aa928521f479babe72bb0af44877dc7ac`
- The worktree was already dirty and shared. No product source, test, plan, ledger, or producer artifact was edited.
- SHA-256 hashes were captured for the AI source/test surface before verification and checked again after automated, adversarial, and browser runs. Every hash remained unchanged.

## Five-phase gate

1. **Plan/report inspection:** Task 4's plan and producer report were read. Producer browser artifacts are valid PNGs and postdate the Task 4 source files.
2. **Automated suite:** fresh `node --test tests/test-ai-*.mjs` passed **504/504**, 0 failed, 0 skipped, in 2.47 seconds.
3. **Adversarial model exercise:** a mixed running / queued-cancel-rejected / failed / completed clear produced `removedIds=[run,done]`, `retainedIds=[reject,failed]`; confirmation was first, cancellation acknowledgement preceded removal, rejected cancellation and failure stayed present, and the original source SHA-256 remained `7ea646958715ed687aa9ac2f5d785feb1a93411f4f25fdd6c7fcc6ab07fdf0e3`.
4. **Fresh real UI:** a new Playwright profile loaded normal HTTP on owned port 19630 with deterministic local transport and no paid AI. Wide (1280x820), narrow (375x812), and reduced-motion (768x900) captures had correct PNG signatures/dimensions and were directly inspected. Deferred 5E asset/full-label controls were hidden but present; line-art defaults remained; background/color/stroke dropdowns persisted across reload; first-result compare had a reason; original/compare remained visible while generating; the prior result survived reload; one inline comment row edited/deleted; normal motion was 200 ms and reduced motion was 0 ms. Layout was usable at all three viewports with no observed CJK orphaning or clipping.
5. **Cleanup:** Playwright contexts/browser closed; the owned port-19630 server was stopped; temporary screenshots stayed in `/tmp`; protected ports 19515/19518/19554/19555 were untouched. Port 19631 was not opened.

## Confirmed behavior

- Counted clear-all confirmation, acknowledged cancellation-before-delete, cancel-failure retention, failed-task retention, source-byte/hash preservation, and no recreated task after confirmed clear.
- Renamed `AI 이미지 변환` UI, compact workbench, hidden deferred choices with capability preserved, line-art defaults, and top output-processing dropdowns.
- Original/compare visibility during generation, disabled pre-first-result compare reason, prior result persistence, and reduced-motion behavior.
- One inline editable/deletable comment row with no duplicate global editor.
- Split IDs are unique, no automatic group record is created, and explicit `groupMode: 'single'` still creates and assigns one group.

## Resolved blocker re-verification

The prior explicit-null blocker is resolved. `insertEditableAssets` now builds the shared object fields with `groupId` unconditionally. A fresh direct actual-insertion exercise created two independent images and one native label with unique IDs; every object had `Object.hasOwn(object, "groupId") === true` and `object.groupId === null`, with zero group records. The same exercise used `groupMode: 'single'` and confirmed all three objects retained the same string group ID and the group record contained all three members. The focused test now asserts both own-property presence and exact null.

Fresh verification after the repair:

- `node --test tests/test-ai-editable-assets.mjs tests/test-ai-separated-assets.mjs tests/test-ai-separated-product-flow.mjs tests/test-ai-workbench-cleanup.mjs`: producer transcript confirms **51/51**.
- Independent `node --test tests/test-ai-*.mjs`: **504/504**, 0 failed, 0 skipped, in 2.62 seconds.
- Pre/post repair-verification hashes remained `f4dda7be1c52f2c83c1c0e83de5c933168b19ef4ce7945925830e147e4309689` for `js/ai-editable-assets.js` and `e4de18e207374a73bcce78574fcefdf9728a163acfa270ce2cff787624a4b122` for `tests/test-ai-editable-assets.mjs`.

## Verdict

**CONFIRMED** — the repaired actual split-object data identity contract now meets the explicit-null requirement, and every previously confirmed Task 4 gate remains green.
