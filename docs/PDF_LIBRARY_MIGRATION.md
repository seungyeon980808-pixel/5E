# PDF library asset migration

This is a migration inventory and reversible distribution-preparation record. It records the completed current-tree removal, but does not rewrite history, ship a release, or publish a catalog. The original migration retained only its tutorial PNG; the complete 3,961-PNG corpus remains preserved externally. The 2026-09-12 integration adds seven checksum-verified original PNG samples through `sample-catalog.json`. Desktop packaging validates the external final-r2 72-PDF/288-page pack and includes it as an application resource; bulk PDFs are not tracked in Git. The inventories below describe the earlier migration snapshot.

## Decision boundary

The default web experience opens the PDF-library tab. When `window.FIVE_E_PDF_PACK_BASE_URL` is configured, it discovers that remote PDF catalog only when the tab opens and fetches document bytes only when a user installs or opens a pack. With no configured URL, the same tab supports explicit local upload, connected desktop folders, and a user-selected pack-directory install. The 72 official PDFs and built packs remain outside tracked application source. `vendor/pdfjs/**` and `vendor/ocr/**` remain in the application package: they are executable runtime dependencies, not exam content.

The finalized 72-document snapshot is externally backed up, but it is not a production remote default. `tools/pdf-library/recent-three.config.json` has an empty `baseUrl` and no `remoteCatalog`; production publication still requires selecting an HTTPS host and setting `window.FIVE_E_PDF_PACK_BASE_URL`.

## Verified inventory

| Item | Exact inventory | Migration disposition |
| --- | ---: | --- |
| Legacy exam PNG payload | Current tree: 1 materialized tutorial PNG, 40,325 bytes. External verified backup: 3,961 PNGs, 299,094,759 bytes (285.24 MiB). | The current-tree removal deleted the other 3,960 files after byte-for-byte backup comparison. |
| Legacy image tree in Git | Current index: `.gitkeep` plus the tutorial PNG; 3,960 PNG deletions are staged. Historical commits still contain the original payload. | Do not conflate checkout, staged index, Git object database, or a future re-clone. |
| Selected official PDF set | 72 PDFs, 127,663,864 bytes (121.75 MiB), 288 pages | Keep outside tracked source; source and pack checksums must verify before publication. |
| Raw corpus directory | 88 PDFs, 151,077,766 bytes (144.08 MiB) | Contains the selected 72 plus 16 excluded PDFs, 23,413,902 bytes (22.33 MiB). Do not publish the raw directory as the default pack. |
| Built selected pack | `.omo/evidence/pdf-library/T5/recent-three-pack`, finalized at 72 PDFs/288 pages/76 files/140,405,401 logical bytes; `pack.json` SHA-256 `6be959d2ed1159bfa47c56b4fabc1092b1457e8cb996d40bd9179d06603a8c49`; `checksums.json` SHA-256 `e8cfa67c428c7b016b57f26b15cfd14e019e0ed5fc27c16407a2e376c7021c66`. | External distribution candidate after URL and legal/release decisions. |
| Curated exam parts | 4 PNGs plus `assets/exam-parts/manifest.json` | Must remain: they are separately curated crops, named in the distribution test, and are not interchangeable with a PDF source page. |
| Test-only exam fixtures | 6 PNGs in `docs/qa-fixtures/exam-library/` | Keep. `docs/EXAM_LIBRARY_SPEC_20260706.md` defines them as copy-in test fixtures. |
| Runtime PDF/OCR vendor payload | `vendor/pdfjs` 8.4 MiB; `vendor/ocr` 12 MiB | Keep in the app package; `package.json` explicitly includes both. |

The selected source-to-pack relation is checksum based: all 72 `documents/*.pdf` values in the pack’s `checksums.json` have exactly one matching SHA-256 among the raw corpus. The selected source list is `sources/corpus/catalog_2024_2026.jsonl`; the selected pack’s path-to-digest list is `T5/recent-three-pack/checksums.json`. The 16 excluded raw files are the source files whose digest is absent from that pack checksum list.

## Live dependency map

