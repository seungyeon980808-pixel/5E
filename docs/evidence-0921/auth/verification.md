# AI login verification

Changed `preview/js/web-login-ui.js`, `preview/js/web-ai-connection.js`, and `preview/css/web-login.css`.

- Chromium browser fixture imported the real login UI module and CSS. Actual clipboard write succeeded; only then was green copied feedback and next-action state present.
- The next-action button retained the neutral `rgb(13,17,23)` fill with an animated outline (screenshot `copy-next.png`).
- Preparing status showed elapsed seconds immediately; ready-code events replaced it.
- Simulated confirmed status rendered 3 → 2 → 1, closed, focused the AI button, and executed zero AI actions (`complete.png`). Authentication itself was mocked, not claimed as an external account login.
- Reduced-motion media query disabled the login button animation.
- Transport harness confirmed start request does not wait on fullscreen exit, duplicate start is suppressed, and cancellation emits cancelled state.
- Both JS files pass `node --check`.

Removed a fixed 350ms popup navigation wait. Preparation now sends the code request immediately instead of awaiting fullscreen transition. Neither frontend change can guarantee the latency of the external Render runtime and OpenAI code issuance. The runtime is hardcoded at `https://five-e-ai-runtime-probe.onrender.com`; backend sources are not present in this checkout. No speculative external endpoint warmup, login, or retries were introduced.

## Review corrections

Reusable harness: `PLAYWRIGHT_PATH=/path/to/node_modules/playwright BASE_URL=http://127.0.0.1:8767 node docs/evidence-0921/auth/check.mjs`.
The harness extracts all stylesheet links, including Google Fonts, from the current preview index and waits for fonts. It sets the same explicit dark theme attribute as the app. Screenshots were replaced with app-global/font captures, plus `light-download-hover.png`.

Additional checks pass: popup blocked after successful copy preserves next-action orbit; cancellation reopens idle with enabled login button; authentication error does not retain preparation countdown; cancelling completion cannot close a subsequently reopened dialog; light download hover inherits theme foreground. Korean copy uses keep-all to avoid isolated syllable lines. Light-theme ChatGPT logo remains visible.
