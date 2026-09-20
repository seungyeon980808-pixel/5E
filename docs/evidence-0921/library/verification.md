# Library follow-up verification — 2026-09-21

## Changes
- `preview/js/library/provider.js`: shared compact exam names (questions, PDF file/page), chronological exam ordering before question number, remove provider's 500-result cap.
- `preview/js/exam-library.js`: respect requested PDF worker search limit (previously always 60). Shortcut edits in this file belong to the settings worker.
- `preview/js/unified-library-ui.js`: remove UI 60/500 retrieval caps, fit selected question instead of union of all questions on page, center short previews, add continuous PDF crop document integration and preserve accepted crops across pages.
- `preview/js/library/continuous-crop-pages.js`: lazy continuous pages, one original editable canvas, mixed page aspect ratios, serialized latest page activation, safe reset and pointer targeting.
- `preview/css/unified-library.css`: short question vertical centering and continuous crop page layout.

## Executed checks
`node tests/library-followup.mjs` PASS:
- Requested Korean labels; PDF page label.
- 620 image records remain accessible.
- 80 actual PDF question crop records, latest exam questions 1–20 followed by next exam 1–20.
- Selected question bounds exclude other questions on same page.
- Accepted crop store retains another page's crop.

`tests/library-followup-browser.cjs` PASS in Playwright Chromium AND WebKit, using real UI/provider modules and controlled four-exam PDF fixtures:
- PDF file view opens through Space hold; four continuous page slots.
- Scroll from page 1 to page 3.
- Draw and accept crop on pages 1 and 3, return to page 1: both crops retained.
- Fast scroll bottom then back while activation pending: correct page 2 active.
- Mixed page heights (page 2: 600×1000; others: 600×850).
- Question tab displays all 80 cards, including latest question 1, next exam at card 21, oldest question 20 at end.
- Short right preview top/bottom margins: Chromium 15.9375/15.921875 px; WebKit 15.921875/15.9375 px.
- Question expansion does not mount whole-file continuous pages. Selected question starts below viewport top and ends above bottom (Chromium 76/45 px margins; WebKit 77/44 px).
- No page JavaScript errors.

Screenshot: `continuous-crop.png`, inspected visually. Shows page 3 and crops from pages 1 and 3 together.

## Limits
These are controlled PDF render fixtures, not live Drive document/network tests. Fixture PDF materialization deliberately returns deterministic test pages; production materialization and normalized crop extraction paths are unchanged. Actual hosted corpus and deployment verification belong to integration QA. WebKit coverage is not a claim that native Safari was driven in this worker.

Run browser checks with a local static server and `PLAYWRIGHT_MODULE` pointing to installed Playwright; `LIBRARY_QA_ORIGIN` defaults to http://localhost:8766 and `LIBRARY_QA_BROWSER` defaults to chromium (or webkit).

## Integration check
Actual bundled/shared library data loaded 8,834 records without JS errors. Real 생명1 27년 6평 PDF opened in crop mode and scrolled to page 2 of 4 with zero JS errors. See real-pdf.json and real-pdf-page2.png.
