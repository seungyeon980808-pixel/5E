# 5E 튜토리얼(따라하기) — 디자인 문서

> Show Me The PRD로 생성됨 (2026-07-27, 질문 20개 인터뷰 기반)
> 레퍼런스: HwpPalette의 따라하기(`31_hwp_palette/tutorial.py`) · 도움말 사전(`help_content.py`)

## 문서 구성

| 문서 | 내용 | 언제 읽나 |
|------|------|----------|
| [01_PRD.md](./01_PRD.md) | 뭘 만드는지, 누가 쓰는지, 가정 원장 | 시작 전 |
| [02_DATA_MODEL.md](./02_DATA_MODEL.md) | Course/Step/Progress 구조 | 코스 정의 짤 때 |
| [03_PHASES.md](./03_PHASES.md) | Phase 1(엔진+코스 3개) → 2(코스 6개+사전) → 3(다듬기) | 개발 순서 정할 때 |
| [04_PROJECT_SPEC.md](./04_PROJECT_SPEC.md) | AI 행동 규칙 (절대 하지 마 / 항상 해) | AI에게 코드 시킬 때마다 |

## 다음 단계

Phase 1을 시작하려면 [03_PHASES.md](./03_PHASES.md)의 "Phase 1 시작 프롬프트"를 복사해서 쓰세요.

## 미결 사항

- 01_PRD.md의 **가정 원장 잔여 6건** (Pro 복원·Phase 1 코스 선정은 확인 완료. 잔여: 진입점 위치, 정체 시 건너뛰기, 백업 제외, 첫 방문 판정, 흐림 정도, 레퍼런스 미수집)
- 02: 진행 기록이 기기별(localStorage)이라 PC 간 공유 안 됨 — 허용 여부
- 04: 실습 단계 [이전] 제한의 표시 방식
