# -*- coding: utf-8 -*-
"""부품 라이브러리 수집기 — Wikimedia Commons 에서 과학 도해 SVG 를 긁어온다.

`build_parts_manifest.py` 와 짝이다. 그쪽이 '재는' 도구라면 이쪽은 '모으는' 도구다.

쓰는 것: assets/parts-library/svg/<id>.svg   원본 SVG (손대지 않는다)
         assets/parts-library/harvest.json   긁어온 정보 (기계가 쓴 것)
         assets/parts-library/.harvest_state.json  진행 상태 (이어받기용)

meta.json(사람이 손으로 적는 것)은 **절대 건드리지 않는다.** 규격 §2 의 원칙 그대로다 —
손으로 적은 정보와 기계가 모은 정보를 한 파일에 섞으면 다시 돌릴 때 사람이 쓴 게 날아간다.

## 왜 느리게 도나

Commons 는 봇 트래픽을 막는다. 지연 없이 20장을 연달아 받으면 절반이 429 로 끊긴다(실측).
그래서 요청 사이에 간격을 두고, 429 가 뜨면 기다렸다 다시 건다. 3000장에 한 시간쯤 걸린다.

## 이어받기

중간에 끊겨도 그대로 다시 부르면 된다. 이미 받은 파일은 건너뛴다.

    python tools/harvest_parts.py              # 이어서 계속
    python tools/harvest_parts.py --limit 200  # 200장만
    python tools/harvest_parts.py --list-only  # 목록만 만들고 받지는 않음
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

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

HERE = pathlib.Path(__file__).resolve().parent
LIB = HERE.parent / "assets" / "parts-library"
SVG_DIR = LIB / "svg"
HARVEST = LIB / "harvest.json"
STATE = LIB / ".harvest_state.json"

API = "https://commons.wikimedia.org/w/api.php"
UA = "5E-parts-library/1.0 (https://github.com/seungyeon980808-pixel/5E; educational; contact via GitHub issues)"

# 파일 크기 상한. 실측 분포에서 100KB 면 84% 가 통과하고 평균 21KB 로 떨어진다.
# 무거운 SVG 는 저장소만 먹는 게 아니라 선화 변환도 잘 안 된다.
MAX_BYTES = 100 * 1024
MIN_BYTES = 400          # 빈 껍데기 제외

# 요청 간격(초). 낮추면 429 가 뜬다.
API_DELAY = 1.2
FILE_DELAY = 0.9

# 수집 대상 — (Commons 카테고리, 과목, 분류, 이 갈래에서 최대 몇 장)
# 한 갈래가 통째로 결과를 뒤덮지 않게 갈래마다 상한을 둔다.
# ("Physics diagrams" 같은 넓은 뿌리는 14만 장이 걸려 나오므로 쓰지 않는다.)
TARGETS = [
    ("Laboratory equipment",            "c", "실험 기구",   700),
    ("Chemistry laboratory equipment",  "c", "실험 기구",   500),
    ("Laboratory glassware",            "c", "실험 기구",   300),
    ("Chemistry diagrams",              "c", "화학 도해",   200),
    ("Circuit diagrams",                "p", "회로",        600),
    ("Optics",                          "p", "광학",        300),
    ("Physics experiments",             "p", "실험 장치",   250),
    ("Mechanics diagrams",              "p", "역학",        200),
    ("Optics diagrams",                 "p", "광학",        300),
    ("Mechanics",                       "p", "역학",        150),
    ("Biology diagrams",                "b", "생명 도해",   250),
    ("Cell biology",                    "b", "세포",        250),
    ("Human anatomy",                   "b", "인체",        250),
    ("Anatomy diagrams",                "b", "인체",        200),
    # 지구과학 — 1차에서 쓴 "…diagrams" 이름은 Commons 에 없어 전부 0장이었다.
    ("Geology",                         "e", "지질",        250),
    ("Structural geology",              "e", "지질",        150),
    ("Stratigraphy",                    "e", "지층",        150),
    ("Plate tectonics",                 "e", "판구조",      100),
    ("Meteorology",                     "e", "기상",        250),
    ("Oceanography",                    "e", "해양",        150),
    ("Solar System diagrams",           "e", "천문",        200),
]

SUBJECT_LABEL = {"p": "물리", "c": "화학", "b": "생명", "e": "지구", "x": "공통"}
SLUG_RE = re.compile(r"[^a-z0-9]+")


def slug(title):
    s = title.rsplit(".", 1)[0]
    s = SLUG_RE.sub("_", s.lower()).strip("_")
    return s[:60] or "item"


def api(**params):
    """API 한 번. 429 면 기다렸다 다시 건다."""
    params.setdefault("format", "json")
    params.setdefault("formatversion", "2")
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                wait = 5 * (attempt + 1)
                print(f"    (429/503 — {wait}초 대기)")
                time.sleep(wait)
                continue
            raise
        except Exception as e:
            print(f"    (통신 오류 {e} — 5초 대기)")
            time.sleep(5)
    raise RuntimeError("재시도 끝까지 실패")


def build_queue():
    """대상 카테고리를 훑어 후보 목록을 만든다. 파일은 아직 받지 않는다."""
    seen, queue = set(), []
    for cat, subj, part, cap in TARGETS:
        got, cont, stall = 0, {}, 0
        while got < cap:
            p = dict(
                action="query", generator="search", gsrnamespace=6,
                gsrlimit=50, gsrsearch=f'filemime:image/svg+xml deepcat:"{cat}"',
                prop="imageinfo|categories", cllimit=500,
                iiprop="url|size|extmetadata",
                iiextmetadatafilter="LicenseShortName|ImageDescription|Artist",
            )
            # continue 는 통째로 되돌려 준다. prop 이 둘이라 gsroffset 말고
            # clcontinue 가 올 때도 있어서, 키를 골라 쓰면 깨진다.
            p.update(cont)
            d = api(**p)
            pages = d.get("query", {}).get("pages", [])
            if not pages:
                break
            before = got
            for pg in pages:
                ii = (pg.get("imageinfo") or [{}])[0]
                size = ii.get("size") or 0
                title = pg.get("title", "").replace("File:", "")
                if not ii.get("url") or not (MIN_BYTES <= size <= MAX_BYTES):
                    continue
                pid = f"{subj}_{slug(title)}"
                if pid in seen:
                    continue
                seen.add(pid)
                ext = ii.get("extmetadata", {})
                tags = [c["title"].replace("Category:", "")
                        for c in pg.get("categories", [])]
                queue.append({
                    "id": pid,
                    "file": f"{pid}.svg",
                    "url": ii["url"],
                    "subject": subj,
                    "subjectLabel": SUBJECT_LABEL[subj],
                    "part": part,
                    "name": title.rsplit(".", 1)[0],
                    "sourceTags": tags,          # ← 주제 검색의 뼈대
                    "sourceCategory": cat,
                    "license": ext.get("LicenseShortName", {}).get("value", "unknown"),
                    "source": f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(title)}",
                    "bytes": size,
                })
                got += 1
                if got >= cap:
                    break
            # 같은 쪽을 카테고리만 더 받으려고 다시 도는 경우가 있다.
            # 새로 는 게 없으면 그만둔다 — 안 그러면 제자리에서 돈다.
            stall = stall + 1 if got == before else 0
            if stall >= 3 or "continue" not in d:
                break
            cont = d["continue"]
            time.sleep(API_DELAY)
        print(f"  {cat:34s} {got:>4}장")
        time.sleep(API_DELAY)
    return queue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="이번 실행에서 받을 최대 장수")
    ap.add_argument("--list-only", action="store_true", help="목록만 만들고 받지 않음")
    ap.add_argument("--refresh", action="store_true", help="목록을 새로 만든다")
    args = ap.parse_args()

    SVG_DIR.mkdir(parents=True, exist_ok=True)

    if STATE.exists() and not args.refresh:
        queue = json.loads(STATE.read_text(encoding="utf-8"))
        print(f"이어받기 — 목록 {len(queue)}장 (새로 만들려면 --refresh)")
    else:
        print("목록 만드는 중 …")
        queue = build_queue()
        STATE.write_text(json.dumps(queue, ensure_ascii=False), encoding="utf-8")
        print(f"목록 {len(queue)}장 → .harvest_state.json")

    if args.list_only:
        return 0

    done = {}
    if HARVEST.exists():
        done = {h["id"]: h for h in json.loads(HARVEST.read_text(encoding="utf-8"))}

    todo = [q for q in queue if not (SVG_DIR / q["file"]).exists()]
    if args.limit:
        todo = todo[:args.limit]
    print(f"받을 것 {len(todo)}장 (이미 있는 것 {len(queue) - len(todo)}장은 건너뜀)")

    ok = fail = 0
    t0 = time.time()
    for n, q in enumerate(todo, 1):
        try:
            req = urllib.request.Request(q["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read()
            if b"<svg" not in body[:4000]:
                fail += 1
                continue
            (SVG_DIR / q["file"]).write_bytes(body)
            rec = {k: v for k, v in q.items() if k != "url"}
            rec["bytes"] = len(body)
            done[q["id"]] = rec
            ok += 1
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                print(f"    (429 — 20초 대기)")
                time.sleep(20)
            fail += 1
        except Exception:
            fail += 1

        if n % 50 == 0:
            HARVEST.write_text(json.dumps(list(done.values()), ensure_ascii=False, indent=1),
                               encoding="utf-8")
            el = time.time() - t0
            rate = el / n
            print(f"  {n}/{len(todo)}  성공 {ok} 실패 {fail}  "
                  f"· 남은 시간 약 {int((len(todo)-n)*rate/60)}분")
        time.sleep(FILE_DELAY)

    HARVEST.write_text(json.dumps(list(done.values()), ensure_ascii=False, indent=1),
                       encoding="utf-8")
    print(f"\n끝. 성공 {ok} · 실패 {fail} · 누적 {len(done)}장 → harvest.json")
    print("다음: python tools/build_parts_manifest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
