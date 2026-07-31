# 인수인계 — 이미지 상자를 그림에 맞추고, 여백 없이 내보내기 (2026-08-01)

> 새 세션에 **아래 §6 프롬프트를 통째로 붙여넣으면** 시작된다.
> 이 문서 자체도 그 세션이 먼저 읽어야 할 배경이다.

---

## 1. 지금까지 만들어 둔 것 (건드리지 말 것 — 이미 동작한다)

| 것 | 파일 | 상태 |
|---|---|---|
| 부품 라이브러리 창 | `js/parts-library.js` · `css/parts-library.css` | 동작 |
| 자료 | `assets/parts-library/` (manifest·meta·svg 10건) | 동작 |
| 선화 변환(위계 4단계) | `js/lineart.js` | 동작 |
| 선 객체로 넣기 | `js/svg-to-objects.js` | 동작 |
| **가위가 이미지도 자름** | `js/cut-geometry.js`(`isBoxCuttable`·`cutBoxObject`) · `js/cut-tool.js` | 동작 |
| **지우개(올가미)** | `js/erase-tool.js` (Shift+E) | 동작 |
| 투명 구멍 렌더 | `js/render/shapes.js` — `cutouts` 의 `poly` 종류 + `<mask>` | 동작 |
| 구멍은 클릭에서 빠짐 | `js/pick.js` `isInsideCutoutPoly()` | 동작 |

규격은 `docs/PARTS_LIBRARY_SPEC.md` 에 있다.

---

## 2. 남은 문제 두 가지 (이번 작업 범위)

### ① 자르거나 지운 조각이 상자를 그대로 물려받는다

가위로 나눈 두 조각은 **원본과 똑같은 x/y/w/h** 를 갖고, 서로 반대쪽을 마스크로 지운다.
그래서 상자가 그림보다 훨씬 크다.

**실측(2026-08-01)**: 45×60mm 자산을 세로로 한 번 자르니
- 큰 조각: 보이는 폭 34mm / 상자 45mm → **24% 낭비**
- 작은 조각: 보이는 폭 11mm / 상자 45mm → **76% 낭비**

이건 미관 문제가 아니다. 네 가지가 함께 망가진다:
- 빈 곳을 눌러도 그 이미지가 선택된다(뒤엣것을 못 고른다)
- 마퀴(드래그) 선택이 멀리 있는 것까지 담는다
- 정렬·스냅이 빈 상자 기준으로 어긋난다
- 내보내기 여백이 커진다

### ② 내보내기가 아트보드 기준이라 여백이 그대로 나간다

`js/svg-export.js:1` 주석 그대로 **"artboard region only"** 다. `exportRegion(s, bounds)` 가
`bounds` 를 주면 그 사각형, 아니면 아트보드 전체를 쓴다. 지금 UI 에서 여백을 없애려면
**[영역 지정]으로 손수 잡는 수밖에 없고, 사용자가 "자르기 너무 불편하다"고 한 지점이 이것이다.**

두 문제는 이어져 있다 — **①을 고쳐야 ②의 "내용에 맞춤"이 제대로 나온다.** 상자가 헐거우면
자동으로 맞춰도 빈 공간이 딸려 나간다.

---

## 3. 이미 내려진 설계 결정 (다시 논의하지 말 것)

1. **상자는 좁히되 크기 조절은 유지한다.**
   사용자가 "크기 조정은 하겠다"고 확인했다. "어차피 변형 안 하니 상자만 줄이자"는 폐기.
2. **방법: 중첩 `<svg viewBox>`.**
   객체가 "원본의 어느 부분을 보여줄지"(`srcRect`)를 들고, 상자는 실제 보이는 범위로 좁힌다.
   `<svg x y width height viewBox="sx sy sw sh" preserveAspectRatio="none">` 안에 `<image>` 를
   원래 좌표로 두면 "이 부분만 이 상자에" 가 SVG 문법 자체로 해결된다.
   → **클릭·이동·회전·크기조절은 상자를 그대로 쓰므로 손댈 필요가 없다.** 이게 이 방법의 요점이다.
3. **적용 시점**: 자를 때·지울 때 자동으로 좁히고, 그와 별개로 **[여백 정리]** 명령을 둔다.
4. **래스터 사진의 픽셀 기반 누끼는 이번 범위가 아니다.** 자른 조각은 자른 다각형으로 정확히
   알 수 있다. 임의 사진을 잉크 기준으로 조이는 건 2단계(픽셀 검사)로 미룬다.

