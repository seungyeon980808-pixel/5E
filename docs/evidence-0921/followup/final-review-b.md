# Final visual/CJK gate B

- recommendation: **APPROVE / PASS**
- blockers: **none**
- review mode: read-only independent visual and CJK gate; product source was not edited
- reviewed scope: the five approved follow-ups in `docs/evidence-0921/followup/README.md`
- reviewed product commit: `09f9858877746aeaf2a1cf51a14d8fb83d7b026a`

## Original intent

Verify that the refreshed follow-up build visibly and functionally completes:

1. **L8** progressive question rendering.
2. **U6** inspector/header placement.
3. **S2** direct save picker behavior.
4. **U7** AI panel toggles.
5. **M4** share-copy control.

The gate specifically had to reproduce the refreshed evidence after the earlier WebKit library-row overlap and duplicate mobile close-control fixes, and judge screenshot geometry, Korean/CJK rendering, clipping, and overlap rather than trusting JSON claims alone.

## Desired outcome

Across Chromium and WebKit at 1440/1024/768/375 widths, the editor and AI workspace should retain usable panel geometry; Korean UI text should remain legible without clipping or collisions; question cards should progressively append without overlap; direct-save and share-copy states should be visually coherent; and the mobile AI workspace should expose one clear close action plus distinct panel toggles.

## User outcome review

**PASS.** The rendered evidence satisfies the requested outcome. No observed defect violates L8, U6, S2, U7, or M4.

- **L8:** All six full library screenshots were opened at original resolution. Chromium and WebKit both show intact three-column card grids in initial, appended-top, and appended-bottom states. Thumbnails, Korean labels, checkboxes, rows, and the fixed bottom tray remain separated. The former WebKit row overlap is absent. `library-webkit-dom.json` also reports 60 initial and 80 appended nodes while preserving the first selection and DOM node, but this JSON was used only as corroboration.
- **U6:** All eight contact sheets were visually inspected. The editor header, horizontal ruler, canvas, left tools, and right inspector remain aligned from 1440 through 375 px in both engines. Collapsed-left and collapsed-right states leave the associated toggle accessible; the 150% captures retain a coherent header and inspector boundary.
- **S2:** Chromium, WebKit, and Safari save-state screenshots show a centered, unclipped Korean dialog with a visible filename field and separate cancel/save actions. The browser screenshots intentionally exercise the fallback dialog. `save-direct/native-results.log` supplies the complementary native-path evidence: active user gesture, timestamp suggestion, zero preliminary prompts, and PASS. The 11 focused save tests pass.
- **U7:** The full 375 px Chromium and WebKit AI captures show the base, left-open, left-toggled, right-open, and right-toggled states without horizontal text clipping. The main top-right close control appears once. The left/right panel controls are distinct, remain reachable, and no duplicate panel-internal close control is visible. Korean labels such as `작업 목록 패널 접기`, `수정 설정 패널 접기`, `작업별 선택 결과`, and the settings fields fit their surfaces.
- **M4:** Share screenshots 09–15 show rest, in-flight orbit, hover, keyboard focus, reduced motion, copied, and mobile orbit states. The compact copy button has stable geometry, its Korean labels (`복사`, `복사됨`) fit, the green copied state is legible, and the 375 px dialog stays within the viewport without action overlap.

## Visual and CJK findings

- No Korean glyph clipping, mojibake, broken line boxes, accidental mid-syllable wrapping, or control-label overlap was found in the reviewed screenshots.
- No library card, card label, checkbox, preview pane, inspector, toolbar control, share action, or save-dialog action visibly overlaps another interactive region.
- Chromium/WebKit differences are limited to native form-control rendering and do not change hierarchy or usability.
- The AI fixture header displays `연결 실패: undefined` in some desktop captures. This is a non-blocking fixture/status-copy note and is outside the five stated follow-up criteria; it does not affect geometry or CJK rendering.

## Direct remove-ai-slops / programming pass

The scoped production diff and focused tests were inspected directly.

- No deletion-only, tautological, or removal-verification tests were added. The library tests assert observable progressive behavior (60 to 80 nodes, selection and DOM retention, keyboard crossing of the batch boundary, no row overflow). Save tests assert observable picker timing, prompt suppression, write failure behavior, and bridge payloads.
- Geometry assertions do not merely mirror CSS constants: they compare rendered thumbnail/label/row boundaries and would fail on the previously observed overlap.
- No speculative parser, normalizer, adapter, or single-use production extraction was added for these five follow-ups. The timestamp filename helper is a small domain value with direct behavior coverage.
- The progressive renderer adds state only at the rendering boundary and uses the existing card creation path. The panel and share changes remain localized to their established modules.
- `git diff --check` and `node --check` for the four principal changed UI modules pass.
- No slop or programming finding creates maintenance burden or false confidence that violates a stated success criterion.

## Checked artifact paths

- Scope and claims: `docs/evidence-0921/followup/README.md`
- Eight visual contact sheets: `docs/evidence-0921/followup/contact-{chromium,webkit}-{1440,1024,768,375}.png`
- Mobile full states: `docs/evidence-0921/followup/{chromium,webkit}-375-ai*.png` and `docs/evidence-0921/followup/{chromium,webkit}-375-editor.png`
- Library visual states: `docs/evidence-0921/followup/library-{chromium,webkit}-{initial60-top,appended80-top,appended80-bottom}.png`
- Library corroboration: `docs/evidence-0921/followup/library-{chromium,webkit}-dom.json`, `real-library.json`
- Share visual states: `docs/evidence-0921/share/09-copy-rest.png` through `15-mobile-orbit.png`
- Share corroboration: `docs/evidence-0921/share/results.json`, `copy-qa.md`
- Save visual states: `docs/evidence-0921/save/chromium-save.png`, `webkit-save.png`, `docs/evidence-0921/safari-save.png`
- Direct-save corroboration: `docs/evidence-0921/save-direct/native-results.log`, `unit-results.log`, `README.md`
- Capture integrity: `docs/evidence-0921/followup/capture-manifest.json`
- Production/test diff: `preview/css/ai-sharing.css`, `preview/css/panel-visibility.css`, `preview/css/unified-library.css`, `preview/index.html`, `preview/js/ai-sharing-ui.js`, `preview/js/panel-visibility.js`, `preview/js/project-save-dialog.js`, `preview/js/unified-library-ui.js`, `desktop/preview-project-save.test.cjs`, `tests/library-followup-browser.cjs`

## Evidence gaps

- No separate prior code-review report or manual-QA matrix artifact was present under `docs/evidence-0921`; the README, focused logs/JSON, screenshots, and this direct independent pass provide the criterion coverage needed for this visual gate.
- The OS-native save panel itself is not captured. The evidence explicitly avoids claiming that it is; direct invocation is proven by the active-gesture fixture result and tests. This does not block S2 as documented.
- No exact pixel-reference mock is specified. The supplied defect images are problem descriptions, so this gate evaluates layout integrity, responsive behavior, and CJK precision rather than pixel identity.

## Blockers

None.
