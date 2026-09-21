# 5E macOS 데스크톱판

## 개발 실행

1. Node.js 20 이상과 Codex CLI를 설치한다.
2. 저장소 루트에서 `npm install`을 실행한다.
3. `npm run desktop`으로 실행한다.

macOS에서는 창을 닫아도 애플리케이션이 유지되며 Dock 아이콘을 누르면 편집기 창이 다시 열린다. 제목 표시줄은 좌측 신호등 버튼 영역을 비우고 5E 패널 색상을 사용한다.

## 설치 패키지

`npm run package:mac`은 Intel용과 Apple Silicon용 DMG·ZIP을 `release/`에 만든다. DMG는 사용자가 설치할 때 쓰고 ZIP은 보관·자동 업데이트 경로를 준비하기 위한 배포 자산으로 함께 생성한다.

로컬 기기의 Apple Silicon 설치판만 빠르게 확인하려면 다음 명령을 사용한다.

```bash
npx electron-builder --mac dmg --arm64 --publish never
```

패키지에는 전용 `.icns` 아이콘과 `public.app-category.education` 카테고리가 포함된다.

## 서명 전 설치 확인

현재 밑작업 단계의 macOS 패키지는 Developer ID 서명과 Apple 공증을 연결하지 않았다. 내부 확인용 미서명 DMG를 실행할 때 Gatekeeper가 차단하면 Finder에서 앱을 Control-클릭한 뒤 `열기`를 선택한다. 일반 사용자에게 배포하는 정식 릴리스에서는 이 우회 절차를 요구하지 않도록 서명과 공증을 연결해야 한다.

## 검증

- `npm test`: 플랫폼 설정과 기존 데스크톱 기능의 단위 검증
- `npm run test:desktop`: 실제 Electron 창, preload IPC, 앱 아이콘, 주요 편집기 진입 동작 검증
- `npm run package:mac`: Intel·Apple Silicon 설치 자산 생성

정식 릴리스 전에는 생성한 DMG를 마운트하고 앱을 `/Applications`에 복사한 뒤 새 사용자 데이터 환경에서 실행한다. AI 연결, 프로젝트 저장, 이미지 내보내기와 앱 재실행을 확인한다.
