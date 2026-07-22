본문 글꼴 방침 — 돋움으로 확정 (2026-07-23)
=====================================================

그림에 들어가는 텍스트의 기본 글꼴은 **돋움**이며, 자가호스팅 폰트 파일을 쓰지
않는다. js/state.js 의 TEXT_FONT_FAMILY 하나로 관리하고 @font-face 없이
이름으로만 해석한다 (Windows=돋움, macOS=Apple SD Gothic Neo).

왜 돋움인가
-----------
수능/평가원 시험지는 SM(신명) 계열 유료 글꼴로 조판된다(SM중고딕·SM태고딕·
신명중명조 등). SM 계열은 라이선스상 웹 임베딩이 불가하고 개발 PC에도 없다.
실측해 보니 한양(HY)·신명(SM)·돋움은 같은 한국 인쇄 고딕 계보라 골격이 거의
같았고, 특히 돋움과 HY견고딕은 메트릭이 사실상 동일했다.

    64px "아크릴 관 저울 수평면"
      돋움        640.1 x 74
      HY견고딕     639.9 x 74
      맑은 고딕    643.5 x 85
      HY중고딕     (레지스트리엔 있으나 브라우저가 접근 못 함 → 폴백)

즉 실제로 쓸 수 있는 것 중 수능 지면에 가장 가까운 선택이 돋움이다.

함초롬바탕 — 제거됨 (2026-07-23)
-----------------------------------------------------
한때 선택 항목으로 있었으나 필요 없다는 판단으로 아래를 전부 제거했다.
    - fonts/HamchoromBatang.woff2 (374 KB)
    - css/style.css 의 @font-face
    - js/state.js 의 TEXT_FONTS 항목
    - js/svg-export.js 의 EMBED_FONTS 항목
제거 이유 중 하나는 용량이다. 내보내기는 EMBED_FONTS를 그림이 그 글꼴을 쓰는지와
무관하게 항상 base64로 심으므로, 이 폰트 하나가 SVG 1개당 +499 KB를 더했다.

  다시 넣게 된다면 반드시 지킬 것
  ------------------------------
  @font-face 의 src 는 local() 을 **맨 앞**에 둔다.

      src: local("함초롬바탕"), local("HCR Batang"),
           url("../fonts/HamchoromBatang.woff2") format("woff2");

  @font-face 를 선언하는 순간 그 이름이 선언에 예약되어, url 이 404 여도 PC 에
  설치된 동명 폰트로 되돌아가지 않고 곧장 serif 로 넘어간다. 실제로 이것 때문에
  함초롬바탕이 설치된 PC 에서도 화면과 내보내기 모두 명조로 나가고 있었고,
  에러가 전혀 없어서 오래 발견되지 않았다.


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