---

## 4. 손댈 파일 (예상)

| 파일 | 무엇 |
|---|---|
| `js/render/shapes.js` | `renderImage` · `renderSvgAsset` 에 `srcRect` 중첩 `<svg>` 적용. **마스크·회전과 순서가 꼬이지 않게** 주의 |
| `js/cut-geometry.js` | `cutBoxObject` — 조각 상자를 보이는 범위로 좁히고 `srcRect` 를 채운다. **마스크 분수 좌표를 새 상자 기준으로 다시 계산** |
| `js/erase-tool.js` | 지운 뒤 좁히기(자동 또는 명령) |
| `js/svg-export.js` · `js/export-dialog.js` | 내보내기에 **"내용에 맞춤"** 추가. 보이는 객체 bbox 합집합 + 여백 값(기본 0~2mm) |
| `js/pick.js` | `getObjectBBox` 가 마스크를 반영하는지 확인(선택 사항) |
| `js/project-io.js` | 새 필드는 **없으면 전체 그림**으로 보는 하위호환. 대개 손댈 필요 없다 |

**내보내기는 `renderObject` 를 그대로 재사용한다**(`js/svg-export.js:241`). 렌더러를 고치면
내보내기도 자동으로 따라온다 — 좋은 소식이자 **회귀 위험**이니 내보내기까지 꼭 확인할 것.

---

## 5. 이 저장소의 함정 (전부 실제로 당한 것)

- **검증은 반드시 새 포트로.** 모든 모듈이 `?v=1.3.0` 로 로드돼 같은 포트에서는 옛 파일이 계속 돈다.
  `.claude/launch.json` 에 새 항목을 추가해 띄운다. **캐시 때문에 버전을 올리지는 않는다.**
- **버전을 올리지 마라.** 사용자 지시가 있을 때만 올린다.
- **브라우저 패널이 안 보이면 캔버스 폭이 0으로 측정된다.** 그러면 포인터 제스처 재현이
  조용히 실패한다(경로가 2점으로 뭉개져 도구가 아무 일도 안 한다). 필요하면 검증 중에만
  `svg.style.width/height` 를 강제로 박아 두고 끝나면 되돌린다.
- 스크린샷 도구는 이 환경에서 타임아웃된다. `javascript_tool` 로 DOM·계산값을 읽어 검증한다.
- **닫힌 도형은 관통(2교차)해야 갈라진다.** 가장자리에서 시작해 안에서 멈추면 안 잘린다 —
  버그로 오해하기 쉽다.

---

## 6. 새 세션에 붙여넣을 프롬프트

