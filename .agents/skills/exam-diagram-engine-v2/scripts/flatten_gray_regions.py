#!/usr/bin/env python3
"""Flatten tonal fill only inside explicit physical-region masks."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


def region_mask(boxes, width, height):
    mask = np.zeros((height, width), dtype=np.uint8)
    for x0, y0, x1, y1 in boxes:
        left, top = round(x0 * width), round(y0 * height)
        right, bottom = round(x1 * width), round(y1 * height)
        mask[max(0, top):min(height, bottom), max(0, left):min(width, right)] = 1
    return mask


def flatten(image: Image.Image, specification: dict) -> tuple[Image.Image, dict]:
    rgb = np.asarray(image.convert("RGB")).copy()
    luminance = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    height, width = luminance.shape
    changed = np.zeros_like(luminance, dtype=bool)
    region_reports = []
    for region in specification["regions"]:
        mask = region_mask(region["boxes"], width, height)
        candidates = ((luminance >= 96) & (luminance <= 248) & (mask == 1)).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(candidates, connectivity=8)
        minimum_area = max(64, round(width * height * 0.00035))
        kept_components = []
        flat_value = int(region.get("flat_gray", 210))
        before_values = []
        for label in range(1, count):
            area = int(stats[label, cv2.CC_STAT_AREA])
            if area < minimum_area:
                continue
            component = labels == label
            before_values.extend(luminance[component].tolist())
            rgb[component] = flat_value
            changed |= component
            kept_components.append(area)
        region_reports.append({
            "name": region["name"],
            "kept_component_count": len(kept_components),
            "kept_component_areas": kept_components,
            "before_min": min(before_values) if before_values else None,
            "before_max": max(before_values) if before_values else None,
            "flat_gray": flat_value,
        })
    report = {
        "case_id": specification["case_id"],
        "parent_attempt": specification["parent_attempt"],
        "changed_pixel_count": int(changed.sum()),
        "changed_fraction": round(float(changed.mean()), 6),
        "regions": region_reports,
        "passed_preflight": bool(changed.any()) and all(region["kept_component_count"] >= 1 for region in region_reports),
        "limitation": "This operation changes tonal fill only and cannot repair missing regions, topology, category assignment, or geometry."
    }
    return Image.fromarray(rgb), report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--mask", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    spec = json.loads(Path(args.mask).read_text(encoding="utf-8"))
    with Image.open(args.input) as image:
        output, report = flatten(image, spec)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)
    Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["passed_preflight"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
