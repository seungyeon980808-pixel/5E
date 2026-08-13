# Stabilization Phase 0 baseline

Phase 0 combines a repeatable, non-mutating baseline runner with the limited verified safety fixes documented below: local-first privacy, browser/Electron parity, and `.5e` roundtrip preservation. The runner itself does not mutate product state; the safety fixes intentionally tighten those product behaviors. Phase 0 removes no assets and does not package, release, or deploy the product.

## Verified baseline

The baseline starts from commit `0684bcf` on `codex/stabilize-reference-workflow` with the merged PDF textbook and native graph paths present.

`npm run test:phase0` runs these gates sequentially and stops on the first failure:

1. `npm test`
2. `npm run test:graph`
3. `npm run test:stabilization-harness`
4. `npm run test:desktop`
5. `npm run audit:exam-graphs:strict`
6. `npm run audit:package-assets`

The unit-test gate includes a synthetic-only stabilization harness for diagram labels,
native graph compilation, and packaged-artifact inspection. It never calls a network
AI service and does not require a pre-existing release directory.

The final package audit is intentionally non-strict in the Phase 0 runner. It emits a deterministic JSON report containing sorted `package.json` build sources, included asset-family file counts and bytes, required runtime presence/inclusion, and machine-readable policy violations.

The audit intentionally supports a fail-closed FileMatcher subset: ordered positive/negative string patterns, directory inclusions, `*`, `?`, and `**`. FileSet objects, minimatch comments, repeated leading negation, brace expansion, character classes, extglobs, and escaped glob syntax are rejected as unsupported instead of being approximated.

`npm run audit:package-assets:strict` is expected to fail at this baseline. The current package rule includes `assets/**/*`, which is forbidden by the Phase 0 policy and also includes the forbidden `assets/exam-library` and `assets/parts-library` roots. This expected failure records packaging debt; it is not bypassed or silently treated as success.

## Synthetic fixture status

The PDF and adapter-parity fixtures are implemented and executable:

- `tests/stabilization/fixtures/pdf/generate-synthetic-pdf.cjs` creates deterministic, independently authored PDF pages with searchable and textless content, vector shapes, an embedded raster, metadata, rotation, and edge-crop cases. `desktop/synthetic-pdf-fixture.test.cjs` verifies their provenance, indexing, search, geometry, crop, and corruption behavior.
- `tests/stabilization/harness/browser-desktop-parity.cjs` provides shared browser/Electron outcome and forbidden-transport assertions used by `desktop/local-file-privacy.test.cjs`.

The remaining fixture work is still planned:

- `tests/stabilization/harness/common-fixtures.cjs`: temporary-directory, stable hashing, canonical JSON, and cross-platform path helpers shared by all three fixture families.

Implemented synthetic harnesses now cover exact crop/transmission pixel comparison,
label-free request planning, OCR strings and normalized bounds, editable 5E text and
leader objects, uncertainty, edits, comparison layout, and retry recovery. The graph
harness keeps interpretation input separate from the existing deterministic native
compiler and checks structure, geometry, deterministic pixel overlay/diff descriptors,
stroke/dash/clipping, Korean/math labels, and the required failure-ledger fields.

## Packaged-artifact audit

`npm run audit:package-artifact -- --artifact <path>` inspects an unpacked application
directory, an `app.asar`, or a staged desktop directory containing `resources/app.asar`.
It reports sorted per-file sizes, logical file bytes, physical artifact bytes, forbidden
and unapproved paths, required PDF/font/UI runtime omissions, and web/desktop version
and commit parity. Invalid ASAR headers and traversal-like paths fail closed.

`npm run package:stage` runs electron-builder's directory target, injects the current
commit into packaged `package.json` metadata, and prints the non-strict artifact report.
Generated `release/` output is not committed. The report remains non-strict while the
Phase 0 broad `assets/**/*` packaging debt exists, so current debt stays visible without
blocking the deterministic synthetic gate. Use `--strict` directly on the artifact audit
for a release candidate.

No copyrighted textbook, exam, answer-key, or publisher source fixture may be added to the repository. Tests must generate minimal geometry/text themselves or use clearly licensed synthetic material whose provenance is recorded.

## Verified project compatibility and local-file privacy

`desktop/project-roundtrip.test.cjs` exercises current and legacy `.5e` projects through the public migrate, apply, and serialize flow. It verifies that root, page, and object extension fields survive load/save roundtrips while transient and migrated legacy drawing fields remain intentionally omitted.

`desktop/local-file-privacy.test.cjs` verifies equivalent browser and Electron adapter outcomes for local image/PDF discovery, reading, indexing, searching, previewing, and `.5e` serialization. Those operations invoke none of the guarded attachment IPC, model-send, network-request, or tool-transmission ports.

PDF, image, and `.5e` file bytes therefore remain local by default. Cancelled, denied, or failed local-reference handoffs cannot attach bytes. A local search whole-page or crop action must produce an explicitly confirmed reference before request planning may include it; the later Generate action performs the actual transport. Ordinary picker/drop images remain eligible when the user explicitly presses Generate. Merely opening, indexing, searching, previewing, saving, or testing a local file does not authorize external transmission.

## Ownership boundaries

- **Packaging/assets:** owns `scripts/stabilization/package-assets-*`, the packaging policy, build-source counts, and installer inclusion/exclusion decisions. It does not rewrite PDF/search or graph behavior.
- **PDF/search/crop:** owns deterministic PDF indexing, normalized crop coordinates, search fixtures, and browser/Electron file-permission parity. It consumes packaging reports but does not change installer policy alone.
- **Graph-native flow:** owns graph routing, compiler fixtures, structural/geometric/visual audits, and the strict graph gate. It does not add copyrighted exam fixtures.
- **Common harness:** owns canonical serialization, temporary fixture lifecycle, stable identifiers, and cross-platform runner behavior. Domain owners retain their expected outputs and acceptance thresholds.

Changes that cross these boundaries require an explicit handoff and a separate atomic commit after the Phase 0 baseline.
