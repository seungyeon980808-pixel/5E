#!/usr/bin/env python3
"""Render a textbook PDF into page thumbnails and numbered contact sheets.

This is intentionally a preparation tool: it does not modify the source PDF and
keeps page numbers stable so selected scientific figures can be traced back to
their source page during image-conversion validation.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path, help="Source textbook PDF")
    parser.add_argument("output", type=Path, help="Output atlas directory")
    parser.add_argument("--thumb-width", type=int, default=240)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=4)
    parser.add_argument("--scale", type=float, default=0.55)
    parser.add_argument("--first-page", type=int, default=1)
    parser.add_argument("--last-page", type=int)
    return parser.parse_args()


def render(args: argparse.Namespace) -> None:
    source = args.pdf.resolve()
    output = args.output.resolve()
    pages_dir = output / "pages"
    sheets_dir = output / "sheets"
    pages_dir.mkdir(parents=True, exist_ok=True)
    sheets_dir.mkdir(parents=True, exist_ok=True)

    pdf = pdfium.PdfDocument(str(source))
    first = max(1, args.first_page)
    last = min(len(pdf), args.last_page or len(pdf))
    if first > last:
        raise ValueError("first-page must not exceed last-page")

    thumbnails: list[tuple[int, Path, int, int]] = []
    for page_number in range(first, last + 1):
        page = pdf[page_number - 1]
        bitmap = page.render(scale=args.scale)
        image = bitmap.to_pil().convert("RGB")
        page_path = pages_dir / f"page-{page_number:03d}.jpg"
        image.save(page_path, quality=88, optimize=True)
        thumb_height = round(image.height * args.thumb_width / image.width)
        thumbnails.append((page_number, page_path, args.thumb_width, thumb_height))

    cell_width = args.thumb_width + 24
    label_height = 30
    cell_height = max(item[3] for item in thumbnails) + label_height + 20
    per_sheet = args.columns * args.rows
    resample = getattr(Image, "Resampling", Image).LANCZOS

    sheet_records = []
    for offset in range(0, len(thumbnails), per_sheet):
        group = thumbnails[offset : offset + per_sheet]
        sheet = Image.new(
            "RGB", (cell_width * args.columns, cell_height * args.rows), "white"
        )
        draw = ImageDraw.Draw(sheet)
        for index, (page_number, page_path, width, height) in enumerate(group):
            row, column = divmod(index, args.columns)
            x = column * cell_width + 12
            y = row * cell_height + label_height
            page_image = Image.open(page_path).resize((width, height), resample)
            sheet.paste(page_image, (x, y))
            draw.rectangle((x - 1, y - 1, x + width, y + height), outline=(160, 160, 160))
            draw.text((x, 7), f"PDF page {page_number}", fill="black", font=ImageFont.load_default())

        first_number = group[0][0]
        last_number = group[-1][0]
        sheet_path = sheets_dir / f"pages-{first_number:03d}-{last_number:03d}.jpg"
        sheet.save(sheet_path, quality=90, optimize=True)
        sheet_records.append(
            {"file": str(sheet_path), "first_page": first_number, "last_page": last_number}
        )

    manifest = {
        "source_pdf": str(source),
        "page_count": len(pdf),
        "rendered_first_page": first,
        "rendered_last_page": last,
        "thumbnail_count": len(thumbnails),
        "contact_sheets": sheet_records,
    }
    (output / "atlas.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    render(parse_args())
