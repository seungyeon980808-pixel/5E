# Image engine and web AI integration

Integration branch: `codex/integrate-image-web-ai`.

Inputs:
- Web AI checkpoint `f558ad4a857e1ce18e2e663c40741a76a35168ba`.
- Image checkpoint `93ae7881cf84ffa093e5ab54245e75516cd471ca`, including persistence/insertion fixes and editable separated assets.

The branches merged without textual conflicts. The web gateway initially returned HTTP 503 for the merged AI panel because its source adapter required an obsolete help-text string. Removed that obsolete replacement and constrained removal of the PNG-save action to its own block. A gateway-level regression now parses the served module and checks both image-engine and web controls.

## Verification

- Product unit suite: 501 passed.
- Web AI suite: 57 passed.
- Synthetic authentication/isolation/CSRF verification passed.
- Real authenticated browser: image generation completed, then a selected square pendulum weight was changed to a round weight. The comparison reported 23,132 changed RGBA pixels within x [537,711), y [895,1070) of a 1254 × 1254 image. Accepted the candidate and compared both versions.
- Exercised white/all-white-removed/outer-white-removed backgrounds and thicker strokes, inserted the result into the canvas, and used the selected canvas image as an AI reference.
- Synthetic provider returning the committed real-image fixture: separated 10 objects, inserted them, cut with Command-X, pasted on another page, confirmed the source page was empty, and restored all 10 images after reload.
- Real account remained connected through gateway restart and a new editor tab. Browser console recorded no errors in the tested flow.

Local screenshots are retained under `experiments/web-codex-auth/evidence/merge/` (ignored, not shipped). Production and web test logs were retained there as well.

## Limits

This verifies the local web integration, not a packaged Windows Electron build or a public deployment. Separated images remain an experimental raster workflow, including editable default labels and their existing per-object PNG actions. The separate research report and unfinished feature proposals were deliberately excluded from this merge. Other worktrees and their recovery backups were not modified.
