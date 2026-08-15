<!-- release-title: v1.6.0-rc.1 비공개 RC 인계 및 UAT -->

# v1.6.0-rc.1 비공개 RC 인계 및 UAT

이 문서는 에이전트가 로컬에서 만든 비공개 후보를 사람에게 인계하는 계약이다. 이 후보는 공개 릴리스가 아니며, 현재 공개 안정판은 계속 [`v1.5.8`](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8)이다. 아래 보류 항목을 실제로 확인하기 전에는 안정판 승격을 주장하거나 공개하지 않는다.

<!-- rc-handoff-contract -->
```json
{
  "schema": "5e-private-rc-handoff@1",
  "candidate": {
    "version": "1.6.0-rc.1",
    "scope": "agent-local",
    "publicReleaseClaim": false
  },
  "publicStable": "v1.5.8",
  "uat": [
    { "id": "real-account-network", "status": "DEFERRED", "passRecorded": false },
    { "id": "clean-machine-install", "status": "DEFERRED", "passRecorded": false },
    { "id": "clean-machine-upgrade", "status": "DEFERRED", "passRecorded": false },
    { "id": "clean-machine-uninstall", "status": "DEFERRED", "passRecorded": false }
  ],
  "signing": {
    "expectedStatus": "NotSigned",
    "warningRequired": true
  },
  "integrity": {
    "manifest": "SHA256SUMS.txt",
    "verificationRequired": true
  },
  "privacy": {
    "redactionRequired": true,
    "privateFilenamesForbidden": true
  },
  "issueSeverities": ["P0", "P1", "P2", "P3"],
  "recovery": {
    "rcFixForward": "1.6.0-rc.N",
    "stablePatch": "1.6.1",
    "rollbackStable": "v1.5.8"
  },
  "promotion": {
    "status": "BLOCKED",
    "gates": [
      "automated-verification",
      "sha256-verified",
      "real-account-network-uat",
      "clean-machine-lifecycle-uat",
      "no-open-p0-p1",
      "p2-decision-recorded",
      "signing-decision-recorded",
      "public-docs-promoted"
    ]
  }
}
```

<!-- section: boundary -->
## RC와 안정판의 경계

- `1.6.0-rc.1`은 로컬 검증과 제한된 인계를 위한 후보다. 태그, GitHub Release 또는 최신 안정판으로 공개하지 않는다.
- 현재 사용자가 받을 수 있는 공개 안정판은 `v1.5.8`이다.
- 자동 검증 통과는 실제 계정·네트워크 UAT나 깨끗한 Windows 수명주기 UAT를 대신하지 않는다.
- 모든 승격 조건이 충족되어 승인되기 전까지 승격 상태는 `BLOCKED`다.

<!-- section: integrity -->
## 인계 파일과 SHA-256 확인

같은 전용 RC 출력 폴더에서 설치 파일, `SHA256SUMS.txt`, `RC_MANIFEST.json`, `SOURCE_AUDIT.json`, `STAGED_ARTIFACT_AUDIT.json`을 함께 받는다. 설치 전에 `SHA256SUMS.txt`의 값과 설치 파일을 직접 비교한다.

```powershell
$expected = (Get-Content .\SHA256SUMS.txt -Raw).Trim().Split()[0].ToLowerInvariant()
$actual = (Get-FileHash .\5E-Setup-1.6.0-rc.1-windows-x64.exe -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "CHECKSUM_MISMATCH" }
```

해시가 다르거나 매니페스트의 버전·커밋이 인계 정보와 다르면 실행하지 않고 P0으로 기록한다. 비공개 파일의 원래 이름은 보고서, 채팅, 화면 캡처에 전달하지 않는다.

<!-- section: signing -->
## 서명 상태와 Windows 경고

이 비공개 후보의 예상 Authenticode 상태는 `NotSigned`다.

```powershell
(Get-AuthenticodeSignature .\5E-Setup-1.6.0-rc.1-windows-x64.exe).Status
```

서명되지 않은 앱 경고나 SmartScreen 경고가 나타나는 것이 예상된다. 경고를 조용히 우회하지 말고 문구와 선택을 민감 정보 없이 기록한다. 경고가 없다고 서명된 것으로 간주하지 않으며, 공개 승격 전에는 [코드 서명 정책](CODE_SIGNING_POLICY.md)에 따라 별도의 서명 결정을 기록한다.

<!-- section: deferred-uat -->
## 보류된 UAT

