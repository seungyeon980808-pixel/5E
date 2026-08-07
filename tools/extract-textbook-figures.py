#!/usr/bin/env python3
"""Extract reproducible figure crops from textbook PDF pages using a JSON plan."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("plan", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--scale", type=float, default=2.0)
    return parser.parse_args()


def normalized_crop(image: Image.Image, bbox: list[float]) -> Image.Image:
    if len(bbox) != 4 or any(value < 0 or value > 1 for value in bbox):
        raise ValueError(f"Invalid normalized bbox: {bbox}")
    left, top, right, bottom = bbox
    if left >= right or top >= bottom:
        raise ValueError(f"Empty normalized bbox: {bbox}")
    return image.crop(
        (
            round(left * image.width),
            round(top * image.height),
            round(right * image.width),
            round(bottom * image.height),
        )
    )


def main() -> None:
    args = parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    cases = plan.get("cases", [])
    args.output.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(str(args.pdf.resolve()))
    records = []

    for case in cases:
        page_number = int(case["pdf_page"])
        if not 1 <= page_number <= len(pdf):
            raise ValueError(f"Page outside PDF: {page_number}")
        image = pdf[page_number - 1].render(scale=args.scale).to_pil().convert("RGB")
        cropped = normalized_crop(image, case["bbox"])
        filename = f"case-{int(case['id']):03d}-{case['slug']}-reference.png"
        destination = args.output / filename
        cropped.save(destination, optimize=True)
        records.append(
            {
                **case,
                "reference": str(destination.resolve()),
                "width": cropped.width,
                "height": cropped.height,
            }
        )

    result = {"source_pdf": str(args.pdf.resolve()), "cases": records}
    manifest_path = args.output.parent / "source-crops.json"
    manifest_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
