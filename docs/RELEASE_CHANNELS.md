# 5E release channels

[`release-channels.json`](../release-channels.json) defines the v1.6.1 publication configuration. The previous observed public deployment is retained in `previousWebDeployment`; configuration and tag creation alone do not prove that publication succeeded.

| Channel | Release configuration | Publication rule |
|---|---|---|
| Stable web | v1.6.1 at <https://www.5e.ai.kr/> | Publish only the validated artifact from the tagged main SHA. |
| Fixed stable web | v1.6.0 at <https://www.5e.ai.kr/1.6.0/> | Preserve the exact files from the pinned public snapshot. |
| Preview web | v1.7.0 Preview at <https://www.5e.ai.kr/preview/> | Preserve the existing preview. |
| Mobile web | Existing mobile preview at <https://www.5e.ai.kr/mobile/> | Preserve the existing published snapshot. |
| Published desktop | v1.5.8 at the [GitHub Release](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8) | Derive from the public release and tag. |
| Desktop candidate | v1.6.1; publication status `HOLD` | Signing, native validation and the existing release holds remain required. |

Before this release, the observed Pages source was legacy branch publication from `codex/preview-1.6.0`, commit `751b1ed4622058497a6f3ba43f92333eb15268eb`, with v1.6.0 at the root. That snapshot remains the immutable source for `/preview/`, `/mobile/`, and `/1.6.0/`.

The canonical editor and desktop entry is root `index.html`. `Validated Web Release` runs the complete source browser suite on macOS, then stages committed files from one main SHA on Linux, preserves the pinned routes, tests the actual staged files, and verifies every hash again. The main and preview branches require `Test` and `Release Identity`; the `github-pages` environment permits main only and requires deployment approval.

`webPublication.status` specifies the required publication gate, rather than a claim that deployment is already complete. Confirm publication using the successful [Validated Web Release run](https://github.com/seungyeon980808-pixel/5E/actions/workflows/web-release.yml), its validation receipt, the Pages deployment, and the source SHA displayed on the public editor. The main commit, v1.6.1 tag target and public receipt must agree.

The candidate has no hard-coded source SHA. The build resolves the final commit and stamps it into the exact tested artifact and receipt. Existing v1.6.0 history remains unchanged. Tag push starts desktop CI; website publication uses the separate Pages workflow. Existing installer signing/native/live-AI HOLD items remain in force.
