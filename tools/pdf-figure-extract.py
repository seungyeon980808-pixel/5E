"""기출 PDF에서 도판 원본(600dpi)을 통째로 뽑는다.

왜 필요한가
-----------
`assets/exam-library/images/*.png` 는 가로 979px 짜리 화면용 축소본이다. 시험지에
실제로 인쇄되는 도판은 가로 6~80mm 라, 979px 본을 잘라 쓰면 손 하나가 70px 밖에
안 된다(≈100dpi). 그런데 **원본 PDF 안에는 같은 그림이 600dpi 로 박혀 있다** —
같은 손이 430px 이다. 삽화(사람·손·차량…)는 그리지 않고 여기서 잘라 쓴다.

쓰기
----
    python tools/pdf-figure-extract.py p1_2025_06                # 한 회차
    python tools/pdf-figure-extract.py p1_2025_06 --page 3       # 그 페이지만
    python tools/pdf-figure-extract.py --list                    # 있는 회차 보기

기본 입력  ../../32_exam_pool/PDF/<회차>.pdf   (--pdf-dir 로 바꿀 수 있다)
기본 출력  _work/pdf-figures/<회차>/p<페이지>_<이름>.png
출력 폴더는 저장소에 커밋하지 않는다(작업용). 부품으로 쓸 것만 cutout-part.py 로
잘라 assets/exam-parts/ 에 넣는다.
"""

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent                       # 5E_main
DEFAULT_PDF_DIR = REPO.parent.parent / "32_exam_pool" / "PDF"
DEFAULT_OUT = REPO / "_work" / "pdf-figures"


def load_reader(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("pypdf 가 없습니다:  pip install pypdf")
    return PdfReader(str(path))


def extract(pdf_path, out_dir, only_page=None, min_px=200):
    """페이지별 삽입 이미지를 전부 저장하고 목록을 돌려준다.

    min_px 미만(가로)은 건너뛴다 — 로고·문항 번호 장식 따위가 섞여 나온다.
    """
    reader = load_reader(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    for pi, page in enumerate(reader.pages):
        if only_page is not None and pi != only_page:
            continue
        # 배치 크기(pt)를 알아야 실제 인쇄 mm 와 dpi 를 계산할 수 있다
        placed = {}
        try:
            import pdfplumber
            with pdfplumber.open(str(pdf_path)) as doc:
                for im in doc.pages[pi].images:
                    placed[im["srcsize"]] = (im["width"], im["height"])
        except Exception:
            pass                                    # 없으면 mm 계산만 생략된다
        for im in page.images:
            img = im.image
            if img.width < min_px:
                continue
            name = f"p{pi}_{Path(im.name).stem}.png"
            img.save(out_dir / name)
            pt = placed.get((img.width, img.height))
            row = {
                "file": name, "page": pi, "px": [img.width, img.height],
                "mm": [round(pt[0] / 72 * 25.4, 2), round(pt[1] / 72 * 25.4, 2)] if pt else None,
                "dpi": round(img.width / pt[0] * 72) if pt else None,
            }
            rows.append(row)
            mm = f"{row['mm'][0]}×{row['mm'][1]}mm {row['dpi']}dpi" if pt else "(배치 크기 불명)"
            print(f"  {name:22} {img.width}×{img.height}px   인쇄 {mm}")
    (out_dir / "index.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return rows


def main():
    ap = argparse.ArgumentParser(description="기출 PDF → 600dpi 도판 PNG")
    ap.add_argument("exam", nargs="?", help="회차 이름 (예: p1_2025_06). .pdf 는 생략")
    ap.add_argument("--page", type=int, default=None, help="이 페이지만 (0부터)")
    ap.add_argument("--pdf-dir", default=str(DEFAULT_PDF_DIR))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--list", action="store_true", help="쓸 수 있는 회차 보기")
    a = ap.parse_args()

    pdf_dir = Path(a.pdf_dir)
    if a.list or not a.exam:
        names = sorted(p.stem for p in pdf_dir.glob("*.pdf"))
        print(f"{pdf_dir} — {len(names)}개")
        for n in names:
            print(" ", n)
        return

    pdf = pdf_dir / (a.exam if a.exam.endswith(".pdf") else a.exam + ".pdf")
    if not pdf.exists():
        sys.exit(f"없는 파일: {pdf}  (--list 로 확인)")
    out = Path(a.out) / pdf.stem
    print(f"{pdf.name} → {out}")
    rows = extract(pdf, out, a.page)
    print(f"{len(rows)}장 저장. 목록: {out / 'index.json'}")


if __name__ == "__main__":
    main()