| UAT | 현재 상태 | PASS 기록 | 완료 조건 |
|---|---|---:|---|
| 실제 계정·네트워크 | `DEFERRED` | 아니요 | 소유자가 승인한 실제 계정으로 연결·요청·결과 삽입을 확인 |
| 깨끗한 Windows 설치 | `DEFERRED` | 아니요 | 새 환경에서 해시·경고·설치·첫 실행·핵심 저장을 확인 |
| `v1.5.8`에서 업그레이드 | `DEFERRED` | 아니요 | 기존 프로젝트와 설정을 보존한 채 후보로 전환되는지 확인 |
| 깨끗한 Windows 제거 | `DEFERRED` | 아니요 | 앱 제거와 사용자 데이터 보존/삭제 선택을 분리해 확인 |

이 문서를 작성한 시점에는 실제 계정, 외부 네트워크, 깨끗한 Windows 설치·업그레이드·제거를 실행하지 않았다. 실제로 실행하고 증거를 검토하기 전에는 어느 항목도 `PASS`로 바꾸지 않는다. 계정 사용량이 발생하는 검사는 소유자의 명시적 승인과 감독 아래 수행한다.

<!-- section: issues -->
## 이슈 등급과 보고 양식

- **P0** — 데이터 손실, 보안·개인정보 노출, 설치 파일 무결성 훼손. 즉시 중단하고 안정판 `v1.5.8`로 되돌린다.
- **P1** — 설치·실행 실패 또는 핵심 편집/저장 흐름 차단. 승격을 중단한다.
- **P2** — 우회 방법이 있는 제한적 기능 오류. 승격 전 수용·수정 결정을 기록한다.
- **P3** — 외관, 문구, 문서처럼 핵심 사용을 막지 않는 문제. 후속 처리 결정을 기록한다.

```text
심각도: P0 | P1 | P2 | P3
후보/커밋: 1.6.0-rc.1 / <40자리 커밋>
환경: <민감 정보가 제거된 Windows 버전과 설치 형태>
재현 절차: <최소 단계>
예상 결과 / 실제 결과: <비교>
SHA-256 / 서명 상태: <검증 결과>
첨부: attachment-01.png 등 중립 이름만 사용
복구 또는 승격 결정: <담당자와 근거>
```

사용자명, 절대 경로, 계정 식별자, 토큰, 문서 내용은 가린다. 개인 PDF·이미지 등 비공개 파일의 원래 파일명도 증거에 넣지 말고 `attachment-01`처럼 중립 이름으로 바꾼다. 가림 여부를 확인한 뒤에만 공유한다.

<!-- section: recovery -->
## 복구와 수정 배포

- 정식 `1.6.0` 전 문제는 기존 후보를 덮어쓰지 않고 `1.6.0-rc.N` 새 후보로 수정 전진한다.
- P0/P1이면 후보 사용과 인계를 중단하고 공개 안정판 `v1.5.8`로 되돌린다.
- 정식 `1.6.0` 공개 뒤 발견된 사소한 호환 버그는 변경 범위를 좁혀 `1.6.1` 패치로 낸다.
- 이미 공개한 태그, 설치 파일, 릴리스 노트의 이력은 다시 쓰지 않는다.

<!-- section: promotion -->
## 안정판 승격 조건

다음을 모두 충족하고 담당자가 결과를 검토해야만 공개 안정판 승격을 논의한다.

1. 자동 테스트와 엄격 감사가 같은 커밋에서 통과했다.
2. 인계받은 설치 파일의 SHA-256을 `SHA256SUMS.txt`와 비교했다.
3. 실제 계정·네트워크 UAT가 승인된 환경에서 통과했다.
4. 깨끗한 Windows에서 설치·`v1.5.8` 업그레이드·제거가 모두 통과했다.
5. 미해결 P0/P1이 없고 P2 각각의 수용 또는 수정 결정이 기록됐다.
6. 코드 서명 여부와 Windows 경고 처리 결정이 기록됐다.
7. 공개 문서가 후보 표현에서 안정판 표현으로 별도 승격됐다.

하나라도 남아 있으면 공개 릴리스 성공을 주장하지 않고 `BLOCKED`를 유지한다. 공개 절차 자체는 [GitHub Releases 운영 문서](GITHUB_RELEASES.md)를 따르되, 이 문서만으로 태그·푸시·릴리스를 만들 권한은 생기지 않는다.

<!-- section: references -->
## 관련 문서

- [v1.6.0-rc.1 후보 기록](RELEASE_NOTES_v1.6.0-rc.1.md)
- [Windows 데스크톱 설치와 검증](DESKTOP_WINDOWS.md)
- [코드 서명 정책](CODE_SIGNING_POLICY.md)
- [GitHub Releases 운영](GITHUB_RELEASES.md)
