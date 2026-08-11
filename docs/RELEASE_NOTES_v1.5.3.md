<!-- release-title: v1.5.3 — 지연 자르기 업데이트 캐시 수정 -->

# v1.5.3 — 지연 자르기 업데이트 캐시 수정

v1.5.2의 화면 마크업은 정상적으로 업데이트됐지만 기존 설치 환경에서는 Chromium 캐시에 남은 구버전 `tools.js`가 로드되어 자르기 선택 팝오버가 열리지 않던 문제를 수정했습니다.

## 수정 사항

- `tools.js`, `cut-tool.js`, `tool-hint.js`, 공통 CSS 캐시 키 갱신
- `main.js`와 `transform.js`가 동일한 최신 `tools.js` 모듈을 사용하도록 통일
- 기존 설치 사용자 프로필에서도 새 자르기 선택 팝오버가 로드되도록 보장
- 캐시 키가 다시 과거 버전으로 돌아가지 않도록 회귀 검사 추가

**Full Changelog**: https://github.com/seungyeon980808-pixel/5E/compare/v1.5.2...v1.5.3
