"""도판 원본에서 부품 한 개를 오려낸다 — 삽화를 '그리지 않고 가져오는' 도구.

핵심 두 가지
------------
1) **바깥만 투명, 안쪽은 불투명.** 손이 물체를 가리려면 손 안쪽 흰색이 남아야 한다.
   그냥 흰색을 전부 투명으로 만들면 물체의 선이 손을 뚫고 보인다. 그래서 테두리에서
   시작하는 홍수 채우기(flood fill)로 **바깥에 이어진 흰색만** 지운다. 손가락 사이
   틈처럼 바깥과 통하는 곳은 자동으로 투명해져 뒤의 선이 비친다 — 원본과 같은 동작이다.

2) **잘린 면 봉하기(seal).** 손목처럼 그림이 화면 밖으로 이어지는 쪽은 윤곽이 열려
   있어서, 바깥 흰색이 그 틈으로 손 안까지 새어 들어간다. 그래서 잘린 면에 임시 벽을
   세우고 채운 뒤 벽을 지운다(벽은 잉크로 남기지 않는다 — 손목에 마개가 생긴다).

3) **앞/뒤 두 조각(--split).** 물체를 쥔 그림은 한 장으로는 안 된다. 손바닥은 물체
   뒤, 손가락은 물체 앞에 있어야 쥔 것으로 보인다. 쥐는 선에서 잘라 두 조각으로
   저장하고, 앱에서는 그 사이에 물체를 넣는다(MCP add_part 가 한 쌍으로 배치한다).

쓰기
----
    python tools/cutout-part.py _work/pdf-figures/p1_2025_06/p3_Im1.png \\
        --id hand_grip --name "쥔 손" --box 165 236 460 452 \\
        --erase 296:0:460:110 --erase 232:230:460:346 \\
        --seal left --split 0.68 --dpi 600

--box/--erase 는 입력 PNG 픽셀 좌표(x0 y0 x1 y1), --split 은 잘린 조각 안에서의 비율
또는 픽셀. 결과는 assets/exam-parts/ 에 PNG 로, 치수·출처는 manifest.json 에 적힌다.
"""

import argparse
import json
from collections import deque
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
PARTS_DIR = REPO / "assets" / "exam-parts"
MANIFEST = PARTS_DIR / "manifest.json"
INK = 128                                  # 이보다 어두우면 잉크


def load(path):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise SystemExit("Pillow 가 없습니다:  pip install pillow")
    return Image.open(path).convert("L"), Image, ImageDraw


def parse_box(s):
    v = [int(t) for t in s.replace(",", ":").split(":")]
    if len(v) != 4:
        raise SystemExit(f"박스는 x0:y0:x1:y1 형식입니다 — 받은 값 {s}")
    return v


def seal_edge(img, side, ImageDraw, min_span=0.2):
    """잘린 면 쪽으로 이미지를 바짝 붙여 자르고, 그 면을 잉크로 봉한 사본을 돌려준다.

    돌려주는 것: (자른 원본, 벽을 세운 작업본). 알파는 작업본으로 계산하고 색은
    원본에서 가져온다 — 벽이 잉크로 남지 않게 하기 위해서다.
    """
    if side == "none":
        return img, img.copy()
    rot = {"left": 0, "top": 270, "right": 180, "bottom": 90}[side]
    im = img.rotate(-rot, expand=True) if rot else img       # 봉할 면을 왼쪽으로
    w, h = im.size
    px = im.load()
    need = max(4, int(h * min_span))
    cut = 0
    for x in range(w):
        ys = [y for y in range(h) if px[x, y] < INK]
        if ys and max(ys) - min(ys) >= need:
            cut = x
            break
    im = im.crop((cut, 0, w, h))
    px = im.load()
    h = im.size[1]
    col = [y for y in range(h) if px[0, y] < INK]
    work = im.copy()
    if col:
        ImageDraw.Draw(work).line([(0, min(col)), (0, max(col))], fill=0, width=1)
    back = lambda z: z.rotate(rot, expand=True) if rot else z
    return back(im), back(work)


