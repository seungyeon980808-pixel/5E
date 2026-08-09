#!/usr/bin/env python3
"""Build comparison sheets and grayscale metrics for one conversion batch."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


STAGES = ("reference", "generated", "normalized")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch", type=Path, help="Batch directory")
    parser.add_argument("--rows-per-sheet", type=int, default=5)
    return parser.parse_args()


def fit(path: Path, box: tuple[int, int]) -> Image.Image:
    image = Image.open(path).convert("RGB")
    image.thumbnail(box, Image.Resampling.LANCZOS)
    return image


def metrics(path: Path) -> dict[str, float | int]:
    rgb = np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    gray = np.rint(rgb.mean(axis=2)).astype(np.uint8)
    return {
        "mean_channel_spread": round(float(spread.mean()), 3),
        "nonwhite_percent": round(float((gray < 248).mean() * 100), 2),
        "gray_levels": int(np.unique(gray).size),
    }


def find_case_files(batch: Path, case: dict) -> dict[str, Path]:
    stem = f"case-{int(case['id']):03d}-{case['slug']}"
    files = {
        "reference": batch / "references" / f"{stem}-reference.png",
        "generated": batch / "converted" / f"{stem}.png",
        "normalized": batch / "normalized" / f"{stem}.png",
    }
    missing = [str(path) for path in files.values() if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing case files:\n" + "\n".join(missing))
    return files


def make_sheets(batch: Path, cases: list[dict], rows_per_sheet: int) -> list[str]:
    comparisons = batch / "comparisons"
    comparisons.mkdir(parents=True, exist_ok=True)
    width, row_height = 2160, 520
    column_width, image_width, image_height = 720, 660, 425
    font = ImageFont.load_default()
    outputs = []

    for offset in range(0, len(cases), rows_per_sheet):
        group = cases[offset : offset + rows_per_sheet]
        canvas = Image.new("RGB", (width, row_height * len(group) + 30), "white")
        draw = ImageDraw.Draw(canvas)
        for row, case in enumerate(group):
            top = 20 + row * row_height
            files = find_case_files(batch, case)
            for column, stage in enumerate(STAGES):
                left = column * column_width + 30
                current = fit(files[stage], (image_width, image_height))
                x = left + (image_width - current.width) // 2
                y = top + 48 + (image_height - current.height) // 2
                canvas.paste(current, (x, y))
                title = f"{int(case['id']):03d} {case['slug']} | {stage.upper()}"
                draw.text((left, top), title, fill="black", font=font)
            draw.line(
                (10, top + row_height - 8, width - 10, top + row_height - 8),
                fill=(210, 210, 210),
            )
        first_id, last_id = int(group[0]["id"]), int(group[-1]["id"])
        output = comparisons / f"cases-{first_id:03d}-{last_id:03d}.jpg"
        canvas.save(output, quality=93, optimize=True)
        outputs.append(str(output.resolve()))
    return outputs


def main() -> None:
    args = parse_args()
    batch = args.batch.resolve()
    source_manifest = json.loads((batch / "source-crops.json").read_text(encoding="utf-8"))
    cases = source_manifest["cases"]
    sheets = make_sheets(batch, cases, args.rows_per_sheet)

    rows = []
    for case in cases:
        files = find_case_files(batch, case)
        for stage, path in files.items():
            rows.append(
                {
                    "case_id": int(case["id"]),
                    "slug": case["slug"],
                    "subject": case["subject"],
                    "stage": stage,
                    "file": str(path.resolve()),
                    **metrics(path),
                }
            )
    metrics_path = batch / "metrics.csv"
    with metrics_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    result = {"batch": str(batch), "case_count": len(cases), "sheets": sheets, "metrics": str(metrics_path)}
    (batch / "report.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
