# Compact copy button QA

Production sharing module/CSS with local snapshot/API fixture only; no external requests or messages. Chromium using bundled Playwright. Evidence from verify.cjs and results.json.

- Desktop copy width 88px / action area 378px; mobile 88px / 295px. Both below half width.
- Rest animation `web-login-copy-orbit`; custom angle changes across 100ms; hover brightness 1.12; keyboard focus-visible verified.
- Clipboard equals displayed share URL. Success text `복사됨`, color and border `rgb(63, 185, 80)`, animation `none`; expiry unchanged.
- Reduced motion animation `none`.
- 375px dialog and copy bounds fit; dialog itself has no horizontal overflow. Screenshots 09–15 cover rest, orbit, hover, focus, reduced motion and mobile before/after copy.
- The script-stripped background desktop editor has 431px scroll width at 375px, outside this sharing fixture's initialization scope. It is recorded in results.json rather than described as a production layout result. Root separately verifies the fully initialized editor.
- Existing create, reopen, details, server-failure recovery and revoke checks still pass. Page errors: none.
