# Windows launcher lightweight candidate (2026-09-18)

Baseline HEAD: `7ce6c2c2bb1618443e580cfbbe7ada61fdbbf574`.
Changes remain uncommitted; baseline SHA alone is not coverage of uncommitted
source. Candidate hashes and captures: `windows-lightweight-qa/`.

## Deliverables and status

- Completed: replace production Windows Go template with native C + system
  WinHTTP/BCrypt/registry/process/shell APIs, preserving original payload,
  integrity, receiver preference, receipt ownership and blue icon.
- Completed: Zig0.15.2 pinned reproducible C/resource build, parser/license
  vendoring, <512KiB per-project overhead regression and Windows-native tests.
- Completed: targeted checks and real local web/development-app restoration.
- Completed: explain previous macOS ZIP packaging; no Mac product/assets changed.
- Remaining outside current local verification: actual Windows OS GUI/adapter/
  installed-editor/download-security QA, signing/public/installer distribution.
  No supported Windows machine is available in this session.

## Candidate size and resource

Previous production template: 7,174,656 bytes.
New production template: **88,576 bytes**, **98.7654% smaller**.
SHA256: `7de61f5117b211f21d87c708f7c8b0a1617f71e282ef4edd015df7da00f10827`.
This includes all four approved PNG icon resources:16/32/48/256px. Each exact
ICO entry occurs once in this final PE.256px SHA256 remains
`183b69e6198882d5f65e7f05194e702fcc6afc81ef2c6303855043218e711323`.
GUI subsystem2; PE DLL characteristics0x8160 include ASLR/NX flags.
Symbol exports of unused parser printing functions were removed for static
linking. Actual document JSON/config/footer is appended without conversion.

## Direct observations

- Node20 tests:16 pass,0 failures,4 Windows-only API tests skipped onMac.
  `node --test tests/test-windows-project-package.cjs desktop/project-open.test.cjs tests/test-project-file-extension.mjs tests/test-windows-native-launcher.cjs tests/test-windows-native-adapters.cjs`
- Shared production C code executes onMac using a test-only CommonCrypto hash
  adapter and UBSan; six tests cover actual product export bytes, corrupt/
  truncated/oversized data, PE certificate layout, origin/credentials/tokens,
  loopback URLs and Windows argument quoting. The platform-gated test suite
  was rerun after its host selection changed and remains6/6.
- The size regression failed onthe old7MB template first: overhead7,177,821.
  It passes onthe newtemplate with original raw JSON unchanged.
- Zig0.15.2 productionGUI and Windows test-driver builds exit0 withWall/Wextra/
  Werror. Testdriver is not shipped. Windows adapter tests are compiled/prepared,
  not run onMac. Manual Windows workflow updated; no remote job dispatched.
- Clang analyzer reports for core,arguments,Wincommon,handoff,transfer,main:
  zero diagnostics. The final Windows API analysis uses direct Clang target
  headers; Zig's --analyze wrapper attempted to link analyzer output and was
  not used as successful analysis evidence.
- LegacyGo7 race tests pass parsing the newPE and existing interoperable
  footer/settings. These are compatibility/reference checks, not evidence
  that the replacement C WinHTTP/process functions ran onWindows.
- Actual isolated Chromium product menu downloads`5E 프로젝트.exe`205,643bytes.
  That includes112,226-byte fixture original withKoreantext,rectangleandimage.
  Fresh normal project import restores2pages/objectcounts3,1; corrupted
  import preserves current work;0pageerrors. HostDarwin withWindows browser
  selection only. Fresh screenshots/results saved underwindows-lightweight-qa.
- Actual specified `scripts/start-library-repair-dev.command` restarts our
  own isolated development app, imports newEXE asdata and restores2pages3,1;
  PDF data/search preserved1312entries38“생명”hits;0pageerrors. Onlyour test
  app wasclosed; existinguser profiles/data/PDF path/server19618 preserved.
- Existing localweb19624reads template/notices on each export and uses new
  binary. NoJS/CSS/editorlayout changes inthis task. NoMac binary/icon change.
- Newbuilder/test JS syntax andgitdiff whitespace checks exit0.

## Instrumentation limits

The hostAppleAddressSanitizer driver hung before main in ASan shadow-memory
initialization. Sample`asan-startup-hang.sample.txt` showsdyld/ASan recursion/
spin; it is not a launcher parser failure. Onlythat ownedtest process was
terminated. SameC code executes correctly usingUBSan; noASanpassis claimed.
Zig0.16 GNU runtime linking failed on undefined CRTsymbols; production pins
workingZig0.15.2 and verifiedits archiveSHA. No compilerinstalledglobally.

## Review lanes

Both current read-only reports bind to baselineHEAD above and the exactPE
hash statedhere; sourcehashes accompanythecapturedcandidate.
- Functional/source integrity: `windows-lightweight-function-review.md`, PASS,
  no blockers after Ccore/package/receiver checks.
- Icon/live editor/CJK fidelity: `windows-lightweight-icon-review.md`,
  APPROVE, no blockers after direct reference/resource/live capture inspection
  and 11 targeted tests. Lane baseline HEAD: `7ce6c2c2bb1618443e580cfbbe7ada61fdbbf574`;
  exact uncommitted PE SHA256: `7de61f5117b211f21d87c708f7c8b0a1617f71e282ef4edd015df7da00f10827`.
  Older windows-open review reports are historical and not current coverage.

## Mac ZIP explanation

In the earlier Mac implementation, the author chose ZIP to transport the
.app folder bundle asone browser download. It was not an additional feature
requested by the user. Unzipping is an extra action, so that earlier web
packaging choice needs review alongside the user's double-click requirement.
This Windows optimization did not add/remove/change the Mac ZIP flow.

No commit,push,preview deployment,editor installer build/replacement or
Authenticode signing. PhysicalWindows Explorer/defaultbrowser/compatible
installedElectron cold/warm operation andWindows-specific native tests are
still unverified. Loopback files generatedonthisMac targettheopeningmachine,
sootherPC testingneedsitsownlocalserveroradeployedpublicAPI.

Usersteps/passcriteria: `docs/WINDOWS_PROJECT_OPEN_0918.md`.
