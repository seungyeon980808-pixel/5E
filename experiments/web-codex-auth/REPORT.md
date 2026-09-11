> Current correction: the replacement generation modal described below is superseded. The authenticated editor now opens the original AI image workbench through editor-bridge.js. See evidence/existing-ui/manual-qa.md for current functional verification and limitations.

## Latest outcome — in-editor generation and editing (2026-09-09)

Actual user-account image generation succeeded through the editor UI. First PNG593171bytes, available by63seconds observed; one explicit generation request, no retry or correction. The PNG was inserted, dragged, resized, undone and redone. Initial off-center placement was found and fixed to worldorigin(0,0), then the same server result was reloaded and verified centered. Final rendered image bytes match the original exactly. Details and limits: `evidence/generation/actual-verification.md`, `final-position-proof.json`, `actual-final.jpg`.

14 synthetic boundary/integration tests and467 existing tests passed. Services19383/19385 run detached for continued local use; original19382 and tracked source unchanged. Sessions remain process-local. Remote deployment, real reference-image conversion and generative editing are not claimed.

Earlier sections below are chronological history and do not describe the current AI-enabled editor.

---

# Web subscription login experiment — 2026-09-08

Base HEAD: 8cdb183e298eff2b69c863e65f8c4668d2bae4f0 (detached isolated Codex checkout). No stable source changes, commits, push, deployment, installer replacement or interaction with port 19382. The earlier three probe files were copied with no-clobber; their original files remain untouched.

## Implemented

Browser → loopback HTTP adapter → one Codex App Server process per random browser session. Every runtime has a fresh private HOME and CODEX_HOME, a file-only credential-store setting, isolated working directory and a minimal environment without inherited API keys or login cache. Browser replies contain only state, signedIn, generationEnabled=false, and the temporary device ceremony; account email, plan details, loginId, tokens, raw RPC errors and runtime stderr are not exposed or logged.

HTTP is bound to 127.0.0.1. Exact Host/Origin, SameSite Strict HttpOnly cookie, custom request header, no-store, CSP and a fixed endpoint allowlist guard the adapter. Cookies are port-scoped by name. No generic RPC proxy, thread/start, turn/start, image endpoint or generation path exists. Max 8 sessions, 30-minute cookie/idle retention and 10-minute local login deadline. Expiry clears the ceremony and requests cancellation. The deadline is local policy, not the provider's expiry time.

## Evidence boundaries

| Check | Evidence | Result/limit |
|---|---|---|
| Fresh storage starts signed out | real-result.json / Codex CLI 0.151.0 | Actual local runtime; two sessions |
| Device code issuance | real-result.json | Actual account/login/start; codes deliberately omitted from report |
| Pending reconnect, cancellation | real-result.json + actual browser reload/cancel | Actual; no user completed sign-in |
| Session B stays signed out | real-result.json | Actual unauthenticated separation only |
| Authenticated A/B isolation, logout | synthetic-result.json | Synthetic provider events/account responses only |
| Provider failure, local deadline, stale event | synthetic-result.json | Synthetic; real provider expiry unverified |
| Dead-runtime reconnect | synthetic-result.json | Synthetic dead flag recreates clean session |
| Host/Origin/CSRF/generation rejection | both result JSONs | Actual HTTP checks plus runtime allowlist denial |
| Existing project regression | npm test | 467 pass, 0 fail |
| New script syntax | node --check | Passed; no build/transpile step/dependencies |
| Image generation, PNG, remote login | none | NOT tested; AI calls 0 |

First verification attempt failed its Host test. Three possible axes were server validation, fetch header behavior, or cookie/session status. Minimal HTTP receiver observed Node fetch replacing custom Host with 127.0.0.1, while node:http preserved evil.example. Switching that test transport produced 403 and both suites passed; server Host protection was unchanged. No temporary debug instrumentation or credentials were retained.

## Operational limits

This is session/account-file separation, **not an OS security boundary**. All children run as the host user; public deployment needs independent OS/container isolation, HTTPS, durable application identity/session binding, resource limits, rate limiting and credential lifecycle review. No remote server has been supplied or used. Existing host auth is not proof that a visitor has authenticated.

Server restart creates new sessions; cookie persistence is only browser reconnect within the running process. Graceful stop requests termination of experiment children and removes experiment-owned temporary storage; abrupt host/process death may leave private temporary directories for operator cleanup. Do not publish this prototype or rely on temporary-storage behavior for production credential durability.

Cancellation can race an already completed provider login; status is reconciled with account/read, and explicit logout is available when signed in. No claim of guaranteed cancellation after provider completion is made.

The browser surface is a functional authentication spike. Responsive/interaction evidence is kept separately. Lighthouse is not measured: the available in-app browser surface has no Lighthouse/CDP audit API; no package or browser installation was performed. Do not interpret functional QA as a 100-point production performance audit.

## App Server versus Pydantic AI

