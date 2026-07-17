<div align="center">

<img src="assets/og-image.png" alt="5E — 과학 시험 그림을 찾고·편집하고·그리다" width="760" />

<p>
  <img src="https://img.shields.io/github/license/seungyeon980808-pixel/5E?style=flat-square&color=2f81f7" alt="License: AGPL-3.0" />
  <img src="https://img.shields.io/badge/web-no__install-1f6feb?style=flat-square" alt="no install" />
  <img src="https://img.shields.io/badge/PWA-installable-3fb950?style=flat-square" alt="PWA" />
  <img src="https://img.shields.io/badge/made__for-teachers-8957e5?style=flat-square" alt="made for teachers" />
</p>

<p><strong>과학교사를 위한 시험용 이미지 제작기</strong> · 설치 없이 브라우저에서 · <a href="https://seungyeon980808-pixel.github.io/5E/">▶ 바로 써보기</a></p>

</div>

---

**5E**(sciEnceEducationalExamEasyEditor)는 과학 교사가 시험지·학습지에 넣을 그림을 빠르게 그리고 편집하기 위한 웹 기반 도구입니다. 설치 없이 브라우저에서 동작하며, 공통 도구로 다양한 이미지를 만들고 라이브러리에서 기출문항을 불러와 편집할 수 있습니다.

## 대상 사용자

- 과학(물리·화학·생명·지구과학) 교사
- 시험지·학습지·수업자료 그림 제작자

## 주요 기능

### 그리기 도구
- 기본 도형: 타원, 사각형, 직각삼각형
- 선: 직선, 꺾은선, 곡선, 자유 그리기
- 텍스트: 자유 텍스트, 수식형 텍스트(LaTeX), 라벨러(지시선 + 이름표)
- 표시: 각도 호, 직각 표시, 점, 길이 표시
- 측정 보조: 자, 각도기
- 자르기: 가위·자유곡선 절단(채움 유지 분할)
- 변형: 선택·회전, 스냅, 가이드/눈금자

### 그래프 도구
좌표평면 위에 함수·직선·꺾은선·곡선을 한 화면에서 만듭니다.
- 좌표평면: x·y 음/양 방향 칸수를 따로 지정하는 비대칭 범위, 프리셋 모양
- 해석적 함수: 수식 입력(다중 함수), 평가원 양식, 조밀 샘플링으로 정확한 곡선
- 직선·꺾은선, 자유곡선: 찍은 점을 정확히 통과하는 centripetal Catmull-Rom 보간

### 라이브러리
- 과목 선택에 따라 강조색 테마와 과목별 오브젝트가 전환됩니다.
- 퍼스널 오브젝트: 자주 쓰는 오브젝트를 저장해 재사용
- 기출문항 검색(Ctrl+Shift+F): 라이브러리에서 문항을 불러와 편집

### 이미지
- 여러 이미지를 한 페이지에 모아 넣거나 페이지별로 하나씩 불러오기
- 이미지 관리: 위치 고정, 비율 고정·비교, 삭제
- 이미지 객체화: 사각형 영역만 남기기

### 저장 / 내보내기
- 프로젝트 저장·열기(JSON, 드래그앤드랍 열기 지원)
- 전체 백업/복원: 설정 + 퍼스널 라이브러리 + 현재 프로젝트를 한 파일로
- 이미지 내보내기: PNG / JPG, 선택 영역 지정 내보내기

### 환경
- 환경 설정: 글씨·도구 패널 크기(소형·중형·대형·와이드)
- Pro / Lite 모드 전환
- 다크 테마 기본

## 로컬 실행

정적 웹앱이라 별도 빌드가 필요 없습니다. 저장소를 받은 폴더에서 정적 서버를 띄우면 됩니다.

```powershell
python -m http.server 8000
```

브라우저에서 열기:

```text
http://localhost:8000
```

Windows에서는 저장소에 포함된 `run-server.bat`을 더블클릭해도 됩니다.

## 저장 파일 형식

프로젝트 JSON은 `objects`, `guides`, `layers`, `artboard`를 스키마 `0.17`로 저장합니다. 되돌리기 히스토리, 선택 상태, 현재 화면 배율(viewBox)은 저장되지 않습니다. 구버전 파일은 열 때 현재 스키마로 자동 마이그레이션됩니다.

## 글꼴

수식용 글꼴(LM Roman)은 woff2로 임베드되어 있어 어느 환경에서든 동일하게 렌더링됩니다. 그 외 본문 글꼴은 설치된 시스템 글꼴에 따라 표시가 달라질 수 있습니다.

## 배포

정적 파일로 구성되어 GitHub Pages에 그대로 배포할 수 있습니다. 배포 시 브라우저가 옛 모듈을 캐시하지 않도록, 각 모듈의 `?v=` 값을 릴리즈 버전과 맞춰 두었습니다.

## 라이선스

이 프로젝트는 **GNU AGPL v3** 하에 배포되는 자유 소프트웨어입니다. 비영리·교육 목적으로
자유롭게 사용·수정·공유할 수 있으며, 수정본을 배포하거나 웹서비스로 제공할 때는 소스코드를
공개해야 합니다. 전문은 [`LICENSE`](LICENSE) 참고.

## 크레딧

개발: 박승연 (서울 대왕중학교) · SMOE
Copyright © 2026 박승연
