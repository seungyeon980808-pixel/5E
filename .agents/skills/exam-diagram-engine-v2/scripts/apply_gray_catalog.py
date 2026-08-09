#!/usr/bin/env python3
"""Apply reviewed gray masks and create parent/derivative review sheets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import flatten_gray_regions
from audit_edit_batch import fit


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--catalog", required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    catalog = json.loads((root / args.catalog).read_text(encoding="utf-8"))
    records = []
    derivative_name = catalog.get("derivative_name", "flat-gray-v1")
    sheet_dir = root / f"results/exam-diagram-engine-v2-2/development/review-sheets/{derivative_name}"
    sheet_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=18)
    for index, case in enumerate(catalog["cases"]):
        parent_attempt = int(case.get("parent_attempt", catalog.get("parent_attempt", 1)))
        parent = root / f"results/exam-diagram-engine-v2-2/development/{case['case_id']}/attempt-{parent_attempt:02d}/generated.png"
        derivative = parent.parent / derivative_name
        derivative.mkdir(parents=True, exist_ok=True)
        mask = {"case_id": case["case_id"], "parent_attempt": parent_attempt, "regions": case["regions"]}
        mask_path = derivative / "gray-mask.json"
        mask_path.write_text(json.dumps(mask, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        with Image.open(parent) as image:
            output, report = flatten_gray_regions.flatten(image, mask)
        output_path = derivative / "generated.png"
        output.save(output_path)
        report_path = derivative / "flatten-report.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        records.append({"case_id": case["case_id"], "parent_attempt": parent_attempt, "passed_preflight": report["passed_preflight"], "output": str(output_path.relative_to(root)).replace("\\", "/")})
    for page_start in range(0, len(records), 3):
        page = Image.new("RGB", (1400, 1260), "white")
        draw = ImageDraw.Draw(page)
        for row, record in enumerate(records[page_start:page_start + 3]):
            top = row * 420
            draw.text((20, top + 10), record["case_id"], fill="black", font=font)
            draw.text((280, top + 40), "ORIGINAL", fill="black", font=font)
            draw.text((980, top + 40), "MASK-FLATTENED", fill="black", font=font)
            original_path = root / f"results/exam-diagram-engine-v2-2/development/{record['case_id']}/attempt-{record['parent_attempt']:02d}/generated.png"
            with Image.open(original_path) as original:
                page.paste(fit(original, (650, 340)), (20, top + 70))
            with Image.open(root / record["output"]) as derivative:
                page.paste(fit(derivative, (650, 340)), (730, top + 70))
        page.save(sheet_dir / f"page-{page_start // 3 + 1:02d}.png")
    summary = {"revision": catalog["revision"], "case_count": len(records), "preflight_passed": sum(record["passed_preflight"] for record in records), "records": records}
    (sheet_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["preflight_passed"] == summary["case_count"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
