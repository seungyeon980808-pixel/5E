#!/usr/bin/env python3
"""Build Original/Simple/Standard/Complex comparison sheets and metrics."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

STAGES = ("original", "simple", "standard", "complex")


def fit_on_white(path: Path, box: tuple[int, int]) -> Image.Image:
    source = Image.open(path).convert("RGBA")
    white = Image.new("RGBA", source.size, "white")
    white.alpha_composite(source)
    image = white.convert("RGB")
    image.thumbnail(box, Image.Resampling.LANCZOS)
    return image


def metrics(path: Path) -> dict[str, float | int]:
    source = Image.open(path).convert("RGBA")
    white = Image.new("RGBA", source.size, "white")
    white.alpha_composite(source)
    rgb = np.asarray(white.convert("RGB"), dtype=np.int16)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    gray = np.rint(rgb.mean(axis=2)).astype(np.uint8)
    return {
        "mean_channel_spread": round(float(spread.mean()), 3),
        "nonwhite_percent": round(float((gray < 248).mean() * 100), 2),
        "gray_levels": int(np.unique(gray).size),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    manifest = json.loads((root / "validation.json").read_text(encoding="utf-8"))
    comparisons = root / "comparisons"
    comparisons.mkdir(parents=True, exist_ok=True)
    font_path = Path("C:/Windows/Fonts/malgun.ttf")
    title_font = ImageFont.truetype(str(font_path), 26) if font_path.exists() else ImageFont.load_default()
    label_font = ImageFont.truetype(str(font_path), 20) if font_path.exists() else ImageFont.load_default()
    metrics_rows = []

    for case in manifest["cases"]:
        slug = case["slug"]
        files = {
            "original": root / "references" / f"{slug}-reference.png",
            "simple": root / "simple" / f"{slug}.png",
            "standard": root / "standard" / f"{slug}.png",
            "complex": root / "complex" / f"{slug}.png",
        }
        for path in files.values():
            if not path.exists():
                raise FileNotFoundError(path)
        cell_w, cell_h = 500, 620
        canvas = Image.new("RGB", (cell_w * 4, cell_h + 70), "white")
        draw = ImageDraw.Draw(canvas)
        draw.text((22, 15), case["title"], fill="black", font=title_font)
        for column, stage in enumerate(STAGES):
            left = column * cell_w
            current = fit_on_white(files[stage], (450, 500))
            x = left + (cell_w - current.width) // 2
            y = 95 + (500 - current.height) // 2
            canvas.paste(current, (x, y))
            score = case["scores"][stage]["total"]
            elapsed = case["timings_ms"].get(stage)
            timing = "기준" if elapsed is None else (f"{elapsed / 1000:.1f}초" if elapsed < 60_000 else f"{elapsed / 60_000:.1f}분")
            label = f"{stage.upper()}  {score}점  {timing}"
            draw.text((left + 18, 60), label, fill="black", font=label_font)
            if column:
                draw.line((left, 55, left, cell_h + 55), fill=(220, 220, 220), width=2)
            metrics_rows.append({"case": slug, "stage": stage, "score": score, "elapsed_ms": elapsed or 0, **metrics(files[stage])})
        output = comparisons / f"{slug}-four-way.png"
        canvas.save(output, optimize=True)

    with (root / "metrics.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=metrics_rows[0].keys())
        writer.writeheader()
        writer.writerows(metrics_rows)
    print(json.dumps({"root": str(root), "cases": len(manifest["cases"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()
