#!/usr/bin/env python3
"""Build source + repeated-output review sheets for a stability queue."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import compare_source
from audit_edit_batch import fit


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--queue", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    queue = json.loads((root / args.queue).read_text(encoding="utf-8"))["queue"]
    groups = defaultdict(list)
    for item in queue:
        groups[item["case_id"]].append(item)

    out_dir = root / args.out
    out_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=20)
    rows = []
    for case_id, items in groups.items():
        items.sort(key=lambda item: item["repetition"])
        request = json.loads((root / items[0]["prompt"]).with_name("edit-request.json").read_text(encoding="utf-8"))
        sheet = Image.new("RGB", (1600, 1500), "white")
        draw = ImageDraw.Draw(sheet)
        draw.text((25, 15), case_id, fill="black", font=font)
        panels = [("SOURCE", root / items[0]["source_image"])] + [
            (f"RUN {item['repetition']}", root / item["output"]) for item in items
        ]
        run_reports = []
        for index, (label, path) in enumerate(panels):
            x = 20 + (index % 2) * 790
            y = 60 + (index // 2) * 710
            draw.text((x + 10, y), label, fill="black", font=font)
            with Image.open(path) as image:
                sheet.paste(fit(image, (760, 650)), (x, y + 35))
            if index:
                item = items[index - 1]
                with Image.open(root / item["source_image"]) as source, Image.open(path) as output:
                    report = compare_source.compare(request, source, output)
                report_path = path.with_name("source-comparison.json")
                compare_source.write_json(report_path, report)
                run_reports.append({
                    "repetition": item["repetition"],
                    "locked_edge_f1": report["locked_edge_f1"],
                    "automatic_pass": report["passed"],
                    "report": str(report_path.relative_to(root)).replace("\\", "/"),
                })
        sheet_path = out_dir / f"{case_id}.png"
        sheet.save(sheet_path)
        rows.append({
            "case_id": case_id,
            "subject": items[0]["subject"],
            "sheet": str(sheet_path.relative_to(root)).replace("\\", "/"),
            "runs": run_reports,
        })

    summary = {"case_count": len(rows), "generation_count": len(queue), "cases": rows}
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