| Consumer | Current dependency | What the migration must do |
| --- | --- | --- |
| Exam library UI | `js/exam-library.js` defaults to PDF and fetches a legacy manifest only when nonempty `window.FIVE_E_LEGACY_EXAM_BASE_URL` explicitly enables that external compatibility branch. | The packaged default neither displays the legacy tab nor requests a legacy manifest/image. |
| Reference Window | `js/reference-window.js` still resolves explicit legacy items through `IMG_BASE`, while PDF references carry a materialized snapshot source. | The PDF snapshot is a page/crop image blob or data URL, so an opened reference survives later pack disable/remove operations. |
| Tutorial compare | `js/tutorial.js` directly uses `assets/exam-library/images/${examId}.png`. | Retain its sole static ID until tutorial migration; package only that image. |
| AI reference search | `js/ai-reference-search.js` routes Exam to the shared PDF picker, which materializes a crop before AI insertion. | The resulting AI input is a saved byte snapshot, not a live path. |
| Canvas insert | `js/exam-library.js` uses `insertImageFromSrc`; its contract converts the selected image to a data URL before project persistence | Existing saved projects already embed image bytes; do not rewrite their `savedImage`/data-URL payloads. |
| PDF insert and AI paths | `js/pdf-library/pdf-library-ui.js` turns rendered PNG bytes into a data URL before insert/AI use | These also embed bytes. Do not save only a pack ID, catalog URL, or local path. |
| Desktop package | `package.json` explicitly packages only `assets/exam-library/images/p2_2027_06_13.png`; it retains `assets/exam-parts/**/*`, PDF.js, and OCR. `desktop/distribution-consumers.test.cjs` asserts the exact selected legacy image list. | The bulk image glob is already absent from the actual package selection. Keep the parts glob. |
| Tests and docs | `desktop/repository-curation.test.cjs`, `docs/EXAM_LIBRARY_SPEC_20260706.md`, and the six QA fixtures describe or exercise the legacy path | Update only in the compatibility implementation change. The fixtures remain local. |
| Service worker | No service-worker file, registration, or Workbox reference exists in the repository search | There is no cache invalidation migration to perform today. Add remote catalog cache/version policy with the future client, not a nonexistent worker. |
| PWA metadata | `manifest.json` references only application icons | Retain it unchanged; it does not point at the exam corpus. |

Other PNG/SVG paths in `assets/`, `assets/parts-library/`, `assets/svg_object/`, and documentation image folders are application, curated-parts, or documentation assets. They are outside this corpus migration.

## Compatibility adapter contract

The adapter must accept the old `manifest.json` item shape (`id`, `file`, title/tags/year metadata) and expose these operations to the four callers above:

1. `resolvePreview(item)` returns a renderable image URL/blob for legacy PNG items or a deterministic PDF page/crop render for catalog items. A PDF Reference Window item carries that materialization as `snapshotSrc`; it accepts pixel-image data URLs or same-document `blob:https://`, `blob:http://`, `blob:file://`, and `blob:null/` URLs only.
2. `snapshotForInsert(item)` returns image bytes/data URL. It is the only input to canvas and AI persistence.
3. `openReference(item)` creates an independent byte/blob snapshot for a Reference Window; it must survive later pack disable/remove operations.
4. `availability(item)` distinguishes an unavailable external pack from an unavailable legacy image without silently falling back to a different question.

The adapter owns the compatibility period. No source PNG may be removed while `reference-window.js`, `tutorial.js`, or `ai-reference-search.js` still build a direct `assets/exam-library/images/` path.

### Exact retained PNG set after adapter adoption

The only static tutorial PNG ID found in executable tutorial source is `p2_2027_06_13`, declared as `EX.id` in `js/tutorial-courses.js` and rendered by `js/tutorial.js`. Keep `assets/exam-library/images/p2_2027_06_13.png` until that tutorial is migrated to the adapter. The six committed test fixtures are retained outside the legacy image directory: `p1_2025_03_02 [2025학년도 3월 학평 물리1 2번].png`, `p1_2025_11_05.png`, `p1_2026_06_12.png`, `p1_2026_09_03.png`, `p1_2026_11_01.png`, and `p1_2026_11_08.png` under `docs/qa-fixtures/exam-library/`.

The approved current-tree removal deleted the precise 3,960 materialized files in `assets/exam-library/images/` other than `p2_2027_06_13.png`. Default runtime and package QA do not require them; the only supported legacy runtime branch is explicit external configuration. The externally backed-up 2,965 older/uncovered IDs remain preserved even though they are not mapped to the 72-PDF pack.

## Completed reversible staging and backup

The following non-destructive artifacts have been created outside this checkout. They do not alter Git history or source assets.

