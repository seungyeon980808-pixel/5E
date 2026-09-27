<div align="center">

<img src="assets/logo.svg" alt="5E 로고" width="96" />

<p>
  <img src="https://img.shields.io/github/license/seungyeon980808-pixel/5E?style=flat-square&color=2f81f7" alt="License: AGPL-3.0" />
  <img src="https://img.shields.io/badge/web-no__install-1f6feb?style=flat-square" alt="no install" />
  <img src="https://img.shields.io/badge/PWA-installable-3fb950?style=flat-square" alt="PWA" />
</p>

<p><strong>과학 교사를 위한 시험용 그림 편집기</strong></p>

<p><a href="https://www.5e.ai.kr/">웹에서 사용하기</a> · <a href="https://www.5e.ai.kr/preview/">1.6.0 미리보기</a></p>

<p><a href="https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8">최신 릴리즈 <strong>v1.5.8</strong> — Windows x64 설치판</a></p>

</div>

---

5E는 과학 시험지와 학습지에 넣을 그림을 찾고, 그린 뒤, 편집하는 도구입니다. 기출·교과서 자료에서 필요한 장면을 가져오거나 좌표·함수, 선·도형, 과학 부품으로 새 그림을 만들 수 있습니다. 작업한 그림은 이미지로 저장하고 프로젝트 파일로 보관할 수 있습니다.

## 지금 사용할 수 있는 버전

| 채널 | 버전 | 이용 방법 |
|---|---|---|
| 웹 | 1.5.3 | [5E 열기](https://www.5e.ai.kr/) · 설치 없이 사용 |
| 웹 미리보기 | 1.6.0 Preview | [미리보기 열기](https://www.5e.ai.kr/preview/) · 개발 중인 화면 |
| Windows x64 설치판 | 1.5.8 | [GitHub Release에서 다운로드](https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8) |
| 다음 릴리즈 후보 | 1.6.0 | [변경 내용](docs/RELEASE_NOTES_v1.6.0.md) · **아직 게시되지 않음** |

1.6.0 후보는 공개 설치판을 대체하지 않습니다. 배포 상태와 웹 채널의 출처는 [릴리즈 채널 기록](docs/RELEASE_CHANNELS.md), 게시 전 확인 항목은 [릴리즈 보류 기록](docs/RELEASE_HOLD.md)에서 볼 수 있습니다.

## 그림 만들기

1. **자료에서 시작하기** — 라이브러리에서 그림을 고르거나 PDF에서 필요한 영역을 자릅니다. 파일을 선택하거나 클립보드의 이미지를 붙여넣을 수도 있습니다.
2. **캔버스에서 편집하기** — 오브젝트를 이동·자르기·회전하고, 선·도형·텍스트·지시선·좌표/함수를 더합니다.
3. **결과 보관하기** — 이미지로 저장하거나 프로젝트 파일로 저장해 다음 작업에서 다시 엽니다. 버전을 옮기기 전에는 프로젝트 파일을 별도로 보관하세요.

### Lite와 Pro

**Lite**는 자주 쓰는 도구와 캔버스에 집중한 화면입니다. **Pro**는 더 많은 그리기·오브젝트 도구를 제공합니다. 1.6.0에서는 모드를 바꿀 때 현재 작업을 이어갈지 새 작업으로 시작할지 선택할 수 있습니다. [1.6.0 변경 내용](docs/RELEASE_NOTES_v1.6.0.md)에 작업 복구와 편집 개선을 정리했습니다.

### AI 이미지 작업

Windows 설치판의 AI 기능은 사용자가 요청할 때 로컬 Codex 연결을 통해 사용합니다. 로그인한 계정의 기능과 이용 한도가 적용되며, 5E는 계정 비밀번호나 인증 토큰을 저장하지 않습니다. 1.6.0의 AI 변환·영역 수정 흐름은 아직 후보 상태입니다. 실제 연결이 준비되지 않아도 일반 그리기·편집 기능은 사용할 수 있습니다.

## 안내와 개발 문서

- [사용 가이드](docs/USER_GUIDE.md) — 기존 기능의 상세 설명. **1.1.0 기준 문서**이므로 1.6.0 화면과 다른 부분은 후보 릴리즈노트를 확인하세요.
- [Windows 데스크톱 안내](docs/DESKTOP_WINDOWS.md) — **1.5.3 기준 개발 문서**. 설치판 사용자는 각 [GitHub Release](https://github.com/seungyeon980808-pixel/5E/releases)의 설명을 우선 확인하세요.
- [릴리즈 이력](https://github.com/seungyeon980808-pixel/5E/releases) · [1.6.0 릴리즈노트 초안](docs/RELEASE_NOTES_v1.6.0.md)
- [문서 지도](docs/README.md) · [설계 기록](DESIGN.md) · [배포 절차](docs/GITHUB_RELEASES.md)

자세한 단축키는 앱 안의 **단축키 도움말**을 확인하세요. 기존 문서의 단축키 표는 1.6.0 화면과 대조 중입니다.

## 로컬에서 실행·검사

웹 화면은 정적 파일입니다. 저장소 루트에서 아래 명령을 실행한 뒤 `http://localhost:8000`을 여세요.

```sh
python3 -m http.server 8000
```

1.6.0 후보의 데스크톱 개발에는 [Node.js 24.21.x](.nvmrc)가 필요합니다.

```sh
npm ci
npm test
npm run test:browser
npm run verify:release-identity
npm run desktop
```

데스크톱 스모크 검사와 패키징은 실행 환경과 인증 준비가 필요합니다. 명령과 범위는 [package.json](package.json)과 [릴리즈 보류 기록](docs/RELEASE_HOLD.md)을 참고하세요.

## 라이선스

5E는 [GNU AGPL v3](LICENSE)로 배포됩니다. 포함된 이미지·자료의 출처와 이용 조건은 [이미지 출처](docs/credits.html)를 확인하세요.

개발: 박승연 · Copyright © 2026 박승연
