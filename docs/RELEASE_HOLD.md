# 1.6.3 웹 게시 승인 — 설치판 HOLD 유지

2026-10-07 사용자가 검증한 라이브러리 초기 표시 개선과 A1 범위의 1.6.3 웹 릴리즈를 승인했습니다. main 통합·push·v1.6.3 태깅·검증된 웹 산출물 배포·웹 릴리즈 노트 게시를 진행합니다. 설치판은 HOLD이며 서명·기기 설치·실계정 AI 검증 보류는 해제하지 않습니다.

공개 전 검증 대상은 별도 브랜치의 검수 완료 소스 f91e7d720198c8c672507ee20b2f16fd0e121a45입니다. 이번 게시 준비에서 제품 코드·검사·의존성은 변경하지 않고 릴리즈 문서와 웹 게시 목표 버전만 갱신합니다. 실제 완료는 원격 main/태그/게시 워크플로/공개 소스 영수증의 일치로 확인합니다. 확인 전 공개 버전은 1.6.2입니다.

기존 로컬 검사: 기본 336개 통과, 브라우저 41개 묶음 확인(기존 경과시간 검사 첫 시간초과 1건은 단독 재검 통과), 실제 교과서·기출 원본 크롭 확인. 최종 게시 소스의 GitHub 검사 및 산출물 검증을 별도로 통과해야 합니다. 상세 기록은 `docs/STABILITY_FOLLOWUP_OPERATIONS.md`를 보세요.

## Historical preparation records

# 1.6.2 web publication authorized — desktop HOLD retained

On 2026-10-06 the owner authorized tagging and publication of the 1.6.2 web artifact. Publication still requires the existing source/artifact workflow checks. Installer and live-AI holds below remain unchanged. Historical local preparation records follow.

# Current local candidate

The 1.6.2 candidate remains **HOLD**. Library browsing and progressive crop changes are prepared locally; public stable web metadata remains 1.6.1. No signing, installation, server, or live-AI gate is cleared.

## Previous candidate record

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
