<!-- release-title: 5E v1.6.0 — 편집·내보내기·데스크톱 릴리즈 정합성 -->

# 5E v1.6.0 candidate

상태: **HOLD**. 이 문서는 아직 게시되지 않은 후보를 설명합니다. 구현 기준선 `8d98bab0f5c9f762a6d8ed6ca8c50e4e369d4013`에서 검토를 시작했으며, 이는 최종 릴리즈 SHA가 아닙니다. 최종 SHA는 빌드 시 git에서 확인해 외부 산출물 매니페스트에 기록합니다.

## 후보 변경 사항

- 페이지 복구와 페이지별 undo/redo, 프로젝트 검증을 보강했습니다.
- PNG/SVG 내보내기 순서와 내용 맞춤 영역을 편집기 렌더링에 맞췄습니다.
- 잘못된 크기 입력은 모델을 바꾸지 않고 거부하며, 음수 위치와 각도는 지원합니다.
- 매우 짧거나 겹친 염색체 끝점에서도 제한된 유한 geometry를 유지합니다.
- 그래프, 좌표평면, PDF 크롭, AI 이미지 경계, 접근성 회귀를 후보 범위에서 점검했습니다.
- Node 24 LTS, Electron 44.4.5, Playwright 1.62.1과 release identity 검사를 사용합니다.

이 목록은 감사에서 발견된 모든 항목이 해결됐다는 주장이 아닙니다. 외부 검증 상태는 [`RELEASE_HOLD.md`](RELEASE_HOLD.md)에 기록합니다.

## 예정 산출물

- `5E-1.6.0-windows-x64.exe`
- `5E-1.6.0-macos-x64.dmg`
- `5E-1.6.0-macos-arm64.dmg`
- `5E-1.6.0-macos-x64.zip`
- `5E-1.6.0-macos-arm64.zip`
- `SHA256SUMS.txt`

체크섬은 완성된 파일의 실제 바이트와 실제 basename으로 생성하고, 파일명을 바꾸지 않은 상태에서 검증해야 합니다. 서명과 사용자 안내는 [`CODE_SIGNING_POLICY.md`](CODE_SIGNING_POLICY.md)를 따릅니다.

게시 전에는 최종 SHA에 연결된 Test, Release Identity, 플랫폼 패키징, checksum, Pages channel receipt, 독립 release verification이 필요합니다. 통과하지 않은 플랫폼이나 외부 인증 흐름은 완료로 표기하지 않습니다.
