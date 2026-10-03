# 5E release channels

[`release-channels.json`](../release-channels.json) separates observed public deployments from the unpublished 1.6.1 candidate.

| Channel | Observed state on 2026-10-03 | Publication rule |
|---|---|---|
| Stable web | v1.6.0 at <https://www.5e.ai.kr/> | Keep this observed version until an approved deployment is verified. |
| Fixed stable web | v1.6.0 at <https://www.5e.ai.kr/1.6.0/> | Preserve the exact files from the current public source SHA. |
| Preview web | v1.7.0 Preview at <https://www.5e.ai.kr/preview/> | Preserve the current preview; do not replace it with the patch candidate. |
| Mobile web | Existing mobile preview at <https://www.5e.ai.kr/mobile/> | Preserve the current published snapshot. |
| Published desktop | v1.5.8 at the [GitHub Release](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8) | Derive from the public release and tag. |
| Web/desktop candidate | v1.6.1; desktop publication status `HOLD` | Version, UI, package, artifact names, and tag must agree. |

The observed Pages configuration is still legacy branch publication from the root of `codex/preview-1.6.0`, commit `751b1ed4622058497a6f3ba43f92333eb15268eb`. The v1.6.1 candidate has not been deployed. `channels.stableWeb` and `channels.previewWeb` describe this observed state; `candidate` and `webPublication.candidateVersion` describe the prepared release.

The canonical editor and desktop entry is root `index.html`. The proposed `Validated Web Release` workflow stages committed files from one main SHA, preserves the pinned `/preview/`, `/mobile/`, and `/1.6.0/` routes, runs source and artifact checks, and verifies all file hashes again before publication. Publication requires a separate manual main-branch operation and the configured `github-pages` environment.

The candidate deliberately has no hard-coded `sourceSha`. The build resolves the final SHA and stamps it into the web artifact and its receipt. Existing v1.6.0 history remains unchanged. A local v1.6.1 tag is a release record; tag push starts desktop CI, while website publication uses the separate Pages workflow. Existing installer signing/native/live-AI HOLD items remain in force.
