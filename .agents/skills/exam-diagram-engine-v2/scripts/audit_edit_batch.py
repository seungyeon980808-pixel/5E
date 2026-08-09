#!/usr/bin/env python3
"""Create source-comparison reports and review sheets for generated edit cases."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

import compare_source


def fit(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    copy = image.convert("RGB")
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", box, "white")
    canvas.paste(copy, ((box[0] - copy.width) // 2, (box[1] - copy.height) // 2))
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--split", choices=["development", "final"], default="development")
    parser.add_argument("--subject", required=True)
    parser.add_argument(
        "--artifact-relative",
        default="generated.png",
        help="Generated artifact path relative to each queued output directory.",
    )
    parser.add_argument(
        "--review-label",
        default="",
        help="Optional subdirectory used to keep review sheets for alternate artifacts separate.",
    )
    args = parser.parse_args()
    root = Path(args.root).resolve()
    queue_path = root / f"results/exam-diagram-engine-v2-2/{args.split}/generation-queue.json"
    queue = json.loads(queue_path.read_text(encoding="utf-8"))["queue"]
    candidates = [item for item in queue if item["subject"] == args.subject]
    items = []
    for item in candidates:
        queued_output = root / item["output"]
        artifact = queued_output.parent / args.artifact_relative
        if artifact.is_file():
            item = dict(item)
            item["audit_output"] = str(artifact.relative_to(root)).replace("\\", "/")
            items.append(item)
    report_rows = []
    for item in items:
        request = json.loads((root / item["request"]).read_text(encoding="utf-8"))
        artifact_path = root / item["audit_output"]
        with Image.open(root / item["source_image"]) as source, Image.open(artifact_path) as output:
            report = compare_source.compare(request, source, output)
        report_path = artifact_path.with_name("source-comparison.json")
        compare_source.write_json(report_path, report)
        report_rows.append({"case_id": item["case_id"], "passed": report["passed"], "locked_edge_f1": report["locked_edge_f1"], "report": str(report_path.relative_to(root)).replace("\\", "/")})

    sheet_dir = root / f"results/exam-diagram-engine-v2-2/{args.split}/review-sheets"
    if args.review_label:
        sheet_dir /= args.review_label
    sheet_dir /= args.subject
    sheet_dir.mkdir(parents=True, exist_ok=True)
    sheet_paths = []
    font = ImageFont.load_default(size=18)
    for page_index in range(0, len(items), 3):
        page_items = items[page_index:page_index + 3]
        sheet = Image.new("RGB", (1400, 1260), "white")
        draw = ImageDraw.Draw(sheet)
        for row, item in enumerate(page_items):
            top = row * 420
            draw.text((20, top + 10), item["case_id"], fill="black", font=font)
            draw.text((280, top + 40), "SOURCE", fill="black", font=font)
            draw.text((980, top + 40), "OUTPUT", fill="black", font=font)
            with Image.open(root / item["source_image"]) as source:
                sheet.paste(fit(source, (650, 340)), (20, top + 70))
            with Image.open(root / item["audit_output"]) as output:
                sheet.paste(fit(output, (650, 340)), (730, top + 70))
        path = sheet_dir / f"page-{page_index // 3 + 1:02d}.png"
        sheet.save(path)
        sheet_paths.append(str(path.relative_to(root)).replace("\\", "/"))
    summary = {
        "split": args.split,
        "subject": args.subject,
        "artifact_relative": args.artifact_relative,
        "review_label": args.review_label,
        "generated_cases": len(items),
        "source_comparison_passed": sum(row["passed"] for row in report_rows),
        "rows": report_rows,
        "review_sheets": sheet_paths,
    }
    summary_path = sheet_dir / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
