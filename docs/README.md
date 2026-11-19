# docs 안내

`docs/` 바로 아래에는 **5E를 쓰는 사람을 위한 문서**를, `docs/dev/`에는 **5E를 만드는 사람을 위한 개발 기록**을 둡니다.

## 쓰는 사람용

| 문서 | 내용 |
|---|---|
| [RELEASE_NOTES_v1.7.0.md](RELEASE_NOTES_v1.7.0.md) 외 `RELEASE_NOTES_v*.md` | 판마다 바뀐 것 (`media/release-1.6.0/`은 1.6.0 노트 그림) |
| [HWP_EXAM_SHORTCUTS.md](HWP_EXAM_SHORTCUTS.md) | 5E_hwp 단축키 |
| [DATA_COMPAT_1_6_3_TO_1_7_0.md](DATA_COMPAT_1_6_3_TO_1_7_0.md) | 1.6.3에서 1.7.0으로 올릴 때 저장 데이터 호환 |
| [CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) | 설치 파일 서명 정책 |
| [USER_GUIDE.md](USER_GUIDE.md) | 사용 안내 — **v1.1.0 기준 옛 판** (다시 쓰기는 1.8.0 이후) |
| [credits.html](credits.html) | 사용한 공개 소프트웨어와 저작권 표시 (웹에 그대로 공개됨) |

## 릴리즈 운영 (자리 고정)

아래 파일은 `scripts/check-release-docs.cjs`·`scripts/check-release-gate.cjs`가 이 경로로 읽습니다. 옮기지 않습니다.

| 문서 | 내용 |
|---|---|
| [BRANCH_MAP.md](BRANCH_MAP.md) | 브랜치 지도 |
| [RELEASE_CHANNELS.md](RELEASE_CHANNELS.md) · [RELEASE_HOLD.md](RELEASE_HOLD.md) · [RELEASE_ROLLBACK.md](RELEASE_ROLLBACK.md) | 배포 통로·보류·되돌리기 |
| `checksums/` | 지난 설치 파일 확인값 |
| [PREVIEW_NOTES_v1.7.0.md](PREVIEW_NOTES_v1.7.0.md) | 1.7.0 프리뷰 요약. `preview/PREVIEW.md`가 링크하므로 `preview/`를 지울 때 같이 지움 |

## 설치판이 싣는 AI 지시문 재료 (자리 고정)

`package.json` `build.files`와 `desktop/main.cjs`가 이 경로로 읽습니다. 1.8.0 그림 생성 작업 때 프로그램 자료 자리로 옮길 예정입니다.

- [EXAM_SCIENTIFIC_DIAGRAM_STYLE.md](EXAM_SCIENTIFIC_DIAGRAM_STYLE.md)
- [GPT_KNOWLEDGE_EVALUATION_SCIENCE_LINEART.md](GPT_KNOWLEDGE_EVALUATION_SCIENCE_LINEART.md)
- [IMAGE_COMPLEXITY_MODE_SPEC.md](IMAGE_COMPLEXITY_MODE_SPEC.md)
- `engine-v2/ILLUSTRATION_ASSET_CANDIDATES.json` (출처 목록에 경로가 적혀 있어 그대로 둠)
- `security/` — CSP 제안서·초안. `scripts/csp-report-only-probe.cjs`의 기본 경로라 그대로 둠

## 만드는 사람용

[dev/README.md](dev/README.md)부터 읽으세요. 디자인 규칙은 저장소 루트 `DESIGN.md`, AI 작업자 규칙은 루트 `AGENTS.md`.
