# Local web AI workbench

This experiment connects the existing 5E image workbench to an isolated local Codex App Server. It is not a remotely deployable multi-user service.

## Run

Requirements: Node.js and the Codex CLI available on PATH. From the repository root, run these in separate terminals:

```sh
node experiments/web-codex-auth/server.cjs
node experiments/web-codex-auth/editor-gateway.cjs
```

Open http://127.0.0.1:19385/login. ChatGPT browser login opens in another tab and returns the original tab to the editor after completion. Device-code entry is not required.

In **AI 이미지 생성**, attach a reference image and choose **평가원식으로 만들기**. Add a region comment to a generated result, choose **선택 영역 수정**, then review and apply the candidate. Background and stroke controls affect previews and insertion while retaining the original. Results can be compared together. Selected canvas images can be reused as references; native Mac cut/paste supports other pages and the AI reference panel.

## Verification

```sh
node --test experiments/web-codex-auth/*.test.cjs experiments/web-codex-auth/*.test.mjs
node experiments/web-codex-auth/verify.cjs
```

The tests and default verifier use synthetic runtimes and do not invoke AI. The optional generation UI fixture accepts an absolute PNG path through QA_IMAGE_PATH; its default uses a local, uncommitted evidence image. probe.cjs is a read-only local runtime probe. verify.cjs --real starts and cancels isolated browser authentication but does not sign in or generate images.

Real desktop validation on 2026-09-09 covered reference conversion, scoped circle-to-square editing with zero changed pixels outside the region, background/stroke options, version comparison, canvas insertion/movement, Cmd+X/V, reference attachment and reload recovery. A paste target outside the viewport now falls back to the viewport center. Screenshots and generated images remain local and are excluded from Git.

## Boundaries and merge notes

- Login cookies renew during use; isolated authentication storage is temporary and is lost when the authentication server restarts.
- Original workbench text-only generation and conversational requests are not connected. Image generation uses gpt-5.6-sol / medium / priority.
- Remote hosting, multiple real users, mobile readiness and prolonged unattended operation remain unverified.
- The gateway transforms selected original JavaScript modules at serve time. These transformations contain source anchors and intentionally fail when upstream structure changes. When merging another image-workbench branch, reconcile these anchors and run both tests and actual browser workflows; absence of Git conflicts does not prove compatibility.
- The original production entrypoint is unchanged. This checkpoint preserves the working experiment; formal application integration remains separate.
- PLAN.md, DESIGN.md and REPORT.md retain historical investigation notes; this README describes the current entrypoint.
