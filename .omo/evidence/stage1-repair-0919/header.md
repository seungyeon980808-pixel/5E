# Stage 1 header repair evidence

## Root cause

1. The editor toolbar was a child of `.panel-center`, so its grid width stopped at
   the canvas column. The real baseline toolbar was `[130, 0, 935, 46]` at 1280px.
2. The editor's fixed `.panel-edge-toggle` CSS hid the real SVG and drew a triangle
   pseudo-element. Static inner panel buttons and dynamic dock buttons then exposed
   duplicate commands.
3. Collapsing a panel reduced the grid to fewer than three tracks while the center
   and inspector remained explicitly placed in columns two and three. This created
   implicit tracks, a short header, and dead canvas space when both panels were
   closed.
4. The library provided a folder/file header action plus an additional inner pane
   chevron for the same folder visibility action.

## Repair

`moveEditorHeader()` places the real existing toolbar in `.app-shell-header`, moves
undo/redo and theme/fullscreen into that toolbar, and leaves one outlined panel SVG
button per side. It also removes obsolete internal toggles and empty utility rows.
The three desktop grid tracks remain present with zero-width collapsed side tracks.
The ChatGPT connection badge resolves its host in the shared header first, preserving
the existing button and login lifecycle. The library has matching left/right outlined
header controls and no inner duplicate folder collapse button. Its mobile drawer now
updates `aria-expanded` and its label whenever it opens or closes.

## Actual-page verification

`node tests/manual-real-header-qa.mjs` loaded the real `index.html` through a local
HTTP server at 1280x768 and 768x768. Its recorded DOM output is
[`actual-dom-qa.json`](header/actual-dom-qa.json):

* Header: `[0, 0, 1280, 46.5]` and `[0, 0, 768, 46.5]`.
* After both panel controls are used, the canvas is `[0, 46.5, 1280, 693.5]` and
  `[0, 46.5, 768, 693.5]` respectively.
* Both controls retain the `0 0 20 20` outlined SVG; there are zero internal and
  zero edge controls.

Screenshots: `header/editor-1280-collapsed.png`,
`header/editor-768-collapsed.png`, and the live isolated-origin capture
`header/live-1280-header.png`.

The self-contained HTTP check has no browser web-connection bridge, so its account
counts are zero. Root's actual CUA session on the isolated 127.0.0.1 product origin
confirmed one badge in `.app-shell-header .canvas-global-controls`, none in the
inspector, and correct geometry after both panels collapse. Root also confirmed the
real library UI has the matching header icons and no inner chevron.

## Regression commands

* `node --test tests/test-common-shell-stage1.mjs` — 3 passing.
* `node tests/manual-real-header-qa.mjs` — passing real-index 1280/768 DOM and
  screenshot check.

The source test locks the full-span header, three-track collapsed layouts, removal of
edge/internal controls, the header-first login host, and the library's single header
folder control.

## Commit manifest

`css/panel-visibility.css`, `css/style.css`, `css/web-login.css`,
`js/panel-visibility.js`, `js/unified-library-ui.js`, `js/web-login-ui.js`,
`tests/test-common-shell-stage1.mjs`, `tests/manual-common-shell-stage1-browser-qa.mjs`,
`tests/manual-real-header-qa.mjs`, and this evidence file. `index.html` cache tokens
are intentionally left to preview delivery.
