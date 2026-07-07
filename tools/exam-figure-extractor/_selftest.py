# -*- coding: utf-8 -*-
"""엔진+태거 자체 테스트: 테스트 PDF → 스테이징(PNG + new_tags.csv) + 태그 통계."""
import csv, sys, statistics as st
from collections import Counter
from pathlib import Path
import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
import figure_core as fc
from tagger import Tagger

TEST_PDF = Path(r"C:\Users\user\Desktop\Fable\그림추출(v4.0)\test_exam")
STAGE = Path(__file__).with_name("_staging_selftest")
(STAGE / "images").mkdir(parents=True, exist_ok=True)

tagger = Tagger()
rows = []
counts = []
sample_tags = {}

for pdf in sorted(TEST_PDF.glob("*.pdf")):
    doc = pymupdf.open(pdf)
    if len(doc) == 0:
        print(f"[skip] {pdf.name}: 손상/빈 문서"); doc.close(); continue
    subj = pdf.stem.split("_")[0]
    for pno, page in enumerate(doc):
        figs = fc.detect_figures(page)
        if not figs:
            continue
        markers = fc.find_question_markers(page)
        spans = fc.question_spans(markers, page.rect.height)
        span_by_q = {q: (col, y0, y1) for col in (0, 1) for (q, y0, y1) in spans[col]}
        for q, bbox in sorted(figs.items()):
            item_id = f"{pdf.stem}_{q:02d}"
            fc.save_figure_png(page, bbox, STAGE / "images" / f"{item_id}.png")
            col, y0, y1 = span_by_q.get(q, (0, 0, page.rect.height))
            text = fc.question_text(page, col, y0, y1)
            tags = tagger.tag(subj, text)
            rows.append((item_id, ",".join(tags)))
            counts.append(len(tags))
            if pdf.stem in ("p1_2026_11", "c1_2023_11", "b1_2026_11", "e1_2026_11"):
                sample_tags[item_id] = tags
    doc.close()

with open(STAGE / "new_tags.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f); w.writerow(["id", "tags", "part"])
    for item_id, tags in rows:
        w.writerow([item_id, tags, ""])

print(f"추출 그림 {len(rows)}개 → {STAGE}")
print(f"태그 수 분포: 평균 {st.mean(counts):.1f} 중앙값 {int(st.median(counts))}")
c = Counter(counts)
for k in sorted(c):
    print(f"  {k}개: {c[k]}")
zero = sum(1 for x in counts if x == 0)
print(f"  0개(사전 미보강): {zero}/{len(counts)} = {100*zero/len(counts):.0f}%")
print("\n=== 샘플 태그 (사용자 예시 대조) ===")
for k in ["p1_2026_11_06", "b1_2026_11_01", "e1_2026_11_01", "c1_2023_11_12",
          "b1_2026_11_19", "e1_2026_11_04", "p1_2026_11_03", "b1_2026_11_05"]:
    if k in sample_tags:
        print(f"  {k}: {sample_tags[k]}")
