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
