# Code Audit 20260630

Generated: 2026-06-30 KST

## 1. Project snapshot

- Branch: `main`
- Commit: `8c720bd` (`8c720bd fix: simplify labeler inspector to geometry controls`)
- Displayed app version: `v0.36.1` in `index.html` footer.
- Save schema version: `0.15` in `js/project-io.js`.
- ES module `?v=` values discovered: `0.36.1` only.
- Version mismatch: none found. Displayed footer, module imports, and console banner all use `0.36.1` / `v0.36.1`.
- Worktree status before this task: clean; `git status --short` printed no files.
- Worktree list: `C:/Users/user/Desktop/project/51_phy_draw_web 8c720bd [main]`.
- Recent history: latest 30 commits were inspected; recent work includes labeler fixes, selected-area export, label type selector, snap engine, optics snap, polyline rounding, and physics templates.

## 2. Feature inventory from code

Implemented plain toolbar tools from `index.html` and `js/tools.js`: selection `V`, rectangle tool id `R` with shortcut `S`, ellipse `O`, right triangle `Y`, line `L`, polyline `P`, curve `C`, text/formula `T`, free draw `F`, and rotate mode with shortcut `R`.

Generated template/object tools from `js/templates.js`: axes, angle arc, right-angle marker, labeler, point/node, wire, compass, clamp, scale, pulley, support, pivot, bar magnet, resistor, DC source, AC source, capacitor, inductor, unknown element, diode, lamp, ammeter, voltmeter, convex/concave lenses, convex/concave/plane mirrors, object arrow, screen, and point light.

Implemented object types found across creation/render/transform/save paths: `rect`, `ellipse`, `triangle`, `line`, `polyline`, `curve`, `text`, `formula`, `image`, `axes`, `anglearc`, `rightangle`, `labeler`, `circuit`, `optics`, `apparatus`.

Implemented features include undo/redo, grouping, layers, rulers/guides, grid, theme toggle, fullscreen, JSON project save/load, image import, local image objectify, PNG export, SVG export, selected-area export, File System Access API save picker with download fallback, timestamp filenames, Shift-based snap, Ctrl 15-degree constraints, and lock/position lock.

## 3. File responsibility map

- `index.html`: app shell, toolbar/topbar/canvas/inspector/ruler containers, footer version, `js/main.js?v=0.36.1` bootstrap.
- `css/style.css`: theme tokens, layout, toolbar, modals, text editor, objectify UI, canvas/ruler/footer styling.
- `css/inspector.css`: right inspector layout, fields, color picker and resize styling.
- `js/state.js`: central store, object array, guides, artboard, viewBox, fonts, label constants, layers, grid, undo/redo arrays.
- `js/tools.js`: tool selection, shortcuts, drawing creation, picking, text/formula editor, labeler and angle arc label editors, font modal.
- `js/render.js`: SVG projection, all object renderers, labels, selection overlays, handles, snap preview, fill patterns, bbox helpers.
- `js/inspector.js`: dynamic property UI for stroke/fill/text/geometry/labels/locks/layers/groups.
- `js/transform.js`: move, resize, rotate, group transforms, undo/redo, copy/paste, keyboard transforms, lock guards.
- `js/svg-export.js`: `buildExportSvg`, PNG/SVG serialization, timestamp names, save picker, selected bounds export.
- `js/export-dialog.js`: file dropdown, export modal, Alt+P, selected-area capture overlay.
- `js/project-io.js`: project JSON save/load/migration, image import and placement.
- `js/snap.js`: Shift snap candidates and resolver: endpoints, edges, curves, optical head, node, tangent, radial, contact.
- `js/templates.js`: single template/object registry and generated symbol panel.
- `js/image-objectify.js`: local image thresholding, shape/line extraction, preview, insertion as editable objects.
- Advanced/support files: `formula.js`, `ruler.js`, `settings.js`, `search.js`, `style-mode.js`, `viewport.js`, `store.js`, `top-menu.js`.

## 4. Render/export consistency review: mismatches only

- Fonts are not embedded in SVG or PNG export; text depends on installed fonts on the exporting machine.
- Formula objects use custom static SVG layout in `formula.js`, while normal text uses regular SVG text; typography can differ from normal labels.
- Labeler geometry rotates, but label text is intentionally upright. This is readable but not the same as rotating the whole glyph.
- Angle arc editor radius/selection guides are intentionally excluded from export; label position still needs negative-sweep/rotation visual QA.
- Selected-area export shares `buildExportSvg`, but screen-to-world crop bounds should be verified under zoom, pan, and letterboxing.

## 5. Shortcut and toolbar review

