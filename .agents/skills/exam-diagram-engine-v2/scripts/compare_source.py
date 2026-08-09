#!/usr/bin/env python3
"""Measure source preservation outside declared edit and annotation masks."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import cv2
from PIL import Image


def read_json(path: str | Path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path: str | Path, value) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _edges(image: Image.Image, width: int, height: int) -> np.ndarray:
    gray = np.asarray(image.convert("L").resize((width, height), Image.Resampling.LANCZOS), dtype=np.int16)
    horizontal = np.zeros_like(gray)
    vertical = np.zeros_like(gray)
    horizontal[:, 1:] = np.abs(gray[:, 1:] - gray[:, :-1])
    vertical[1:, :] = np.abs(gray[1:, :] - gray[:-1, :])
    gradient = np.maximum(horizontal, vertical)
    return gradient >= 28


def _dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask
    height, width = mask.shape
    padded = np.pad(mask, radius, mode="constant")
    result = np.zeros_like(mask)
    for dy in range(radius * 2 + 1):
        for dx in range(radius * 2 + 1):
            result |= padded[dy:dy + height, dx:dx + width]
    return result


def _region_mask(boxes: list[list[float]], width: int, height: int) -> np.ndarray:
    result = np.zeros((height, width), dtype=bool)
    for x0, y0, x1, y1 in boxes:
        left, top = max(0, round(x0 * width)), max(0, round(y0 * height))
        right, bottom = min(width, round(x1 * width)), min(height, round(y1 * height))
        result[top:bottom, left:right] = True
    return result


def _align_output(source_edges: np.ndarray, output_edges: np.ndarray) -> tuple[np.ndarray, dict]:
    template = _dilate(source_edges, 1).astype(np.float32)
    moving = _dilate(output_edges, 1).astype(np.float32)
    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 150, 1e-6)
    try:
        correlation, warp = cv2.findTransformECC(template, moving, warp, cv2.MOTION_AFFINE, criteria, None, 3)
        raw_warp = warp.copy()
        uniform_scale = float((np.hypot(raw_warp[0, 0], raw_warp[0, 1]) + np.hypot(raw_warp[1, 0], raw_warp[1, 1])) / 2)
        warp = np.array([[uniform_scale, 0, raw_warp[0, 2]], [0, uniform_scale, raw_warp[1, 2]]], dtype=np.float32)
        aligned = cv2.warpAffine(
            output_edges.astype(np.uint8), warp, (source_edges.shape[1], source_edges.shape[0]),
            flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_CONSTANT,
        ).astype(bool)
    except cv2.error:
        correlation = 0.0
        aligned = output_edges
        warp = np.eye(2, 3, dtype=np.float32)
    scale_x = float(np.hypot(warp[0, 0], warp[0, 1]))
    scale_y = float(np.hypot(warp[1, 0], warp[1, 1]))
    shear = float(max(abs(raw_warp[0, 1]), abs(raw_warp[1, 0]))) if 'raw_warp' in locals() else 0.0
    height, width = source_edges.shape
    transform = {
        "ecc_correlation": round(float(correlation), 4),
        "scale_x": round(scale_x, 5),
        "scale_y": round(scale_y, 5),
        "translation_x_fraction": round(float(warp[0, 2]) / width, 5),
        "translation_y_fraction": round(float(warp[1, 2]) / height, 5),
        "shear_or_rotation": round(shear, 5),
    }
    transform["within_limits"] = (
        abs(scale_x - 1) <= 0.06 and abs(scale_y - 1) <= 0.06
        and abs(transform["translation_x_fraction"]) <= 0.05
        and abs(transform["translation_y_fraction"]) <= 0.05
    )
    return aligned, transform


def compare(request: dict, source: Image.Image, output: Image.Image) -> dict:
    spatial = request.get("spatial_contract") or {}
    width = 768
    height = max(1, round(width * source.height / source.width))
    source_edges = _edges(source, width, height)
    output_edges = _edges(output, width, height)
    output_edges, alignment = _align_output(source_edges, output_edges)
    edit_mask = _region_mask(spatial.get("edit_masks", []), width, height)
    annotation_mask = _region_mask(spatial.get("annotation_masks", []), width, height)
    locked = ~(edit_mask | annotation_mask)
    tolerance = max(3, round(width / 128))
    source_dilated = _dilate(source_edges, tolerance)
    output_dilated = _dilate(output_edges, tolerance)
    source_locked = source_edges & locked
    output_locked = output_edges & locked
    precision_den = int(output_locked.sum())
    recall_den = int(source_locked.sum())
    precision = float((output_locked & source_dilated).sum() / precision_den) if precision_den else 0.0
    recall = float((source_locked & output_dilated).sum() / recall_den) if recall_den else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    output_gray = np.asarray(output.convert("L").resize((width, height), Image.Resampling.LANCZOS))
    annotation_pixels = int(annotation_mask.sum())
    annotation_ink = float(((output_gray < 220) & annotation_mask).sum() / annotation_pixels) if annotation_pixels else 0.0
    aspect_delta = abs((source.width / source.height) - (output.width / output.height)) / (source.width / source.height)
    min_f1 = float(spatial.get("minimum_locked_edge_f1", 0.72))
    max_annotation = float(spatial.get("maximum_annotation_ink_fraction", 0.015))
    return {
        "case_id": request.get("case_id"),
        "source_size": [source.width, source.height],
        "output_size": [output.width, output.height],
        "comparison_size": [width, height],
        "locked_edge_precision": round(precision, 4),
        "locked_edge_recall": round(recall, 4),
        "locked_edge_f1": round(f1, 4),
        "minimum_locked_edge_f1": min_f1,
        "annotation_ink_fraction": round(annotation_ink, 6),
        "maximum_annotation_ink_fraction": max_annotation,
        "aspect_ratio_delta": round(aspect_delta, 6),
        "alignment": alignment,
        "passed": f1 >= min_f1 and annotation_ink <= max_annotation and aspect_delta <= 0.01 and alignment["within_limits"],
        "limitations": [
            "edge agreement is supporting evidence and does not prove object identity or scientific correctness",
            "edit and annotation masks must be independently reviewed",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--source")
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--report-only", action="store_true")
    args = parser.parse_args()
    request = read_json(args.request)
    source_path = Path(args.source or request["source_image"])
    with Image.open(source_path) as source, Image.open(args.output) as output:
        report = compare(request, source, output)
    write_json(args.report, report)
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report["passed"] or args.report_only else 1


if __name__ == "__main__":
    raise SystemExit(main())
