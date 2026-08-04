# -*- coding: utf-8 -*-
"""작가별로 긁어오기 — 마음에 든 그림을 그린 사람의 다른 작품을 모은다.

카테고리로 긁으면 양식이 제각각이라 골라내는 데 오래 걸린다. 그런데 **한 사람이 그린
연작은 양식이 이미 통일돼 있다.** 마음에 든 그림의 작가를 찾아 그 사람 것만 가져오면
골라낼 일이 거의 없다.

받은 것은 라이브러리에 바로 넣지 않고 `_work/author-preview/` 에 두고 검토용 페이지를
만든다. 보고 판단한 뒤에 옮긴다.

    python tools/harvest_by_author.py            # 작가마다 10장
    python tools/harvest_by_author.py --each 40  # 더 많이
"""

import argparse
import base64
import html
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "_work" / "author-preview"
API = "https://commons.wikimedia.org/w/api.php"
UA = ("5E-parts-library/1.0 (https://github.com/seungyeon980808-pixel/5E; "
      "educational; contact via GitHub issues)")

# 교사가 "이 그림이 마음에 든다"고 고른 것들의 작가.
# match 는 Artist 필드에 실제로 이 말이 들어 있는지 확인하는 데 쓴다 —
# insource 검색은 본문 어디에 있어도 걸리므로 그대로 믿으면 남의 그림이 섞인다.
AUTHORS = [
    {"key": "dbcls",      "label": "DBCLS (일본 생명과학DB센터)",
     "search": 'insource:"DBCLS"', "match": "dbcls", "license": "CC BY 4.0"},
    {"key": "xavax",      "label": "Xavax",
     "search": 'insource:"Xavax"', "match": "xavax", "license": "Public domain"},
    {"key": "jalanpalmer", "label": "Jalanpalmer",
     "search": 'insource:"Jalanpalmer"', "match": "jalanpalmer", "license": "Public domain"},
    {"key": "orem",       "label": "Orem (Olek Remesz)",
     "search": 'insource:"Olek Remesz"', "match": "remesz", "license": "CC BY-SA 3.0"},
]

MAX_BYTES = 220 * 1024
STRIP = re.compile(r"<[^>]+>")
API_DELAY = 1.2
FILE_DELAY = 0.8


