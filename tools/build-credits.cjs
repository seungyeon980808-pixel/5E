const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'preview/assets/parts-library/manifest.json');
const OUTPUTS = [path.join(ROOT, 'preview/docs/credits.html'), path.join(ROOT, 'docs/credits.html')];
const FREE = new Set(['public domain', 'cc0', 'copyrighted free use']);
const ORDER = ['Public domain', 'CC0', 'CC BY 4.0', 'CC BY 3.0', 'CC BY 2.5', 'CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC BY-SA 2.5', 'GFDL'];

const PAGE = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>이미지 출처 — 5E</title>
<style>
  :root{ --bg:#f6f8fa; --surface:#fff; --ink:#0d1117; --muted:#57606a;
          --line:#d0d7de; --accent:#0969da; --ok:#1a7f37; }
  @media (prefers-color-scheme:dark){
    :root{ --bg:#0d1117; --surface:#161b22; --ink:#e6edf3; --muted:#8b949e;
            --line:#30363d; --accent:#58a6ff; --ok:#3fb950; }
  }
  *{box-sizing:border-box}
  body{ margin:0; background:var(--bg); color:var(--ink); line-height:1.75;
    font-family:"IBM Plex Sans KR","Pretendard","Malgun Gothic","Segoe UI",system-ui,sans-serif;
    font-size:15px; padding:36px 20px 90px; }
  .w{ max-width:940px; margin:0 auto; }
  h1{ font-size:25px; margin:0 0 6px; letter-spacing:-.02em; }
  .lede{ color:var(--muted); font-size:14px; margin:0 0 8px; max-width:66ch; }
  .law{ border:1px solid var(--line); border-left:3px solid var(--ok);
    border-radius:9px; background:var(--surface); padding:15px 19px; margin:22px 0 30px; }
  .law h2{ font-size:15px; margin:0 0 8px; }
  .law p{ margin:0 0 9px; font-size:14px; color:var(--ink); }
  .law p:last-child{ margin-bottom:0; }
  .law blockquote{ overflow-wrap:anywhere; margin:9px 0; padding:9px 14px; border-left:2px solid var(--line);
    color:var(--muted); font-size:13.5px; }
  .law b{ font-weight:600; }
  section{ border:1px solid var(--line); border-radius:10px; overflow:hidden;
    margin-bottom:16px; background:var(--surface); }
  section.free{ opacity:.86; }
  h2{ font-size:14px; margin:0; padding:11px 16px; border-bottom:1px solid var(--line); }
  h2 small{ color:var(--muted); font-weight:400; margin-left:9px; }
  ul{ margin:0; padding:12px 16px 14px 34px; columns:2; column-gap:28px; font-size:13px; }
  li{ margin-bottom:3px; break-inside:avoid; overflow-wrap:anywhere; }
  a{ color:var(--accent); text-decoration:none; }
  a:hover, a:focus-visible{ text-decoration:underline; }
  footer{ margin-top:30px; color:var(--muted); font-size:12.5px; }
  ul.fonts{ columns:1; }
  @media (max-width:640px){ ul{ columns:1; } }
</style></head><body><div class="w">

<h1>이미지 출처</h1>
<p class="lede">5E 이미지 라이브러리에 담긴 그림 {count}장의 원작자와 이용 조건입니다.
이름을 누르면 원본 페이지로 갑니다.</p>

<div class="law">
  <h2>시험 문항을 만드는 데 쓰는 것은 문제가 없습니다</h2>
  <p>한국 저작권법은 시험 문제를 위한 이용을 따로 허용하고 있습니다.</p>
  <blockquote><b>제32조(시험문제를 위한 복제 등)</b> 학교의 입학시험이나 그 밖에 학식 및
  기능에 관한 시험 또는 검정을 위하여 필요한 경우에는 그 목적을 위하여 정당한 범위에서
  공표된 저작물을 복제·배포 또는 공중송신할 수 있다. 다만, 영리를 목적으로 하는 경우에는
  그러하지 아니하다.</blockquote>
  <p>그리고 <b>제37조(출처의 명시)</b>는 출처를 밝히도록 하면서 <b>제32조의 경우를 예외로
  두고 있습니다.</b> 즉 <b>비영리로 만든 시험지에는 출처를 적지 않아도 됩니다.</b></p>
  <p>이 페이지는 다른 이유로 둡니다 — 5E 앱이 그림을 <b>함께 배포</b>하기 때문입니다.
  그건 시험 문제 이용이 아니라 재배포이고, CC BY·BY-SA 는 재배포할 때 원작자 표시를
  조건으로 답니다. 그 조건을 이 페이지 하나로 충족시킵니다.</p>
</div>

{body}

<div class="law" id="software">
  <h2>함께 들어간 소프트웨어</h2>
  <p>5E 설치판과 웹판에 함께 들어가는 남의 소프트웨어·글꼴입니다. 각 이용 조건 전문은 앱 안 같은 폴더의 LICENSE 파일에 있습니다.</p>
  <p><b>KaTeX 0.16.11</b> — 그래프를 그림으로 만들 때 수식 글자를 조판합니다. MIT License,
  Copyright (c) 2013-2020 Khan Academy and other contributors.
  <a href="https://github.com/KaTeX/KaTeX" target="_blank" rel="noopener noreferrer">github.com/KaTeX/KaTeX</a>
  · 전문은 앱 안 <code>vendor/katex/LICENSE</code>.</p>
  <p><b>Electron 44.11.5</b> — 설치판 실행 틀. MIT License, Copyright (c) Electron contributors · Chromium·Node.js 등 딸린 오픈소스 고지는 설치판 안 <code>LICENSES.chromium.html</code>.
  <a href="https://github.com/electron/electron" target="_blank" rel="noopener noreferrer">github.com/electron/electron</a></p>
  <p><b>rhwp 0.8.7 (rhwp-studio·rhwp-editor)</b> — 한글 문서 조판·편집 엔진. MIT License, Copyright (c) 2025-2026 Edward Kim.
  <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noopener noreferrer">github.com/edwardkim/rhwp</a>
  · <code>vendor/rhwp-studio/LICENSE</code>, 함께 든 글꼴은 아래 「함께 들어간 글꼴」.</p>
  <p><b>PDF.js 6.3.289</b> — PDF 읽기·그리기. Apache License 2.0, Copyright Mozilla Foundation · 딸린 OpenJPEG(BSD-2), JBIG2(PDFium, BSD-3), qcms(MIT), Adobe CMap(BSD-3), Foxit·Liberation 글꼴.
  <a href="https://github.com/mozilla/pdf.js" target="_blank" rel="noopener noreferrer">github.com/mozilla/pdf.js</a>
  · <code>vendor/pdfjs/LICENSE</code>와 하위 폴더 LICENSE_* 파일.</p>
  <p><b>MathLive 0.111.0</b> — 수식 입력. MIT License, Copyright (c) 2017-present Arno Gourdol.
  <a href="https://github.com/arnog/mathlive" target="_blank" rel="noopener noreferrer">github.com/arnog/mathlive</a>
  · <code>vendor/mathlive/LICENSE.txt</code>.</p>
  <p><b>Tesseract.js 7.0.0 · tesseract.js-core 7.0.0</b> — 글자 읽기(OCR). Apache License 2.0 · 영어·한국어 학습 자료(@tesseract.js-data, MIT).
  <a href="https://github.com/naptha/tesseract.js" target="_blank" rel="noopener noreferrer">github.com/naptha/tesseract.js</a>
  · <code>vendor/ocr/LICENSE-tesseract.md</code>, <code>vendor/ocr/LICENSE-tesseract-core</code>.</p>
  <p><b>OpenCV.js 4.13.0</b> — 그림 변환(내 컴퓨터 안에서만). Apache License 2.0, Copyright OpenCV team.
  <a href="https://github.com/opencv/opencv" target="_blank" rel="noopener noreferrer">github.com/opencv/opencv</a>
  · <code>vendor/opencv/LICENSE</code>.</p>
  <p><b>fflate 0.8.2</b> — ZIP 풀기(HWPX·XLSX). MIT License, Copyright (c) 2020 Arjun Barrett.
  <a href="https://github.com/101arrowz/fflate" target="_blank" rel="noopener noreferrer">github.com/101arrowz/fflate</a>
  · <code>vendor/fflate/LICENSE</code>.</p>
  <p><b>SheetJS Community Edition 0.20.3</b> — 엑셀·한글(CFB) 파일 읽고 쓰기. Apache License 2.0, Copyright (C) 2013-present SheetJS LLC.
  <a href="https://git.sheetjs.com/sheetjs/sheetjs" target="_blank" rel="noopener noreferrer">git.sheetjs.com/sheetjs/sheetjs</a>
  · <code>assets/exampool/sheet/vendor/LICENSE-sheetjs.txt</code>.</p>
  <p><b>JSZip 3.10.1</b> — ZIP 만들기. MIT License(또는 GPLv3 중 고름, 5E는 MIT), Copyright (c) 2009-2016 Stuart Knightley · 딸린 pako(MIT).
  <a href="https://github.com/Stuk/jszip" target="_blank" rel="noopener noreferrer">github.com/Stuk/jszip</a>
  · <code>assets/exampool/sheet/vendor/LICENSE-jszip.txt</code>.</p>
  <p><b>Pretendard</b> — 화면 글꼴. SIL Open Font License 1.1, Copyright (c) 2021 Kil Hyung-jin.
  <a href="https://github.com/orioncactus/pretendard" target="_blank" rel="noopener noreferrer">github.com/orioncactus/pretendard</a>
  · <code>fonts/pretendard/LICENSE</code>.</p>
  <p><b>Latin Modern Roman (LM Roman 10 2.004)</b> — 수식 글꼴. GUST Font License, Copyright 2003, 2009 B. Jackowski and J. M. Nowacki (on behalf of TeX users groups).
  <a href="https://www.gust.org.pl/projects/e-foundry/latin-modern" target="_blank" rel="noopener noreferrer">gust.org.pl/projects/e-foundry/latin-modern</a>
  · <code>fonts/LICENSE-LatinModern-GUST.txt</code>(GUST Font License 전문), <code>fonts/LICENSE-LPPL-1.3c.txt</code>.</p>
  <h2>함께 들어간 글꼴</h2>
  <p>한글 문서 편집기(rhwp-studio)가 문서를 그릴 때 쓰는 글꼴 29개입니다. 받은 그대로 싣고 따로 팔지 않습니다.
  파일별 목록(파일 이름·글꼴 안 저작권 문구·이용 조건)은 <code>vendor/rhwp-studio/FONT-NOTICES.md</code>,
  이용 조건 전문은 <code>vendor/rhwp-studio/font-licenses/</code>(SIL OFL 1.1 전문은 <code>SIL-OFL-1.1.txt</code>)에 있습니다.</p>
  <ul class=fonts>
    <li><b>카페24 써라운드 (Cafe24 Ssurround Bold 1.001)</b> — Copyright © Cafe24 Corp.. SIL OFL 1.1 — 카페24 공식 안내서 · <code>vendor/rhwp-studio/font-licenses/Cafe24Ssurround-LICENSE.pdf</code> · <a href="https://fonts.cafe24.com" target="_blank" rel="noopener noreferrer">fonts.cafe24.com</a></li>
    <li><b>카페24 슈퍼매직 (Cafe24 Supermagic 1.000)</b> — Copyright © Cafe24 Corp.. SIL OFL 1.1 — 카페24 공식 안내서 · <code>vendor/rhwp-studio/font-licenses/Cafe24Supermagic-LICENSE.pdf</code> · <a href="https://fonts.cafe24.com" target="_blank" rel="noopener noreferrer">fonts.cafe24.com</a></li>
    <li><b>D2Coding 1.3.2</b> — Copyright (c) 2015-2016 NHN Corporation · FONTRIX. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/D2Coding-OFL.txt</code> · <a href="https://github.com/naver/d2codingfont" target="_blank" rel="noopener noreferrer">github.com/naver/d2codingfont</a></li>
    <li><b>고운바탕 (Gowun Batang 2.000)</b> — Copyright 2021 The Gowun Batang Project Authors. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/GowunBatang-OFL.txt</code> · <a href="https://github.com/yangheeryu/Gowun-Batang" target="_blank" rel="noopener noreferrer">github.com/yangheeryu/Gowun-Batang</a></li>
    <li><b>고운돋움 (Gowun Dodum 2.000)</b> — Copyright 2021 The Gowun Dodum Project Authors. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/GowunDodum-OFL.txt</code> · <a href="https://github.com/yangheeryu/Gowun-Dodum" target="_blank" rel="noopener noreferrer">github.com/yangheeryu/Gowun-Dodum</a></li>
    <li><b>해피니스 산스 Regular·Bold·Title·VF (1.000)</b> — Copyright © 2022 THE HYUNDAI · AG Typography Institute. SIL OFL 1.1 — 현대백화점 공식 안내서 · <code>vendor/rhwp-studio/font-licenses/HappinessSans-LICENSE.pdf</code> · <a href="https://thehyundaifont.com" target="_blank" rel="noopener noreferrer">thehyundaifont.com</a></li>
    <li><b>Latin Modern Math 1.959</b> — Copyright 2012–2014 B. Jackowski, P. Strzelczyk, P. Pianowski (TeX users groups). GUST Font License (LPPL 1.3c) · <code>vendor/rhwp-studio/font-licenses/LatinModernMath-GUST-FONT-LICENSE.txt</code> · <a href="https://www.gust.org.pl/projects/e-foundry/lm-math" target="_blank" rel="noopener noreferrer">www.gust.org.pl/projects/e-foundry/lm-math</a></li>
    <li><b>나눔고딕 3.020 · 나눔고딕코딩 2.000 · 나눔명조 2.032</b> — Copyright © 2009–2011 NHN Corporation · Sandoll · FONTRIX. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/NanumGothic-OFL.txt</code> · <a href="https://hangeul.naver.com/font" target="_blank" rel="noopener noreferrer">hangeul.naver.com/font</a></li>
    <li><b>Noto Sans KR 2.004 (Regular·Bold·ExtraLight)</b> — (c) 2014-2021 Adobe. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/NotoSansKR-OFL.txt</code> · <a href="https://fonts.google.com/noto" target="_blank" rel="noopener noreferrer">fonts.google.com/noto</a></li>
    <li><b>Noto Serif KR 2.003 (Regular·Bold)</b> — (c) 2017-2024 Adobe. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/NotoCJKSerif-OFL.txt</code> · <a href="https://fonts.google.com/noto" target="_blank" rel="noopener noreferrer">fonts.google.com/noto</a></li>
    <li><b>Pretendard 1.309 (9개 굵기)</b> — Copyright © 2023 Kil Hyung-jin. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/Pretendard-OFL.txt</code> · <a href="https://github.com/orioncactus/pretendard" target="_blank" rel="noopener noreferrer">github.com/orioncactus/pretendard</a></li>
    <li><b>RHWP Old Hangul</b> (Source Han Serif K 2.003 옛한글 부분 글꼴, rhwp가 이름 바꾼 판) — © 2017-2024 Adobe. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/SourceHanSerifK-OFL.txt</code> · <a href="https://github.com/edwardkim/rhwp" target="_blank" rel="noopener noreferrer">github.com/edwardkim/rhwp</a> · 원본 <a href="https://github.com/adobe-fonts/source-han-serif" target="_blank" rel="noopener noreferrer">github.com/adobe-fonts/source-han-serif</a></li>
    <li><b>스포카 한 산스 (SpoqaHanSans 1.004)</b> — Copyright 2015 Spoqa. SIL OFL 1.1 · <code>vendor/rhwp-studio/font-licenses/SpoqaHanSans-OFL.txt</code> · <a href="https://github.com/spoqa/spoqa-han-sans" target="_blank" rel="noopener noreferrer">github.com/spoqa/spoqa-han-sans</a></li>
  </ul>
  <p>그 밖에 KaTeX·MathLive 수식 글꼴(MIT, Copyright (c) 2013-2020 Khan Academy and other contributors · <code>vendor/katex/LICENSE</code>),
  PDF.js 표준 글꼴 Liberation Sans 1.07.4(Copyright (c) 2007 Red Hat, Inc. · Liberation Fonts License, GPLv2 + 글꼴 예외 · <code>vendor/pdfjs/standard_fonts/LICENSE_LIBERATION</code>)와
  Foxit 글꼴(Copyright 2014 PDFium Authors, BSD · <code>LICENSE_FOXIT</code>)이 들어 있습니다.</p>
</div>

<footer>생성 {date} · <a href="../index.html">5E로 돌아가기</a></footer>
</div></body></html>`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderGroup(license, items) {
  const free = FREE.has(license.toLowerCase());
  const note = free ? '표기 의무 없음' : '원작자 표시 필요';
  const rows = [...items]
    .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
    .map((item) => `<li data-asset-id="${escapeHtml(item.id)}" data-license="${escapeHtml(item.license)}"><a href="${escapeHtml(item.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.name || item.file)}</a></li>`)
    .join('');
  return `<section${free ? ' class=free' : ''}><h2>${escapeHtml(license)}<small>${items.length}장 · ${note}</small></h2><ul>${rows}</ul></section>`;
}

function main() {
  const items = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).items;
  const groups = new Map();
  for (const item of items) {
    const license = item.license || '미상';
    groups.set(license, [...(groups.get(license) ?? []), item]);
  }
  const licenses = [...ORDER.filter((license) => groups.has(license)), ...[...groups.keys()].filter((license) => !ORDER.includes(license)).sort()];
  const page = PAGE
    .replace('{count}', String(items.length))
    .replace('{date}', new Date().toISOString().slice(0, 10))
    .replace('{body}', licenses.map((license) => renderGroup(license, groups.get(license))).join(''));
  for (const output of OUTPUTS) {
    fs.writeFileSync(output, page, 'utf8');
  }
  process.stdout.write(`credits ${items.length}건 생성 → preview/docs/credits.html, docs/credits.html\n`);
}

main();
