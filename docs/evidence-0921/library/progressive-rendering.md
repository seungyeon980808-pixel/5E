# Progressive card rendering — 2026-09-21 follow-up

Changed `preview/js/unified-library-ui.js`, `preview/css/unified-library.css` and `tests/library-followup-browser.cjs`.

- Full provider inventory/order/count preserved; initially mount 60 result cards.
- Within 480px of scroll end, append up to 60 more cards using `list.append`; existing nodes remain intact.
- Existing thumbnail observer is reused for appended media. Search/filter/reset invalidate the epoch; old queued thumbnail/append callbacks cannot update the new list.
- Keyboard focus beyond rendered range appends the required batch before focusing.
- Search/filter resets mounted cards and scroll position; checkboxes are rebuilt from persistent selected IDs.

Executed browser suite in Chromium and WebKit against http://127.0.0.1:8767 with actual UI/provider modules and controlled PDF fixtures. Both PASS:
1. 80 total question results, only 60 initial DOM cards, displayed count 80.
2. Scroll mounts all 80 in correct order, same first DOM node survives, first checkbox remains checked, 80 unique IDs, scroll not reset.
3. PDF→question filter reset mounts 60 again and returns scroll to 0.
4. ArrowRight from item 60 appends next batch and focuses item 61.
5. Existing continuous crop, cross-page preservation, fast scrolling, centered preview, selected-question expansion tests still pass.
6. No page JavaScript errors.

`node tests/library-followup.mjs` PASS (unchanged full-result ordering/labels/inventory tests).
WebKit regression: grid stretch resolves the cyclic percentage card height; contained absolute images no longer push cards beyond rows. Both engines assert card/label row bounds and thumbnail height >100px. Provider query limits are unchanged.