The existing Node/Electron implementation already consumes Codex App Server events and PNG transport. The documented device-code flow can be shown in a remote browser without routing a localhost OAuth callback to that browser. Actual local issuance now corroborates this path, but hosted execution remains unverified.

Pydantic AI documents a CLI-free subscription provider, but its current browser flow uses localhost:1455/auth/callback and explicitly has no device flow. It has not been installed or run in this experiment. Its model support does not prove this product's image-tool event/PNG compatibility. Keeping the existing App Server image path is the lower-change candidate; that is an architectural inference, not a remote success claim.

Sources fetched 2026-09-08:
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://pydantic.dev/docs/ai/models/openai-codex/

## Quality and timing

No new image was generated. No quality or speed equivalence is established. A server-side implementation retaining gpt-5.6-sol / medium / priority, identical input bytes and the approved prompt would avoid a deliberate model/prompt downgrade; image-tool compatibility and actual output quality still need testing. Upload and server queue overhead can add latency, while inference latency varies.

The historical U01-1 values (AI 62841.9ms, preparation 17ms, inspection/display 50.5ms) belong to docs/IMAGE_FIRST_PNG_INTEGRATION_REPORT.md and are not measurements of this prototype. A future explicitly approved single PNG trial should record input preparation, upload, AI response, PNG validation/display separately. One result cannot establish statistical quality/speed equivalence; the user judges quality.

## Next external gates

1. User completes ChatGPT device sign-in themselves at the real local experiment page; observe completion and perform authenticated logout only in that experiment session. No AI call follows automatically.
2. Obtain a test-server destination and separate deployment authorization; verify from a machine without client Codex/5E.
3. Obtain explicit additional generation allowance before any assistant-run model turn. Prior allowance is exhausted. Preserve all approved generation constraints and original PNG bytes.

## Final surface verification

Seven synthetic lifecycle states were exercised in the actual in-app browser: signed out, waiting, signed in, failed, local deadline, cancelled and disconnected. Captured at 375/768/1280 ×900 after a 250ms compositor settling interval. Final evidence is JPEG with matching .jpg extensions; earlier mislabeled/stale frames are retained only under evidence/superseded/. Dimensions are recorded in evidence/dimensions.txt. This rendering evidence is not a real sign-in or remote test.

LSP is unavailable: the configured TypeScript language server is not installed and prior installation refusal was respected. All six new runnable JS/CJS files passed node --check. Root tracked files have no diff; only the experiment directory is untracked.

Independent final visual QA A and B both PASS for all 21 final frames, with no blockers. See evidence/visual-qa.md. This is a scoped local prototype verdict, not production readiness or the unperformed Lighthouse audit.

## User-completed real login follow-up — 2026-09-08

This section supersedes the earlier “real user sign-in unverified” status for the local experiment only. After the user enabled device-code authentication and completed their own consent, the real browser showed “ChatGPT 계정이 연결되었습니다.”. Reload retained that state. A fresh independent HTTP session on the same running server returned signedIn=false while the browser session remained signed in. The planned authenticated logout was then performed only in this experiment; the browser returned to “계정이 연결되지 않았습니다.”. Evidence: evidence/user-login-result.json. No OAuth credentials were read/exported and no model or image call was made.

This establishes one actual local account login/reconnect/logout lifecycle and non-sharing with a fresh unsigned session. Two different authenticated accounts, actual provider expiry, remote no-install execution and PNG quality/latency remain unverified. The experiment is now signed out following the logout test.

## Login → editor integration — 2026-09-09

The prior missing navigation is now implemented at http://127.0.0.1:19385/. The user’s existing actual login on19383 automatically entered the editor after reload, without restarting its auth runtime or logging out. Same-session account status, actual drawing+undo and access-gate tests passed. Two independent visual reviewers passed all7 captures. See evidence/editor/verification.md for exact coverage. Existing19382 source/server and original user data remain untouched.

This adds authenticated editor access only. Image inference transport remains absent and visibly disabled. It is not a completed subscription image-generation integration or remote deployment.

## Follow-up verification — 2026-09-09
- Additional HTTP boundary/integration tests: 6 passed. Product regression: 467 passed. Synthetic authentication verification passed; generation calls: 0.
- Reproduced malformed percent-encoded asset URL returning 503; fixed to return 400. Before/after evidence: evidence/followup/before.log and after.log. Live gateway returned 400 afterward; unsigned editor request returned 302.
- At continuation both loopback services (19383 and 19385) had no listeners. Cause of their termination was not established. Restarted only those experiment services; original19382 was left alone.
- Browser tab5 retained the editor and changed its status from connection failure to re-login required after service recovery. Opened account tab8 and observed unsigned state and the login button. No current user logout was invoked.
- Authentication sessions are process-local and do not survive this restart. A fresh user sign-in is required; authenticated re-entry was not retested in this follow-up. Persistence across service restarts remains a prototype limitation.
- Logs: evidence/followup/auth.log and product.log. No AI inference or remote deployment was tested.
