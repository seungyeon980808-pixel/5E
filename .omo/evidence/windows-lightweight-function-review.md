+# Windows lightweight launcher — functional code review

**Review type:** Read-only functional/security reassessment for visual-QA integrity pass A  
**Scope:** Current native Windows launcher source and the narrow package/open tests:
`desktop/project-launcher/windows/native/{core,arguments,windows-common,windows-handoff,windows-transfer,windows-main}.c`,
the corresponding headers, `desktop/windows-project-package.cjs`,
`desktop/project-open.cjs`, and their focused tests. The legacy Go source is
format-interoperability/reference coverage only; it was not treated as evidence
that the new C runtime executes.

**Result:** `CLEAR` — **APPROVE / PASS**

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None.

## Functional and security assessment

- The C parser accepts only bounded PE32+ x64 inputs, finds the appended payload
  before an optional Authenticode certificate table, checks the SHA-256 of the
  exact source/config body, fully parses both JSON values, and retains the raw
  source bytes for delivery. This preserves the project data rather than
  reserializing it.
- The handoff path validates an absolute registered/development executable,
  creates a private random temporary directory, writes the raw document and its
  SHA-256 ownership receipt, and uses `CreateProcessW` with an explicit
  executable and Windows-correct Unicode argument quoting. The shipped receiver
  reads and validates the project before it removes only a receipt-matching
  native-owned copy.
- Web delivery uses an async WinHTTP request with a shared 35-second deadline,
  TLS 1.2/1.3, disabled cookies/redirects/authentication, restricted response
  size, and an origin/token check before invoking the shell. The response must
  use the configured editor scheme, host, port, and a lowercase 48-hex project
  token.
- Module size and ownership are reasonable: production native modules are each
  below 250 nonblank/noncomment LOC and split along parser, quoting, Win32
  common, handoff, transport, and GUI-entry responsibilities. The vendored
  cJSON implementation is clearly isolated and outside that assessment.

## Evidence independently inspected

- Current template PE is x64 GUI, **88,576 bytes**, SHA-256
  `7de61f5117b211f21d87c708f7c8b0a1617f71e282ef4edd015df7da00f10827`;
  its Node parser correctly reports that it is a template with no embedded
  project.
- `/tmp/5e-windows-project-qa/web-result.json` records a 205,643-byte fresh
  browser export, two pages/object counts `[3,1]`, successful import, damaged
  import preservation, and no errors. `desktop-result.json` records two
  restored pages, 1,312 PDF entries, 38 search hits, and no errors.
- Independently run:
  - `node --test tests/test-windows-native-launcher.cjs` — 6 passed.
    These run the new C parser on macOS and cover exact UTF-8 preservation,
    malformed/bounded payloads, certificate alignment, URL-origin/token
    rejection, loopback-only HTTP, and command-line quoting.
  - `node --test desktop/project-open.test.cjs tests/test-windows-project-package.cjs`
    — 9 passed, including the shipped receiver cleanup and damaged-import
    preservation paths.
  - `clang --analyze` on the host-compilable `core.c`,
    `arguments.c`, and pinned cJSON source — no diagnostics.
  - `git diff --check` — clean.
- `node --test tests/test-windows-native-adapters.cjs` produced the expected
  **four Windows-only skips** on macOS. This review does not count these as
  runtime proof.

## Skill-perspective check

**Ran:** yes. I read and applied `omo:remove-ai-slops` and
`omo:programming` before assessing tests and maintainability.

**Result:** no violation found. The production parsing is confined to the
untrusted executable/HTTP boundaries and is required for integrity and origin
enforcement; it is not needless extraction or normalization. The tests assert
observable behavior through product exports, the C driver, and the shipped
receiver. They are neither deletion-only, tautological, prompt-prose, nor
implementation-constant tests. No untyped escape hatches or unnecessary
abstractions were found in the reviewed C candidate.

## Verification limits

This macOS host lacks Zig 0.15.2, so I did not reproduce the final PE from
current source or independently compile/analyze the Windows-API modules. No
physical Windows execution was available: WinHTTP callbacks, registry lookup,
CreateProcessW handoff, Explorer launch, and installed-editor runtime remain
unexecuted. The test suite contains targeted Windows scenarios for those paths,
but they skipped here. These are explicit platform-validation limits, not
source-level blockers for this bounded reassessment.

## Blockers

None.