def api(**p):
    p.setdefault("format", "json")
    p.setdefault("formatversion", "2")
    url = API + "?" + urllib.parse.urlencode(p)
    for attempt in range(5):
        try:
            r = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(r, timeout=45) as res:
                return json.load(res)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(5 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(4)
    raise RuntimeError("재시도 실패")


def plain(v):
    return re.sub(r"\s+", " ", STRIP.sub(" ", v or "")).strip()


def collect(a, want):
    """그 작가의 SVG 를 want 장 모은다. Artist 필드로 한 번 더 거른다."""
    got, cont, seen = [], {}, set()
    while len(got) < want:
        p = dict(action="query", generator="search", gsrnamespace=6, gsrlimit=50,
                 gsrsearch=f'filemime:image/svg+xml {a["search"]}',
                 prop="imageinfo", iiprop="url|size|extmetadata",
                 iiextmetadatafilter="Artist|LicenseShortName|ImageDescription")
        p.update(cont)
        d = api(**p)
        pages = d.get("query", {}).get("pages", [])
        if not pages:
            break
        for pg in pages:
            if len(got) >= want:
                break
            title = pg.get("title", "").replace("File:", "")
            if title in seen:
                continue
            seen.add(title)
            ii = (pg.get("imageinfo") or [{}])[0]
            ext = ii.get("extmetadata", {}) if isinstance(ii, dict) else {}
            artist = plain(ext.get("Artist", {}).get("value", ""))
            if a["match"] not in artist.lower():
                continue                        # 본문에만 이름이 스친 남의 그림
            size = ii.get("size") or 0
            if not ii.get("url") or not (400 <= size <= MAX_BYTES):
                continue
            got.append({
                "title": title,
                "url": ii["url"],
                "artist": artist,
                "license": plain(ext.get("LicenseShortName", {}).get("value", "")) or a["license"],
                "desc": plain(ext.get("ImageDescription", {}).get("value", ""))[:120],
                "source": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(title),
                "bytes": size,
            })
        if "continue" not in d:
            break
        cont = d["continue"]
        time.sleep(API_DELAY)
    return got


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--each", type=int, default=10, help="작가마다 몇 장")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    result = []
    for a in AUTHORS:
        print(f"── {a['label']}")
        items = collect(a, args.each)
        print(f"   후보 {len(items)}장")
        saved = []
        for it in items:
            fn = f"{a['key']}_{re.sub(r'[^a-z0-9]+', '_', it['title'].rsplit('.',1)[0].lower())[:52]}.svg"
            try:
                r = urllib.request.Request(it["url"], headers={"User-Agent": UA})
                body = urllib.request.urlopen(r, timeout=45).read()
                if b"<svg" not in body[:4000]:
                    continue
                (OUT / fn).write_bytes(body)
                it["file"] = fn
                it["author"] = a["label"]
                saved.append(it)
            except Exception as e:
                print(f"   실패 {it['title'][:34]} — {str(e)[:34]}")
            time.sleep(FILE_DELAY)
        print(f"   받음 {len(saved)}장")
        result.extend(saved)
        time.sleep(API_DELAY)

    (OUT / "authors.json").write_text(json.dumps(result, ensure_ascii=False, indent=1),
                                      encoding="utf-8")
    build_page(result)
    print(f"\n합계 {len(result)}장 → _work/author-preview/")
    print("검토 페이지: _work/author-preview/index.html")
    return 0


def build_page(items):
    by = {}
    for it in items:
        by.setdefault(it["author"], []).append(it)
    def inline(i):
        """그림을 페이지에 박아 넣는다. 파일로 걸어 두면 단일 스레드 서버가
           동시 요청 수십 개를 못 받아내고 전부 깨진다(실측)."""
        try:
            b = (OUT / i["file"]).read_bytes()
            return "data:image/svg+xml;base64," + base64.b64encode(b).decode()
        except Exception:
            return ""

    secs = []
    for author, group in by.items():
        lics = sorted({i["license"] for i in group})
        cards = "".join(
            f'<figure><img src="{inline(i)}" alt="{html.escape(i["title"])}" />'
            f'<figcaption><b>{html.escape(i["title"].rsplit(".",1)[0])}</b>'
            f'<span class="lic">{html.escape(i["license"])}</span>'
            f'<a href="{html.escape(i["source"])}" target="_blank" rel="noopener">원본</a></figcaption></figure>'
            for i in group)
        secs.append(f'<section><h2>{html.escape(author)}'
                    f'<small>{len(group)}장 · {html.escape(" / ".join(lics))}</small></h2>'
                    f'<div class="grid">{cards}</div></section>')
    (OUT / "index.html").write_text(f"""<!doctype html><meta charset="utf-8">
<title>작가별 표본 — 검토용</title>
<style>
body{{margin:0;background:#0d1117;color:#e6edf3;padding:32px 20px 70px;
 font-family:"Malgun Gothic","Segoe UI",sans-serif;line-height:1.65}}
.w{{max-width:1080px;margin:0 auto}}
h1{{font-size:23px;margin:0 0 6px}}
.lede{{color:#8b949e;font-size:14px;margin:0 0 26px;max-width:64ch}}
section{{margin-bottom:30px}}
h2{{font-size:15px;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #30363d}}
h2 small{{color:#8b949e;font-weight:400;margin-left:9px;font-size:12.5px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}}
figure{{margin:0;background:#161b22;border:1px solid #30363d;border-radius:9px;overflow:hidden}}
figure img{{width:100%;height:150px;object-fit:contain;background:#fff;padding:8px;display:block}}
figcaption{{padding:8px 10px;font-size:12px;display:flex;flex-direction:column;gap:2px}}
figcaption b{{font-weight:600;word-break:break-word}}
.lic{{color:#8b949e;font-size:11px}}
a{{color:#58a6ff;text-decoration:none;font-size:11.5px}} a:hover{{text-decoration:underline}}
</style>
<div class="w"><h1>작가별 표본</h1>
<p class="lede">마음에 들어 하신 그림을 그린 작가 넷의 다른 작품입니다.
작가마다 {len(items)//max(len(by),1)}장 안팎으로 받아 왔습니다.
이 작가를 통째로 가져올지 판단해 주세요.</p>
{''.join(secs)}</div>""", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