| Artifact | Location | Observable |
| --- | --- | --- |
| No-bulk application stage | `/Users/parkseungyeon/5E-pdf-library-staging/t7-f2-post-removal-gateway-freeze` | 4,850 files, 146,326,580 logical bytes; stage manifest SHA-256 `13bc0830640d6d3c1008b225d0b09bc6bd3578c4ede36d688a86133e7b9194c9`; includes PDF.js/OCR, the tutorial PNG, `default-pack-config.js`, and six fixtures while the source has no bulk legacy PNGs, and configures the separate pack host for runtime QA. |
| Legacy source backup | `/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2/assets-exam-library` | Full `assets/exam-library` tree and `assets-exam-library.sha256` manifest; 3,961 PNGs. |
| Final pack backup | `/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2-final-r2/recent-three-pack` | 72 PDFs/288 pages; 140,558,336 allocated bytes; copied manifest, catalog, and index hashes match the finalized source pack. |
| Latest pre-rebuild pack audit snapshot | `/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2-final/recent-three-pack` | Preserved 72-PDF backup of the prior detector candidate; it is not the final distribution backup. |
| Pre-rebuild pack audit snapshot | `/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2/recent-three-pack` | Preserved 72-PDF backup of the prior checksum set; it is not the final distribution backup. |

Verify the captured stage, or create a separate stage at a new, nonexistent external path (the command refuses an in-repository or already-existing target):

```sh
node tools/pdf-library/verify-staged-distribution.mjs \
  /Users/parkseungyeon/5E-pdf-library-staging/t7-f2-final-r2-app-4275 \
  --require-pdf-pack-base-url

STAGE_ROOT=/Users/parkseungyeon/5E-pdf-library-staging/t7-f2-app-NEXT
test ! -e "$STAGE_ROOT"
node tools/pdf-library/stage-distribution.mjs --output "$STAGE_ROOT"
node tools/pdf-library/verify-staged-distribution.mjs "$STAGE_ROOT"
```

The post-removal verifier output is `valid: true`, `retainedFixtures: 6`, and `excludedLegacyPngs: 0`. The stage manifest is an external QA receipt, not a runtime application switch: integration must use its configured PDF catalog/default mode to select the PDF UI.

The completed backup can be verified without changing any repository file:

```sh
LEGACY_BACKUP_ROOT=/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2
PACK_BACKUP_ROOT=/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2-final-r2
(cd "$LEGACY_BACKUP_ROOT/assets-exam-library" && shasum -a 256 -c ../assets-exam-library.sha256)
(cd "$PACK_BACKUP_ROOT/recent-three-pack" && shasum -a 256 -c ../recent-three-pack.sha256)
node tools/pdf-library/inspect-pack.mjs "$PACK_BACKUP_ROOT/recent-three-pack"
cat "$LEGACY_BACKUP_ROOT/legacy-png-count.txt" "$PACK_BACKUP_ROOT/recent-three-pack-pdf-count.txt"
```

Expected observables are: every manifest entry is `OK`, `inspect-pack` succeeds, the backup has exactly 72 PDFs, and the final `pack.json`/`checksums.json` hashes match. The source-to-pack check before any migration is:

```sh
node --input-type=module - <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const evidence = '.omo/evidence/pdf-library';
const checksums = JSON.parse(fs.readFileSync(`${evidence}/T5/recent-three-pack/checksums.json`, 'utf8'));
const source = `${evidence}/sources/corpus`;
const hashes = new Set(fs.readdirSync(source).filter((name) => name.endsWith('.pdf')).map((name) =>
  crypto.createHash('sha256').update(fs.readFileSync(path.join(source, name))).digest('hex')));
const selected = Object.entries(checksums.files).filter(([name]) => name.endsWith('.pdf'));
if (selected.length !== 72 || selected.some(([, digest]) => !hashes.has(digest))) process.exit(1);
console.log(`verified ${selected.length} selected source-to-pack SHA-256 mappings`);
NODE
```

## Exact recent-three coverage

`tools/pdf-library/map-legacy-pdf-coverage.mjs` produced the checksum-backed mapping at `.omo/evidence/pdf-library/migration/recent-three-legacy-png-coverage.json` for the final snapshot (SHA-256 `517a7845c82d12dcb4363da8f5ce44412a9d88f605d3b3d4fe59f3ff353bb3ae`). It maps every pack document to its raw source filename, original EBSi URL, and legacy PNG IDs. It partitions the 3,961 legacy PNG IDs into 996 covered by the recent-three PDFs and 2,965 older or otherwise uncovered IDs. The retained tutorial ID `p2_2027_06_13` is explicitly recorded independently of that coverage decision.

```sh
node tools/pdf-library/map-legacy-pdf-coverage.mjs \
  --output .omo/evidence/pdf-library/migration/recent-three-legacy-png-coverage.json
```

## Final distribution evidence and removal gate

The frozen-source package selection has passed the focused distribution tests and actual runtime checks:

