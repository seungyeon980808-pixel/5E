# 5E 1.6.0 Preview

The public preview at <https://www.5e.ai.kr/preview/> was observed on 2026-09-26 from Pages source `codex/preview-1.6.0:/` at `09f94d830a7cec15632aa5286f6cffbe58e5f39f`.

That published snapshot is distinct from the unpublished 1.6 desktop candidate. The implementation baseline reviewed for candidate documentation was `8d98bab0f5c9f762a6d8ed6ca8c50e4e369d4013`; it is not a final release SHA. Final source provenance is captured from git at build time in the external artifact manifest.

Browser settings, IndexedDB databases, and AI session choices use a `5e.preview:` prefix. The manifest uses a relative start URL and scope. No service worker is registered. Desktop-only local integrations require the desktop application.

Preview publication does not satisfy the release holds in [`docs/RELEASE_HOLD.md`](../docs/RELEASE_HOLD.md).
