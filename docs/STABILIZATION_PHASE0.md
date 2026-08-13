# Stabilization Phase 0 baseline

Phase 0 establishes a repeatable, non-mutating baseline before PDF, label, graph, or package-content stabilization changes. It does not alter product behavior or remove assets.

## Verified baseline

The baseline starts from commit `0684bcf` on `codex/stabilize-reference-workflow` with the merged PDF textbook and native graph paths present.

`npm run test:phase0` runs these gates sequentially and stops on the first failure:

1. `npm test`
2. `npm run test:graph`
3. `npm run test:desktop`
4. `npm run audit:exam-graphs:strict`
5. `npm run audit:package-assets`

The final package audit is intentionally non-strict in the Phase 0 runner. It emits a deterministic JSON report containing sorted `package.json` build sources, included asset-family file counts and bytes, required runtime presence/inclusion, and machine-readable policy violations.

`npm run audit:package-assets:strict` is expected to fail at this baseline. The current package rule includes `assets/**/*`, which is forbidden by the Phase 0 policy and also includes the forbidden `assets/exam-library` and `assets/parts-library` roots. This expected failure records packaging debt; it is not bypassed or silently treated as success.

## Future synthetic fixture plan

Future harness work should add only generated or independently authored fixtures under these planned locations:

- `tests/stabilization/fixtures/pdf/generate-synthetic-pdf.cjs`: creates temporary PDF pages with text, vector shapes, an embedded raster, rotation, and edge crops.
- `tests/stabilization/fixtures/labels/synthetic-label-cases.json`: authored label placement and collision cases with no source-exam content.
- `tests/stabilization/fixtures/graphs/synthetic-graph-cases.json`: authored graph topology, geometry, and unsupported-type cases.
- `tests/stabilization/harness/common-fixtures.cjs`: temporary-directory, stable hashing, canonical JSON, and cross-platform path helpers shared by all three fixture families.
- `tests/stabilization/harness/browser-desktop-parity.cjs`: shared outcome assertions for browser and Electron adapters.

No copyrighted textbook, exam, answer-key, or publisher source fixture may be added to the repository. Tests must generate minimal geometry/text themselves or use clearly licensed synthetic material whose provenance is recorded.

## Project compatibility and local-file privacy invariants

The future common harness must verify both current and legacy `.5e` save/load roundtrips. Loading and saving must preserve unknown fields so a newer or extended project is not silently truncated, and equivalent fixtures must produce equivalent observable outcomes in the browser and Electron adapters.

PDF, image, and `.5e` file bytes remain local by default. Local inputs and test fixtures must never be uploaded, network-requested, attached to a model, or transmitted through a tool before an explicit, user-confirmed AI crop handoff. Merely opening, indexing, searching, previewing, saving, or testing a local file does not authorize external transmission.

## Ownership boundaries

- **Packaging/assets:** owns `scripts/stabilization/package-assets-*`, the packaging policy, build-source counts, and installer inclusion/exclusion decisions. It does not rewrite PDF/search or graph behavior.
- **PDF/search/crop:** owns deterministic PDF indexing, normalized crop coordinates, search fixtures, and browser/Electron file-permission parity. It consumes packaging reports but does not change installer policy alone.
- **Graph-native flow:** owns graph routing, compiler fixtures, structural/geometric/visual audits, and the strict graph gate. It does not add copyrighted exam fixtures.
- **Common harness:** owns canonical serialization, temporary fixture lifecycle, stable identifiers, and cross-platform runner behavior. Domain owners retain their expected outputs and acceptance thresholds.

Changes that cross these boundaries require an explicit handoff and a separate atomic commit after the Phase 0 baseline.
