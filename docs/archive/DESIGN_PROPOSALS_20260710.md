# 5E 디자인 개편 — 5개 제안 종합 검토서

- **기준 버전**: v0.54.14
- **작성일**: 2026-07-10
- **검토 기준(CLAUDE.md 디자인 원칙)**: 모바일 우선 반응형 / AI티 금지(그라데이션·큰 그림자·이모지 남발·과한 애니메이션 금지) / 색은 그룹·섹션 단위로만 변경 / 시그니처: 메인 `#0969da`, 서브 `#0e7490`, 배경 `#f6f8fa`, 텍스트 `#0d1117`, 구분선 `#d0d7de` / 본문 IBM Plex Sans KR, 모노 IBM Plex Mono

---

## 원칙 점검 결과 · 편집 이력 (편집자 주)

5개 제안 전부에서 **그라데이션·이모지 남발·과한 애니메이션 위반은 발견되지 않았다.** 그림자는 모든 제안이 현행 최대치(`0 8px 24px`) 이하로 통합·축소하는 방향이라 "큰 그림자 금지"의 실질 위반은 없다. 원칙과 충돌하는 대목은 각 제안이 자체 선언하고 있으며, 선언 누락분은 아래와 같이 본문을 직접 수정했다.

| # | 수정 위치 | 내용 |
|---|---|---|
| 1 | 제안 2 서두 | 제안서가 아닌 작성 과정 서술(정찰 메모) 문단 삭제 — 진단 내용은 본문 각 절에 이미 반영되어 있음 |
| 2 | 제안 3 §2 | Noto Serif KR 표제 도입이 타이포그래피 원칙(본문 IBM Plex Sans KR)의 확장임에도 "의도적으로 깨는 원칙" 목록에 없었음 → 5번 항목으로 선언 추가 |
| 3 | 제안 3 §4-5 | `.examlib-tags`의 `10.5px`가 제안 자신의 스케일(최소 11px 캡션)과 모순 → `var(--fs-caption)`(11px)으로 수정 |
| 4 | 전체 | 제안 번호 부여(제안 1~5), 표기 통일 |

---

## 5개 제안 비교표

| # | 제안 | 컨셉 한 줄 | 작업량 | 위험 | 기존 원칙과의 충돌 |
|---|---|---|---|---|---|
| 1 | GitHub Primer 정합 | 색은 그대로, 간격·타이포·곡률·그림자를 Primer 4px 격자로 스냅 | 1.5~2일 (CSS만) | **중** — 전 컴포넌트 픽셀 이동, 라이트/다크×과목 8조합 검증, 타 브랜치와 CSS 병합 충돌 | 곡률 6px 단일 결정을 3단(6/8/12)으로 확장(선언됨). 28px 컨트롤은 모바일 터치 타깃과 긴장 → 미디어쿼리 보완 선언됨. 라이트 `#f6f8fa` **복귀**로 시그니처 준수 회복 |
| 2 | 프로 그래픽 툴 (다크 크롬 + 흰 아트보드) | 캔버스 우물을 최심층으로 파고, 아이콘 3종 혼재를 SVG 단일 규격으로 통일 | 2~3.5일 (CSS+마크업+JS) | **중~높** — index.html 마크업 변경, 아이콘 자체 유지보수 발생, 아트보드 그림자의 내보내기 오염 검증 필요 | 시그니처 라이트 팔레트를 라이트 테마 전용으로 격하(선언), 아트보드 소형 그림자 1개(선언, blur 3px). 라이트 `--bg-app`은 `#f6f8fa` 복귀 |
| 3 | 인쇄 우선 미니멀 (평가원 지면) | 라이트 기본 반전 + 먹색 괘선 + 유채색은 `#0969da` 1점만 | 2~3일 (테마 반전+2단계 JS) | **높** — 기본 테마 반전은 첫인상 전환이라 사실상 비가역, 하드코딩 다크 파손 지점 선처리 필수, 어포던스 저하 | 서브색 `#0e7490` 화면 퇴장·기본 다크→라이트·활성 도구색 먹색 전환·과목 배경 틴트 삭제·명조 표제(전부 선언, 5번은 편집 추가) |
| 4 | 고밀도 워크스페이스 (커맨드 팔레트·키보드 중심) | 크롬 106px→84px 축소, 패널 접기, Ctrl+K 단일 진입점 | 2~3일 (CSS+신규 JS 모듈) | **높** — 커맨드 팔레트는 신규 모듈로 기능 추가 때마다 레지스트리 동기화 부채, 단축키 충돌(Tab, Ctrl+K) 가드 필요, 초심자 발견성 하락 | 모바일 우선과 부분 충돌 — 고밀도는 ≥768px 한정, 모바일 레이아웃 불변으로 골격 유지(선언) |
| 5 | 디자인 토큰 시스템화 | 룩 변경 없음 — 하드코딩 40여 곳 토큰 회수, 상태 4종 계약, WCAG AA 대비 | 1~1.5일 (CSS, 3단계는 지속과제) | **낮** — 1단계는 값 동결·이름 연결이라 시각 변화 최소, 커밋 단위 되돌림 용이 | "타깃 수정" 원칙과 긴장(diff 40여 곳 확산, 선언). 시그니처 배경 `#f6f8fa` 미복귀·`#eaeef2` 유지(선언, 아트보드 분리 근거) |

**5개 제안의 교집합(전원 또는 다수 합의 — 사실상 확정 과제)**
1. 수식 편집기·글꼴 모달의 하드코딩 다크 색(`#1e1f22` 계열) → 토큰 치환. **라이트 테마 실파손 버그** (4개 제안 지적)
2. `.modal-overlay` 중복 정의(z-index 1000 vs 10000) 정리 (3개 제안)
3. 포커스링 파랑 고정 → `--focus-ring` 토큰화로 과목 테마 추종 (4개 제안)
4. 타이포 10단 난립(9~18px, 12.5px 포함) → 4~6단 스케일 (5개 전원)
5. 간격 4px 격자화, 홀수 임의값 폐기 (5개 전원)
6. 기출 라이브러리 4열 고정 → `auto-fill` 반응형 그리드 — 모바일 우선 원칙 정합 (4개 제안)
7. 인스펙터 `uppercase` 제거(한글에 무의미), `--insp-radius` 3px 이탈 정리 (3개 제안)
8. 위험색 4종 혼용 → 1토큰 (2개 제안)

---

## 종합 추천

### 기본: 제안 5 (토큰 시스템화) + 제안 1의 2단계(밀도·타이포 정렬)를 접목

**왜 제안 5가 기본인가.**
- 위 교집합 8건을 정면 과제로 삼는 유일한 제안이다. 나머지 4개 제안도 전부 "토큰 신설 → 하드코딩 회수"를 1단계로 깔고 시작하므로, 제안 5는 **어느 방향으로 가든 선행 조건**이다.
- 위험이 가장 낮다. 1단계가 "값 동결·이름 연결"이라 시각 회귀가 거의 없고, 커밋 단위로 되돌림 지점이 잘게 쪼개진다. 진행 중인 브랜치(캠페인·ai-assist 등)와의 병합 충돌 면적도 최소다.
- 접근성(AA 대비, `:focus-visible` 계약, disabled/active 상태)이 유일하게 시스템 차원에서 설계되어 있다 — 교사 동료 배포를 전제하면 이것이 "보이는 새 기능"보다 먼저다.

**접목 1 — 제안 1의 밀도·간격·타이포 스냅(2단계로).** 토큰 층이 깔린 직후, 제안 1의 4px 격자·타이포 4단·컨트롤 높이 3종(24/28/32)·`tabular-nums` 수치 표기를 얹는다. 제안 5가 "이름 연결"이라면 제안 1의 2단계가 "값 정렬"로, 둘은 같은 작업의 전반전·후반전이다. 단, **곡률은 제안 1의 12px 다이얼로그 대신 제안 5의 10px를 채택**한다(현행 최대치 유지 = "6px 통일" 결정에서의 이탈 폭 최소). 모바일 드로어(≤767px)에서 컨트롤 36~40px 승격 미디어쿼리는 필수 동반.

**접목 2 — 제안 2의 표면 위계 토큰 3종.** `--bg-raised`(팝오버·모달 전용 표면 — 현재 패널과 동색이라 층이 안 보이는 문제 해결), 다크 `--bg-canvas: #010409`(캔버스 우물), 그리고 **라이트 `--bg-app`은 `#f6f8fa`로 복귀**한다. 제안 5는 `#eaeef2` 유지를 선언했지만, 아트보드 분리는 `--bg-app`이 아니라 `--bg-canvas`(별도 토큰, 더 어두운 서라운드)가 담당하므로 두 논거는 양립한다 — 시그니처 준수를 회복하는 쪽으로 재정한다(제안 1·2·3 모두 같은 결론).

**접목 3 — 공통 합의 항목 즉시 채택.** 기출 라이브러리 `auto-fill` 그리드 + 2줄 클램프 제목(제안 1) + 키보드 접근(제안 5의 3단계), 인스펙터 uppercase 제거·라벨 폭 단일화.