def alpha_outside(base, work, Image):
    """work(봉해진 사본)의 테두리에서 흰색을 홍수 채우기 → 바깥만 투명한 RGBA."""
    w, h = work.size
    wp = work.load()
    seen = [[0] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if wp[x, y] >= INK and not seen[y][x]:
                seen[y][x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if wp[x, y] >= INK and not seen[y][x]:
                seen[y][x] = 1
                q.append((x, y))
    while q:
        a, b = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            i, j = a + dx, b + dy
            if 0 <= i < w and 0 <= j < h and wp[i, j] >= INK and not seen[j][i]:
                seen[j][i] = 1
                q.append((i, j))
    out = base.convert("RGBA")
    bp, ap = base.load(), out.load()
    for y in range(h):
        for x in range(w):
            if seen[y][x]:
                ap[x, y] = (255, 255, 255, 0)        # 바깥 = 투명
            elif bp[x, y] >= INK:
                ap[x, y] = (255, 255, 255, 255)      # 안쪽 흰색 = 뒤를 가린다
    return out


def update_manifest(entry):
    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    if MANIFEST.exists():
        rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = [r for r in rows if r["id"] != entry["id"]] + [entry]
    rows.sort(key=lambda r: r["id"])
    MANIFEST.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description="도판 원본 → 부품 PNG(앞/뒤 조각)")
    ap.add_argument("src", help="입력 PNG (pdf-figure-extract.py 결과)")
    ap.add_argument("--id", required=True, help="부품 id (예: hand_grip)")
    ap.add_argument("--name", required=True, help="한국어 이름 (예: 쥔 손)")
    ap.add_argument("--keywords", default="", help="쉼표로 구분한 검색어")
    ap.add_argument("--box", required=True, help="자를 영역 x0:y0:x1:y1")
    ap.add_argument("--erase", action="append", default=[], help="흰색으로 지울 영역(여러 번)")
    ap.add_argument("--seal", default="none", choices=["none", "left", "right", "top", "bottom"],
                    help="그림이 화면 밖으로 이어지는 잘린 면")
    ap.add_argument("--split", default=None,
                    help="앞/뒤로 자를 위치 — 0~1 비율 또는 px. 세로로 자르려면 접두사 y (예: y0.6)")
    ap.add_argument("--dpi", type=float, default=600, help="원본 해상도(기본 600)")
    ap.add_argument("--note", default="", help="출처 메모")
    a = ap.parse_args()

    img, Image, ImageDraw = load(a.src)
    x0, y0, x1, y1 = parse_box(a.box)
    d = ImageDraw.Draw(img)
    for e in a.erase:
        d.rectangle(parse_box(e), fill=255)
    img = img.crop((x0, y0, x1, y1))
    base, work = seal_edge(img, a.seal, ImageDraw)
    rgba = alpha_outside(base, work, Image)
    w, h = rgba.size
    mm = (round(w / a.dpi * 25.4, 2), round(h / a.dpi * 25.4, 2))

    PARTS_DIR.mkdir(parents=True, exist_ok=True)
    files = {"full": f"{a.id}.png"}
    rgba.save(PARTS_DIR / files["full"])
    split_px = None
    if a.split:
        vertical = a.split.startswith("y")
        s = a.split[1:] if vertical else a.split
        size = h if vertical else w
        split_px = int(float(s) * size) if float(s) <= 1 else int(float(s))
        if vertical:
            rgba.crop((0, 0, w, split_px)).save(PARTS_DIR / f"{a.id}_back.png")
            rgba.crop((0, split_px, w, h)).save(PARTS_DIR / f"{a.id}_front.png")
        else:
            rgba.crop((0, 0, split_px, h)).save(PARTS_DIR / f"{a.id}_back.png")
            rgba.crop((split_px, 0, w, h)).save(PARTS_DIR / f"{a.id}_front.png")
        files["back"] = f"{a.id}_back.png"
        files["front"] = f"{a.id}_front.png"

    n = update_manifest({
        "id": a.id, "name": a.name,
        "keywords": [k.strip() for k in a.keywords.split(",") if k.strip()],
        "files": files, "px": [w, h], "mm": list(mm),
        "split": {"axis": "y" if (a.split or "").startswith("y") else "x", "px": split_px}
        if split_px else None,
        "source": {"src": Path(a.src).name, "box": [x0, y0, x1, y1], "dpi": a.dpi, "note": a.note},
    })
    print(f"{a.id}: {w}×{h}px  인쇄 {mm[0]}×{mm[1]}mm" +
          (f"  (뒤 {split_px}px / 앞 {w - split_px}px)" if split_px and not (a.split or '').startswith('y') else ""))
    print(f"→ {PARTS_DIR}  (manifest {n}개)")


if __name__ == "__main__":
    main()
