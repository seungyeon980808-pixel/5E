# Windows lightweight launcher icon fidelity review

**Recommendation: APPROVE**

## Scope and conclusion

Reviewed the current lightweight Windows project launcher and the retained live
editor import path. The requested blue folded-document artwork is a legitimate
multi-resolution Windows icon resource, rather than a raster substitute for the
editor UI. The restored editor continues to be rendered by the existing state
and renderer path; the changed work adds no CSS or replacement screen.

## Evidence inspected

- Reference artwork: `/tmp/5e-blue-document-win.png` (1024×1024 RGBA PNG).
- Extracted embedded icon: `/tmp/5e-windows-icon-embedded.png` (256×256 RGBA
  PNG), viewed directly alongside the reference.
- Fresh captures: `/tmp/5e-windows-project-qa/windows-web-export.png`,
  `/tmp/5e-windows-project-qa/windows-web-import.png`, and
  `/tmp/5e-windows-project-qa/desktop-exe-data-import.png`; all have PNG
  signatures and were captured after the 13:44:55 executable build and the
  13:06:32 renderer change.
- Result records: `/tmp/5e-windows-project-qa/web-result.json` and
  `/tmp/5e-windows-project-qa/desktop-result.json`. They record two restored
  pages with object counts `[3, 1]`, no errors, Korean title/content, damaged
  import preservation, and the desktop PDF/search state.
- Current implementation: `desktop/project-launcher/windows/native/launcher.rc`,
  `scripts/build-windows-project-launcher.cjs`,
  `desktop/project-launcher/windows/native/windows-main.c`, `js/project-io.js`,
  `js/project-launch.js`, and `js/windows-project-source.mjs`.
- Built artifacts: `desktop/project-launcher/windows/launcher.exe` and
  `desktop/project-launcher/windows/BlueDocument.ico`.

## Verification

- The PE is a 88,576-byte x64 GUI executable with SHA-256
  `7de61f5117b211f21d87c708f7c8b0a1617f71e282ef4edd015df7da00f10827`.
  Its resource directory contains only the expected `RT_ICON`, `RT_GROUP_ICON`,
  and manifest resource types.
- Direct PE resource parsing found exactly four PNG `RT_ICON` entries: 16, 32,
  48, and 256 px. Each is byte-identical to exactly one ICO entry. The 256px
  entry and the supplied extracted icon both hash to
  `183b69e6198882d5f65e7f05194e702fcc6afc81ef2c6303855043218e711323`.
- `native/launcher.rc:1` declares the ICO, and
  `scripts/build-windows-project-launcher.cjs:15-19` compiles and links that
  resource into the PE. This is a real OS icon resource, not a nearby file or
  CSS/raster fallback.
- Direct visual inspection confirms the transparent surround, deep-blue page,
  white folded corner, large white `5E`, and small `.5e` remain intact at
  256px. A same-size image comparison reports alpha intact. Its strict
  exact-pixel similarity is 46/100 after resampling the 1024px source; decoded
  opaque pixels nevertheless differ by a mean 4.08 channel values (5.2% above
  8), consistent with resampling/asset encoding rather than a visible geometric
  or compositional deviation. The focal marks and proportions match directly.
- The visible editor captures contain live controls, SVG/document objects,
  layers, page tabs, status text, and Korean UI. `js/project-io.js:627-642`
  extracts the executable source, prepares it, and applies it through the
  existing `applyLoaded` state path. There is no pasted editor screenshot,
  `background-image`, or separate one-off UI styling in the changed launcher
  path.
- `node --test tests/test-windows-project-package.cjs
  tests/test-windows-native-launcher.cjs` passed 11/11, including the actual
  product export/import source path. `git diff --check` also passed.

## Findings

### CRITICAL

None. The icon is an expected native image asset; it does not replace the
interactive editor surface. The imported document is applied as editable state.

### HIGH

None. The approved multi-size ICO is embedded in the current PE, and all four
payloads occur exactly once.

### MEDIUM

None. This task introduces no independent web layout, typography, spacing, or
color rules. Existing UI tokens and reused editor components remain responsible
for the rendered editor.

### LOW

- **[evidence]** The captures were made on macOS with browser platform
  selection spoofed to Windows. They establish resource embedding and browser/
  desktop data import, but cannot establish physical Windows Explorer icon
  presentation, installed-app execution, or a real double-click path. This is
  an evidence boundary, not a product defect in the reviewed scope.
- **[evidence]** `.omo/evidence/windows-open-function-review.md` describes an
  older Go launcher and a 7,287,311-byte artifact. It is stale and must not be
  used as a final-gate artifact for this 88,576-byte C launcher.

## Blockers

None for the bounded launcher/icon and editor-restoration review. A future
claim about actual Windows shell behavior requires a Windows-host Explorer and
installed-editor pass.