Implemented shortcuts: `V`, `S`, `R`, `O`, `Y`, `L`, `P`, `N`, `X`, `A`, `Shift+G`, `C`, `Shift+T`, `T`, `F`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`, `Alt+P`, `Alt+Enter`, `Delete`, arrow keys, `F2`/`Enter`, and debug `d`.

Findings: no direct duplicate execution conflict was found, but `R` means rotate while rectangle's data-tool is `R` and its shortcut is `S`, which is confusing. `Alt+P`, `F2`/`Enter`, Delete, arrow nudges, and debug `d` are implemented but not fully surfaced in normal UI. Generated template buttons show X/A/Shift+G/N/Shift+T. Some static toolbar buttons use title only and lack explicit aria-label.

## 6. Version/cache-bust review

Current app version: `v0.36.1`. Discovered `?v=` values: `0.36.1`. No mismatch found. Save schema `0.15` is intentionally separate from app version.

## 7. Label system review

Normal text, formula text, line labels, dimension labels, box labels, axes labels, object labels, labeler/callout text, circuit labels, optics/node labels, and angle arc labels are implemented. `labelType` supports `quantity` and `label` in several object families. Fragile areas: label font constants and label type normalization are spread across `state.js`, `render.js`, `inspector.js`, `project-io.js`, and `formula.js`; rotation/upright behavior varies by label family.

## 8. Transform/rotation review

Boxes/images/axes/optics/apparatus use rotation fields. Lines/circuits rotate by endpoint geometry. Closed polylines/curves bake rotation into points. Labeler rotates endpoints while text stays upright. Angle arcs rotate through `startAngle`; right-angle markers use `angle`. Groups resize/rotate around combined bbox. `locked` and `positionLocked` are enforced in transform/inspector paths. Highest risk is mixed storage models plus label relative positioning.

## 9. Snap system review

Snap is Shift-only. Candidates include line/circuit endpoints, polyline/curve first/last points, optical object head, straight edges, ellipse/curve outlines, node centers, tangent targets, radial center targets, and shape contact points. Labeler endpoints can be transformed but are not collected as global snap candidates. Resolver scans visible objects without a spatial index, which can become a performance risk.

## 10. Dead code / duplicate / temporary scan

No major TODO/FIXME markers were found in the required modules. `console.warn` fallback messages exist in `tools.js`/`templates.js`; `console.info` startup banner exists in `main.js`; `window.phyDraw` and the `d` coordinate debug overlay ship in the main bundle. Prompt-protected temp files were not present in the project tree at inspection time. Export filename helper is centralized; label font/type helpers are duplicated across modules. No stale `?v=` mismatch was found.

## 11. Risk-ranked recommendations

### P0 — User-facing string and visual QA
- Affected files: `index.html`, `js/*.js`, `css/*.css`
- Evidence: large amount of Korean UI text is generated dynamically across modules; this area has prior mojibake history in commits.
- Why it matters: teachers need trustworthy Korean UI text.
- Risk of touching it: High.
- Minimal safe fix: browser visual QA and targeted UTF-8 string fixes only.

### P1 — External API image-to-object is not implemented
- Affected files: `js/image-objectify.js`, future backend/proxy.
- Evidence: current feature is local threshold/Hough-style extraction; no fetch/API key/proxy/schema flow exists.
- Why it matters: planned feature has privacy, cost, and key leakage risks.
- Risk of touching it: High.
- Minimal safe fix: schema plus mock JSON import first.

### P1 — Label type/font consistency
- Affected files: `js/state.js`, `js/render.js`, `js/inspector.js`, `js/project-io.js`, `js/formula.js`.
- Evidence: multiple font constants and label type resolvers.
- Why it matters: exam figures require consistent typography.
- Risk of touching it: Medium.
- Minimal safe fix: document font policy, then centralize resolution with visual samples.

### P1 — Snap resolver complexity
- Affected files: `js/snap.js`, `js/transform.js`.
- Evidence: priority, edge, curve, tangent, radial, optic-head, node, and contact snap are intertwined.
- Why it matters: small changes can regress precise drawing workflows.
- Risk of touching it: High.
- Minimal safe fix: build a snap scenario matrix before code edits.

### P2 — Debug surface in production bundle
- Affected files: `js/main.js`.
- Evidence: `window.phyDraw` and `d` coordinate overlay.
- Why it matters: useful for development, noisy for public users.
- Risk of touching it: Low.
- Minimal safe fix: gate behind a dev flag later.

### P2 — Selected-area export edge cases
- Affected files: `js/export-dialog.js`, `js/svg-export.js`.
- Evidence: crop bounds are captured in screen space and converted to world space.
- Why it matters: wrong crops waste user time.
- Risk of touching it: Medium.
- Minimal safe fix: verify under zoom, pan, and both formats.

### P2 — Save/load compatibility fixtures missing
- Affected files: `js/project-io.js`.
- Evidence: schema `0.15` migration is mostly default-filling.
- Why it matters: older drawings can silently load with changed defaults.
- Risk of touching it: Medium.
- Minimal safe fix: add JSON fixtures before schema changes.
