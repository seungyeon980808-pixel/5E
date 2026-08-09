"""Normalize generated scientific artwork to a small grayscale print palette.

This is a deterministic finishing step for image-model output.  It removes
residual colour, near-white shadows, and smooth gradients while preserving the
geometry and alpha channel of the source image.

Examples
--------
    python tools/normalize-exam-lineart.py input.png output.png
    python tools/normalize-exam-lineart.py input-dir output-dir --recursive
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image


DEFAULT_PALETTE = (0, 176, 255)
SUPPORTED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}


def parse_palette(value: str) -> tuple[int, ...]:
    try:
        palette = tuple(sorted({int(item.strip()) for item in value.split(",")}))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("palette must contain integers") from exc
    if len(palette) < 2 or palette[0] < 0 or palette[-1] > 255:
        raise argparse.ArgumentTypeError("palette must contain 2+ values from 0 to 255")
    if 0 not in palette or 255 not in palette:
        raise argparse.ArgumentTypeError("palette must include black (0) and white (255)")
    return palette


def luminance(rgb: np.ndarray) -> np.ndarray:
    """Return perceptual grayscale without retaining source colour casts."""
    weighted = (
        rgb[..., 0].astype(np.float32) * 0.2126
        + rgb[..., 1].astype(np.float32) * 0.7152
        + rgb[..., 2].astype(np.float32) * 0.0722
    )
    return np.rint(weighted).astype(np.uint8)


def quantize(gray: np.ndarray, palette: tuple[int, ...], white_cutoff: int) -> np.ndarray:
    """Map every pixel to the nearest fixed tone, forcing paper shadows white."""
    values = np.asarray(palette, dtype=np.int16)
    work = gray.astype(np.int16)
    indices = np.abs(work[..., None] - values).argmin(axis=2)
    result = values[indices].astype(np.uint8)
    result[gray >= white_cutoff] = 255
    return result


def normalize_image(
    source: Path,
    destination: Path,
    palette: tuple[int, ...] = DEFAULT_PALETTE,
    white_cutoff: int = 242,
) -> dict[str, float | int | str]:
    image = Image.open(source).convert("RGBA")
    data = np.asarray(image)
    gray = luminance(data[..., :3])
    normalized = quantize(gray, palette, white_cutoff)

    rgba = np.empty_like(data)
    rgba[..., 0] = normalized
    rgba[..., 1] = normalized
    rgba[..., 2] = normalized
    rgba[..., 3] = data[..., 3]

    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(destination, optimize=True)

    opaque = data[..., 3] > 0
    source_gray = gray[opaque]
    output_gray = normalized[opaque]
    return {
        "source": str(source),
        "destination": str(destination),
        "source_gray_levels": int(np.unique(source_gray).size),
        "output_gray_levels": int(np.unique(output_gray).size),
        "source_nonwhite_percent": round(float((source_gray < 248).mean() * 100), 2),
        "output_nonwhite_percent": round(float((output_gray < 248).mean() * 100), 2),
    }


def iter_images(source: Path, recursive: bool) -> Iterable[Path]:
    iterator = source.rglob("*") if recursive else source.glob("*")
    return (path for path in iterator if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES)


def build_jobs(source: Path, destination: Path, recursive: bool) -> list[tuple[Path, Path]]:
    if source.is_file():
        return [(source, destination)]
    jobs = []
    for path in iter_images(source, recursive):
        relative = path.relative_to(source)
        jobs.append((path, destination / relative.with_suffix(".png")))
    return jobs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--recursive", action="store_true")
    parser.add_argument("--palette", type=parse_palette, default=DEFAULT_PALETTE)
    parser.add_argument("--white-cutoff", type=int, default=242)
    args = parser.parse_args()

    if not args.source.exists():
        parser.error(f"source does not exist: {args.source}")
    if not 0 <= args.white_cutoff <= 255:
        parser.error("--white-cutoff must be between 0 and 255")

    jobs = build_jobs(args.source, args.destination, args.recursive)
    if not jobs:
        parser.error("no supported images found")

    for source, destination in jobs:
        stats = normalize_image(source, destination, args.palette, args.white_cutoff)
        print(
            f"{source.name}: gray {stats['source_gray_levels']} -> "
            f"{stats['output_gray_levels']}, nonwhite "
            f"{stats['source_nonwhite_percent']}% -> {stats['output_nonwhite_percent']}%"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
