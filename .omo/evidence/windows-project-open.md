# Windows project open evidence (2026-09-18)

Baseline full HEAD: `7ce6c2c2bb1618443e580cfbbe7ada61fdbbf574`.
All source additions remain uncommitted. Actual candidate hashes are recorded
in `windows-open-qa/source-manifest.json`; baseline SHA alone does not certify
uncommitted changes. No commit, push, preview deployment, or editor installer
build/replacement was performed.

## Current evidence

- GUI AMD64 PE build exit 0: launcher 7,174,656 bytes, SHA-256
  `e83c1cca2cc84e21ea19378ac2577023f5b54c262fe5e8c78d8c2cfd63591760`.
- ICO 16/32/48/256 PNG entries occur exactly once each in the final PE.
  The selected blue 256px artwork hash is unchanged:
  `183b69e6198882d5f65e7f05194e702fcc6afc81ef2c6303855043218e711323`.
- Focused Node tests: 23/23 pass, 0 failures. Direct invocation:
  `node --test tests/test-windows-project-package.cjs tests/test-project-package.cjs tests/test-project-file-extension.mjs desktop/project-open.test.cjs desktop/project-status.test.cjs`.
- Go host common tests: 7 pass using
  `go test -race -shuffle=on -count=1 -timeout=2m ./...`.
  Actual production Go handoff starts a real Node child and invokes the
  shipped `project-open.cjs` receiver; exact raw JSON reaches the child and
  the receipt-owned temporary copy is removed before HTTP acknowledgement.
- golangci-lint host/Windows target: 0 issues. Nilaway project-scoped host/
  Windows target exits 0. Windows test PE compilation exits 0; its 9 tests
  (7 shared + 2 Windows registry) were NOT executed on Windows.
- Actual web menu `.exe` save, fresh import, two-page/object 3/1 restoration,
  damaged import rejection/current-work preservation: `windows-open-qa/web-result.json`.
  Host macOS; Windows selection spoof is explicitly labelled client-only.
- Actual specified development entry script, isolated profile, `.exe` data
  import, PDF data source/search preserved: `windows-open-qa/desktop-result.json`.
  Host macOS, 2 pages and object counts 3/1, zero page errors, PDF search
  entries 1,312 and “생명” hits 38. Only our test Electron process was closed.
- Personal visual inspection: fresh live editor export/import and desktop
  images, intact Korean text, images, two page tabs and existing controls.
  Captures and actual embedded icon are under `windows-open-qa/`.
- Only our existing product development server 19624 was restarted with
  current source; HTTP confirms Windows/Mac package targets injected.
  Existing 19618 server and other user apps/profiles/files were preserved.
- Changed JS/CJS syntax checks and `git diff --check` exit 0.

## Review records

- Functional initial lane / baseline SHA above / REQUEST_CHANGES:
  `windows-open-function-review.md`. Temporary-copy lifecycle finding is
  retained as history and fixed in the current candidate.
- Fresh functional lane / baseline SHA above / APPROVE / no blockers:
  `windows-open-final-review.md`. Independently checked the real receiver
  cleanup, focused Node tests and Go race tests after the fix.
- Icon/live editor fidelity lane / baseline SHA above / APPROVE:
  `windows-open-icon-review.md`. Final PE retains the exact four approved
  ICO entries; final visual captures and icon hashes are recorded here.
  There was no subsequent layout/style/icon source change.

## Limits, not success claims

No Windows OS/test PC is available in this session. Explorer icon presentation,
physical double-click, ShellExecute browser launching, registry tests, NSIS
compiler/install registration, actual compatible installed Electron cold/warm
launch, offline native operation, and downloaded file security checks remain
unverified on Windows. The cached macOS NSIS binary failed with “bad CPU type”;
no Rosetta or full editor installer was installed as a workaround.

No Authenticode signing/public project API deployment was done. PE certificate
alignment tests are format tests, not evidence of real signing. Exported EXEs
are unsigned development files. `127.0.0.1` exported here targets the machine
that opens the file; it does not reference this Mac when sent to another PC.
Windows testing requires a server on that PC or a deployed public API.

An earlier reviewer unintentionally ran the broad npm wrapper and observed
unrelated pre-existing failures. It is not used as scoped success evidence;
we did not change unrelated code to address them. The wrapper was not rerun.

Current user steps, expected results and pass criteria:
`docs/WINDOWS_PROJECT_OPEN_0918.md`.
