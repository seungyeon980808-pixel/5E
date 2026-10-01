# 5E 배포 채널

확인일: **2026-09-30**. 공개 웹과 공개 설치판, 설치판 후보의 상태를 구분합니다.

## 현재 사용 주소

| 채널 | 현재 안내 | 주소 |
|---|---|---|
| 정식 웹 | 1.6.0 | [www.5e.ai.kr](https://www.5e.ai.kr/) |
| 버전 고정 웹 | 1.6.0 | [www.5e.ai.kr/1.6.0/](https://www.5e.ai.kr/1.6.0/) |
| 다음 버전 미리보기 | 1.7.0 Preview | [www.5e.ai.kr/preview/](https://www.5e.ai.kr/preview/) |
| 모바일 미리보기 | 1.6.0 Mobile Preview | [www.5e.ai.kr/mobile/](https://www.5e.ai.kr/mobile/) |
| 공개 설치판 | v1.5.8 Windows | [v1.5.8 릴리즈](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8) |
| 설치판 후보 | 1.6.0, **HOLD** | 설치·실행·서명 검증 후 별도로 공개합니다. |

## 공개 상태와 소스 기록

- [v1.6.0 정식 릴리즈](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.6.0)는 **웹 출시**입니다. Windows·Mac용 1.6.0 설치 파일은 아직 없습니다.
- GitHub Pages는 `codex/preview-1.6.0` 브랜치의 저장소 루트를 게시합니다. 확인 시 배포 브랜치 HEAD는 `eb3fa3a99b3c2a77de4c6321ea9f5bb48a15cca0`이며, 이 커밋은 사이트 루트를 1.6.0으로 유지하고 `/preview/`를 1.7.0 Preview로 올린 기록입니다.
- 릴리즈 태그 `v1.6.0`은 `5549d935d0218abd4f124c521852bbbe894069e7`을 가리킵니다. 태그의 소스, 메인 README, Pages 배포 소스는 서로 다른 기록입니다.
- 날짜가 붙은 채널 정보는 그날의 확인 기록입니다. 현재 주소를 확인할 때는 페이지에 보이는 버전을 함께 확인하세요.

## 설치판 보류와 과거 후보 기록

[release-channels.json](../release-channels.json)은 **2026-09-26 후보 검증 당시의 기계 판독 기록**입니다. 그 안의 웹 1.5.3·프리뷰 1.6.0 값은 현재 공개 웹 버전 안내가 아닙니다. 후보 검사와 게시 보호에 쓰이는 파일이므로 현재 웹 안내를 맞추기 위해 보류 값을 임의로 해제하지 않습니다.

[RELEASE_HOLD.md](RELEASE_HOLD.md)의 외부 검증 상태 역시 출시 전 후보 기록입니다. 웹 출시 완료가 설치판의 서명·실기기 검증 완료를 뜻하지는 않습니다. 설치판을 게시하려면 최종 산출물과 소스 SHA에 맞춰 보류 항목을 다시 확인해야 합니다.

실제 게시 절차는 [GITHUB_RELEASES.md](GITHUB_RELEASES.md), 되돌리기 절차는 [RELEASE_ROLLBACK.md](RELEASE_ROLLBACK.md)를 참고하세요.

<details>
<summary>2026-09-26 후보 채널 기록 (당시 상태 보존)</summary>

[`release-channels.json`](../release-channels.json) is the machine-readable channel record. It separates what is public now from the unpublished 1.6.0 candidate.

| Channel | Observed state on 2026-09-26 | Publication rule |
|---|---|---|
| Stable web | v1.5.3 at <https://www.5e.ai.kr/> | Record the visible version and exact Pages source SHA. |
| Preview web | v1.6.0 Preview at <https://www.5e.ai.kr/preview/> | Keep the Preview label until promotion is separately authorized and verified. |
| Published desktop | v1.5.8 at the [GitHub Release](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8) | Derive from the public release and tag, never from `package.json` alone. |
| Desktop candidate | v1.6.0, status `HOLD` | Build from the final git SHA and record that SHA in the external artifact manifest. |

The current Pages configuration publishes the repository root of `codex/preview-1.6.0` at `09f94d830a7cec15632aa5286f6cffbe58e5f39f`. Both web entries come from that source but show different versions.

The candidate deliberately has no hard-coded `sourceSha`. A documentation commit would make such a value stale. The release build resolves the final full SHA from git and binds it to binaries and checksums in the external artifact receipt.

Metadata changes do not promote a release. Required jobs, platform evidence, checksums, and external checks must pass at the final SHA before separately authorized Pages, tag, or release writes.

</details>
