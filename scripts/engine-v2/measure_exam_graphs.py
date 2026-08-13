#!/usr/bin/env python3
"""Propose graph geometry from the real exam PNGs without marking anything verified.

The output is evidence for fixture authors: axis-aligned graph boxes, aspect ratios,
line/grid candidates and possible point markers. Every proposal still requires a
human-confirmed GraphSpec fixture before the strict audit accepts the panel.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "docs" / "engine-v2" / "graph-validation-manifest.jsonl"
DEFAULT_OUTPUT = ROOT / "_repro" / "exam-graph-measurements" / "proposals.jsonl"


def read_rows():
    return [json.loads(line) for line in MANIFEST.read_text(encoding="utf-8").splitlines() if line]


def iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1, ix2, iy2 = max(ax1, bx1), max(ay1, by1), min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union else 0


def axis_candidates(gray):
    h, w = gray.shape
    ink = cv2.threshold(gray, 125, 255, cv2.THRESH_BINARY_INV)[1]
    lines = cv2.HoughLinesP(ink, 1, np.pi / 180, threshold=max(18, min(w, h) // 14),
                            minLineLength=max(18, min(w, h) // 8), maxLineGap=6)
    horizontal, vertical = [], []
    for raw in [] if lines is None else np.asarray(lines).reshape(-1, 4):
        x1, y1, x2, y2 = map(int, raw)
        dx, dy = abs(x2 - x1), abs(y2 - y1)
        if dx >= max(20, w * 0.18) and dy <= max(3, dx * 0.035):
            horizontal.append((min(x1, x2), int(round((y1 + y2) / 2)), max(x1, x2)))
        elif dy >= max(20, h * 0.16) and dx <= max(3, dy * 0.035):
            vertical.append((int(round((x1 + x2) / 2)), min(y1, y2), max(y1, y2)))

    def merge_segments(segments, vertical_axis):
        # Axis shafts are often split by a gray band, label halo or arrowhead.
        # Merge nearly collinear runs before pairing x/y axes.
        normalized = []
        for segment in segments:
            if vertical_axis:
                coord, start, end = segment
            else:
                start, coord, end = segment
            merged = False
            for row in normalized:
                if abs(row[0] - coord) <= 3 and start <= row[2] + max(12, (h if vertical_axis else w) * 0.15) and end >= row[1] - 4:
                    row[0] = round((row[0] + coord) / 2); row[1] = min(row[1], start); row[2] = max(row[2], end)
                    merged = True; break
            if not merged:
                normalized.append([coord, start, end])
        return [(row[0], row[1], row[2]) if vertical_axis else (row[1], row[0], row[2]) for row in normalized]

    horizontal = merge_segments(horizontal, False)
    vertical = merge_segments(vertical, True)
    proposals = []
    # 평가원 축은 화살촉·원점 라벨·ㄴ자 여백 때문에 Hough 선분 끝이 실제
    # 교점에서 10~25 px 끊겨 잡히기도 한다. 후보 생성 단계에서는 넉넉히 허용하고
    # score와 fixture 육안 검증에서 거짓 후보를 제거한다.
    tol = max(9, round(min(w, h) * 0.07))
    for hx1, hy, hx2 in horizontal:
        for vx, vy1, vy2 in vertical:
            if abs(hx1 - vx) > tol or abs(vy2 - hy) > tol:
                continue
            if hx2 - vx < w * 0.2 or hy - vy1 < h * 0.14:
                continue
            box = (max(0, vx), max(0, vy1), min(w - 1, hx2), min(h - 1, hy))
            bw, bh = box[2] - box[0], box[3] - box[1]
            score = (bw / w) + (bh / h) - abs(hx1 - vx) / tol - abs(vy2 - hy) / tol
            proposals.append({"box": box, "score": round(float(score), 5)})
    proposals.sort(key=lambda p: p["score"], reverse=True)
    kept = []
    for proposal in proposals:
        if all(iou(proposal["box"], other["box"]) < 0.72 for other in kept):
            kept.append(proposal)
    return ink, kept[:12]


def interior_measurements(ink, box):
    x1, y1, x2, y2 = box
    roi = ink[y1:y2 + 1, x1:x2 + 1]
    h, w = roi.shape
    if h < 4 or w < 4:
        return {"gridVertical": 0, "gridHorizontal": 0, "pointCandidates": []}
    vertical_density = (roi > 0).mean(axis=0)
    horizontal_density = (roi > 0).mean(axis=1)
    grid_v = int(np.count_nonzero(vertical_density[2:-2] > 0.55))
    grid_h = int(np.count_nonzero(horizontal_density[2:-2] > 0.55))

    count, labels, stats, centroids = cv2.connectedComponentsWithStats(roi, 8)
    points = []
    for idx in range(1, count):
        sx, sy, sw, sh, area = stats[idx]
        if not (4 <= area <= 100 and 2 <= sw <= 14 and 2 <= sh <= 14):
            continue
        ratio = sw / sh
        if 0.55 <= ratio <= 1.8:
            cx, cy = centroids[idx]
            points.append([round((x1 + cx) / ink.shape[1], 6), round((y1 + cy) / ink.shape[0], 6)])
    return {"gridVerticalPixels": grid_v, "gridHorizontalPixels": grid_h, "pointCandidates": points[:80]}


def choose_for_panels(candidates, count):
    chosen = []
    for candidate in candidates:
        if all(iou(candidate["box"], prior["box"]) < 0.25 for prior in chosen):
            chosen.append(candidate)
        if len(chosen) == count:
            break
    return sorted(chosen, key=lambda p: (p["box"][1], p["box"][0]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--overlay-limit", type=int, default=24)
    args = parser.parse_args()
    rows = read_rows()
    grouped = {}
    for row in rows:
        grouped.setdefault(row["source"], []).append(row)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    overlay_dir = args.output.parent / "overlays"
    overlay_dir.mkdir(parents=True, exist_ok=True)
    results, proposed = [], 0
    for source_index, (source, source_rows) in enumerate(sorted(grouped.items())):
        image_path = ROOT / source
        gray = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            raise RuntimeError(f"Cannot read {source}")
        ink, candidates = axis_candidates(gray)
        chosen = choose_for_panels(candidates, len(source_rows))
        canvas = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        for panel_index, row in enumerate(sorted(source_rows, key=lambda r: r["panelIndex"])):
            candidate = chosen[panel_index] if panel_index < len(chosen) else None
            record = {"schema": "5e-exam-graph-measurement@1", "id": row["id"], "source": source,
                      "status": "proposed" if candidate else "manual_required"}
            if candidate:
                proposed += 1
                x1, y1, x2, y2 = candidate["box"]
                h, w = gray.shape
                record.update({
                    "axisBoxPixels": [x1, y1, x2 - x1, y2 - y1],
                    "axisBoxNormalized": [round(x1 / w, 6), round(y1 / h, 6), round((x2 - x1) / w, 6), round((y2 - y1) / h, 6)],
                    "aspectRatio": round((x2 - x1) / max(1, y2 - y1), 6), "score": candidate["score"],
                    **interior_measurements(ink, candidate["box"]),
                })
                cv2.rectangle(canvas, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(canvas, str(row["panelIndex"]), (x1 + 3, y1 + 15), cv2.FONT_HERSHEY_SIMPLEX, .5, (0, 0, 255), 1)
            results.append(record)
        if source_index < args.overlay_limit:
            cv2.imwrite(str(overlay_dir / Path(source).name), canvas)
    args.output.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in results) + "\n", encoding="utf-8")
    print(f"Exam graph measurements: {proposed}/{len(rows)} axis boxes proposed; {len(rows)-proposed} require manual measurement")
    print(f"Output: {args.output.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
