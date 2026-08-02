# -*- coding: utf-8 -*-
"""이미지 출처 페이지 생성기 — docs/credits.html

이미지 라이브러리의 그림은 대부분 다른 사람이 그린 것이고, 일부는 출처를 밝히는 조건으로
쓸 수 있다. 그 조건을 **페이지 하나로 한꺼번에 충족**시킨다.

## 시험지에는 필요 없다

한국 저작권법 제32조(시험문제를 위한 복제 등)는 비영리 시험 목적의 복제·배포를 허용하고,
제37조 단서가 그 경우를 **출처 명시 의무에서 뺀다.** 그래서 선생님이 만든 시험지에는
아무것도 적지 않아도 된다.

이 페이지가 필요한 이유는 다르다 — **5E 앱이 그림을 함께 배포**하기 때문이다.
GitHub Pages 로 공개돼 있으니 누구나 그림을 받아 갈 수 있고, 그건 시험문제 이용이 아니라
재배포다. CC BY·BY-SA 는 재배포할 때 원작자 표시를 조건으로 단다.

    python tools/build_credits.py
"""

import collections
import html
import io
import json
import pathlib
import sys
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
MANIFEST = ROOT / "assets" / "parts-library" / "manifest.json"
OUT = ROOT / "docs" / "credits.html"

# 표기 의무가 없는 것들 — 굳이 적지 않아도 되지만, 어디서 왔는지 남겨 두면 나중에 편하다.
FREE = {"public domain", "cc0", "copyrighted free use"}

ORDER = ["Public domain", "CC0", "CC BY 4.0", "CC BY 3.0", "CC BY 2.5",
         "CC BY-SA 4.0", "CC BY-SA 3.0", "CC BY-SA 2.5", "GFDL"]


def main():
    if not MANIFEST.exists():
        print("manifest.json 이 없다 — build_parts_manifest.py 를 먼저 돌린다")
        return 1
    items = json.loads(MANIFEST.read_text(encoding="utf-8"))["items"]

    by = collections.defaultdict(list)
    for it in items:
        by[it.get("license") or "미상"].append(it)
    keys = [k for k in ORDER if k in by] + sorted(k for k in by if k not in ORDER)

    secs = []
    for k in keys:
        group = sorted(by[k], key=lambda x: x.get("name", ""))
        free = k.lower() in FREE
        note = "표기 의무 없음" if free else "원작자 표시 필요"
        lis = "".join(
            f'<li><a href="{html.escape(i.get("source",""))}" target="_blank" '
            f'rel="noopener noreferrer">{html.escape(i.get("name") or i.get("file",""))}</a></li>'
            for i in group)
        secs.append(
            f'<section{" class=free" if free else ""}>'
            f'<h2>{html.escape(k)}<small>{len(group)}장 · {note}</small></h2>'
            f'<ul>{lis}</ul></section>')

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(PAGE.format(
        n=len(items), today=date.today().isoformat(), body="".join(secs)),
        encoding="utf-8")
    print(f"credits {len(items)}건 생성 → docs/credits.html")
    for k in keys[:6]:
        print(f"  {len(by[k]):>4}장  {k}")
    return 0


PAGE = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>이미지 출처 — 5E</title>
<style>
  :root{{ --bg:#f6f8fa; --surface:#fff; --ink:#0d1117; --muted:#57606a;
          --line:#d0d7de; --accent:#0969da; --ok:#1a7f37; }}
  @media (prefers-color-scheme:dark){{
    :root{{ --bg:#0d1117; --surface:#161b22; --ink:#e6edf3; --muted:#8b949e;
            --line:#30363d; --accent:#58a6ff; --ok:#3fb950; }}
  }}
  *{{box-sizing:border-box}}
  body{{ margin:0; background:var(--bg); color:var(--ink); line-height:1.75;
    font-family:"IBM Plex Sans KR","Pretendard","Malgun Gothic","Segoe UI",system-ui,sans-serif;
    font-size:15px; padding:36px 20px 90px; }}
  .w{{ max-width:940px; margin:0 auto; }}
  h1{{ font-size:25px; margin:0 0 6px; letter-spacing:-.02em; }}
  .lede{{ color:var(--muted); font-size:14px; margin:0 0 8px; max-width:66ch; }}

  .law{{ border:1px solid var(--line); border-left:3px solid var(--ok);
    border-radius:9px; background:var(--surface); padding:15px 19px; margin:22px 0 30px; }}
  .law h2{{ font-size:15px; margin:0 0 8px; }}
  .law p{{ margin:0 0 9px; font-size:14px; color:var(--ink); }}
  .law p:last-child{{ margin-bottom:0; }}
  .law blockquote{{ overflow-wrap:anywhere; margin:9px 0; padding:9px 14px; border-left:2px solid var(--line);
    color:var(--muted); font-size:13.5px; }}
  .law b{{ font-weight:600; }}

  section{{ border:1px solid var(--line); border-radius:10px; overflow:hidden;
    margin-bottom:16px; background:var(--surface); }}
  section.free{{ opacity:.86; }}
  h2{{ font-size:14px; margin:0; padding:11px 16px; border-bottom:1px solid var(--line); }}
  h2 small{{ color:var(--muted); font-weight:400; margin-left:9px; }}
  ul{{ margin:0; padding:12px 16px 14px 34px; columns:2; column-gap:28px; font-size:13px; }}
  li{{ margin-bottom:3px; break-inside:avoid; overflow-wrap:anywhere; }}
  a{{ color:var(--accent); text-decoration:none; }}
  a:hover, a:focus-visible{{ text-decoration:underline; }}
  footer{{ margin-top:30px; color:var(--muted); font-size:12.5px; }}
  @media (max-width:640px){{ ul{{ columns:1; }} }}
</style></head><body><div class="w">

<h1>이미지 출처</h1>
<p class="lede">5E 이미지 라이브러리에 담긴 그림 {n}장의 원작자와 이용 조건입니다.
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

<footer>생성 {today} · <a href="../index.html">5E로 돌아가기</a></footer>
</div></body></html>"""


if __name__ == "__main__":
    sys.exit(main())
