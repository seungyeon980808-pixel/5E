# -*- coding: utf-8 -*-
"""실험 기구 선화 모으기 — 이름으로 찾는다.

카테고리로 찾으면 두 가지가 어긋난다:
  · 주제 카테고리(Laboratory equipment)에는 사진·채색화가 섞인다
  · 양식 카테고리(SVG tools 11,498장)에는 시계·연장이 섞인다

그래서 **실험 기구 이름으로 제목을 직접 검색**한다. 원하는 것이 "과학 실험에 쓰는 기구"로
분명하므로 이름이 가장 정확한 열쇠다. 여기에 양식 점수(색 10종 이하·도형 11~130)를 걸어
교사가 고른 19장과 같은 결의 것만 남긴다.

광선도·그래프 같은 **도해는 모으지 않는다.** 5E 가 optics/graph 객체로 직접 그린다.

    python tools/harvest_labware.py --target 300
"""

import argparse
import io
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from harvest_by_style import style_score, api, plain, UA   # 점수·통신은 그대로 쓴다

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "_work" / "labware"
SVG_DIR = OUT / "svg"

# 실험실에서 실제로 손에 잡는 것들. (과목, 한글이름, 검색어)
TERMS = [
    ("c", "비커",        "beaker"),
    ("c", "삼각플라스크",  "erlenmeyer"),
    ("c", "플라스크",      "flask"),
    ("c", "눈금실린더",    "graduated cylinder"),
    ("c", "메스실린더",    "measuring cylinder"),
    ("c", "뷰렛",         "burette"),
    ("c", "피펫",         "pipette"),
    ("c", "깔때기",        "funnel"),
    ("c", "시험관",        "test tube"),
    ("c", "냉각관",        "condenser"),
    ("c", "증류장치",      "distillation apparatus"),
    ("c", "레토르트",      "retort"),
    ("c", "분젠버너",      "bunsen burner"),
    ("c", "알코올램프",    "alcohol lamp"),
    ("c", "삼발이",        "tripod stand"),
    ("c", "도가니",        "crucible"),
    ("c", "막자사발",      "mortar pestle"),
    ("c", "증발접시",      "evaporating dish"),
    ("c", "시계접시",      "watch glass"),
    ("c", "시약병",        "reagent bottle"),
    ("c", "스탠드",        "laboratory stand"),
    ("c", "클램프",        "laboratory clamp"),
    ("c", "시험관대",      "test tube rack"),
    ("c", "교반기",        "stirrer"),
    ("c", "건조기",        "desiccator"),
    ("c", "분액깔때기",    "separatory funnel"),
    ("c", "스포이트",      "dropper"),
    ("c", "약숟가락",      "spatula laboratory"),
    ("p", "온도계",        "thermometer"),
    ("p", "저울",         "balance scale laboratory"),
    ("p", "버니어캘리퍼스", "vernier caliper"),
    ("p", "마이크로미터",  "micrometer screw"),
    ("p", "용수철저울",    "spring scale"),
    ("p", "초시계",        "stopwatch"),
    ("p", "기압계",        "barometer"),
    ("p", "소리굽쇠",      "tuning fork"),
    ("p", "추",           "weight mass laboratory"),
    ("p", "도르래",        "pulley"),
    ("b", "현미경",        "microscope"),
    ("b", "슬라이드글라스", "microscope slide"),
    ("b", "페트리접시",    "petri dish"),
    ("b", "핀셋",         "forceps"),
    ("b", "핀셋2",        "tweezers"),
    ("b", "메스",         "scalpel"),
    ("b", "가위",         "surgical scissors"),
    ("b", "지혈겸자",      "hemostat"),
    ("b", "견인기",        "retractor"),
    ("b", "주사기",        "syringe"),
    ("b", "원심분리기",    "centrifuge"),
    ("b", "해부도구",      "dissecting instrument"),
]

# 실물이 아닌 것 — 도해·그래프·기호는 5E 가 직접 그린다
DIAGRAM = re.compile(
    r"diagram|scheme|graph|chart|curve|ray |rays|optical path|snell|refract|"
    r"interference|spectrum|formula|reaction|cycle|pathway|icon|logo|symbol|"
    r"pictogram|map|flow", re.I)
