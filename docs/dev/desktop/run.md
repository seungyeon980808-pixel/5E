# 설치판 개발 실행 (맥·윈도우)

> 1.7.1 정리: 아래 문서를 한 파일로 모았습니다 — `DESKTOP_MACOS.md`, `DESKTOP_WINDOWS.md`. 내용은 원문 그대로이며 개인 경로만 지웠습니다.

---

## 5E macOS 데스크톱판

### 개발 실행

1. Node.js 20 이상과 Codex CLI를 설치한다.
2. 저장소 루트에서 `npm install`을 실행한다.
3. `npm run desktop`으로 실행한다.

macOS에서는 창을 닫아도 애플리케이션이 유지되며 Dock 아이콘을 누르면 편집기 창이 다시 열린다. 제목 표시줄은 좌측 신호등 버튼 영역을 비우고 5E 패널 색상을 사용한다.

### 설치 패키지

`npm run package:mac`은 Intel용과 Apple Silicon용 DMG·ZIP을 `release/`에 만든다. DMG는 사용자가 설치할 때 쓰고 ZIP은 보관·자동 업데이트 경로를 준비하기 위한 배포 자산으로 함께 생성한다.

로컬 기기의 Apple Silicon 설치판만 빠르게 확인하려면 다음 명령을 사용한다.

```bash
npx electron-builder --mac dmg --arm64 --publish never
```

패키지에는 전용 `.icns` 아이콘과 `public.app-category.education` 카테고리가 포함된다.

### 서명 전 설치 확인

현재 밑작업 단계의 macOS 패키지는 Developer ID 서명과 Apple 공증을 연결하지 않았다. 내부 확인용 미서명 DMG를 실행할 때 Gatekeeper가 차단하면 Finder에서 앱을 Control-클릭한 뒤 `열기`를 선택한다. 일반 사용자에게 배포하는 정식 릴리스에서는 이 우회 절차를 요구하지 않도록 서명과 공증을 연결해야 한다.

### 검증

- `npm test`: 플랫폼 설정과 기존 데스크톱 기능의 단위 검증
- `npm run test:desktop`: 실제 Electron 창, preload IPC, 앱 아이콘, 주요 편집기 진입 동작 검증
- `npm run package:mac`: Intel·Apple Silicon 설치 자산 생성

정식 릴리스 전에는 생성한 DMG를 마운트하고 앱을 `/Applications`에 복사한 뒤 새 사용자 데이터 환경에서 실행한다. AI 연결, 프로젝트 저장, 이미지 내보내기와 앱 재실행을 확인한다.

---

## 5E Windows 데스크톱판

### 개발 실행

1. Node.js 20 이상과 Codex CLI를 설치한다.
2. 저장소 루트에서 `npm install`을 실행한다.
3. `npm run desktop`으로 실행한다.

개발 중에는 설치·삭제를 반복하지 않는다. 소스를 수정한 뒤 `npm.cmd run desktop`으로 바로 실행하고, 자동 검증은 `npm.cmd test`와 `npm.cmd run test:desktop`을 사용한다. `test:desktop`은 실제 Electron 화면을 열어 고급 기능 버튼, AI 패널 열기, Codex 로그인 상태 IPC, App Server 시작·종료를 확인하고 자동 종료한다.

Codex CLI가 PATH에 없거나 로그인하지 않은 경우 AI 패널이 각각 `연결 실패` 또는 `Codex 로그인 필요`로 표시한다. `로그인` 버튼은 Codex의 기존 로그인 흐름을 열며, 5E는 토큰·비밀번호를 저장하거나 읽지 않는다.

### 설치 패키지

`npm run package:win`은 정식 `release/5E Setup 1.5.3.exe` NSIS 설치 파일을 만든다. 설치 후 5E는 기존 `index.html`과 ES 모듈을 그대로 사용하고, AI 기능만 안전한 preload IPC로 추가된다.

### 보안과 제한

