# 소개 페이지 원본 (www.5e.ai.kr/page)

`page/`는 이 폴더에서 만든 결과물입니다. 소개 페이지를 고칠 때는 여기를 고친 뒤 다시 만듭니다.

## 고치는 곳

| 고칠 것 | 파일 |
|---|---|
| 장면 제목·설명·단계·재생 순서 | `v8/scene-S*.json` (S1~S6, S8, S9) |
| 첫 화면·문구 화면·메뉴 단추 | `v8/focus.js` |
| architecture | `v8/arch.js` · `v8/arch.css` |
| history(세 갈래 선) | `v8/opts1120.js` |
| download · 웹과 설치판 사양표 · FAQ | `v8/download.js` · `v8/faq.js` |
| 메뉴 진행선 · 메뉴 한 줄 | `v8/navsync.js` |
| 모양 마무리 | `v8/polish1120.css` |
| 페이지 뼈대 · 머리 정보(썸네일) | `index-v8.html` |

그림은 `img/`(= `../page/img`)에 둡니다. 새 그림도 여기에 넣으면 됩니다.

## 만들기

```bash
python3 page-src/v8/build_page.py
```

`page/index.html`을 새로 쓰고, 페이지가 쓰는 그림만 `page/img/`에 둡니다. 시안 도구(문구 탭 · 시안 알약 · 번호표)는 빠집니다.

## 시안으로 보기(문구 탭 · 시안 알약 · 휴대폰 미리보기 포함)

```bash
python3 page-src/v8/build.py
```

`page-src/5e-landing-v8.html`이 생깁니다(저장소에는 올리지 않음). 시안 묶음에는 mockup 스킬의 `bundle.py`(`~/Projects/mockup`)가 필요합니다.
저장소 맨 위에서 `python3 -m http.server`로 띄운 뒤 `/page-src/5e-landing-v8.html`을 엽니다.

문구 코멘트 탭을 쓰려면 `python3 page-src/comment/serve.py`를 함께 띄웁니다(127.0.0.1:8967).

## 게시

`page/`는 사이트 배포 목록에 들어 있지 않습니다. 게시 방법은 따로 정합니다.
