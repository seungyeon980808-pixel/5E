# Repository maintenance

This repository deliberately retains more source SVGs than the application
catalog exposes. Retention is not a signal that an asset is unused. The parts
catalog is the items list in assets/parts-library/manifest.json; the generator
and package configuration preserve that boundary without deleting source or
historical material.

## Parts catalog

tools/build_parts_manifest.py uses one of two selection sources:

1. A complete local _work/triage set: marks.json, clusters.json, grades.json,
   and scores.json.
2. If no triage file is present, the IDs already committed in
   assets/parts-library/manifest.json. This is the explicit preserved
   selection.

A partial triage set fails. If both triage and the existing manifest are
unavailable, the command fails rather than harvesting the SVG directory. Run
the read-only guard before any intended curation write:

    python3 tools/build_parts_manifest.py --check

It compares effective IDs with the committed manifest and does not write an
output file. The ordinary command writes manifest.json; it is appropriate only
after a reviewer has deliberately changed a complete triage result or the
preserved selection.

## Inventory

| Class | Current count | Reason and handling |
| --- | ---: | --- |
| Kept catalog IDs | 991 | Runtime library entries referenced by the parts manifest. |
| Retained source/reference SVGs | 3,383 | Not in the current catalog. Retain them; they may be sparse, historical, or candidates for later curation. |
| Approved archive SVGs | 60 | Curated-reference material under assets/parts-library/approved/; do not delete or treat as live runtime content. |
| Selected IDs missing a source SVG | 0 | The current manifest can resolve every selected SVG. |

The 991/3,383 split is an inventory, not a claim about compressed installer
size. Do not make a size claim without an actual package build.

## Runtime package boundary

package.json uses an explicit build.files allowlist. It includes the desktop
runtime modules, HTML/CSS/JS, web manifest and icons, fonts, live parts/exam
manifests and assets, SVG object assets, LICENSE, and docs/credits.html. The
credits page is required because the footer links to it.

It excludes package test runners, smoke/benchmark tools, source curation
metadata (harvest.json, meta.json, and keep.json), and the approved archive.
The SVG source directory remains packaged because the current electron-builder
file configuration cannot select manifest IDs dynamically; the checked
manifest remains the application-visible boundary. Do not replace this with
broad assets/**/* or desktop/**/*.

Validate the configured expansion and curation guard with:

    node --test desktop/repository-curation.test.cjs
    python3 tools/build_parts_manifest.py --check
    npm test

The focused test expands the configured file patterns against disk and checks
required runtime files, credits, and excluded developer material. It is not a
Windows installer build. If Electron Builder and a supported runner are
available, perform the separate package validation without publishing; until
then, do not claim installer size or platform coverage.

## Safe cleanup rules

- Do not delete, untrack, relocate, or regenerate the source SVG collection
  merely because it is not in the current manifest.
- Do not infer that sparse-excluded paths are unused, and do not lazily fetch
  absent blobs.
- Keep archive and benchmark/reference records unless an explicitly scoped
  retention decision authorizes their removal.
- When curation changes, review the ID delta from --check, update the
  manifest deliberately, then re-run the checks above.
