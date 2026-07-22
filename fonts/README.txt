함초롬바탕 (HamchoromBatang) — 자체 호스팅 글꼴  [2026-07-23 반영 완료]
=====================================================

    fonts/HamchoromBatang.woff2   (374 KB) — 들어 있음

이 파일이 없던 동안 함초롬바탕은 화면에서도 내보내기에서도 명조로 폴백되고
있었다(글꼴 드롭다운에서 골라도 적용 안 됨). 아래 절차로 생성해 넣었다.

만들어진 방식
-------------
원본: C:\Windows\Fonts\HANBatang.TTF  (HCR Batang = 함초롬바탕, 27.1 MB)
한자 전체를 포함해 27 MB라 그대로는 쓸 수 없다 — 내보내기 때 SVG에 base64로
통째로 실리기 때문. 그래서 시험지 그림에 필요한 범위만 서브셋했다.

    python -m fontTools.subset "C:/Windows/Fonts/HANBatang.TTF" ^
      --unicodes=U+0020-007E,U+00A0-00FF,U+0370-03FF,U+2000-206F,U+2070-209F,^
U+20A0-20BF,U+2190-21FF,U+2200-22FF,U+2460-24FF,U+25A0-25FF,U+3000-303F,^
U+3131-318E,U+AC00-D7A3 ^
      --flavor=woff2 --output-file=fonts/HamchoromBatang.woff2

포함 범위: 한글 음절 전체 11,172자 + 호환 자모 / 라틴·숫자·문장부호 /
그리스 127자(θ λ μ Ω 등 물리량) / 화살표·수학기호·첨자·원문자·괘선.
결과 13,723 글리프, 374 KB (원본 대비 -98.6%).

용량 메모: 내보내기(SVG)는 이 파일을 base64로 싣는다 → SVG 1개당 약 +499 KB.
힌팅을 빼면(--no-hinting) 182 KB / 임베드 +243 KB로 절반이 되지만 작은 크기의
화면 렌더 품질이 떨어진다. 현재는 힌팅 유지본을 쓰고 있다.

어디에 쓰이나
-------------
- 함초롬바탕은 기본 글꼴이 아니라 글꼴 드롭다운의 **선택 항목**이다
  (기본은 시스템 고딕 스택). @font-face 등록은 css/style.css 에 있다.
- 내보내기: svg-export.js 의 ensureEmbeddedFonts() 가 EMBED_FONTS 목록대로
  이 파일을 읽어 base64 @font-face로 SVG <defs>에 심는다. 그래서 다른 PC에서
  열거나 PNG로 래스터화해도 함초롬바탕으로 나온다. 파일이 없으면 조용히
  건너뛴다(= 예전에 명조로 나가던 원인).

파일이 없을 때 동작
-------------------
css/style.css의 @font-face src는 local()을 먼저 본다:
    local("함초롬바탕") → local("HCR Batang") → 이 woff2 → serif
따라서 woff2가 없어도 한글(HWP)이 깔린 PC에서는 화면에 제대로 나온다.
다만 내보내기는 base64 임베딩 경로를 쓰므로 woff2가 반드시 있어야 한다.

⚠ local()을 빼면 안 된다. @font-face를 선언하는 순간 그 이름이 선언에 예약되어,
   src가 404여도 PC에 설치된 동명 폰트로 되돌아가지 않고 serif로 넘어간다.
   실제로 이 때문에 함초롬바탕이 설치된 PC에서도 적용이 안 되고 있었다.

라이선스
--------
함초롬바탕(함초롬체)은 상업적 사용 및 웹 임베딩이 허용된 무료 글꼴입니다.
배포본에 동봉된 라이선스 고지를 함께 보관하세요.

TTF만 가지고 있다면 woff2로 변환해서 넣으면 됩니다 (예시):
    pip install fonttools brotli
    fonttools ttLib.woff2 compress -o HamchoromBatang.woff2 HamchoromBatang.ttf


Latin Modern (수식 글꼴) — 이미 포함됨
=====================================================
이 폴더에 아래 두 파일이 함께 들어 있습니다 (수식/formula 전용 글꼴):

    lmroman10-regular.otf   (정자)
    lmroman10-italic.otf    (이탤릭 — 물리량·변수)

- 출처: Latin Modern (GUST e-foundry). LaTeX 기본 수식체 Computer Modern의
  오픈타입판. 상업적 사용·웹 임베딩 허용 (GUST Font License).
- 등록: css/style.css 의 @font-face "Latin Modern Roman" (정자 + 이탤릭).
- 사용처: state.js 의 EQUATION_FONT_FAMILY = "수식" 글꼴 옵션. 이 파일이 없으면
  자동으로 뒤쪽 fallback(Times New Roman/serif)으로 그려집니다.
- 내보내기: PNG는 브라우저가 글자를 픽셀로 구워 넣으므로 어디서 열어도 동일합니다.
  (SVG는 폰트를 이름으로만 싣기에, 여는 PC에 이 글꼴이 없으면 대체됩니다.)