JUNK = re.compile(
    r"coats? of arms|heraldr|wappen|\bflags?\b|emoji|twemoji|noto[ _-]|openmoji|"
    r"barnstar|userbox|clock|watch h |reloj", re.I)

MIN_BYTES, MAX_BYTES = 1200, 90 * 1024
API_DELAY = 1.1
FILE_DELAY = 0.7


def search(term, limit):
    """제목으로 찾는다. deepcat 이 아니라 이름 검색이라 훨씬 정확하다."""
    out, cont, guard = [], {}, 0
    while len(out) < limit and guard < 8:
        guard += 1
        p = dict(action="query", generator="search", gsrnamespace=6, gsrlimit=50,
                 gsrsearch=f'filemime:image/svg+xml {term}',
                 prop="imageinfo", iiprop="url|size|extmetadata",
                 iiextmetadatafilter="LicenseShortName|Artist")
        p.update(cont)
        d = api(**p)
        pages = d.get("query", {}).get("pages", [])
        if not pages:
            break
        for pg in pages:
            title = pg.get("title", "").replace("File:", "")
            ii = (pg.get("imageinfo") or [{}])[0]
            if not isinstance(ii, dict) or not ii.get("url"):
                continue
            size = ii.get("size") or 0
            if not (MIN_BYTES <= size <= MAX_BYTES):
                continue
            if DIAGRAM.search(title) or JUNK.search(title):
                continue
            ext = ii.get("extmetadata", {})
            out.append({
                "title": title, "url": ii["url"], "size": size,
                "license": plain(ext.get("LicenseShortName", {}).get("value", "")) or "unknown",
                "artist": plain(ext.get("Artist", {}).get("value", ""))[:60],
                "source": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(title),
            })
        if "continue" not in d:
            break
        cont = d["continue"]
        time.sleep(API_DELAY)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=300)
    ap.add_argument("--per-term", type=int, default=14)
    ap.add_argument("--min-score", type=int, default=85)
    args = ap.parse_args()

    SVG_DIR.mkdir(parents=True, exist_ok=True)
    kept, seen = [], set()
    for subj, ko, term in TERMS:
        if len(kept) >= args.target:
            break
        found = search(term, args.per_term * 3)
        got = 0
        for it in found:
            if got >= args.per_term or len(kept) >= args.target:
                break
            if it["title"] in seen:
                continue
            seen.add(it["title"])
            fn = re.sub(r"[^a-z0-9]+", "_", it["title"].rsplit(".", 1)[0].lower())[:58] + ".svg"
            p = SVG_DIR / fn
            try:
                if p.exists():
                    body = p.read_bytes()
                else:
                    body = None
                    for attempt in range(4):
                        try:
                            r = urllib.request.Request(it["url"], headers={"User-Agent": UA})
                            body = urllib.request.urlopen(r, timeout=40).read()
                            break
                        except urllib.error.HTTPError as e:
                            if e.code in (429, 503):
                                time.sleep(6 * (attempt + 1)); continue
                            break
                        except Exception:
                            time.sleep(3)
                    if body is None:
                        continue
                    time.sleep(FILE_DELAY)
                text = body.decode("utf-8", "replace")
                if "<svg" not in text[:4000]:
                    continue
                score, info = style_score(text, len(body))
                if score < args.min_score:
                    continue
                if not p.exists():
                    p.write_bytes(body)
                it.update(file=fn, score=score, subject=subj, part=ko, **info)
                kept.append(it)
                got += 1
            except Exception:
                continue
        print(f"  {ko:<12} {term:<26} {got:>3}장 (누적 {len(kept)})")
        time.sleep(API_DELAY)

    kept.sort(key=lambda x: (x["subject"], -x["score"]))
    (OUT / "picked.json").write_text(json.dumps(kept, ensure_ascii=False, indent=1),
                                     encoding="utf-8")
    mb = sum((SVG_DIR / k["file"]).stat().st_size for k in kept) / 1024 / 1024
    print(f"\n끝. {len(kept)}장 · {mb:.1f}MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
