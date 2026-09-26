# 5E release channels

[`release-channels.json`](../release-channels.json) is the machine-readable channel record. It separates what is public now from the unpublished 1.6.0 candidate.

| Channel | Observed state on 2026-09-26 | Publication rule |
|---|---|---|
| Stable web | v1.5.3 at <https://www.5e.ai.kr/> | Record the visible version and exact Pages source SHA. |
| Preview web | v1.6.0 Preview at <https://www.5e.ai.kr/preview/> | Keep the Preview label until promotion is separately authorized and verified. |
| Published desktop | v1.5.8 at the [GitHub Release](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8) | Derive from the public release and tag, never from `package.json` alone. |
| Desktop candidate | v1.6.0, status `HOLD` | Build from the final git SHA and record that SHA in the external artifact manifest. |

The current Pages configuration publishes the repository root of `codex/preview-1.6.0` at `09f94d830a7cec15632aa5286f6cffbe58e5f39f`. Both web entries come from that source but show different versions.

The candidate deliberately has no hard-coded `sourceSha`. A documentation commit would make such a value stale. The release build resolves the final full SHA from git and binds it to binaries and checksums in the external artifact receipt.

Metadata changes do not promote a release. Required jobs, platform evidence, checksums, and external checks must pass at the final SHA before separately authorized Pages, tag, or release writes.