- 렌더러에는 Node.js 권한이 없고, 외부 링크는 HTTPS만 기본 브라우저로 연다.
- Codex 통신은 로컬 stdio App Server만 사용한다. 서버를 외부 WebSocket에 노출하지 않는다.
- 참고 이미지는 생성 요청 동안 `%TEMP%\\5e-codex`에 제한적으로 저장되며 요청 완료 또는 App Server 종료 시 삭제한다.
- 대화 ID는 `localStorage`의 `5e.aiConversationId`에 저장하여 앱을 다시 열어도 `thread/resume`으로 이어간다. 토큰이나 계정 비밀번호는 저장하지 않는다.
- 현재 설치된 Codex가 생성한 공식 App Server 스키마에 맞춰 `initialize`, `thread/start`, `thread/resume`, `turn/start`, `turn/interrupt`를 사용한다.
- `item/completed`의 `imageGeneration` 결과는 허용된 이미지 형식과 20MB 제한을 확인한 뒤 data URL로 변환하여 미리보기로 전달한다.
- 이미지 생성 자체는 ChatGPT/Codex 계정과 해당 모델 기능이 필요하다. 로그인하지 않은 상태에서 로컬 편집·저장·내보내기는 계속 사용할 수 있다.
- 설치 파일에는 전용 `.ico` 앱 아이콘이 포함된다. 배포용 코드 서명 인증서는 아직 연결하지 않았으므로 외부 배포 전 서명 상태를 릴리스 설명에 명시한다.

웹판에서 `AI 이미지 생성/변환`을 누르면 설치 안내만 표시된다. preload API가 있는 데스크톱판에서는 같은 버튼이 실제 AI 패널을 연다.

### AI 이미지 생성 속도

- 대화와 이미지 렌더링은 서로 다른 스레드를 사용한다. 대화는 이어 가되, 이미지 생성은 매번 임시 스레드에서 확정된 요구사항과 필요한 참고 이미지만 전달한다.
- 같은 대화에서 이미 전송한 참고 이미지는 다시 보내지 않는다. 이미지 생성용 전송 사본은 긴 변 1536px, 최대 2.5MP로 제한하며 캔버스에 쓰는 원본은 변경하지 않는다.
- 생성 프롬프트는 저장소 검색이나 추가 질문 없이 이미지 도구를 한 번만 호출하도록 고정한다. 기본 선택은 Luna, 낮은 추론 수준, Fast 서비스 티어이며 사용자가 저장한 선택은 유지한다.
- 단계별 시간은 클라이언트 준비, 이미지 호출 시작 전, 이미지 도구 실행, 전체 시간으로 나누어 기록한다. 최근 50회 기록은 `localStorage`의 `5e.aiPerformance.v1`에 저장한다.

실제 계정으로 반복 측정하려면 `npm.cmd run benchmark:image`를 사용한다. 이 명령은 계정 사용량을 소비한다. 2026-08-09의 단순 무참조 기준 측정값은 전체 55.1초, 첫 이미지 호출까지 29.8초, 이미지 도구 23.2초, 호출 1회였다. 이는 복잡한 참고 이미지 요청의 보장 시간이 아니라 속도 회귀를 탐지하기 위한 기준값이다.

현재 설치된 Codex App Server 스키마에는 클라이언트가 직접 호출하는 이미지 생성 요청 메서드가 없다. 따라서 이 인증 경로에서는 모델 준비 시간을 완전히 제거할 수 없으며, 그보다 빠른 별도 경로는 별도 Images API 인증·과금 또는 로컬 벡터 초안 렌더러를 필요로 한다.

### 검증

`npm.cmd test`는 연결 계층의 격리 설정, App Server 프로토콜, 대화 영속화, 평가원 스타일 무문자 규칙을 검사한다. `npm.cmd run test:desktop`은 실제 UI와 Codex 프로세스 생명주기를 검사한다. 설치 전에는 `codex.cmd login status`, `codex.cmd doctor --json`으로 진단할 수 있다.

`npm.cmd run test:image`는 로그인된 실제 ChatGPT/Codex 계정으로 이미지 생성 요청을 보내고, 생성 결과의 미리보기와 5E 캔버스 삽입까지 검사한다. 실제 계정 사용량이 발생하므로 릴리스 후보 검증처럼 필요한 때에만 실행한다.
