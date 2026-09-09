# Authentication experiment surface

Existing 5E component system: cool slate panel and blue action from root DESIGN.md / css/style.css. This is an isolated operational login screen, not a product redesign. No generated imagery or extra dependencies are needed for this task.

Tokens: app #0d1117, panel #161b22, border #30363d, text #e6edf3, secondary #b1bac4, accent #2f81f7. System sans typography 16px/1.65; heading 28px; code 24px monospace. Spacing 8/16/24/32px; panel radius 12px; max width 560px. Tonal surfaces with border, no shadow. Buttons and link targets at least 44px tall; white action text uses darker #0969da for contrast. Outline focus 3px. No animation needed for these discrete authentication states.

One responsive main panel with heading, context, live status, device instructions, action group and experiment boundary. Korean word-break keep-all; code overflow-wrap anywhere. At 375/768/1280px it reflows without horizontal scrolling. Semantic buttons; status aria-live; disabled requests prevent accidental duplicates. Same-device tabs share the browser cookie; different browser profiles are independent. No OAuth tokens or account PII in the DOM. Device code is visible only while needed.

States: signed-out, waiting, signed-in, cancelled, login-failed, local-timeout, disconnected. Local-timeout is the adapter's own deadline, not proof of provider expiry. Reconnect reloads status with the same cookie while server and session remain alive. Process restart persistence and remote HTTPS are outside this prototype.

QA correction: dedicated action-text #fff; boundary note uses three short sentence lines to keep Korean auxiliary phrases together on narrow screens.

QA correction: each lifecycle status is a short Korean sentence that fits the narrow panel; the device instruction is “아래 코드를 입력하세요.”. Network failures expose only a short connection message and a reconnect button.

## Authenticated editor entry
Preserve the root 5E editor DOM and CSS. Gateway serves the existing editor from this checkout under /editor/ and injects only a compact 44px session strip above the editor. Tokens inherit --text-primary, --text-label, --bg-panel, --border-strong and --accent; status text 13px with 8px gap. No overlay, screenshot substitute or editor redesign. Browser authentication uses the same existing local auth session. Login success replaces the login page with /editor/. Logged-out direct entry returns to login. Polling failure shows a reconnect action without clearing or navigating away from unsaved editor work. The existing AI control is disabled and labelled “AI 이미지 연결 준비 중” because inference transport is not implemented. Session controls include a link back to account settings, not an automatic logout.

## In-editor image generation
Use the existing image button to open a native modal dialog; preserve the editor behind it. Reuse panel, text, border and accent tokens. Dialog max width 560px, 24px padding (16px below 480px), radius12px, 16px text/1.65 line height, 24px heading, 8/16px gaps, 44px minimum controls, 120px textarea and 240px contained preview. Backdrop black at 55%. Semantic labels, live status, native focus trap/Escape, explicit close; busy state prevents duplicate generation. Reference file optional; description required only without a reference. Completion keeps the raw PNG preview and offers canvas insertion and original PNG download. Insertion uses existing state/import path with preserveBytes. Error/cancel retains input; recovery uses same job id and never resubmits implicitly. No new dependency, animation or design overhaul. Personas: teacher composing a science diagram; keyboard user navigating generation and result actions. QA covers empty/running/result/error modal at375/768/1280. Existing editor's narrow-screen layout remains the inherited desktop-oriented surface.

QA correction: editor world origin is the artboard center, so new PNG insertion uses at(0,0), not a width/height-derived center. Recent-result retrieval is always available on a fresh dialog so a page reload can recover the same server job without a new generation call.

## Background option
Preserve original AI workbench. Add a compact labeled native select above existing output buttons: outer-only transparency(default), white preserved. Use existing slate tokens; checkerboard only behind transparent result pixels. Original image remains unchanged for AI revision and can be restored by selecting white. Preview, save and insertion share policy. Keep status readable and expose native accessible label.

Background labels updated to user wording, in order: 모든 흰색 배경 제거 / 물체 외부 흰색 배경 제거(default) / 흰색 배경. All-white mode explicitly warns that internal white is removed.

Original workbench follow-up: remove PNG action; add line thickness native select next to background; defaultoriginal. Drag existing comment pins/areas with clamped geometry. Status region adjacentto action buttons for busy/error/scopedcompletion, using existingcolor tokens and polite live region. Originalprogress overlay enabled for scopedgeneration.

## Result review and reference entry
Keep original workbench tokens/layout. Candidate review leads with before/after pictures and “이 결과 사용”; one plain sentence explains keeping the original. Pixel metrics and mask are optional collapsed “변경 상세”. Latest result is default; optional simultaneous result comparison keeps explicit active selection. Selected canvas image is the direct reference for AI editing, without repeating file selection.

Comparison grid uses inherited controls with 200px minimum cards, 320px rows and 8px gaps, explicit active result border.

Below600px comparison mode stacks results above comments in a scrollable workspace; result section and comment section use540px minimum working area. Candidate preview refits on width changes.
