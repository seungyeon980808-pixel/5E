KaTeX 0.16.11 (MIT) — https://github.com/KaTeX/KaTeX · 11-19 그림으로 만드는 그래프 엔진(js/ai-graph/draw.js)의 수식 글자용으로 넣음.
받은 곳: npm katex@0.16.11 dist(katex.min.js·katex.min.css·fonts/*.woff2만, woff·ttf 뺌). 파일은 고치지 않음.
그래프 엔진은 이 CSS를 직접 쓰지 않고 data/ai-graph/build-stage-css.cjs로 만든 assets/ai-graph/graph-stage.css를 씀
(글꼴 이름 KaTeX_* → FEGKaTeX_*로 바꿔 MathLive와 섞이지 않게, 보통·기울임은 5E fonts/의 Latin Modern).