```
[한국어] 5E 앱에서 **이미지 상자를 그림에 맞추고, 여백 없이 내보내기**를 만든다.
작업 폴더는 C:\Users\user\Desktop\project\51_5E\5E_main 이다.

[먼저 읽을 것 — 순서대로]
1. docs/HANDOFF_tight_box_20260801.md (이 작업의 배경·이미 내려진 결정·함정)
2. docs/PARTS_LIBRARY_SPEC.md §6 (자르기·지우기·삽입 규약)
3. js/render/shapes.js 의 renderImage / renderSvgAsset (마스크 적용 방식)
4. js/cut-geometry.js 의 cutBoxObject (조각을 어떻게 만드는지)
5. js/svg-export.js 의 exportRegion / buildExportSvg (내보내기 범위 계산)

[문제]
① 가위로 자르거나 지우개로 지운 조각이 원본 상자를 그대로 물려받아,
   실측에서 작은 조각은 상자의 76%가 빈 공간이었다. 그 결과 빈 곳을 눌러도 선택되고,
   마퀴 선택·정렬·내보내기 여백이 전부 어긋난다.
② 내보내기가 아트보드 기준이라 불필요한 여백이 그대로 나간다. 지금은 [영역 지정]으로
   손수 잡는 수밖에 없어 불편하다.

[이미 내려진 결정 — 다시 논의하지 말 것]
· 상자는 좁히되 **크기 조절은 유지**한다(사용자 확인함).
· 방법은 **중첩 <svg viewBox>**: 객체가 "원본의 어느 부분을 보여줄지"(srcRect)를 들고,
  상자는 보이는 범위로 좁힌다. 클릭·이동·회전·크기조절은 상자를 그대로 쓰므로 안 건드린다.
· 자를 때·지울 때 자동으로 좁히고, 별도로 [여백 정리] 명령도 둔다.
· 래스터 사진의 픽셀 기반 누끼는 이번 범위가 아니다(자른 조각은 다각형으로 정확히 알 수 있다).

[할 일]
1. renderImage·renderSvgAsset 에 srcRect 를 적용한다. 마스크·회전과 순서가 꼬이지 않게 하고,
   srcRect 가 없으면 지금과 100% 동일하게 동작해야 한다(하위호환).
2. cutBoxObject 가 조각마다 상자를 보이는 범위로 좁히고 srcRect 를 채운다.
   마스크(cutouts) 분수 좌표를 새 상자 기준으로 다시 계산해야 한다 — 안 하면 구멍이 어긋난다.
3. 지우개도 지운 뒤 좁힌다.
4. 내보내기에 "내용에 맞춤"을 넣는다. 보이는 객체 bbox 합집합 + 여백 값(기본 0, 조절 가능).
   내보내기는 renderObject 를 재사용하므로 렌더러 변경이 그대로 반영된다 — 회귀를 꼭 확인하라.

[하지 말 것]
· 버전을 올리지 마라. import 는 전부 ?v=1.3.0 그대로.
· 기존 벡터 도형의 자르기 동작을 바꾸지 마라.
· 광범위한 리팩토링 금지. 위에 적힌 지점만 최소로 고친다.

[검증 — 반드시 새 포트로]
.claude/launch.json 에 새 포트를 추가해 서버를 띄우고 확인한다(같은 포트는 ?v=1.3.0 모듈이
캐시돼 옛 파일이 돈다). 확인할 것:
(1) 자른 조각의 상자가 보이는 그림에 붙는가(실측: 76% 낭비 → 10% 이하)
(2) 빈 곳을 클릭하면 이제 안 잡히는가
(3) 이동·회전·크기조절이 정상이고 구멍이 따라붙는가
(4) 저장→열기 왕복 보존, srcRect 없는 옛 파일도 그대로 열리는가
(5) "내용에 맞춤"으로 내보내면 여백이 사라지는가
(6) 기존 벡터 자르기·지우개·라이브러리 삽입이 그대로인가
(7) 콘솔 에러 0건

브라우저 패널이 안 보이면 캔버스 폭이 0으로 측정돼 포인터 제스처 재현이 조용히 실패한다.
그럴 땐 검증 중에만 svg.style.width/height 를 강제로 박고 끝나면 되돌려라.

[English] Make image boxes hug their visible content, and add margin-free export, in the 5E app
at C:\Users\user\Desktop\project\51_5E\5E_main.

Read docs/HANDOFF_tight_box_20260801.md first — it carries the background, the decisions already
made (do not re-litigate them), and the repo's traps.

Problem: pieces produced by the scissors/eraser inherit the original box, so a measured small piece
had 76% empty box. That breaks click selection, marquee selection, alignment, and export margins.
Export itself is artboard-based, so unwanted margin ships unless the user hand-picks a region.

Decided design: shrink the box but KEEP resize. Use a nested <svg viewBox> so the object carries a
srcRect ("show this part of the source in this box"); picking/move/rotate/resize keep using the box
unchanged. Apply automatically on cut and erase, plus an explicit "trim margins" command. Raster
pixel-level trimming is out of scope this round.

Work: (1) apply srcRect in renderImage/renderSvgAsset, fully backward compatible when absent;
(2) cutBoxObject tightens each piece's box, fills srcRect, and recomputes cutout fractions against
the new box; (3) eraser tightens after erasing; (4) add "fit to content" export (union of visible
object bboxes + adjustable padding). Export reuses renderObject, so renderer changes propagate —
verify export for regressions.

Do not bump the version; keep every import at ?v=1.3.0. Do not change existing vector cutting.
No broad refactoring. Verify on a NEW port (same port serves cached ?v=1.3.0 modules).

Do not ask clarifying questions. Make reasonable assumptions and proceed.
```

---

## 7. 이번 세션에서 검증해 둔 수치 (재조사 불필요)

| 잰 것 | 값 |
|---|---|
| 자른 조각 상자 낭비 | 큰 조각 24% · **작은 조각 76%** |
| 선화 viewBox 크롭 효과 | 단진자 채움률 46% → **98%** (`lineart.js` 에 이미 반영됨) |
| 자산 1000개 등록 비용 | 10ms · 램 65MB |
| 캔버스 자산 200개 다시 그리기 | 22ms (25개면 3ms) |
| 구멍이 진짜 투명한가 | 구멍 자리 클릭 시 **뒤 객체가 잡힘** — 확인됨 |
