# GitHub Releases를 통한 Windows 배포

## 배포 원칙

- 설치 파일은 Git 저장소에 커밋하지 않고 GitHub Release 자산으로만 게시한다.
- `.github/workflows/windows-release.yml`은 `v`로 시작하는 태그가 푸시되면 Windows 설치 파일을 빌드한다.
- 릴리스에는 설치 파일과 `SHA256SUMS.txt`를 함께 첨부한다.
- 코드 서명을 적용하기 전 릴리스에는 Windows SmartScreen 경고가 나타날 수 있음을 명시한다.

GitHub Release 자산은 파일당 2GiB까지 허용된다. 현재 약 389MB인 5E 설치 파일은 제한 안에 있지만, 대역폭 사용이 다른 프로젝트보다 과도하면 GitHub가 제한할 수 있으므로 대규모 상용 다운로드 CDN으로 간주하지 않는다.

## 게시 절차

1. 단위 테스트와 데스크톱 스모크 테스트를 통과시킨다.
2. `package.json` 버전과 태그 버전을 일치시킨다.
3. 변경 사항을 기본 브랜치에 반영한다.
4. 예를 들어 `v1.4.0` 태그를 만들고 푸시한다.

```powershell
git tag v1.4.0
git push origin v1.4.0
```

태그 푸시 후 GitHub Actions의 `Windows Release` 작업이 설치 파일과 체크섬을 게시한다. 공개 전 릴리스 설명에 최소 지원 Windows 버전, Codex 설치·로그인 요구사항, 알려진 제한, 서명 상태를 적는다.

## 비용 없는 서명 방향

5E는 공개 AGPL-3.0 프로젝트이므로 SignPath Foundation 무료 OSS 코드 서명을 신청할 수 있다. 승인이 자동으로 보장되지는 않으며, 유지보수 상태·릴리스 이력·문서·MFA·검토 및 승인 역할·개인정보 처리 설명 등의 요건을 충족해야 한다.

승인 전에는 자체 서명 인증서를 공개 배포에 사용하지 않는다. 자체 서명은 사용자가 인증서를 별도로 신뢰하도록 설정해야 하므로 서명되지 않은 파일보다 설치 경험이 좋아지지 않는다.