| Scenario | Invocation | Binary observable | Artifact |
| --- | --- | --- | --- |
| Gateway-freeze staged app | `node tools/pdf-library/verify-staged-distribution.mjs /Users/parkseungyeon/5E-pdf-library-staging/t7-f2-post-removal-gateway-freeze --require-pdf-pack-base-url` | `valid: true`; source has no bulk PNGs, six fixtures remain, and the archive includes the explicitly empty default-pack configuration. A separate QA owner verifies gateway behavior. | `.omo/evidence/pdf-library/migration/t7_f2_gateway_freeze_stage_verify.json`, `t7_f2_gateway_freeze_stage_manifest.sha256` |
| Gateway-freeze Electron package | `electron-builder --dir --config.directories.output=/Users/parkseungyeon/5E-pdf-library-package-smoke/t7-f2-post-removal-gateway-freeze` | `app.asar` is 182,175,575 bytes, SHA-256 `557f90cdea289accc51955ab3911d4baf7aa541060082457cf4d4098a01810f2`; it lists exactly `p2_2027_06_13.png` in the legacy image directory and embeds `js/pdf-library/default-pack-config.js` with SHA-256 `47dabe11f97ec0fc17ef655a7a40e24b1367de63e961c8fbe1248f38454b5ca6`. The standalone gateway server is deliberately not part of Electron. | `.omo/evidence/pdf-library/migration/t7_f2_gateway_freeze_package_selected.txt`, `t7_f2_gateway_freeze_package_hashes.txt`, `t7_f2_gateway_freeze_electron_builder.log` |

The external backup was reverified after this source freeze: all manifest entries reported `OK` under `assets-exam-library`, including the full 3,961 PNG tree. It preserves the 996 recent-three-covered IDs and the separate 2,965 older/uncovered IDs; the latter are preserved but are not represented as mapped PDFs. The verification output is `.omo/evidence/pdf-library/migration/t7_f2_final_legacy_backup_verify.log`.

The approved removal compared every source PNG to the external backup before acting: zero mismatches, 3,961 inputs, 3,960 deletions totaling 299,054,434 bytes, and one 40,325-byte retained tutorial. The deleted-list SHA-256 is `c464d0ba67ec8b9071db8cfaf03ba222ec73bd60a01d0aca02454aabee9d95a7`. The postcondition records one source PNG, `.gitkeep` plus that PNG in the current index, and exactly 3,960 staged deletions. Evidence: `.omo/evidence/pdf-library/migration/t7_f2_png_removal_preflight.json`, `t7_f2_png_deletion_list.sha256`, and `t7_f2_png_removal_postcondition.json`. Do not run a history rewrite, force push, or publication as part of this migration.

### Committed-history preservation and separately scoped rewrite plan

Before source removal, the committed refs were copied non-destructively to `/Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2-final-r2/committed-refs-before-png-removal.bundle`. The bundle is 449,439,936 bytes, SHA-256 `824f23be9d75e86236963fd8f79db9735aec22c53abec061d6d51360463758cc`, and `git bundle verify` reports it contains complete history. It captures committed refs only; it does not contain this dirty worktree’s uncommitted application changes.

The following is a **not executed** history-rewrite scope. It is retained solely to distinguish a future re-clone-size project from the authorized current-tree removal. Run it only in a disposable clone restored from the verified bundle, after separate approval of the rewrite and remote update. It removes the exact 3,960 legacy paths from every rewritten commit while preserving `p2_2027_06_13.png`; it does not name or assume any publication host.

```sh
REWRITE_CLONE=/absolute/path/to/disposable-clone
cd "$REWRITE_CLONE"
git bundle verify /Users/parkseungyeon/5E-pdf-library-backups/2026-09-10-t7-f2-final-r2/committed-refs-before-png-removal.bundle
git ls-tree -r --name-only HEAD -- assets/exam-library/images \
  | awk '$0 != "assets/exam-library/images/p2_2027_06_13.png"' \
  > /tmp/5e-bulk-legacy-png-paths.txt
test "$(wc -l < /tmp/5e-bulk-legacy-png-paths.txt | tr -d ' ')" = 3960
git filter-repo --force --invert-paths --paths-from-file /tmp/5e-bulk-legacy-png-paths.txt
```

That command sequence is intentionally not a next step for this migration. It needs new-clone measurements, a recovery review using the bundle, and an explicitly approved remote force-with-lease operation before it can affect shared history.

## Size interpretation

This shared worktree reports 1.4 GiB, but `.git` here is a 4 KiB worktree pointer. `git count-objects -vH` reports 408.91 MiB in the shared Git object database. Removing PNGs from a future tip immediately reduces checkout and packaged-app size; it does **not** make an existing clone or a new clone smaller while historical commits still retain the PNG blobs. A re-clone shrink requires a separately approved history rewrite, server update, and object pruning; its result must be measured after a fresh clone rather than inferred from `du` in this worktree.
