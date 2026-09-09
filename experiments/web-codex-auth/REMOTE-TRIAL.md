# Private Render trial

Base: integrated image/web AI checkout 9b4baa054e3ab4441129f1ded600c68b5f207ee8.
Deployment branch: codex/render-ai-trial. Main/Pages remain unchanged.

Build: `npm install --prefix .render-probe --no-package-lock --no-audit --no-fund @openai/codex@0.153.4`

Start: `PATH="$PWD/.render-probe/node_modules/.bin:$PATH" node experiments/web-codex-auth/remote-trial.cjs`

Use Render Free Singapore, Node >=18, auto-deploy Off, health `/healthz`.
Set a random 32-byte hexadecimal `TRIAL_ACCESS_KEY` in Render environment only.
Render supplies `RENDER_EXTERNAL_URL`; elsewhere set exact HTTPS `TRIAL_PUBLIC_ORIGIN`.
Open `/trial/<key>` privately to establish the six-hour HttpOnly/Secure trial cookie.
Treat the invitation as a password; it can remain in browser/hosting request history. Rotate the key after the trial. Never commit the key or a ChatGPT auth cache.

The editor loads without ChatGPT login. Account opens device-code authentication.
Only one browser auth session is allowed, and existing Generation serializes image work.
Device authentication uses the tester's own ChatGPT account; no API-key fallback.
The first remote login and real generation/editing must be explicitly observed before claiming AI success. Initialization or health200 alone is not AI verification.

Polling keeps sessions alive while editor/account tabs remain open. Once requests stop, auth expires after 30 minutes. Render restart/spin-down loses temporary auth and output files; reauthentication is expected. No persistence guarantee.

Trial sequence: open editor → account/login → copy code to official OpenAI page → return to editor → generate one image → insert → select and AI-edit → select region and revise → apply/cancel. Check background options, stroke thickness and result comparison. Save the working project locally before closing. Compare same prompt/reference on local and remote; measure first wake separately from image generation. No automatic retries or load test using real credits.

Validation before deployment: 55 auth/image adapter tests passed. Proxy manually exercised with HTTP health, invitation, unauthorized request, and cross-origin rejection. Full browser and user login checks remain deployment evidence, not unit-test coverage.

## Accepted checkpoint — 2026-09-10

The user completed remote account connection and exercised image generation and object separation. They reported satisfactory single-user responsiveness relative to local use. This is not a concurrent-user capacity benchmark.

Retain device-code authentication for initial remote connection. A code-free initial login for an independent hosted website using ordinary ChatGPT subscriptions was not established through the supported interfaces. The hosted success-page option still uses a localhost callback; external-token mode requires an existing token acquisition flow. Codex access tokens are currently documented for Business and Enterprise workspaces, not a general Plus/Pro web sign-in solution.

Sources checked: [authentication](https://learn.chatgpt.com/docs/auth), [App Server authentication](https://learn.chatgpt.com/docs/app-server), [access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens).

This checkpoint includes completed-task indicators, optional per-object labels with a global suppression control, and width-fitted single-result previews. The combined focused UI and remote-adapter suite passes 80 tests. Local browser interactions and nine responsive screenshots were reviewed; synthetic fixtures verify UI behavior without claiming an additional live AI generation run.

Follow-up work is separate from this checkpoint:

1. Persist and recover per-user authentication securely to reduce repeated device-code entry. Current temporary sessions remain unchanged; reauthentication may still be required after expiry or revocation.
2. Measure concurrent-session limits and resource use before widening access beyond the private single-session trial.
3. Plan the remaining editor/image improvements from the research report in separate workstreams.

Committing this checkpoint does not deploy it. Render auto-deploy remains off; publish and test the new revision as a separate deployment step after protecting any active user project.
