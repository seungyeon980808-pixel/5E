# GitHub Releases를 통한 데스크톱 배포

## 배포 원칙

- 설치 파일은 Git 저장소에 커밋하지 않고 GitHub Release 자산으로만 게시한다.
- `.github/workflows/windows-release.yml`은 `v`로 시작하는 태그가 푸시되면 Windows NSIS 설치 파일과 macOS DMG·ZIP을 각각 네이티브 러너에서 빌드한다.
- Windows와 macOS 빌드가 모두 성공하고 출시 보류 검사가 해제된 뒤, 설치 파일과 `SHA256SUMS.txt`를 첨부한 초안 릴리스를 만든다. 현재 1.6.1 설치판의 외부 HOLD 항목은 유지한다.
- 코드 서명을 적용하기 전에는 Windows SmartScreen 경고와 macOS의 미확인 개발자 경고가 나타날 수 있음을 명시한다.

GitHub Release 자산은 파일당 2GiB까지 허용된다. 각 설치 파일이 제한 안에 있는지 릴리스 전 확인하고, GitHub Releases를 대규모 상용 다운로드 CDN으로 사용하지 않는다.

## 게시 절차

1. 단위 테스트와 데스크톱 스모크 테스트를 통과시킨다.
2. `package.json` 버전과 태그 버전을 일치시킨다.
3. 변경 사항을 기본 브랜치에 반영한다.
4. 예를 들어 `v1.6.1` 태그를 만들고 푸시한다.

```powershell
git tag -a v1.6.1 -m "5E v1.6.1"
git push origin v1.6.1
```

태그 푸시 후 GitHub Actions의 `Desktop Release` 작업이 빌드와 출시 보류 검사를 수행한다. HOLD이면 릴리스 생성은 차단되고, 해제된 경우 Windows x64 설치 파일, macOS Intel·Apple Silicon 설치 파일, 체크섬을 초안 릴리스에 첨부한다. 태그 푸시는 웹 배포를 실행하지 않는다. 공개 전 릴리스 설명에 지원 운영체제, Codex 설치·로그인 요구사항, 알려진 제한, 서명·공증 상태를 적는다.

## 서명 방향

5E는 공개 AGPL-3.0 프로젝트이므로 SignPath Foundation 무료 OSS 코드 서명을 신청할 수 있다. 승인이 자동으로 보장되지는 않으며, 유지보수 상태·릴리스 이력·문서·MFA·검토 및 승인 역할·개인정보 처리 설명 등의 요건을 충족해야 한다.

승인 전에는 자체 서명 인증서를 공개 배포에 사용하지 않는다. 자체 서명은 사용자가 인증서를 별도로 신뢰하도록 설정해야 하므로 서명되지 않은 파일보다 설치 경험이 좋아지지 않는다.

macOS 정식 배포에는 Apple Developer ID Application 인증서와 공증이 필요하다. 현재 CI의 macOS 산출물은 패키징 경로를 검증하기 위한 미서명 설치판이며, 서명 비밀값을 등록하기 전에는 공개 정식판으로 안내하지 않는다.