**보류 · 별도 트랙.**
- **제안 3(기본 테마 라이트 반전)**: 인쇄 결과 정합 논거는 5개 중 가장 설득력 있는 문제 제기지만, 기본 테마 반전은 되돌리기 비싼 결정이라 CLAUDE.md 의사결정 기준상 **사용자 확인 없이는 진행 불가**. "인쇄 미리보기 모드"(출력 시뮬레이션 토글) 아이디어만 백로그로 승격하고, 라이트 테마 품질 개선(무채색 서라운드 `#e7e9ec` 등)은 토큰 값 조정으로 흡수 가능하다.
- **제안 4(커맨드 팔레트·패널 토글)**: 디자인 폴리싱이 아니라 기능 개발이다. 가치는 있으나 레지스트리 동기화라는 영구 부채가 따라오므로 **별도 기능 브랜치(feat/*)로 분리**해 독립 판단한다. 단, `:focus-visible` 계약과 `--accent-dim`(선택 상태 옅은 채움)은 제안 5에 이미 포함되므로 여기서 흡수.
- **제안 2(아이콘 SVG 통일)**: 유니코드 글리프 5종의 SVG 교체는 완성도 대비 효과가 크지만 마크업 회귀 비용이 있으므로, 토큰·밀도 정렬이 끝난 뒤 후속 커밋으로.

**시점과 버전.** 제안 1의 지적대로, 진행 중인 캠페인 브랜치들이 integration-hub에 합류한 **뒤에** 얹는 것이 병합 비용상 안전하다. 완료 시 v0.55.0(기능 1~2개 급 변화 기준), 커밋은 `style:` 접두사로 단계별 분리.

---
---

# 제안 1: GitHub Primer 정합 — 현 시그니처 유지, 밀도·타이포·간격 시스템만 프로급으로 재정렬

### 1. 컨셉 요약과 무드

5E의 색은 이미 GitHub 혈통(#0d1117 / #f6f8fa / #0969da / #2f81f7)이므로 색을 바꾸는 것이 아니라, 색 주변에 흩어져 있는 **간격·글자 크기·컨트롤 높이·곡률·그림자를 Primer의 4px 격자와 3단 곡률 체계로 스냅**시키는 제안이다. 현재 CSS에는 폰트 크기 10종(9–18px), 패딩 조합 십수 종, 곡률 4종(1/3/6/8/10px), z-index 11단이 공존하는데, 이것을 토큰 층 하나로 수렴시키면 "잘 만든 개인 도구"가 "제품"으로 읽히게 된다. 기능·레이아웃 구조(3패널, 드로어, 모달)는 전혀 건드리지 않고 순수 CSS 재정렬로 완결한다.

**무드**: GitHub 데스크톱 코드 리뷰 화면의 그것 — 서늘한 슬레이트 회색 위에 잉크처럼 앉은 텍스트, 장식 없는 1px 헤어라인, 좁지만 숨 막히지 않는 8px 리듬. 화면 어디를 잘라 붙여도 같은 자로 잰 듯한 균질함이 목표다. 브랜드 개성은 Georgia 이탤릭 "5E" 로고와 과목별 액센트(버건디·틸·브라운)에만 남기고, 나머지 UI는 침묵한다.

---

### 2. 컬러 토큰 표

색 자체는 거의 유지한다. 변경은 (a) 시그니처 복원, (b) Primer 최신 fg.muted 값으로의 미세 보정, (c) **하드코딩 색의 토큰 흡수** 세 가지다.

| CSS 변수 | 현재 (light / dark) | 제안 (light / dark) | 근거 |
|---|---|---|---|
| `--bg-app` | `#eaeef2` / `#0d1117` | **`#f6f8fa`** / `#0d1117` | 시그니처 배경 #f6f8fa 복원 = Primer `canvas.subtle`. 현재 라이트가 시그니처보다 어두움 |
| `--bg-canvas` | `#dde3ea` / `#0d1117` | `#dde3ea` / **`#010409`** | 다크 캔버스 서라운드를 Primer `canvas.inset`으로 한 단 낮춰 흰 아트보드 프레이밍 강화 (선택 사항) |
| `--bg-panel` | `#ffffff` / `#161b22` | 유지 | Primer `canvas.default` 정합 |
| `--border` | `#d0d7de` / `#30363d` | 유지 | 시그니처 구분선 그대로 |
| `--border-muted` **(신설)** | — | `#d8dee4` / `#21262d` | 인스펙터 행 구분 등 안쪽 헤어라인용 2단계 보더 (Primer `border.muted`) |
| `--text-secondary` | `#656d76` / `#7d8590` | **`#59636e`** / **`#848d97`** | Primer 현행 `fg.muted`. 대비 소폭 상승(AA 확보) |
| `--accent` | `#0969da` / `#2f81f7` | 유지 | 시그니처 메인 |
| `--danger-fg` **(신설)** | — | `#d1242f` / `#f85149` | 현재 흩어진 위험색 4종(`#e35d6a` L822, `#e5534b` L1631·1669, `#b42318` L1153, `#d1242f` L411)을 1토큰으로 통일 |
| `--focus-ring` **(신설)** | 하드코딩 `rgba(9,105,218,.22)` | `color-mix(in srgb, var(--accent) 40%, transparent)` | 현재 포커스링이 파랑 고정이라 **화학(버건디)·생명(틸) 테마에서 파란 링이 남는 불일치**(L1111, 1429) 해소 |
| `--shadow-menu` **(신설)** | `0 4px 14px rgba(0,0,0,.28)` 등 | `0 4px 12px rgba(140,149,159,.2)` / `0 4px 12px rgba(1,4,9,.5)` | 드롭다운·팝오버용 소형 그림자 1종 |
| `--shadow-overlay` **(신설)** | `0 8px 24px` `0 8px 22px` `0 2px 8px` 혼재 | `0 8px 24px rgba(140,149,159,.2)` / `0 8px 24px rgba(1,4,9,.5)` | 모달용 1종. Primer `shadow.large` — 기존 최대치와 동급이므로 "큰 그림자 금지" 원칙 위반 아님 |

**토큰 흡수 대상 (색 변화 없이 변수 치환만)**: 수식 편집기·글꼴 모달(style.css L1246–1272, 1344–1390)이 `#1e1f22 / #3a3c41 / #dcddde`를 하드코딩하고 있어 **라이트 모드에서도 다크 색으로 뜨는 실질 버그**다 → `var(--bg-input) / var(--border) / var(--text-primary)`로 치환. 가이드 좌표 에디터의 `#0550ae`(L958) → `var(--accent)`. 과목별 테마(L91–102)는 Primer 팔레트 밖이지만 시그니처 기능이므로 **의도적으로 유지**한다.

---

### 3. 타이포 스케일 · 간격 시스템

**현재 문제**: 폰트 크기 9 / 10 / 11 / 12 / 12.5 / 13 / 14 / 15 / 16 / 18px의 10단이 근거 없이 공존(12.5px 같은 반픽셀 값 포함). 간격은 3 / 4 / 5 / 6 / 7 / 9 / 10 / 14px 등 홀수 임의값 다수. 컨트롤 높이도 24 / 28 / 30 / 40px 혼재.

**제안 — 타이포 4단 스케일** (`:root`에 토큰 신설):

| 토큰 | 값 | 용도 (현재값 → 스냅) |
|---|---|---|
| `--fs-xs` | **11px / lh 16px** | 단축키 힌트·뱃지·푸터·캡션 (9, 10, 11px → 여기) |
| `--fs-sm` | **12px / lh 18px** | 기본 UI: 인스펙터, 하단바, 도구 라벨, 메뉴 설명 (12, 12.5, 13px → 여기) |
| `--fs-md` | **14px / lh 20px** | 입력 필드, 파일 메뉴 항목, 모달 본문 (13, 14, 15px 입력계 → 여기) |
| `--fs-lg` | **16px / lh 24px** | 모달 제목 (15, 16px → 여기) |

브랜드 로고 18px Georgia 이탤릭은 시그니처로 예외 유지. 숫자 필드는 전부 `font-variant-numeric: tabular-nums` 부여(zoom 표시, 좌표, DPI — 자리 흔들림 제거). 굵기는 400/500/600 3단만 사용(현재 700 산재 → 600으로).

**제안 — 간격·크기 토큰** (Primer 4px 베이스):

```css
:root {
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-6: 24px;
  --control-h-sm: 24px;  /* 인스펙터 필드·하단바 입력 */
  --control-h: 28px;     /* 툴바 버튼·select·세그먼트 */
  --control-h-lg: 32px;  /* 모달 주 버튼 */
  --radius-control: 6px; /* 버튼·입력 (기존 통일 기준 유지) */
  --radius-menu: 8px;    /* 드롭다운·팝오버 */
  --radius-dialog: 12px; /* 모달 (Primer Dialog) */
}
```

규칙: 컴포넌트 내부 간격 4/8px, 컴포넌트 사이 8/12px, 섹션 사이 16/24px. 패널 폭은 8배수로 미세 조정(`--panel-left-w` 130→**128px**, `--panel-right-w` 215→**216px**). z-index는 11단(10~10000)을 6단 사다리(100 드롭다운 / 200 캔버스 오버레이 / 300 드로어 / 400 모달 / 500 최상위 모달 / 600 토스트)로 재배열 — 중복 선언된 `.modal-overlay`(style.css L535 z:1000, L1471 z:10000)도 이때 1개로 합친다.

---

### 4. 컴포넌트별 개선

#### 4-1. 툴바 (`.canvas-toolbar`)

**현재 문제**: 버튼 높이가 28px(icon-btn)과 가변(padding 6px 10px + font 14px ≈ 28~30px)으로 미묘하게 어긋나고, 폰트가 14px로 주변 UI(12–13px)보다 커서 위계가 역전됨. 구분자 간격 3px은 클러스터 구분 역할을 못 함. zoom 표시가 13px로 버튼과 경합.

**제안**: 행 높이 44px 고정, 모든 컨트롤 28px 통일, 클러스터 내부 8px·클러스터 간 구분자로 리듬 부여.

```css
.canvas-toolbar { height: 44px; gap: var(--space-2); padding: 0 var(--space-3); }
.topbar-btn {
  height: var(--control-h); padding: 0 12px;
  font-size: var(--fs-sm); font-weight: 500; line-height: 1;
}
.topbar-btn.icon-btn, .fullscreen-toggle { width: 28px; height: 28px; padding: 0; }
.tb-sep { height: 20px; margin: 0 var(--space-1); }
.zoom-readout { font-size: var(--fs-xs); font-variant-numeric: tabular-nums; color: var(--text-secondary); }
.subject-select { height: var(--control-h); font-size: var(--fs-sm); }
```

#### 4-2. 인스펙터 (`inspector.css`)

**현재 문제**: `--insp-radius: 3px`(L12)이 전역 6px 통일 원칙(style.css L1640)과 어긋나는 유일한 이탈. 섹션 헤더가 13px + `text-transform: uppercase`인데 헤더가 한글이라 uppercase는 무의미. 라벨 폭이 28px과 58px 두 체계(L131 vs L139). 행 간격 5px, 패딩 6px 8px 등 홀수값.

**제안**: 6px 곡률 합류, 헤더를 Primer 사이드바식 11px 세미볼드 뮤트로 낮추고 콘텐츠(값)를 주인공으로. 라벨 컬럼 56px 단일화, 8px 격자.

```css
:root { --insp-radius: var(--radius-control); } /* 3px → 6px */
.insp-summary {
  min-height: 28px; padding: 0 var(--space-3);
  font-size: var(--fs-xs); font-weight: 600; color: var(--text-secondary);
  text-transform: none; letter-spacing: 0;
}
.insp-body { padding: var(--space-2) var(--space-3) var(--space-3); gap: var(--space-2); }
.insp-row { gap: var(--space-2); min-height: var(--control-h-sm); }
.insp-field-label, .insp-line-grid .insp-field-label {
  width: 56px; min-width: 56px; text-align: left; font-size: var(--fs-sm);
}
.insp-input { height: var(--control-h-sm); padding: 0 6px; font-variant-numeric: tabular-nums; }
.insp-section { border-bottom-color: var(--border-muted); } /* 안쪽 구분은 한 단 연하게 */
```

#### 4-3. 캔버스 영역 (하단 바 · 오버레이 힌트)

**현재 문제**: 하단 바가 padding 5px에 gap 14px로 어중간하고, 격자 세부 컨트롤(range 72px, number 4.6em)이 격자에 안 맞음. 배치 힌트·오려내기 배너가 `rgba(13,17,23,.82)`, `rgba(9,105,218,.95)` 하드코딩이라 과목 테마를 무시함.

**제안**: 하단 바 36px 고정 행, 내부 컨트롤 24px, 힌트류는 토큰화.

```css
.canvas-bottom-bar { height: 36px; gap: var(--space-4); padding: 0 var(--space-3); }
.object-search-trigger, .grid-toggle-btn {
  height: var(--control-h-sm); padding: 0 10px; font-size: var(--fs-sm);
}
.canvas-bottom-bar input[type="number"] {
  height: var(--control-h-sm); width: 64px; font-variant-numeric: tabular-nums;
}
.cutout-instruction { background: var(--accent); }        /* 과목 테마 추종 */
.image-placement-hint { border-radius: var(--radius-control); }
```

눈금자 20px 트랙과 다크 워터마크는 잘 설계되어 있으므로 유지.

#### 4-4. 모달 · 다이얼로그

**현재 문제**: 곡률이 8px(내보내기)·10px(안내 카드)·8px(글꼴)로 갈라지고, 패딩도 16 / 20 / 24 28 / 28 32px 4종. 그림자 3종 혼재. 수식 편집기·글꼴 모달의 다크 하드코딩(§2 참조)은 라이트 모드 파손. `.modal-overlay` 중복 정의로 z-index가 선언 순서에 의존.

**제안**: 곡률 12px·패딩 16px·그림자 1종으로 다이얼로그 문법 단일화, 제목은 `--fs-lg`.

```css
.modal, .modal-card, .font-modal {
  border-radius: var(--radius-dialog);
  padding: var(--space-4); gap: var(--space-4);
  box-shadow: var(--shadow-overlay);
}
.modal-title, .font-modal-header { font-size: var(--fs-lg); line-height: 24px; font-weight: 600; }
.modal-btn { height: var(--control-h-lg); padding: 0 var(--space-4); font-size: var(--fs-sm); }
.file-menu-list { border-radius: var(--radius-menu); box-shadow: var(--shadow-menu); }
/* 수식 편집기 라이트 대응 — 색값 변화 없이 토큰 치환 */
.formula-input, .formula-palette-btn, .fm-list, .fm-size-input, .fm-btn {
  color: var(--text-primary); background: var(--bg-input); border-color: var(--border);
}
```

포커스는 전역 1규칙으로: `:where(button, select, input, textarea, [role="menuitem"]):focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }` — Primer 방식이며, 기존 파랑 고정 box-shadow 링 2곳을 대체한다.

#### 4-5. 기출 라이브러리 패널 (`exam-library.css`)

**현재 문제**: 980px 모달에 4열 고정 그리드라 좁은 화면에서 카드가 190px 이하로 찌그러지고, 썸네일이 150px 고정 높이라 카드 폭과 비례가 깨짐. 제목이 1줄 잘림 없이 카드 높이를 들쭉날쭉하게 만듦. 필터 행 select 높이 가변.

**제안**: auto-fill 반응형 그리드 + 종횡비 고정 썸네일 + 2줄 클램프 — 모바일 우선 원칙에도 부합.

```css
.examlib-grid {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}
.examlib-thumb { height: auto; aspect-ratio: 4 / 3; }
.examlib-card { border-radius: var(--radius-control); }
.examlib-meta { padding: var(--space-2); }
.examlib-title {
  font-size: var(--fs-sm); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.examlib-tags { margin-top: var(--space-1); font-size: var(--fs-xs); }
.examlib-filter-row select { height: var(--control-h); font-size: var(--fs-sm); }
.examlib-toolbar { min-height: 36px; }
```

---

### 5. 적용 로드맵 3단계

**1단계 — 토큰 층 깔기 (CSS만, 1~2시간)**
`:root`에 §2·§3 토큰 블록 추가 → 하드코딩 색 치환(수식 편집기·글꼴 모달 라이트 파손 해소, 위험색 4종 → `--danger-fg`, 포커스링 → `--focus-ring`) → 중복 `.modal-overlay` 병합 → 그림자 2종 통일. HTML·JS 무변경, 시각 변화는 "라이트 모드에서 수식 편집기가 정상으로 보임"이 최대치라 위험도 최저. `style: 토큰 시스템 도입` 커밋 1개.

**2단계 — 컨트롤·밀도 정렬 (CSS만, 반나절)**
툴바 28px 행(§4-1), 인스펙터 6px 곡률·56px 라벨·8px 격자(§4-2), 하단 바 36px(§4-3), 모달 12px 곡률·16px 패딩(§4-4), 타이포 4단 스냅(12.5px 등 제거), z-index 사다리 재배열. 픽셀이 실제로 움직이는 단계이므로 라이트/다크 × 과목 4종 = 8조합 눈검사 필수.

**3단계 — 라이브러리 반응형 + 최종 QA (CSS 위주, 반나절)**
기출 라이브러리 auto-fill 그리드·종횡비 썸네일(§4-5), 모바일 드로어(≤767px)에서 터치 타깃 보정(아래 trade-off 참조), 패널 폭 8배수 조정, 인스펙터 리사이즈 최소폭 재검. 완료 시 `v0.55.0` 태그(기능 1~2개 급 변화).

---

### 6. 이 방향의 trade-off (잃는 것)

- **터치 타깃 축소**: 28px 컨트롤 통일은 데스크톱 밀도로는 정답이지만 모바일 권장 44px에 크게 못 미친다. 드로어 모드(≤767px)에서 `--control-h`를 36px로 올리는 미디어쿼리 보완이 필수 비용으로 따라온다 — "모바일 우선" 원칙과의 긴장을 미디어쿼리로 상쇄하는 구조.
- **가독성 하한 근접**: 기본 UI를 12px로 수렴시키면 13px에 익숙한 현 사용자(그리고 고연령 교사 동료 배포 시)에게 한 뼘 작게 느껴질 수 있다. 캔버스 위 콘텐츠가 아니라 크롬(UI)만 작아지는 것이지만, 되돌리려면 스케일 전체를 다시 밀어야 한다.
- **개성의 침묵**: Primer 정합의 종착지는 "GitHub처럼 보이는 도구"다. 잘 만들어 보이는 대신 5E만의 시각적 기억점은 로고·과목 액센트·워터마크 세 가지로 줄어든다. 과목 테마(버건디·틸·브라운)는 Primer 팔레트 밖이라 이 방향으로는 영원히 "완전 정합"이 안 되는데, 이는 시그니처 유지를 위해 의도적으로 감수한다.
- **순수 폴리싱 비용**: 기능 가치 0인 작업에 1.5~2일이 든다. 특히 2단계는 전 컴포넌트의 픽셀이 움직이므로 기존 스크린샷 기반 문서·사용 습관과 미세하게 어긋나고, 진행 중인 다른 브랜치(cut-tool, ai-assist 등)와 CSS 충돌 병합 비용이 발생할 수 있다 — 캠페인 브랜치들이 integration-hub에 합류한 뒤 마지막에 얹는 것이 안전하다.
- **12px 곡률 다이얼로그**: "곡률 6px 통일" 기존 결정을 다이얼로그에 한해 의도적으로 깬다(컨트롤 6 / 메뉴 8 / 다이얼로그 12의 Primer 3단 체계가 위계를 더 정확히 전달한다는 판단). 단일값의 단순함은 잃는다.

---

# 제안 2: 프로 그래픽 툴 — Figma/Illustrator식 어두운 캔버스 주변부 + 밝은 문서, 아이콘 체계 통일

### 1. 컨셉 요약과 무드

**컨셉 3문장.** 5E는 이미 다크 크롬 위에 흰 아트보드가 떠 있는 Figma형 골격을 갖고 있으므로, 이 제안은 "전환"이 아니라 "완성"이다 — 캔버스 우물(well)을 패널보다 한 단계 더 어둡게 파서 흰 문서가 유일한 주인공이 되게 하고, UI는 무채색 저대비로 물러난다. 스트로크 1.2~1.6px이 혼재된 수제 SVG와 유니코드 글리프(↶ ↷ ⌖ ☰ ▾)를 20×20 그리드·1.5px 스트로크·round cap 단일 규격의 아이콘 체계로 통일한다. 수식 편집기·글꼴 모달에 남은 하드코딩 다크 색(#1e1f22 계열)을 전부 토큰으로 회수해, 과목 테마·라이트 테마 어디서든 한 벌의 변수로 UI 전체가 일관되게 물들게 한다.

**무드.** "실험실의 라이트 테이블". 어두운 작업대 위에 시험지 한 장이 놓여 있고, 도구들은 손 닿는 곳에 조용히 정렬돼 있다. 채도는 UI에서 빼고 과목 액센트 한 곳에만 남긴다. 장식 없음, 정보 밀도 높음, 숫자는 모노스페이스 — Figma의 절제와 Illustrator의 밀도 사이.

**의도적으로 깨는 CLAUDE.md 원칙 (선언).**

| 원칙 | 어떻게 깨는가 | 왜 |
|---|---|---|
| 배경 #f6f8fa / 텍스트 #0d1117 | 앱 크롬 기본을 다크로 유지(현행 기본값 계승). 시그니처 라이트 팔레트는 라이트 테마 전용으로 격하 | 흰 아트보드가 "문서"로 읽히려면 주변이 어두워야 함. 대신 라이트 테마의 `--bg-app`을 현행 #eaeef2에서 시그니처 #f6f8fa로 **복귀**시켜 원칙 준수를 회복 |
| 메인 #0969da | 다크에서는 #2f81f7로 밝힘(현행 유지·공식화) | #0969da는 #0d1117 위에서 대비 3.0:1 미만 — 접근성 확보 목적 |
| 큰 그림자 금지 | 아트보드에 **작은** 그림자 1개(0 1px 3px), 팝오버에 현행 수준 그림자 유지 | 깊이 위계 표현이 목적. blur 14px/24px를 넘는 그림자는 계속 금지 |

---

### 2. 컬러 토큰 표

다크(기본) — 핵심은 **4단 명도 위계**: 캔버스 우물(최심) < 앱 배경 = 입력 필드 < 패널 < 팝오버.

| CSS 변수 | 현재값 | 제안값 | 근거 |
|---|---|---|---|
| `--bg-canvas` | `#0d1117` | **`#010409`** | 캔버스 우물을 최심층으로. 흰 아트보드 대비 극대화 (Figma의 canvas < panel 위계) |
| `--bg-app` | `#0d1117` | `#0d1117` (유지) | 푸터·루트 배경 |
| `--bg-panel` | `#161b22` | `#161b22` (유지) | 좌우 패널·툴바 |
| `--bg-panel-hover` | `#21262d` | `#21262d` (유지) | |
| `--bg-raised` | (없음) | **`#1c2128`** 신설 | 드롭다운·모달·팝오버 전용 표면. 현재는 패널과 같은 `--bg-panel`이라 떠 보이지 않음 |
| `--bg-input` | `#0d1117` | `#0d1117` (유지) | 필드는 패널보다 한 단계 함몰 |
| `--border` | `#30363d` | `#30363d` (유지) | 패널 경계 |
| `--border-muted` | (없음) | **`#21262d`** 신설 | 섹션 내부 구분선 — 현재 모든 구분선이 같은 강도라 소음 |
| `--accent` | `#2f81f7` | `#2f81f7` (유지) | |
| `--focus-ring` | 하드코딩 `rgba(9,105,218,.22)` ×2곳 | **`color-mix(in srgb, var(--accent) 30%, transparent)`** 신설 | 현재 포커스링이 라이트용 파랑 고정 → 과목 테마(버건디·틸·브라운)에서 어긋남. 버그 수준 |
| `--shadow-pop` | 산재(`0 4px 14px .28` 등) | **`0 4px 12px rgba(1,4,9,.4)`** 토큰화 | 팝오버 1종으로 통일 |
| `--shadow-modal` | 산재(`0 8px 24px .3/.32`) | **`0 8px 24px rgba(1,4,9,.45)`** 토큰화 | 모달 1종으로 통일 |

라이트 —

| CSS 변수 | 현재값 | 제안값 | 근거 |
|---|---|---|---|
| `--bg-app` | `#eaeef2` | **`#f6f8fa`** | 시그니처 복귀 (CLAUDE.md 준수 회복) |
| `--bg-canvas` | `#dde3ea` (청색 틴트) | **`#d3dae3`** | 라이트에서도 우물을 반 단계 더 파서 흰 아트보드 경계가 성립하게 |
| `--bg-raised` | (없음) | `#ffffff` 신설 | |
| `--border-muted` | (없음) | `#e5e9ee` 신설 | |
| `--focus-ring` | 동일 하드코딩 | 동일 color-mix 식 | |
| 나머지 | 유지 | 유지 | `--accent` #0969da 등 시그니처 그대로 |

**토큰 회수 대상(신규 색 아님, 치환만).** `style.css`의 `.formula-editor` `.formula-input` `.formula-palette-btn`(1234~1272행), `.font-modal` 계열(`.fm-list` `.fm-size-input` `.fm-btn`, 1344~1391행), `.canvas-bottom-bar input[type="number"]` 다크 오버라이드(1431행)가 `#1e1f22` `#2b2d31` `#3a3c41` `#dcddde`를 하드코딩 중 — 라이트 테마에서 이 컴포넌트만 어둡게 남는 실결함이다. 각각 `--bg-input` `--bg-raised` `--border` `--text-primary`로 치환.

라디우스 토큰(현재 6px 통일 규칙 vs 인스펙터 3px vs 모달 8/10px 충돌 → 4단 스케일로 공식화):

```css
:root {
  --radius-field: 4px;   /* 입력 필드·스와치 (인스펙터 3px → 4px 상향) */
  --radius-ctrl:  6px;   /* 버튼·셀렉트 (현행 통일 규칙 계승) */
  --radius-pop:   8px;   /* 드롭다운·팝오버 */
  --radius-modal: 10px;  /* 모달 */
}
```

---

### 3. 타이포 스케일 · 간격 시스템

현재 9 / 10 / 11 / 12 / 12.5 / 13 / 14 / 15 / 16 / 18px가 산재. **6단으로 압축**한다 (12.5px, 14px 폐기):

| 토큰 | 크기/행간 | 용도 |
|---|---|---|
| `--fs-badge` | 10px / 1.2 | 배지·검색 카테고리 (9px 폐기 — 최소 10px) |
| `--fs-caption` | 11px / 1.35 | 필드 라벨·힌트·단축키 표기·푸터 |
| `--fs-ui` | 12px / 1.4 | **UI 기본** — 인스펙터·버튼·바텀바·카드 메타 |
| `--fs-menu` | 13px / 1.4 | 메뉴 항목·툴바 텍스트 버튼·섹션 헤더 (현행 14px 메뉴 → 13px로 밀도 상향) |
| `--fs-title` | 15px / 1.4 | 모달 제목 |
| `--fs-brand` | 18px / 1 | 5E 브랜드 (Georgia italic 유지 — 시그니처) |

숫자·좌표·수치 입력은 전부 `IBM Plex Mono`(현행 유지), 본문은 `IBM Plex Sans KR`. 섹션 헤더의 `text-transform: uppercase`(inspector.css 84행)는 한글에 무의미하므로 제거하고 `letter-spacing: .02em` + 11px + `--text-secondary`로 Figma식 소형 헤더 처리.

간격은 **4px 기본 그리드**:

| 토큰 | 값 | 용도 |
|---|---|---|
| `--sp-1` | 4px | 아이콘-텍스트 간, 그리드 갭(도구 버튼) |
| `--sp-2` | 8px | 패널 패딩, 컨트롤 행 내부 갭 |
| `--sp-3` | 12px | 섹션 간, 모달 필드 간 |
| `--sp-4` | 16px | 모달 패딩 |
| `--sp-5` | 20px | 모달 외곽 패딩(大) |

컨트롤 높이 3종 고정: 툴바 버튼 **28px**(현행 28/30 혼재 → 28 통일), 인스펙터 필드 **24px**, 메뉴 행 **30px**.

---

### 4. 컴포넌트별 개선

#### 4-1. 툴바 (canvas-toolbar + 좌측 도구 패널)

**현재 문제.** ① 아이콘 언어 3종 혼재 — 수제 SVG(스트로크 1.2/1.3/1.4/1.5/1.6 제각각), 유니코드 글리프(↶ ↷는 폰트 따라 모양·굵기가 바뀜, ☰, ▾), 텍스트 버튼. ② `topbar-btn` 높이 28px vs `fullscreen-toggle`·`icon-btn` 30×28 혼재. ③ 활성 도구가 액센트 단색 채움이라 다크에서 과하게 튐.

**제안.** 아이콘 규격을 선언하고(20×20 viewBox, stroke 1.5, round cap/join, `currentColor`) 유니코드 글리프 4종(↶ ↷ ⌖ ☰)과 텍스트 화살표 ▾를 SVG로 교체한다. 기존 도구 아이콘은 스트로크만 1.5로 정규화(SVG 속성 무시하고 CSS로 강제 가능):

```css
/* 아이콘 규격 강제: 개별 SVG의 stroke-width 편차를 CSS가 덮는다 */
.tool-ico, .topbar-btn svg, .search-trigger-ico {
  width: 18px; height: 18px;
  stroke-width: 1.5;
  stroke-linecap: round; stroke-linejoin: round;
}
/* 활성 도구: 단색 채움 → 저채도 채움 + 액센트 스트로크 (Figma식) */
.tool-btn.is-active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: var(--accent);
}
.tool-btn.is-active kbd { color: var(--accent); }
```

▾는 재사용 셰브론 하나로: `<svg viewBox="0 0 20 20"><path d="M6 8l4 4 4-4"/></svg>`. ↶↷는 `M15 5.5 A6.5..` 회전 화살(기존 회전 도구 아이콘과 같은 문법)로 통일 — 좌측 패널·툴바·바텀바가 같은 손글씨가 된다.

#### 4-2. 인스펙터

**현재 문제.** ① 라디우스 3px가 앱 전체 6px 규칙과 충돌. ② `uppercase` 헤더가 한글에 무의미. ③ 포커스가 1px 보더 색 변화뿐이라 어두운 배경에서 미약. ④ 구분선이 전부 `--border` 강도라 섹션과 필드행의 위계가 없음.

**제안.**

```css
:root { --insp-radius: var(--radius-field); }   /* 3px → 4px */

.insp-summary {
  font-size: 11px; font-weight: 600;
  text-transform: none;                /* uppercase 제거 */
  letter-spacing: .02em;
  color: var(--text-secondary);
  padding: 7px 8px;
}
.insp-section { border-bottom: 1px solid var(--border-muted); } /* 내부선 감쇠 */

.insp-input:focus, .cp-num-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--focus-ring);      /* 과목 테마 추종 */
}
```

리사이즈 핸들(`#inspector-resize`)의 hover 색 `rgba(9,105,218,.18)`도 `color-mix(in srgb, var(--accent) 18%, transparent)`로 치환 — 화학(버건디) 테마에서 파란 핸들이 뜨는 현행 어긋남 해소.

#### 4-3. 캔버스 영역

**현재 문제.** ① `--bg-canvas`가 `--bg-app`·`--bg-input`과 동일(#0d1117)해 우물 깊이가 없음. ② 아트보드가 1px 회색 스트로크(#d0d7de)뿐이라 "종이"가 아니라 "사각형"으로 읽힘. ③ 워터마크 fill-opacity 0.08이 도해 작업 시 시각 소음.

**제안.** 토큰 변경(#010409)만으로 우물이 생긴다. 아트보드는 JS(render/scene.js 116~118행)라 3단계 과제이지만, 목표 상태는: 스트로크를 `#30363d`(다크)/`#d0d7de`(라이트)로 테마화 + **작은** 그림자 1개(의도적 원칙 예외, §1 선언 참조):

```css
/* scene.js가 artboard rect에 class="artboard"를 달아준다는 전제 (3단계) */
#canvas .artboard { filter: drop-shadow(0 1px 3px rgba(1, 4, 9, 0.55)); }
```

워터마크는 CSS-only로 즉시 감쇠: data-URI 내 `fill-opacity='0.08'` → `'0.04'`. 눈금자·격자 UI는 현행 유지(이미 패널 토큰 사용).

#### 4-4. 모달 · 다이얼로그

**현재 문제.** ① `.modal-overlay`가 style.css에 **2회 정의**(535행, 1471행 — z-index 1000 vs 10000)로 케이스케이드 사고 대기 상태. ② 표면색이 `--bg-panel`이라 패널 위에 떠도 층이 안 보임. ③ 수식 편집기(`.formula-editor`)·글꼴 모달(`.font-modal`)이 하드코딩 다크로 라이트 테마에서 깨짐(§2).

**제안.**

```css
/* 중복 정의 1471행 블록 삭제 후 단일 정의 */
.modal-overlay { background: rgba(1, 4, 9, 0.55); z-index: 1000; }

.modal, .modal-card, .font-modal, .unified-text-editor {
  background: var(--bg-raised);          /* 패널보다 한 단계 밝은 표면 */
  border: 1px solid var(--border);
  border-radius: var(--radius-modal);
  box-shadow: var(--shadow-modal);
}
.file-menu-list, .text-ctx-menu, .formula-editor {
  background: var(--bg-raised);
  border-radius: var(--radius-pop);
  box-shadow: var(--shadow-pop);
}
.formula-input, .fm-list, .fm-size-input {   /* 하드코딩 → 토큰 */
  color: var(--text-primary);
  background: var(--bg-input);
  border-color: var(--border);
}
```

#### 4-5. 기출 라이브러리 패널

**현재 문제.** ① 카드가 배경과 같은 표면색이라 썸네일 흰 판만 둥둥 뜸. ② hover가 보더 색 변화뿐(`--text-secondary`)이라 피드백 미약. ③ 선택 상태 `box-shadow ... inset` 2px가 썸네일을 침범.

**제안.** 결과 그리드를 "우물" 위에 얹고, 카드를 raised 표면으로:

```css
.examlib-grid {
  background: var(--bg-app);            /* 모달 안의 한 단계 함몰된 우물 */
  border: 1px solid var(--border-muted);
  border-radius: var(--radius-ctrl);
  padding: 12px;
}
.examlib-card {
  background: var(--bg-raised);
  border-radius: var(--radius-ctrl);
  transition: border-color .1s;
}
.examlib-card:hover { border-color: var(--accent-2); }
.examlib-card.is-selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);  /* inset 2px → 외곽 1px 링 */
}
.examlib-thumb { background: #ffffff; } /* 유지 — 문항 PNG는 흰 판 전제 */
```

썸네일 흰 판은 "어두운 크롬 + 밝은 문서" 문법과 정확히 일치하므로 그대로 두는 것이 이 제안의 핵심 정합성이다.

---

### 5. 적용 로드맵 3단계

**1단계 — CSS만, 1~2시간.** ① 신규 토큰 6종(`--bg-raised` `--border-muted` `--focus-ring` `--shadow-pop` `--shadow-modal` `--radius-*`) 선언. ② 다크 `--bg-canvas` #010409, 라이트 `--bg-app` #f6f8fa/`--bg-canvas` #d3dae3. ③ 하드코딩 색 치환(수식 편집기·글꼴 모달·바텀바 숫자 입력·포커스링 2곳·리사이즈 핸들). ④ `.modal-overlay` 중복 정의 정리. ⑤ 워터마크 0.08→0.04. ⑥ 인스펙터 라디우스 4px·uppercase 제거. 파일: `css/style.css`, `css/inspector.css`, `css/exam-library.css`만. 라이트 테마·과목 4테마 즉시 개선 체감.

**2단계 — 아이콘 통일 + 마크업, 반나절~1일.** ① index.html에 `<symbol>` 스프라이트 추가, 유니코드 글리프(↶ ↷ ⌖ ☰ ▾ 5종)를 `<use>` SVG로 교체. ② 아이콘 규격 CSS 강제(스트로크 1.5 정규화). ③ 활성 도구 저채도 채움 스타일. ④ 툴바 높이 28px 통일. ⑤ 기출 라이브러리 카드 개선(4-5).

**3단계 — JS 접점 + 검증, 1~2일.** ① scene.js 아트보드에 class 부여 → 테마화 스트로크 + 소형 그림자(내보내기 경로에 그림자 미포함 확인 필수). ② export-dialog.js·image-objectify.js 등 JS 인라인 스타일의 하드코딩 색 토큰화. ③ 과목 4테마 × 라이트/다크 8조합 대비 검증(AA 4.5:1), 모바일 드로어 회귀 확인.

---

### 6. 이 방향의 trade-off (잃는 것)

- **시그니처 라이트 정체성의 후퇴.** 기본 화면이 다크인 이상 #f6f8fa·#0969da 시그니처는 "설정을 바꾼 사람"만 본다. 다른 5E 계열 도구(edunote 등)와 첫인상 일관성이 약해진다.
- **인쇄 결과와의 밝기 괴리.** 최종 산출물은 흰 종이 인쇄물인데 편집 환경이 어두우면 눈의 순응 때문에 선 굵기·회색 단계 판단이 실제 인쇄보다 진하게 느껴질 수 있다. 교사 사용자층에는 실무 리스크 — 라이트 테마를 "인쇄 미리보기 모드"로 유지·홍보하는 보완이 필요하다.
- **과목 배경 틴트의 식별력 저하.** 캔버스 우물이 #010409로 깊어지면 과목별 배경 기울임(#110f12, #0e1512 등)과의 차이가 더 미세해져, 배경만으로 과목을 인지하던 단서가 약해진다(액센트 색 의존도 증가).
- **아이콘 교체의 회귀 비용.** 2단계는 CSS-only 원칙을 벗어나 index.html 마크업을 건드린다. 유니코드 글리프는 폰트가 그려주지만 SVG는 직접 유지보수해야 하므로, 이후 아이콘 추가마다 규격(20그리드·1.5스트로크) 준수 비용이 발생한다.
- **토큰 계층 증가.** 표면 4단·라디우스 4단·그림자 2단은 지금의 "변수 몇 개" 구조보다 학습 비용이 있다. JS 3~4주차 수준에서 직접 수정할 때 "어느 층 토큰인가"를 먼저 판단해야 한다.
- **밀도 상향의 접근성 비용.** 메뉴 14→13px, 헤더 11px 등 프로 툴식 고밀도는 작은 글씨 불편(기존에 제기된 불편 4종 중 하나)과 방향이 반대다 — 근본 해결은 밀도 축소가 아니라 대비·행높이 확보로 풀어야 하며, 그래도 부족하면 이 항목은 되돌릴 것.

---

# 제안 3: 인쇄 우선 미니멀 — 평가원 지면 감성, 흑백 기조 + 포인트 1색, 종이 중심 레이아웃

### 1. 컨셉 요약과 무드

5E의 최종 산출물은 언제나 "흰 종이 위 먹색 도해"이므로, 편집기 자체를 평가원 시험지의 지면 문법 — 흰 바탕, 가는 먹색 괘선, 명조 제목, 단 하나의 절제된 강조색 — 으로 재구성한다. 화면의 모든 유채색 장식(과목별 배경 틴트, 보조 파랑 체브론, 워터마크)을 걷어내고 무채색 위계(먹 → 회색 → 은회색)로 정보를 조직하며, 시그니처 블루 #0969da는 "지금 선택된 것" 하나에만 남긴다. 캔버스의 흰 아트보드가 화면의 주인공이 되도록 주변 UI는 종이 여백처럼 물러나는, "도구가 아니라 지면을 보는" 편집기를 만든다.

무드: 인쇄소 교정쇄, 수능 문제지 1면의 머리 괘선, 함초롬바탕 지문 옆의 가는 실선 표. 화면인데 종이 냄새가 나는 상태. 그림자와 라운드 대신 괘선(rule)과 여백으로 구획한다.

**현재 상태 진단 (파일 실측)**
- 기본 테마가 다크(`index.html:2` `data-theme="dark"`, GitHub-dark 계열)이고, 다크 캔버스에 Georgia 이탤릭 워터마크 텍스처가 깔림(`style.css:997-1000`) → "화면 우선" 앱. 흰 문항 이미지·흰 아트보드와 상시 명암 충돌.
- 과목 선택 시 accent뿐 아니라 **배경 전체가 버건디/틸/브라운으로 틴트**됨(`style.css:91-102`) → 유채색이 화면 전역에 번짐.
- 유채색 강조가 2계열(--accent, --accent-2)로 분산: 접기 체브론(`style.css:220`, `inspector.css:98`)과 브랜드 로고까지 파랑.
- 곡률 6px 통일 블록(`style.css:1641-1646`) + 모달 8~10px, 모달 그림자 `0 8px 24px`(`style.css:557`) → 종이보다 "웹앱 카드" 문법.
- 라이트 테마 배경이 청색 틴트(`--bg-canvas:#dde3ea`, `--bg-app:#eaeef2`)로 시그니처 #f6f8fa에서 이탈.
- 인스펙터는 이미 흑백 그레이스케일 컬러 피커(white→black 바, `inspector.css:256-301`)를 갖고 있어 본 방향과 이미 정합 — 이 문법을 앱 전체로 확장하는 제안이다.

### 2. 컬러 토큰 표

기준: 라이트(=종이) 테마를 **기본값**으로 승격. 다크는 "야간 모드"로 유지(3단계에서 재조정).

| CSS 변수 | 현재값 (light) | 제안값 | 비고 |
|---|---|---|---|
| `--bg-app` | `#eaeef2` | `#f6f8fa` | 시그니처 배경 복귀. 종이 밖 "책상" 면 |
| `--bg-panel` | `#ffffff` | `#ffffff` | 유지 |
| `--bg-panel-hover` | `#f3f5f8` | `#f6f8fa` | 회색 단계 수 축소(app 면과 통일) |
| `--bg-canvas` | `#dde3ea` (청색 틴트) | `#e7e9ec` | 무채색화. 흰 아트보드를 액자처럼 프레이밍 |
| `--bg-input` | `#ffffff` | `#ffffff` | 유지 |
| `--border` | `#d0d7de` | `#d0d7de` | 시그니처 구분선 유지 (은회색 괘선) |
| `--ink` (신설) | — | `#0d1117` | 먹색 괘선·활성 반전용. 평가원 머리선 |
| `--text-primary` | `#0d1117` | `#0d1117` | 유지 |
| `--text-secondary` | `#656d76` | `#59636e` | 청색기 제거한 중성 회색 |
| `--text-label` | `#424a53` | `#424a53` | 유지 |
| `--accent` | `#0969da` | `#0969da` | **화면에 남는 유일한 유채색.** 선택·포커스·주 CTA 전용 |
| `--accent-hover` | `#0860ca` | `#0860ca` | 유지 |
| `--accent-2` | `#0a5aa8` | `#59636e` (사실상 폐지) | 체브론·브랜드 등 장식성 파랑 → 회색/먹으로 |
| `--accent-2-hover` | `#084b8d` | 폐지 | — |
| `--btn-tool-active` | `#0969da` | `#0d1117` | 활성 도구 = **먹색 반전**(활판 느낌). 파랑은 "선택된 오브젝트"에 양보 |
| `--scrollbar-thumb` | `#afb8c1` | `#c2c8ce` | 한 톤 연하게, 존재감 축소 |
| `--radius` (신설) | 6px 하드코딩 | `3px` | 곡률 통일 블록을 토큰화하며 값 축소 |
| 과목 오버라이드 `--bg-app/panel/canvas` (`style.css:91-102`) | 과목별 전면 틴트 | **삭제** | 과목색은 `--accent` 1변수만 오버라이드. 배경은 항상 무채색 |

**의도적으로 깨는 원칙 명시**
1. **서브 컬러 #0e7490 미사용** — "포인트 1색" 컨셉상 2차 유채색을 화면에서 배제한다(팔레트에서 삭제하는 것이 아니라, 이 도구의 UI에는 등판시키지 않음).
2. **활성 도구색을 메인 블루 → 먹색으로** — 시그니처 메인 컬러를 폐기하는 것이 아니라 적용 범위를 "선택/포커스/주 버튼"으로 좁힌다. 도구 버튼까지 파랑이면 캔버스 위 선택 하이라이트와 경합하기 때문.
3. **기본 테마 다크 → 라이트 전환** — CLAUDE.md 원칙은 아니나 현행 제품 기본값(v0.54.14)을 뒤집는 결정. 인쇄 우선 컨셉의 전제라 불가피.
4. 과목별 배경 틴트 제거는 "색은 그룹/섹션 단위로만" 원칙에 오히려 **부합**하는 방향(현재가 전역 틴트로 원칙을 넘고 있음).
5. **표제 서체에 Noto Serif KR 도입** *(편집자 추가 선언)* — 타이포그래피 원칙(본문 IBM Plex Sans KR / 모노 IBM Plex Mono)은 본문·수치에서 그대로 지키되, 모달 제목과 브랜드 2곳에 한해 명조 표제를 얹는다. 평가원 지면 문법의 핵심 장치라 의도적으로 확장하며, 현행 브랜드도 이미 원칙 밖 서체(Georgia 이탤릭)였으므로 "신규 이탈"이 아니라 "교체"다.

### 3. 타이포 스케일 · 간격 시스템

**타이포 스케일 (5단, 본문 13px 기준)**

| 토큰 | 크기/행간 | 용도 | 서체 |
|---|---|---|---|
| `--fs-caption` | 11px / 1.4 | 단축키 배지, 단위, 푸터, 카드 태그 | Sans KR (숫자는 Plex Mono) |
| `--fs-ui` | 12px / 1.5 | 인스펙터 필드, 메뉴 설명, 섹션 헤더 | IBM Plex Sans KR |
| `--fs-body` | 13px / 1.5 | 버튼, 셀렉트, 리스트 — UI 표준 | IBM Plex Sans KR |
| `--fs-title` | 15px / 1.45 | 모달 제목 | **Noto Serif KR 600** (평가원 명조 표제) |
| `--fs-brand` | 18px / 1.3 | 브랜드 "5E" | Noto Serif KR 600, 이탤릭 제거 |

- 웨이트는 400/500/600 3단만. 700은 `[시범공개]` 같은 경고 배지에 한정.
- 수치(좌표·줌·DPI·연도)는 전부 IBM Plex Mono — 이미 `zoom-readout`, `.insp-input`이 그러함. 표기 일관화만 하면 됨.
- Noto Serif KR은 **이미 index.html:33에서 로드 중**이므로 추가 비용 0. 현재 브랜드의 Georgia 이탤릭(`style.css:402-404`)은 명조로 교체(워터마크 SVG도 2단계에서 동일 서체로 재생성).

**간격 시스템 (4px 격자)**

| 토큰 | 값 | 적용 규칙 |
|---|---|---|
| `--sp-1` | 4px | 라벨↔컨트롤, 아이콘↔텍스트 |
| `--sp-2` | 8px | 행 간격, 툴바 상하 패딩, 버튼 gap |
| `--sp-3` | 12px | 패널 패딩, 카드 내부 |
| `--sp-4` | 16px | 섹션 간 간격, 모달 내부 블록 |
| `--sp-5` | 24px | 모달 외곽 패딩 |

- 클릭 타깃 최소 높이 28px(현 topbar-btn 28px 유지), 모바일 드로어에서는 36px.
- 구획은 여백+괘선으로: 섹션 사이 `--sp-4` + `1px solid var(--border)`, 최상위 구획(툴바 하단, 모달 제목 하단)만 먹색 괘선.

### 4. 컴포넌트별 개선

#### 4-1. 툴바 (`.canvas-toolbar`, style.css:377-485)

**현재 문제**: 모든 버튼이 1px 테두리 박스 → 좁은 폭에 박스 12개가 늘어서 시각적 소음. 브랜드가 파랑 이탤릭 Georgia로 유채색 장식 역할. 구분자(`.tb-sep`)가 있는데도 박스 테두리 때문에 그룹 인지가 안 됨.

**제안**: 버튼 테두리를 기본 투명으로(플랫), hover에서만 면색. 그룹 구분은 여백+세로 괘선만으로. 브랜드는 먹색 명조. 툴바 하단선을 먹색 1px로 올려 "지면 머리 괘선" 역할.

```css
.canvas-toolbar {
  gap: 4px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ink);   /* 평가원 머리 괘선 */
  background: var(--bg-panel);
}
.topbar-btn {
  border: 1px solid transparent;          /* 박스 소음 제거 */
  background: transparent;
  color: var(--text-label);
  border-radius: var(--radius);
}
.topbar-btn:hover { background: var(--bg-panel-hover); border-color: var(--border); }
.tb-sep { height: 16px; margin: 0 6px; background: var(--border); }
.app-brand {
  font-family: "Noto Serif KR", serif;
  font-style: normal;                     /* 이탤릭 제거 */
  font-size: 18px; font-weight: 600;
  color: var(--text-primary);             /* 파랑 → 먹 */
}
.zoom-readout { font-size: 12px; color: var(--text-secondary); }
```

파일/설정 드롭다운(`.file-menu-list`)도 동일 문법: `border-radius: var(--radius)`, 그림자 `0 2px 8px rgba(0,0,0,.08)`로 축소.

#### 4-2. 인스펙터 (`css/inspector.css`)

**현재 문제**: `.insp-summary`가 `text-transform: uppercase; letter-spacing: .04em`(85-86행) — 한국어 라벨에는 무의미한 라틴 문법. 체브론이 파랑(`--accent-2`, 98행). 섹션 구분이 회색 hover 면(`rgba(128,128,128,.15)`)으로 앱스러움. 기본 폭 215px에 12px 텍스트가 빽빽.

**제안**: 섹션 헤더를 "문항 소제목" 문법으로 — 명조 웨이트 대신 굵기 600 + 하단 은회색 괘선, 체브론은 회색. 그레이스케일 피커(이미 인쇄 정합)는 유지하고, 유채색은 포커스 테두리(`--accent`)에만.

```css
.insp-summary {
  padding: 8px;
  font-size: 12px; font-weight: 600;
  text-transform: none; letter-spacing: 0;   /* 라틴 문법 제거 */
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);     /* 면 대신 괘선 */
}
.insp-summary::before { color: var(--text-secondary); }  /* 체브론 무채색 */
.insp-summary:hover { background: var(--bg-panel-hover); }
.insp-body { padding: 8px; gap: 6px; }        /* 4px 격자 정렬 */
:root { --insp-radius: 2px; }                 /* 입력칸은 거의 각지게 */
```

기본 폭은 `--panel-right-w: 215px → 232px`로 소폭 상향(리사이즈 핸들 존재하므로 CSS 1줄).

#### 4-3. 캔버스 영역 (`.panel-center`, `#canvas`, 눈금자)

**현재 문제**: 다크 기본에서 흰 문항 PNG·흰 아트보드가 화면에서 "빛나는" 명암 충돌. 워터마크 텍스처(997-1000행)가 지면 감성과 정면 충돌. 라이트에서도 surround가 청색 틴트.

**제안**: 라이트 기본 + 무채색 surround로 "책상 위 교정쇄" 프레이밍. 눈금자는 흰 바탕에 회색 눈금(이미 `--bg-panel` 사용이라 토큰 스왑만으로 해결). 워터마크는 다크 전용 규칙이므로 라이트 기본화만으로 화면에서 사라짐 — 삭제 아닌 자연 퇴장.

```css
/* index.html:2 — 1줄 변경 */
<html lang="ko" data-theme="light">

#canvas { background: var(--bg-canvas); }      /* #e7e9ec 무채 회색 */
.ruler-corner, .ruler { background: var(--bg-panel); }
```

3단계에서: 아트보드(SVG rect, render.js 소관)에 `stroke: #d0d7de` 1px 헤어라인을 주어 종이 가장자리를 명시 — 그림자 없는 "재단선" 프레임. CSS 범위 밖이므로 로드맵에만 배치.

#### 4-4. 모달·다이얼로그 (`.modal`, `.modal-card`, `.font-modal`)

**현재 문제**: 곡률 8~10px + `box-shadow: 0 8px 24px`(557행) — "떠 있는 카드" 문법으로 AI티 금지 원칙의 경계선. `.font-modal` 내부에 다크 하드코딩(`#1e1f22`, `#dcddde`, 1344-1390행)이 있어 라이트 기본화 시 파손 위험.

**제안**: 모달을 "지면 위 별지(別紙)" 로 — 각진 모서리, 먹색 제목 괘선, 그림자는 존재만 알리는 수준.

```css
.modal, .modal-card, .font-modal {
  border-radius: var(--radius);               /* 10px → 3px */
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);  /* 큰 그림자 제거 */
}
.modal-title {
  font-family: "Noto Serif KR", serif;
  font-size: 15px; font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ink);        /* 평가원 표제 괘선 */
}
.modal-overlay { background: rgba(13, 17, 23, 0.35); }  /* 딤도 옅게 */
```

`.font-modal`의 하드코딩 색(`.fm-list`, `.fm-size-input`, `.fm-btn`의 `#1e1f22/#dcddde`)은 `var(--bg-input)/var(--text-primary)`로 치환 — 1단계 필수 항목(라이트 기본화 시 유일한 파손 지점).

#### 4-5. 기출 라이브러리 패널 (`css/exam-library.css`)

**현재 문제**: 그리드가 `repeat(4, 1fr)` 고정(63행) — 좁은 화면에서 카드가 뭉개져 모바일 우선 원칙 위반. 선택 표시가 `box-shadow: 0 0 0 2px var(--accent) inset`(81행)으로 두껍고 앱스러움. 카드 메타(연도·태그)가 서체 구분 없이 흐릿함.

**제안**: 카드를 "문제지 축쇄판" 으로 — 흰 판, 헤어라인, 각진 모서리. 선택은 먹색 테두리 + 포인트색 마커 1점.

```css
.examlib-grid {
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); /* 반응형 */
  gap: 12px;
}
.examlib-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
}
.examlib-card:hover { border-color: var(--text-secondary); }
.examlib-card.is-selected {
  border-color: var(--ink);
  box-shadow: 0 0 0 1px var(--ink) inset;      /* 2px 파랑 → 1px 먹 */
}
.examlib-card.is-selected .examlib-title::before {
  content: "▸ "; color: var(--accent);          /* 포인트 1색은 마커 1점만 */
}
.examlib-tags { font-family: "IBM Plex Mono", monospace; font-size: var(--fs-caption); }
```

검색 인풋·필터 셀렉트는 공통 토큰(`--radius`, `--border`)을 따라 자동 정렬.

### 5. 적용 로드맵 3단계

**1단계 — CSS 토큰 스왑 (1~2시간, style.css·inspector.css·exam-library.css + index.html 1줄)**
1. `index.html:2` `data-theme="light"` 기본화 (1줄).
2. `:root[data-theme="light"]` 토큰 교체(§2 표), `--ink`·`--radius` 신설, 곡률 통일 블록(style.css:1641)을 `border-radius: var(--radius)`로.
3. `--accent-2` 사용처(체브론·브랜드) 무채색화, 모달 그림자·딤 축소, `.font-modal` 다크 하드코딩 → 변수 치환.
4. 기출 그리드 `auto-fill` 반응형 1줄 수정.
   → 여기까지로 "흰 지면 + 먹 괘선 + 파랑 1점" 인상이 완성됨. JS 무수정.

**2단계 — 컴포넌트 정리 (반나절)**
- 툴바 플랫화·그룹 여백 재조정, 브랜드 명조 교체 + 다크용 워터마크 SVG 서체 통일.
- 과목별 테마 축소: style.css:91-102에서 `--bg-*` 오버라이드 줄 삭제, `--accent` 계열만 존치(과목 인지는 과목 셀렉트 테두리·파트 헤더 좌측 3px 바가 이미 담당).
- 인스펙터 섹션 헤더 괘선화, 기출 카드 선택 마커, 활성 도구 먹색 반전 적용 후 캔버스 선택색(파랑)과의 위계 검증.

**3단계 — 구조·모드 (1~2일, JS 동반)**
- 종이 중심 캔버스: 아트보드 헤어라인 테두리(render.js), 초기 뷰를 "지면 여백 포함 중앙 정렬"로(viewport.js).
- "인쇄 미리보기" 토글: 캔버스만 100% 배율 + 완전 무채색 강제 렌더 — 기존 흑백 모드 토글(`theme-toggle`)의 개념을 "화면 테마"에서 "출력 시뮬레이션"으로 승격.
- 다크 테마를 "야간 모드"로 재정의(먹/종이 반전 원칙으로 토큰만 재조정), 버전 v0.55.0 표기 및 일괄 커밋.

### 6. 이 방향의 Trade-off (잃는 것)

- **다크 기본의 상실**: 야간·암실 환경에서 장시간 쓰는 사용자는 첫 화면이 눈부시게 느껴질 수 있다. 다크가 익숙해진 기존 사용자에게 전환 비용 발생 (야간 모드 토글로 완화되지만 "기본값의 인상"은 되돌릴 수 없음).
- **과목별 앰비언트 테마의 상실**: 배경 전체가 과목색으로 물드는 현행의 즉각적 과목 인지가 사라지고, accent 1변수 수준의 미묘한 단서만 남는다.
- **서브 컬러 #0e7490의 퇴장**: 2차 강조 수단이 없어져 위계 표현을 전부 굵기·괘선·여백으로 감당해야 한다. 표현 폭이 좁아진다.
- **어포던스 저하**: 플랫 버튼·헤어라인·저채도는 "눌리는 것"의 단서를 줄인다. 도구를 처음 접하는 교사(주 사용자층 확장 시)에게 학습 비용이 늘 수 있다.
- **상태 표현의 미묘화**: 활성/비활성·경고가 채도 대신 명도 차이에 의존하게 되어, 저품질 모니터·빔프로젝터 시연 환경에서 구분이 흐려질 수 있다. 잔존 경고색(#d1242f 등)이 상대적으로 튀어 별도 톤 관리 필요.
- **"앱다움"의 포기**: 그림자·라운드·틴트가 주던 현대 웹앱의 생동감이 빠져 정적이고 밋밋하다는 인상을 받을 수 있다 — 이 제안은 그것을 결함이 아니라 지면의 품격으로 재해석하는 쪽에 선다.

---

# 제안 4: 고밀도 워크스페이스 — 접이식 패널, 커맨드 팔레트, 키보드 중심, 화면 효율 극대화

### 1. 컨셉 요약과 무드

5E는 이미 GitHub-다크 계열의 절제된 3패널 에디터지만, 크롬(툴바 44px + 하단바 34px + 눈금자 20px + 좌 130px + 우 215px)이 캔버스를 사방에서 잠식하고 있다. 이 제안은 "모든 픽셀은 캔버스를 위해 존재한다"는 원칙 아래 크롬을 접고·줄이고·숨겨서, 1280px 노트북에서도 아트보드가 화면의 80% 이상을 차지하게 만든다. 마우스로 메뉴를 뒤지는 대신 Ctrl+K 커맨드 팔레트와 단축키가 1차 입력이 되고, 패널은 필요할 때만 펼쳐지는 "계기판"이 된다.

무드: VS Code의 Zen 모드와 Figma의 UI 축소 모드 사이. 도구는 조용하고 평평하며, 색은 오직 "지금 활성인 것" 하나에만 쓰인다. 장식적 요소는 0, 정보 밀도는 최대 — 시험지 편집이라는 반복 작업에 최적화된 작업대의 인상.

> **의도적으로 구부리는 원칙**: CLAUDE.md의 "모바일 우선 반응형"과 부분 충돌한다. 고밀도(24px 컨트롤, 아이콘 레일)는 **≥768px 데스크톱에만 적용**하고, 모바일(≤767px)은 현행 드로어 UX와 터치 타깃 크기를 그대로 유지한다. 이 도구의 실사용 무대(교무실 데스크톱·노트북)에서 화면 효율이 곧 생산성이기 때문이며, 모바일 레이아웃 자체는 손대지 않으므로 반응형 원칙의 골격은 지킨다. 그 외 원칙(그라데이션 금지·큰 그림자 금지·색은 그룹 단위)은 오히려 이 방향과 일치하며, 그림자는 현재보다 더 줄인다.

---

### 2. 컬러 토큰 표

시그니처 팔레트는 **유지**한다(고밀도는 색이 아니라 간격의 문제). 변경은 3건, 신설은 4건 — 전부 "크롬의 존재감 축소 + 키보드 포커스 가시성"이 목적이다.

| CSS 변수 | 현재값 (다크 / 라이트) | 제안값 (다크 / 라이트) | 근거 |
|---|---|---|---|
| `--bg-app` | `#0d1117` / `#eaeef2` | 유지 | 시그니처 |
| `--bg-panel` | `#161b22` / `#ffffff` | 유지 | 시그니처 |
| `--bg-canvas` | `#0d1117` / `#dde3ea` | **`#010409`** / 유지 | 다크에서 캔버스 서라운드를 한 단계 더 눌러 흰 아트보드와 패널 경계가 선명해짐 → 크롬이 뒤로 물러남 |
| `--border` | `#30363d` / `#d0d7de` | 유지 (패널 외곽 전용으로 격하) | 시그니처 구분선 |
| `--border-subtle` (신설) | — | **`#21262d`** / **`#e7ebef`** | 패널 내부 섹션 구분선용. 내부 선이 외곽선과 같은 농도라 현재 화면이 "격자 상자"처럼 보임 |
| `--accent` | `#2f81f7` / `#0969da` | 유지 | 시그니처 (과목 테마 오버라이드 구조도 유지) |
| `--accent-dim` (신설) | — | **`rgba(47,129,247,.15)`** / **`rgba(9,105,218,.10)`** | 활성 행·선택 상태를 solid 채움 대신 은은한 배경으로 — 고밀도 화면에서 solid 블록이 많으면 시끄러움. `color-mix(in srgb, var(--accent) 15%, transparent)`로 선언하면 과목 테마 자동 추종 |
| `--focus-ring` (신설) | — | **`rgba(47,129,247,.45)`** / **`rgba(9,105,218,.35)`** | 키보드 중심 UI의 필수품. 현재 `:focus-visible` 스타일이 사실상 없음 |
| `--kbd-bg` / `--kbd-border` (신설) | — | **`#1c2128` `#30363d`** / **`#f6f8fa` `#d0d7de`** | 단축키 칩(kbd) 전용. 팔레트·메뉴·툴팁 어디서나 동일한 칩 모양 |
| 그림자 (`box-shadow`) | 메뉴 `0 4px 14px`, 모달 `0 8px 24px` | **`0 1px 0 rgba(0,0,0,.2)` + 1px 보더** / 모달만 `0 4px 12px` | "큰 그림자 금지" 원칙을 더 밀어붙임. 플랫한 층위는 보더로 충분 |

---

### 3. 타이포 스케일·간격 시스템

현재 글꼴 크기가 9, 10, 11, 12, 12.5, 13, 14, 15, 18px로 산개해 있다. 6단으로 고정한다.

**타이포 스케일** (본문 IBM Plex Sans KR, 수치 IBM Plex Mono — 현행 유지)

| 토큰 | 값 | 용도 (현재값 → 변경) |
|---|---|---|
| `--fs-caption` | 10px | 배지·단축키 칩 (10~11px 혼용 → 통일) |
| `--fs-minor` | 11px | 보조 설명·단위·힌트 (유지) |
| `--fs-ui` | 12px | **기본 UI**: 인스펙터, 버튼, 메뉴, 섹션 헤더 (툴바 14px → 12px, 섹션 헤더 13px → 12px) |
| `--fs-input` | 13px | 텍스트 입력 필드 (판독성 확보, 유지) |
| `--fs-title` | 14px | 모달 제목 (15px → 14px) |
| `--fs-brand` | 16px | 5E 브랜드 (18px → 16px) |

행간: UI 1.35 / 설명문 1.5. `12.5px` 같은 소수 크기는 폐기.

**간격 시스템** — 4px 그리드, 홀수 간격(5, 7, 9px 등 현재 다수) 폐기:

```css
:root {
  --sp-1: 2px;  --sp-2: 4px;  --sp-3: 6px;
  --sp-4: 8px;  --sp-5: 12px; --sp-6: 16px;
  --control-h: 24px;      /* 데스크톱 표준 컨트롤 높이 (현행 28~30px) */
  --toolbar-h: 36px;      /* 현행 실측 ≈44px */
  --statusbar-h: 26px;    /* 하단바 현행 ≈34px */
  --footer-h: 22px;       /* 현행 28px */
  --panel-left-w: 128px;  /* 접힘 시 44px */
  --panel-right-w: 216px;
}
@media (max-width: 767px) {
  :root { --control-h: 32px; } /* 모바일 터치 타깃 유지 */
}
```

수직 크롬 합계: 현재 44+34+28 ≈ **106px** → 제안 36+26+22 = **84px** (하단바·상태 통합 시 62px까지).

---

### 4. 컴포넌트별 개선

#### 4-1. 상단 툴바

**현재 문제**: 패딩 `8px 12px` + 28px 버튼으로 44px 높이. "파일 ▾", "설정 ▾" 텍스트 버튼과 `zoom 1.00×` 리드아웃이 가로폭을 소비하고, zoom은 상태 정보인데 조작부(툴바)에 있다. 기능 진입점이 툴바·좌패널·하단바 3곳에 흩어져 "어디서 여는지" 기억해야 한다.

**제안**: 36px 슬림 툴바. zoom 리드아웃은 하단 상태바로 이동. 우측에 커맨드 팔레트 진입 버튼(검색 아이콘 + `Ctrl K` 칩)을 상시 노출해 "모든 기능의 단일 입구"를 시각적으로 약속한다.

```css
.canvas-toolbar { padding: var(--sp-2) var(--sp-4); gap: var(--sp-2); min-height: var(--toolbar-h); }
.topbar-btn { padding: 4px 8px; font-size: var(--fs-ui); }
.topbar-btn.icon-btn, .fullscreen-toggle { width: 26px; height: var(--control-h); }
.app-brand { font-size: var(--fs-brand); height: var(--control-h); }
.tb-sep { height: 14px; margin: 0 var(--sp-1); }
/* 커맨드 팔레트 진입 버튼의 단축키 칩 */
.kbd-chip {
  padding: 1px 5px; font: var(--fs-caption)/1.4 "IBM Plex Mono", monospace;
  color: var(--text-secondary); background: var(--kbd-bg);
  border: 1px solid var(--kbd-border); border-radius: 4px;
}
```

#### 4-2. 좌측 도구 패널 (접이식 레일)

**현재 문제**: 130px 고정. 아코디언은 있지만 패널 자체를 접을 수 없어, 도구를 다 외운 숙련 사용자에게도 130px이 항상 점유된다.

**제안**: `Ctrl+\`(또는 `[`)로 **44px 아이콘 레일 ↔ 128px 전체** 토글. 접힌 상태에선 도구 그리드가 1열이 되고 섹션 헤더 텍스트는 숨김, 아코디언 상태는 localStorage에 보존. 도구 이름 검색은 커맨드 팔레트가 대신한다.

```css
.app.left-rail { --panel-left-w: 44px; }
.app.left-rail .tool-section-body { grid-template-columns: 1fr; gap: var(--sp-1); }
.app.left-rail .tool-section-header { font-size: 0; padding: var(--sp-2) 0; justify-content: center; }
.app.left-rail .tool-section-header .toggle-icon { font-size: 10px; }
.app.left-rail .subject-select-panel { padding: 0 2px; font-size: var(--fs-caption); }
.app.left-rail [style*="grid-column-start"] { grid-column-start: auto !important; }
```

#### 4-3. 인스펙터 (우측 패널)

**현재 문제**: 이미 리사이즈 핸들이 있으나(150~480px) 행 간격 5px·홀수 패딩·대문자 13px 섹션 헤더가 공간 대비 정보량을 깎는다. `Ctrl+]` 같은 즉시 토글이 없어 "잠깐 넓게 보기"가 안 된다.

**제안**: 섹션 헤더를 11px 소형 캡션으로 낮추고 본문 밀도를 4px 그리드로 재조정. `Ctrl+]`로 패널 전체 접기/펴기. 내부 구분선은 `--border-subtle`로 한 단계 연하게.

```css
.insp-summary {
  padding: var(--sp-2) var(--sp-4); font-size: var(--fs-minor);
  letter-spacing: 0.06em; color: var(--text-secondary);
}
.insp-section { border-bottom: 1px solid var(--border-subtle); }
.insp-body { padding: var(--sp-2) var(--sp-4) var(--sp-4); gap: var(--sp-2); }
.insp-row { gap: var(--sp-2); min-height: var(--control-h); }
.insp-input { padding: 2px 5px; height: 22px; }
.app.right-hidden { grid-template-columns: var(--panel-left-w) 1fr 0; }
.app.right-hidden .panel-right { display: none; }
/* 키보드 포커스 가시화 — 모든 컨트롤 공통 */
:is(.insp-input, .topbar-btn, .tool-btn, .modal-input):focus-visible {
  outline: none; box-shadow: 0 0 0 2px var(--focus-ring);
}
```

#### 4-4. 캔버스 영역

**현재 문제**: 눈금자 20px 트랙, 하단바 34px(검색 2버튼 + 격자 + 중앙정렬), 푸터 28px이 각각 별도 층. `Tab`으로 양 패널을 동시에 숨기는 "포커스 모드"가 없다.

**제안**: 눈금자 16px(눈금 렌더는 JS 캔버스라 리사이즈에 자동 추종 — 틱 라벨 폰트만 1px 축소 확인 필요). 하단바를 26px **상태바**로 재정의: 좌측에 검색·격자 트리거(아이콘화), 우측에 zoom 리드아웃 + 버전을 배치하고 푸터와 통합해 층 하나를 제거한다. `Tab` = 양 패널 토글(Photoshop 관례; 텍스트 편집 중엔 무시).

```css
.ruler-container { grid-template-columns: 16px minmax(0,1fr); grid-template-rows: 16px minmax(0,1fr); }
.canvas-bottom-bar {
  min-height: var(--statusbar-h); padding: var(--sp-1) var(--sp-4);
  gap: var(--sp-4); font-size: var(--fs-minor);
}
.object-search-trigger { padding: 2px 7px; font-size: var(--fs-minor); }
.app.is-focus { grid-template-columns: 0 1fr 0; }
.app.is-focus .panel-left, .app.is-focus .panel-right { display: none; }
```

#### 4-5. 모달·다이얼로그 + 커맨드 팔레트 (신설)

**현재 문제**: 기능 진입이 파일 메뉴·설정 메뉴·고급 기능 버튼·하단바로 4갈래. 오브젝트 검색(Ctrl+F) 모달이 이미 "목록 + 하이라이트 행" 인프라를 갖고 있는데 도구 검색에만 쓰인다.

**제안**: `.object-search-modal` 구조를 그대로 확장한 **커맨드 팔레트(Ctrl+K)**. 도구 활성화·파일 작업·설정·기출 검색 진입·격자 토글까지 모든 액션을 한 검색창에서 실행하고, 각 행 우측에 단축키 칩을 노출해 팔레트 자체가 단축키 학습 도구가 되게 한다. 일반 모달은 패딩 20→16px, 제목 15→14px로 소폭 압축. 그림자는 §2 기준으로 축소. (주의: Ctrl+K는 브라우저 주소창 포커스와 충돌 — `preventDefault` 처리 필수, 실패 시 대안 `Ctrl+P`.)

```css
.command-palette { width: 560px; padding: var(--sp-5); gap: var(--sp-4); }
.command-palette .object-search-row { padding: 5px 10px; grid-template-columns: 24px minmax(0,1fr) auto; }
.command-palette .object-search-row .kbd-chip { justify-self: end; }
.modal { padding: var(--sp-6); gap: var(--sp-5); box-shadow: 0 4px 12px rgba(0,0,0,.25); }
.modal-title { font-size: var(--fs-title); }
.file-menu-list { box-shadow: 0 1px 0 rgba(0,0,0,.2); }
```

#### 4-6. 기출 라이브러리 패널

**현재 문제**: 980px 고정폭 + 4열 고정 그리드라 와이드 모니터에서 남는 폭을 버리고, 카드 간격 12px·썸네일 150px로 한 화면 노출량이 적다. 마우스 없이는 카드 선택·삽입이 불가능하다.

**제안**: 뷰포트 추종 폭 + auto-fill 그리드로 밀도 극대화. 방향키로 카드 포커스 이동, Enter=삽입, Space=선택 토글(3단계 로드맵). 선택 표시는 solid 대신 `--accent-dim` 배경 + accent 보더로 톤 다운.

```css
.modal-examlib { width: min(1280px, calc(100vw - 48px)); }
.examlib-grid {
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: var(--sp-4); max-height: 66vh;
}
.examlib-thumb { height: 124px; }
.examlib-meta { padding: var(--sp-2) var(--sp-3) var(--sp-3); }
.examlib-card.is-selected {
  border-color: var(--accent);
  background: var(--accent-dim);
  box-shadow: none;
}
.examlib-filter-row select { padding: 2px 6px; font-size: var(--fs-ui); height: var(--control-h); }
```

---

### 5. 적용 로드맵 3단계

**1단계 — CSS만, 1~2시간** (css/style.css · css/inspector.css · css/exam-library.css 3파일)
- §3 토큰 블록 추가(`--sp-*`, `--fs-*`, `--control-h` 등) + `--border-subtle`/`--accent-dim`/`--focus-ring`/`--kbd-*` 신설
- 툴바 36px·하단바 26px·푸터 22px 슬림화, 그림자 축소, `:focus-visible` 링 일괄 적용
- 인스펙터 밀도 재조정(4-3), 눈금자 16px, 기출 라이브러리 auto-fill 그리드(4-6)
- 다크 `--bg-canvas: #010409` — 검증: 워터마크 가독성만 육안 확인

**2단계 — 소규모 JS, 반나절** (js/main.js 또는 신설 js/layout.js, 기존 드로어 IIFE 패턴 재사용)
- `Ctrl+\` 좌패널 레일 토글, `Ctrl+]` 인스펙터 토글, `Tab` 포커스 모드 (텍스트 편집 중 가드)
- 패널 상태·아코디언 상태 localStorage 보존
- zoom 리드아웃 하단 상태바 이동, 푸터-상태바 통합

**3단계 — 커맨드 팔레트, 1~2일** (신설 js/command-palette.js)
- 액션 레지스트리(도구·파일·설정·토글을 `{id, 이름, 단축키, 실행fn}` 배열로 등록) + Ctrl+K 팔레트
- 기출 라이브러리 방향키 탐색·Enter 삽입
- 현재 disabled인 "단축키 설정" 메뉴를 레지스트리 기반으로 활성화 (팔레트와 데이터 공유)

---

### 6. 이 방향의 trade-off (잃는 것)

- **초심자 발견성**: 기능이 팔레트·단축키 뒤로 숨는다. 5E가 다른 교사에게 배포되는 도구라면, 처음 온 사용자는 Ctrl+K의 존재 자체를 모른다 → 툴바의 팔레트 버튼 상시 노출과 시작 안내 모달 갱신이 필수 비용.
- **여백의 쾌적함**: 24px 컨트롤·4px 간격은 장시간 사용 시 시각 피로를 높일 수 있고, "시원한" 인상은 포기한다. 노안·저시력 사용자에게 12px UI는 부담일 수 있다(글꼴 크기만이라도 되돌릴 설정 여지 남길 것).
- **모바일과의 이원화**: 밀도 토큰을 미디어쿼리로 갈라 관리해야 하므로 CSS 분기 유지보수 비용이 늘고, "한 벌의 스타일" 단순함을 잃는다.
- **구현·동기화 부담**: 커맨드 팔레트는 새 모듈이며, 기능이 추가될 때마다 레지스트리 등록을 빠뜨리면 "팔레트에 없는 기능"이 생긴다 — 단일 진입점이라는 약속이 깨지는 순간 신뢰 비용이 크다.
- **단축키 지형 관리**: 이미 V/R/E/O/Y/S/L/P/C/D/T/F/N/A 등 도구 키가 빼곡해 새 토글 키(Tab, Ctrl+\, Ctrl+])의 충돌·오발동 가드 로직이 필요하고, Ctrl+K는 브라우저 기본 동작과 경합한다.

---

# 제안 5: 디자인 토큰 시스템화 — CSS 변수 체계, 상태(hover/active/disabled/focus) 일관화, 접근성(대비·포커스링)

### 1. 컨셉 요약과 무드

5E는 이미 GitHub 계열의 절제된 다크/라이트 테마와 과목별 강조색 시스템을 갖췄지만, 토큰 바깥에서 하드코딩된 색이 40여 곳 흩어져 있어 테마가 바뀔 때 따라오지 못하는 구멍(라이트 테마에서 다크색으로 남는 글꼴 모달 등)이 생겼다. 이 제안은 새 룩을 만드는 것이 아니라, **지금의 룩을 "우연히 유지되는 상태"에서 "구조적으로 보장되는 상태"로 바꾸는 것**이다. 색·간격·곡률·상태(hover/active/disabled/focus)를 3계층 토큰(원시값 → 의미 토큰 → 컴포넌트 별칭)으로 묶고, 지금까지 사실상 부재한 키보드 포커스링과 대비 기준(WCAG AA)을 시스템 차원에서 심는다.

**무드**: 현행 유지 — "실험실 계기판". 채도 낮은 슬레이트 표면 위에 과목색 한 줄기만 흐르는 평면(flat) UI. 그라데이션·큰 그림자·애니메이션 없음(CLAUDE.md 준수). 달라지는 것은 눈에 보이는 인상이 아니라 *일관성의 밀도*다 — 같은 역할이면 어느 패널에서든 같은 색·같은 곡률·같은 상태 변화를 보인다.

---

### 2. 컬러 토큰 표

현행 테마 토큰(`--bg-app`, `--bg-panel`, `--text-primary` 등, style.css 44~102행)은 이미 잘 설계되어 있어 **값을 거의 바꾸지 않는다**. 문제는 (a) 토큰이 있어야 할 자리에 하드코딩이 있는 것, (b) 역할은 있는데 토큰이 없는 것(위험색·포커스·눌림 상태)이다.

#### 2-1. 신설 토큰 (역할은 쓰이는데 이름이 없던 것)

| CSS 변수명 | 역할 | 다크 제안값 | 라이트 제안값 | 근거 |
|---|---|---|---|---|
| `--danger` | 삭제·오류 | `#f85149` | `#d1242f` | 현재 빨강이 **4종 혼용**: `#e35d6a`(823행), `#e5534b`(1631·1669행), `#d1242f`(413행), `#b42318`(1153행) → 테마당 1종으로 통합 |
| `--accent-emphasis` | 강조 채움(흰 글자를 얹는 버튼 배경) | `#1f6feb` | `#0969da` | 현재 다크의 `#2f81f7` 위 흰 글자는 대비 **3.8:1**로 AA(4.5:1) 미달. 채움 전용으로 한 단계 어두운 값을 분리 |
| `--on-accent` | 강조 채움 위 글자색 | `#ffffff` | `#ffffff` | 현재 `color:#fff` 하드코딩 14곳 치환 |
| `--accent-muted` | 선택 행 배경 등 옅은 강조 | `color-mix(in srgb, var(--accent) 14%, transparent)` | 동일 | inspector.css 370행의 인라인 color-mix를 승격 |
| `--focus-ring` | 포커스 표시 | `var(--accent)` | `var(--accent)` | 현재 `rgba(9,105,218,.22)` 하드코딩(1111·1429행) — 과목 테마를 따라가지 못함 |
| `--bg-pressed` | 버튼 눌림(3번째 표면 단계) | `#262c36` | `#e5e9ee` | 현재 `:active` 상태가 사실상 없음. `.btn:active #0757b0`(427행)만 고립 존재 |
| `--overlay` | 모달 뒷배경 | `rgba(0,0,0,.5)` | 동일 | 현재 `.5`/`.45` 혼용(542·1312·1474행) |
| `--shadow-pop` | 드롭다운·모달 그림자 | `0 4px 14px rgba(0,0,0,.28)` | `0 4px 12px rgba(0,0,0,.12)` | 현재 알파값 .25/.28/.3/.32/.35 5종 혼용. 라이트에서는 더 약하게(평면 원칙 유지) |

#### 2-2. 과목별 `--accent-emphasis` (흰 글자 AA 보장값)

| 과목 | 현재 채움색(다크) | 흰 글자 대비 | 제안 채움색 | 대비 |
|---|---|---|---|---|
| 물리(기본) | `#2f81f7` | 3.8:1 미달 | `#1f6feb` | 4.6:1 충족 |
| 화학 | `#b03a4a` | 5.9:1 충족 | 유지 | — |
| 생명 | `#0f8a72` | 4.3:1 미달 | `#0c7a64` (기존 라이트값 재사용) | 5.3:1 충족 |
| 지구 | `#a5794a` | 3.9:1 미달 | `#8e6339` (기존 `--accent-2-hover` 재사용) | 5.3:1 충족 |

아이콘·테두리용 `--accent`는 현행 유지(밝은 값이 다크 배경에서 유리). **채움에만** emphasis를 쓴다.

#### 2-3. 하드코딩 → 토큰 치환 대상 (값 변경 아님, 이름 연결)

| 위치 | 현재 | 치환 |
|---|---|---|
| `.formula-editor`·`.font-modal` 일대 (style.css 1234~1391행) | `#2b2d31 #1e1f22 #3a3c41 #dcddde` 고정 → **라이트 테마에서 다크 UI로 남는 실버그** | `var(--bg-panel)` `var(--bg-input)` `var(--border)` `var(--text-primary)` |
| `.guide-coordinate-editor` (958행) | `background:#0550ae` | `var(--accent-emphasis)` |
| `.cutout-instruction` (1533행) | `rgba(9,105,218,.95)` | `var(--accent-emphasis)` — 과목 테마 추종 |
| `.canvas-bottom-bar` 다크 전용 override (1431행) | `#1e1f22/#3a3c41` | 토큰화 후 override 자체 삭제 |

**CLAUDE.md와의 관계 명시**: 시그니처 메인 `#0969da`는 라이트 테마의 `--accent`로 온전히 유지된다. 다크 테마에서 `#2f81f7`/`#1f6feb` 파생색을 쓰는 것은 원칙의 의도적 확장인데, `#0969da`를 다크 배경(`#0d1117`)에 그대로 두면 대비가 3.7:1로 무너지기 때문이다(이미 제품이 하고 있는 선택을 공식화하는 것). 또 시그니처 배경 `#f6f8fa` 대신 라이트 `--bg-app`이 `#eaeef2`인 현행도 유지한다 — 흰 아트보드가 배경에서 분리되어 보이려면 주변이 한 단계 더 어두워야 한다.

---

### 3. 타이포 스케일·간격 시스템

#### 타이포 (현재 9 / 10 / 11 / 12 / 12.5 / 13 / 14 / 15 / 16 / 18px의 10단 난립 → 5단)

| 토큰 | 값 | 용도 | 흡수되는 현재값 |
|---|---|---|---|
| `--fs-caption` | 11px | 단위·힌트·배지·푸터 | 9, 10, 11 (9·10px은 대비를 만족해도 가독 하한 미달 — 전량 승격) |
| `--fs-dense` | 12px | 인스펙터 필드·카드 메타 | 12, 12.5 |
| `--fs-base` | 13px | 버튼·본문 UI 기본 | 13 |
| `--fs-menu` | 14px | 툴바·메뉴 항목 | 14 |
| `--fs-title` | 15px | 모달 제목 | 15, 16 |

브랜드 워드마크(18px Georgia italic)만 스케일 밖 예외로 남긴다. 행간은 3종으로: `1`(아이콘·단독 라벨), `1.4`(UI 기본), `1.6`(문단·안내문 — 현재 1.45/1.5/1.65/1.7 통합).

#### 간격 (4px 그리드)

| 토큰 | 값 | 대표 용도 |
|---|---|---|
| `--sp-1` | 4px | 아이콘-라벨 간, 그리드 gap 최소 |
| `--sp-2` | 8px | 필드 내부 패딩, 행 간격 |
| `--sp-3` | 12px | 패널 패딩, 카드 gap |
| `--sp-4` | 16px | 모달 내부 블록 간 |
| `--sp-5` | 20px | 모달 패딩 |
| `--sp-6` | 24px | 대형 모달 패딩 |

현재 3/5/6/7/9/14px 같은 홀수 간격은 시각 차이가 없는 범위에서 인접 단계로 스냅한다.

#### 곡률·크기

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-s` | 4px | 입력 필드·스와치 (`--insp-radius` 3px → 4px 승격) |
| `--radius-m` | 6px | 버튼 전반 — 기존 "곡률 통일 6px" 규칙(1641행)을 토큰으로 승격 |
| `--radius-l` | 10px | 모달 (8px/10px 혼용 → 10px) |
| `--control-h` | 28px | 툴바 컨트롤 높이 |
| `--control-h-s` | 24px | 하단 바·인스펙터 필드 높이 |

z-index도 5단으로: `--z-float:100`(캔버스 오버레이) / `--z-pop:200`(드롭다운) / `--z-modal:1000` / `--z-drawer:1200` / `--z-toast:9000`. 현재 `.modal-overlay`가 **두 번 정의**되어 z-index 1000(535행)과 10000(1471행)이 충돌 중 — 중복 정의 삭제가 선행 과제.

---

### 4. 컴포넌트별 개선

#### 공통 기반: 상태 4종 전역 규칙 (모든 컴포넌트가 상속)

현재 상태: hover는 `--btn-tool-hover`로 비교적 일관되나, **focus-visible은 전무**(브라우저 기본 외곽선에 방치), disabled는 opacity `.4`(458행)/`.45`(59행) 혼용에 `#open-shortcuts`(index.html 200행)처럼 disabled인데 아무 표시도 없는 항목 존재, active는 사실상 부재.

```css
/* 상태 계약 — :where()로 특이성 0을 유지해 기존 규칙을 깨지 않음 */
:where(button, select, input, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}
:where(.topbar-btn, .tool-btn, .modal-btn, .advanced-tool-btn):active:not(:disabled) {
  background: var(--bg-pressed);
}
:where(button, .file-menu-item):disabled {
  opacity: .45;
  cursor: not-allowed;
}
```

반투명 링(`rgba(...,.22)`) 대신 **불투명 2px 외곽선**을 쓰는 이유: 비텍스트 대비 3:1 요건을 어느 배경에서든 계산 없이 만족시키기 위해서다.

#### ① 툴바 (canvas-toolbar)

- **현재 문제**: 컨트롤 높이가 28px(icon-btn)과 패딩 유도 높이(topbar-btn `6px 10px`)로 미묘하게 어긋남. 눌림 상태 없음. 활성 토글(`theme-toggle[aria-pressed]`, `fullscreen-toggle`)의 흰 글자가 다크 accent 위에서 AA 미달.
- **제안**: 높이를 `--control-h`로 고정하고, 활성 채움을 `--accent-emphasis`로 교체.

```css
.topbar-btn { height: var(--control-h); padding: 0 10px;
  display: inline-flex; align-items: center; }
.theme-toggle[aria-pressed="true"],
.fullscreen-toggle[aria-pressed="true"],
.tool-btn.is-active, .grid-toggle-btn.is-active, .seg-btn.is-active {
  color: var(--on-accent);
  background: var(--accent-emphasis);
  border-color: var(--accent-emphasis);
}
```

#### ② 인스펙터 (panel-right / inspector.css)

- **현재 문제**: 자체 별칭 계층(`--insp-*`)은 좋은 구조인데 `--insp-radius:3px`가 전역 곡률 체계와 어긋나고, hover가 `rgba(128,128,128,.15)`(89·387행) 하드코딩, 입력 focus가 1px 테두리색 변화뿐이라 어떤 필드에 커서가 있는지 식별이 어려움. 리사이즈 핸들 hover도 파랑 고정(54행)이라 과목 테마 이탈.
- **제안**: 별칭의 *연결만* 교체 — 인스펙터 전 규칙이 한 번에 시스템에 편입된다.

```css
:root {
  --insp-radius: var(--radius-s);          /* 3px → 4px */
  --insp-hover: var(--bg-panel-hover);     /* rgba(128...) 대체 */
}
.insp-summary:hover, .insp-layer-eye:hover { background: var(--insp-hover); }
.insp-input:focus, .cp-num-input:focus {
  border-color: var(--insp-accent);
  box-shadow: 0 0 0 1px var(--insp-accent); /* 1px 변화 → 2px 두께로 식별성 확보 */
}
#inspector-resize:hover { background: var(--accent-muted); }
```

#### ③ 캔버스 영역 (하단 바 · 오버레이 힌트)

- **현재 문제**: 하단 바 버튼이 `padding:3px 10px`로 실높이 약 22px — 데스크톱 최소 클릭 목표(24px)에 미달하고 모바일에선 더 심각. 좌표 에디터(`#0550ae`)·자르기 안내(`rgba(9,105,218,.95)`)가 과목 테마를 무시하고 항상 파랑.
- **제안**:

```css
.grid-toggle-btn, .object-search-trigger, #center-view-btn {
  min-height: var(--control-h-s);            /* 24px */
}
@media (max-width: 767px) {
  .canvas-bottom-bar > button { min-height: 40px; } /* 모바일 우선: 터치 목표 확대 */
}
.guide-coordinate-editor { background: var(--accent-emphasis); }
.cutout-instruction {
  background: color-mix(in srgb, var(--accent-emphasis) 95%, transparent);
}
```

#### ④ 모달·다이얼로그

- **현재 문제**: (버그급) 글꼴 설정 모달·수식 에디터가 다크색 하드코딩이라 **라이트 테마에서 검은 입력창이 그대로 남음**. `.modal-overlay` 중복 정의로 z-index 의도 불명. 곡률 8/10px, 그림자 알파 5종, backdrop 2종 혼용. `.fm-btn:hover`만 유일하게 `filter:brightness(1.1)` 방식(1391행)이라 상태 변화 문법이 이질적.
- **제안**:

```css
.modal, .font-modal, .modal-card { border-radius: var(--radius-l);
  box-shadow: var(--shadow-pop); }
.modal-overlay, .font-modal-overlay { background: var(--overlay); }
.fm-list, .fm-size-input, .formula-input {
  background: var(--bg-input); color: var(--text-primary);
  border-color: var(--border);               /* #1e1f22 고정 제거 */
}
.fm-btn:hover { background: var(--btn-tool-hover); filter: none; }
.fm-ok { background: var(--accent-emphasis); border-color: var(--accent-emphasis);
  color: var(--on-accent); }
```

그리고 535행과 1471행의 `.modal-overlay` 중복 중 하나를 삭제하고 `z-index: var(--z-modal)`로 통일.

#### ⑤ 기출 라이브러리 패널 (exam-library.css)

- **현재 문제**: 카드 hover가 테두리색 1px 변화뿐이라 4열 그리드에서 어느 카드 위에 있는지 흐릿함. 카드가 클릭 대상인데 포커스 표시가 없어 키보드로 선택 불가 시각화 안 됨. 메타 텍스트 11px·배지 10px로 하한 미달. 4열 고정이라 좁은 화면에서 썸네일이 뭉개짐(모바일 우선 원칙 위배).
- **제안**:

```css
.examlib-grid {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); /* 4열 고정 해제 */
}
.examlib-card:hover { border-color: var(--accent);
  background: var(--bg-panel-hover); }
.examlib-card:focus-visible { outline: 2px solid var(--focus-ring);
  outline-offset: 1px; }
.examlib-card.is-selected { border-color: var(--accent-emphasis);
  box-shadow: 0 0 0 2px var(--accent-emphasis) inset; }
.examlib-tags { font-size: var(--fs-caption); }  /* 11px 보장 */
```

카드가 `<div>`라면 `tabindex="0"`+키 핸들러가 필요하므로 이 항목만 JS 1곳 수정이 따라온다(로드맵 3단계로 이월).

---

### 5. 적용 로드맵 3단계

**1단계 — CSS만, 1~2시간, 시각 변화 거의 없음 (버그 픽스 + 토큰 심기)**
1. `:root`에 신설 토큰 블록 추가(§2-1, §3 — 선언만 하고 아직 참조 안 해도 무해).
2. 빨강 4종 → `--danger` 치환 (5곳).
3. 글꼴 모달·수식 에디터의 하드코딩 다크색 → 테마 변수 치환 (**라이트 테마 실버그 해소**).
4. `.modal-overlay` 중복 정의 정리 + `--overlay`·`--shadow-pop` 적용.
5. 전역 `:focus-visible` / `:disabled` / `:active` 계약 3규칙 추가(§4 공통 기반).
검증: 라이트/다크 × 과목 4종 = 8조합 스크린샷 비교.

**2단계 — 반나절, 값이 실제로 바뀌는 정렬**
1. `--accent-emphasis` 도입 + 과목별 값 배정(§2-2) — 활성 버튼 채움색이 다크에서 한 단계 어두워짐.
2. 곡률·간격·타이포 스케일 스냅(9·10px → 11px, `--insp-radius` 4px, 모달 10px 등).
3. z-index 5단 토큰화, 인스펙터 `--insp-*` 별칭 재연결.
4. 기출 라이브러리 그리드 auto-fill 전환 + 하단 바 최소 높이.

**3단계 — 지속 체계화 (JS 소폭 동반)**
1. 기출 카드 키보드 접근(tabindex + Enter/Space 핸들러).
2. `css/tokens.css`로 토큰 분리(파일 분리 구조 원칙 부합) 후 style.css 상단에서 import 순서 고정.
3. 대비 검사 습관화: 토큰 표(§2)의 대비값을 주석으로 병기해 두고, 과목색 추가 시 4.5:1 채움 검증을 체크리스트화.
4. `STYLEGUIDE.md`에 "새 컴포넌트는 토큰만 참조, 원시 hex 금지" 1페이지 규약 명문화.

---

### 6. 이 방향의 trade-off (잃는 것)

- **간접 참조 깊이 증가**: `--insp-accent → --accent → 과목 override` 3단 추적이 필요해져, DevTools 없이 CSS만 읽어서 최종색을 아는 것이 어려워진다. 학습 중인 사용자에게는 디버깅 진입장벽이 될 수 있다(완화: 토큰 표를 주석으로 파일 상단에 유지).
- **"타깃 수정" 원칙과의 긴장**: 치환 대상이 40여 곳이라 diff가 넓게 퍼진다. CLAUDE.md 절대 규칙 4(광범위 리팩토링 금지)를 형식적으로 건드리는 셈인데, **값을 동결하고 이름만 연결하는 1단계 방식**으로 동작 리스크를 최소화하고, 단계별 커밋으로 되돌림 지점을 잘게 쪼개는 것으로 의도적으로 감수한다.
- **익숙한 색의 미세 변화**: 다크 테마 활성 버튼이 `#2f81f7 → #1f6feb`로, 지구과학은 `#a5794a → #8e6339`로 어두워진다. 기존 사용자의 눈에는 "살짝 칙칙해짐"으로 느껴질 수 있다 — 접근성 대비와 맞바꾸는 값이다.
- **새 기능 0**: 이 작업 전체가 사용자 눈에 보이는 신기능이 하나도 없다. 같은 시간을 기능 백로그에 쓸 수 없다는 기회비용이 있으며, 효과는 "이후 모든 UI 작업이 빨라지고 안 깨진다"로 지연 회수된다.
- **최신 CSS 의존**: `color-mix()`는 2023년 이후 브라우저 전제다(이미 inspector.css 370행에서 사용 중이므로 신규 리스크는 아니나, 학교 구형 PC의 브라우저 하한을 명시적으로 못 박게 된다).
