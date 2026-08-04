# -*- coding: utf-8 -*-
"""양식으로 긁어오기 — "이런 그림" 을 기준으로 모은다.

작가로 묶었더니 문장(紋章)·훈장까지 딸려 왔다. 사람이 아니라 **그림의 양식**이 기준이어야
한다. 교사가 좋다고 고른 그림들을 재 보니 공통점이 뚜렷했다:

    파일 크기   5~25KB      (수집분 중앙값은 189KB — 훨씬 가볍다)
    그라디언트  0개          ← 가장 강한 신호. 사진 같은 그림은 반드시 쓴다
    색 수       0~11종       평평한 단색 몇 개
    도형 수     13~71개      단순한 구조

전부 SVG 원문에서 바로 잴 수 있다. 렌더링이 필요 없으니 수천 장을 빠르게 훑을 수 있다.

    python tools/harvest_by_style.py --target 1000
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
OUT = HERE.parent / "_work" / "style-harvest"
SVG_DIR = OUT / "svg"
API = "https://commons.wikimedia.org/w/api.php"
UA = ("5E-parts-library/1.0 (https://github.com/seungyeon980808-pixel/5E; "
      "educational; contact via GitHub issues)")

# ── 기구 모드 ────────────────────────────────────────────────────────────
# 교사가 고른 19장은 대부분 **기구 선화**(메스·겸자·핀셋·견인기)였다.
# 그래서 도해가 아니라 "손에 잡히는 물건" 이 모인 갈래를 따로 둔다.
# 과목마다 몫을 정해 한쪽이 독식하지 않게 한다 — 물리 기구가 특히 모자랐다.
INSTRUMENTS = [
    # 물리
    ("Measuring instruments",       "p", "실험 기구"),
    ("Scientific instruments",      "p", "실험 기구"),
    ("Physics experiments",         "p", "실험 장치"),
    ("Optical instruments",         "p", "광학 기구"),
    ("Vernier calipers",            "p", "실험 기구"),
    ("Tuning forks",                "p", "실험 기구"),
    ("Barometers",                  "p", "실험 기구"),
    # 화학
    ("Laboratory glassware",        "c", "실험 기구"),
    ("Laboratory equipment",        "c", "실험 기구"),
    ("Test tubes",                  "c", "실험 기구"),
    ("Pipettes",                    "c", "실험 기구"),
    ("Retorts",                     "c", "실험 기구"),
    ("Bunsen burners",              "c", "실험 기구"),
    ("Petri dishes",                "c", "실험 기구"),
    # 생명 — 고르신 19장 중 상당수가 여기서 나왔다
    ("Surgical instruments",        "b", "실험 기구"),
    ("Microscopy",                  "b", "실험 기구"),
    ("Centrifuges",                 "b", "실험 기구"),
    ("Microtomes",                  "b", "실험 기구"),
]
QUOTA = {"p": 200, "c": 150, "b": 150}

# ── 도구 선화 모드 ──────────────────────────────────────────────────────
# 교사가 고른 19장의 카테고리를 실제로 조회해 보니 "SVG tools"(9장)가 압도적이었다.
# Commons 에는 **도구를 선화로 그린 SVG 전용 갈래**가 따로 있었다. 여기가 정답이다.
TOOLS_CATS = [
    ("SVG surgical instruments",  "b", "실험 기구"),
    ("SVG scalpels",              "b", "실험 기구"),
    ("SVG hemostatic clamps",     "b", "실험 기구"),
    ("Pinzettes",                 "b", "실험 기구"),
    ("SVG laboratory equipment",  "c", "실험 기구"),
    ("SVG optics",                "p", "광학 기구"),
    ("SVG tools",                 "x", "도구"),
]
TOOLS_QUOTA = {"b": 40, "c": 25, "p": 20, "x": 40}

# 과학 도해가 실제로 모여 있는 갈래. 넓은 뿌리("Physics diagrams" 14만 장)는 쓰지 않는다.
CATEGORIES = [
    ("Laboratory glassware",        "c", "실험 기구"),
    ("Laboratory equipment",        "c", "실험 기구"),
    ("Chemistry diagrams",          "c", "화학 도해"),
    ("Scientific instruments",      "x", "실험 기구"),
    ("Microscopy",                  "b", "실험 기구"),
    ("Surgical instruments",        "b", "실험 기구"),
    ("Human anatomy",               "b", "인체"),
    ("Anatomy diagrams",            "b", "인체"),
    ("Cell biology",                "b", "세포"),
    ("Biology diagrams",            "b", "생명 도해"),
    ("Botany",                      "b", "식물"),
    ("Optics diagrams",             "p", "광학"),
    ("Physics experiments",         "p", "실험 장치"),
    ("Mechanics",                   "p", "역학"),
    ("Geology",                     "e", "지질"),
    ("Meteorology",                 "e", "기상"),
    ("Oceanography",                "e", "해양"),
    ("Solar System diagrams",       "e", "천문"),
]

# 크기로 1차로 거른다. 작을수록 단순한 선화일 가능성이 높다.
MIN_BYTES, MAX_BYTES = 1500, 70 * 1024

# 확실히 아닌 것
JUNK = re.compile(
    r"coats? of arms|heraldr|wappen|\bflags?\b|road sign|traffic sign|zeichen \d|"
    r"municipalit|\bcoa\b|krzy[żz]|medal|\blogo\b|football|sport|emoji|twemoji|noto[ _-]|"
    r"openmoji|fluent|\bicon\b|barnstar|userbox|POL |gmina|powiat|herb ", re.I)
# 도구로 그릴 것 — 이미지로 넣지 않는다(교사 지시)
TOOLS = re.compile(
    r"\d[,\-]\d|structural formula|skeletal|\bCoA\b|\bsynthes(e|is)\b|biosynthesis|"
    r"\b\w+ic acid\b|circuit|schaltung|amplifier|transistor|\bdiode\b|oscillator|"
    r"logic gate|flip-?flop|\bresistor\b|capacitor", re.I)

DRAW = re.compile(r"<(path|circle|ellipse|rect|polygon|polyline|line)\b")
GRAD = re.compile(r"<(linearGradient|radialGradient)\b")
FILTER = re.compile(r"<filter\b|filter\s*[:=]")
IMAGE = re.compile(r"<image\b")
FILLC = re.compile(r'(?:fill|stroke)\s*[:=]\s*["\']?#([0-9a-fA-F]{3,6})')
STRIP = re.compile(r"<[^>]+>")

API_DELAY = 1.1
FILE_DELAY = 0.7


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
                time.sleep(6 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(4)
    return {}


def plain(v):
    return re.sub(r"\s+", " ", STRIP.sub(" ", v or "")).strip()


def build_pool(per_cat, cats=None):
    """카테고리마다 후보 목록을 모은다. 파일은 아직 안 받는다."""
    pool, seen = [], set()
    for cat, subj, part in (cats or CATEGORIES):
        got, cont, guard = 0, {}, 0
        while got < per_cat and guard < 30:
            guard += 1
            p = dict(action="query", generator="search", gsrnamespace=6, gsrlimit=50,
                     gsrsearch=f'filemime:image/svg+xml deepcat:"{cat}"',
                     prop="imageinfo|categories", cllimit=60,
                     iiprop="url|size|extmetadata",
                     iiextmetadatafilter="LicenseShortName|Artist")
            p.update(cont)
            d = api(**p)
            pages = d.get("query", {}).get("pages", [])
            if not pages:
                break
            for pg in pages:
                if got >= per_cat:
                    break
                title = pg.get("title", "").replace("File:", "")
                if title in seen:
                    continue
                ii = (pg.get("imageinfo") or [{}])[0]
                if not isinstance(ii, dict) or not ii.get("url"):
                    continue
                size = ii.get("size") or 0
                if not (MIN_BYTES <= size <= MAX_BYTES):
                    continue
                # 변수명을 cats 로 두면 함수 인자를 덮어쓴다 — 다음 카테고리가 날아간다
                catstr = " ".join(c["title"].replace("Category:", "")
                                  for c in pg.get("categories", []))
                hay = title + " " + catstr
                if JUNK.search(hay) or TOOLS.search(hay):
                    continue
                seen.add(title)
                ext = ii.get("extmetadata", {})
                pool.append({
                    "title": title, "url": ii["url"], "size": size,
                    "subject": subj, "part": part, "cats": catstr,
                    "license": plain(ext.get("LicenseShortName", {}).get("value", "")) or "unknown",
                    "artist": plain(ext.get("Artist", {}).get("value", ""))[:60],
                    "source": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(title),
                })
                got += 1
            if "continue" not in d:
                break
            cont = d["continue"]
            time.sleep(API_DELAY)
        print(f"  {cat:28s} {got:>4}장 (누적 {len(pool)})")
        time.sleep(API_DELAY)
    return pool


def style_score(text, size):
    """좋다고 한 그림들과 얼마나 닮은 양식인가. 0~100."""
    shapes = len(DRAW.findall(text))
    grads = len(GRAD.findall(text))
    filts = len(FILTER.findall(text))
    raster = len(IMAGE.findall(text))
    cols = {c.lower() * 2 if len(c) == 3 else c.lower() for c in FILLC.findall(text)}
    ncol = len(cols)

    if raster:                       # 사진을 품은 SVG — 선화가 아니다
        return 0, dict(shapes=shapes, grads=grads, colors=ncol, why="사진 포함")
    if shapes < 6:                   # 사실상 빈 그림
        return 0, dict(shapes=shapes, grads=grads, colors=ncol, why="너무 단순")
    # 도형이 수천 개면 사진을 벡터로 뜬 것이다. 그라디언트가 없어도 선화가 아니다
    # (실측: 물고기·뇌줄기 채색화가 1,500~12,000 도형으로 60점대를 받았다).
    if shapes > 900:
        return 0, dict(shapes=shapes, grads=grads, colors=ncol, why="사진을 벡터로 뜬 것")
    if ncol > 60:
        return 0, dict(shapes=shapes, grads=grads, colors=ncol, why="색이 너무 많음")

    # 교사가 고른 19장(메스·겸자·핀셋·견인기 등 기구 선화)을 실측한 값이 기준이다:
    #   색 0~9종(중앙값 4) · 도형 11~109(중앙값 33) · 8.5~58KB · 그라디언트 0~17
    # → **색 수가 결정적이고 그라디언트는 거의 무관하다.**
    #   (Dessin scalpel 은 그라디언트가 16개인데도 마음에 들어 했다)
    s = 0
    s += 40 if ncol <= 10 else (26 if ncol <= 18 else (12 if ncol <= 30 else 0))
    s += 30 if 10 <= shapes <= 130 else (20 if shapes <= 300 else (8 if shapes <= 600 else 0))
    s += 16 if size <= 40 * 1024 else (10 if size <= 70 * 1024 else 3)
    s += 8 if filts == 0 else 0
    s += 6 if grads <= 20 else 0          # 그라디언트는 아주 많을 때만 감점
    return s, dict(shapes=shapes, grads=grads, colors=ncol, why="")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=1000, help="최종 몇 장")
    ap.add_argument("--per-cat", type=int, default=220, help="카테고리마다 후보 몇 장")
    ap.add_argument("--min-score", type=int, default=60, help="이 점수 미만은 버린다")
    ap.add_argument("--instruments", action="store_true", help="기구 모드 (과목별 몫 적용)")
    ap.add_argument("--tools", action="store_true", help="도구 선화 모드 (SVG tools 갈래)")
    args = ap.parse_args()
    if args.tools:
        cats, quota = TOOLS_CATS, dict(TOOLS_QUOTA)
    elif args.instruments:
        cats, quota = INSTRUMENTS, dict(QUOTA)
    else:
        cats, quota = CATEGORIES, None

    SVG_DIR.mkdir(parents=True, exist_ok=True)
    print("후보 목록 만드는 중 …")
    pool_path = OUT / "pool.json"
    if pool_path.exists():
        pool = json.loads(pool_path.read_text(encoding="utf-8"))
        print(f"  이전 목록 이어씀 — {len(pool)}장 (새로 만들려면 pool.json 삭제)")
    else:
        pool = build_pool(args.per_cat, cats)
        pool_path.write_text(json.dumps(pool, ensure_ascii=False), encoding="utf-8")
    print(f"후보 {len(pool)}장\n")

    print("받으면서 양식 점수 매기는 중 …")
    kept, n, skipped = [], 0, 0
    filled = {k: 0 for k in (quota or {})}
    for it in pool:
        if len(kept) >= args.target:
            break
        # 과목 몫이 찼으면 건너뛴다 — 앞 카테고리가 전부 먹어 지구과학이 0장이 됐던 일이 있다
        if quota and filled.get(it["subject"], 0) >= quota.get(it["subject"], 10 ** 9):
            continue
        n += 1
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
                    skipped += 1
                    continue
                time.sleep(FILE_DELAY)
            text = body.decode("utf-8", "replace")
            if "<svg" not in text[:4000]:
                skipped += 1; continue
            score, info = style_score(text, len(body))
            if score < args.min_score:
                skipped += 1
                if p.exists():
                    p.unlink()
                continue
            if not p.exists():
                p.write_bytes(body)
            it.update(file=fn, score=score, **info)
            kept.append(it)
            if quota:
                filled[it["subject"]] = filled.get(it["subject"], 0) + 1
        except Exception:
            skipped += 1
            continue
        if n % 100 == 0:
            print(f"  훑음 {n}/{len(pool)} · 통과 {len(kept)} · 버림 {skipped}")

    kept.sort(key=lambda x: -x["score"])
    (OUT / "picked.json").write_text(json.dumps(kept, ensure_ascii=False, indent=1),
                                     encoding="utf-8")
    mb = sum((SVG_DIR / k["file"]).stat().st_size for k in kept) / 1024 / 1024
    print(f"\n끝. 통과 {len(kept)}장 · 버림 {skipped}장 · {mb:.1f}MB")
    print(f"점수 분포: 최고 {kept[0]['score'] if kept else 0} · "
          f"최저 {kept[-1]['score'] if kept else 0}")
    if quota:
        import collections as _c
        print("과목별:", dict(_c.Counter(k["subject"] for k in kept)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
