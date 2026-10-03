# Release hold

The 1.6.1 candidate remains **HOLD**. This patch prepares canonical source recovery, PDF page-cache cleanup, and validation of the exact web artifact. It does not clear the existing signing, native Windows, server authentication, or live AI release gates.

The web candidate is separate from desktop publication. The public stable web remains 1.6.0 until the separately approved main integration and Pages cutover. The 1.7.0 preview, mobile route, fixed `/1.6.0/` route, and existing v1.6.0 tag are retained. A local v1.6.1 tag alone neither changes Pages nor publishes an installer.

## v1.6.0 historical decision

The 1.6.0 candidate remains **HOLD**. Documentation preparation and implementation review do not satisfy the external release gates.

| Gate | Status | Release effect |
|---|---|---|
| Windows signing | `PENDING_EXTERNAL` | Do not describe the Windows candidate as signed. |
| Native Windows validation | `PENDING_EXTERNAL` | Do not publish the Windows installer without native evidence. |
| Server deployment and authentication | `PENDING_EXTERNAL` | Do not claim the server-backed flow is production-ready. |
| Live authenticated AI | `PENDING_EXTERNAL` | Do not claim the authenticated live flow passed. |
| Worktree retention/cleanup | `PENDING_OWNER_APPROVAL` | Keep release worktrees until the owner decides retention. |
| Seven legacy candidate assets | `UNVERIFIED` | The seven legacy preview PNGs and catalog are removed/unbundled from the 1.6.0 candidate, so they are not distributed there; provenance and rights remain unresolved. |
| Published v1.5.8 checksum | `OPEN_PENDING_PUBLICATION` | The public checksum uses the wrong basename. A corrected private packet exists, but the public asset is still wrong. |

The seven `UNVERIFIED` sample IDs are `p1_2025_11_05`, `p1_2026_06_12`, `p1_2026_09_01`, `p1_2026_11_01`, `p1_2026_11_08`, `p1_2027_06_01`, and `p2_2027_06_13`. Their candidate preview PNGs and catalog entries are removed/unbundled, preventing distribution in the candidate; this does not verify their provenance or rights. The public root v1.5.3 library remains unchanged pending cutover.

The v1.5.8 public installer is `5E.Setup.1.5.8.exe` (391187448 bytes), SHA-256 `04d30dacf9b3dd8e63889872527f69a95a96106dc7d4e709ab933dd55de65487`. Its checksum is usable only when the checksum line uses that exact basename. Replacing a public checksum asset requires separate authorization.
