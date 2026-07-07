# 기출 그림 추출기 + 태깅 뷰어

5E 기출 라이브러리(`assets/exam-library`)에 그림을 추가하고 검색용 태그를 다는 데스크톱 도구.

## 구성

| 파일 | 역할 |
|---|---|
| `exam_figure_extractor.pyw` | PDF → 문항별 그림 추출 + 개념 자동 태깅 → 스테이징 → 라이브러리 병합 |
| `exam_tag_viewer.pyw` | 그림을 보며 태그를 직접 확인·추가·삭제 → 저장 → manifest 재생성 |
| `figure_core.py` | 검출 엔진(내장 이미지 기반, 표·글상자·〈보기〉 자동 배제, 경계 트림) |
| `tagger.py` + `lexicon.json` | 오프라인 키워드 자동 태깅(개념어, 상한 5·희소도순) |
| `tags_store.py` | 태그 원천(tags.xlsx/csv) 읽기·쓰기 |
| `tag-vocab.proposed.json` | 화학·생명·지구 어휘집 확장 제안본 |

## 사용 흐름

1. **추출**: `exam_figure_extractor.pyw` 실행 → PDF를 끌어다 놓기 → `_staging/`에 PNG+태그 생성
2. **병합**: [라이브러리에 병합] → 이미지·태그를 라이브러리로 옮기고 `manifest.json` 재생성
3. **태깅 보강**: `exam_tag_viewer.pyw` 실행 → 그림 보며 태그 추가/수정 → [저장] → [manifest 재생성]

## 파일명 규칙

`<과목>_<학년도>_<월2자리>_<문항번호2자리>.png` (예: `p1_2026_11_06.png`)
`build_manifest.py`와 동일. 월: 11=수능, 6/9=모평.

## 태깅 정책

- **자동 태깅**은 문항 텍스트의 개념어만 사용(사물/이미지 인식 없음). 깨끗한 개념 태그 평균 2~3개.
- **사물 태그**(새·그래프·지층 등)는 뷰어에서 사람이 직접 보강 → 목표 4~5개.
- 상한 5개. 어휘집(`tag-vocab.json`)에 없는 태그는 build_manifest가 경고.

## 최초 설정

`tag-vocab.proposed.json`을 검토 후 `assets/exam-library/tag-vocab.json`에 병합하면
4과목 파트가 자동 도출된다(현재 원본은 물리만).

## 의존성

`pip install pymupdf numpy pillow openpyxl tkinterdnd2`
(pillow=뷰어 미리보기, openpyxl=xlsx 태그, tkinterdnd2=드래그앤드롭)
