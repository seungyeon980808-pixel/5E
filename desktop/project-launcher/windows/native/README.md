# Native Windows project launcher

Windows 10/11 x64. The production template is built from the C modules here;
Go files in the parent directory remain format-interoperability/reference tests
and are not embedded in new projects.

Build using Zig **0.15.2** on PATH, or set `FIVE_E_ZIG` to its executable path:

```
node scripts/build-windows-project-launcher.cjs
```

The builder compiles the approved ICO/manifest with `zig rc`, links only the
used static cJSON functions, and verifies the GUI PE size before replacing the
template. Do not rebuild a saved project executable in place. JSON/config/footer
is appended to the template by `desktop/windows-project-package.cjs`.

WinHTTP uses one async operation at a time, a 35-second overall request deadline,
no automatic cookies/authentication/redirects, and validated editor origin/token.
Buffers and callback context remain alive through HANDLE_CLOSING. Handoff uses
CreateProcessW with explicit executable and quoted Unicode arguments, and the
existing receiver-owned temporary-copy receipt.

Focused checks:

```
node --test tests/test-windows-native-launcher.cjs tests/test-windows-native-adapters.cjs tests/test-windows-project-package.cjs desktop/project-open.test.cjs
```

The C core runs on macOS using CommonCrypto for the test hash adapter and UBSan.
Windows adapter tests intentionally skip on macOS. On Windows they use actual
WinHTTP, isolated registry keys, and the shipped GUI executable plus Node receiver.
The test driver is not shipped in project files. Real Explorer/installed-editor/
download security checks are additional Windows validation; current files are
unsigned development artifacts, not signed distribution candidates.

macOS download packaging is unchanged by this component.
