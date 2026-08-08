#!/usr/bin/env python3
"""Create project-owned synthetic reference and sketch inputs for the V2 benchmark."""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from build_benchmark import SCENARIOS

W, H = 768, 512


def rough_line(draw, points, fill, width, rng):
    jittered = [(x + rng.randint(-3, 3), y + rng.randint(-3, 3)) for x, y in points]
    draw.line(jittered, fill=fill, width=width, joint="curve")


def vessel(draw, box, fill=None, outline="black", width=5):
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=18, outline=outline, width=width, fill=fill)
    draw.rectangle((x1 + 18, y1 - 20, x2 - 18, y1 + 8), outline=outline, width=width, fill="white")


def spring(draw, x, y1, y2, turns=8, color="black", width=4):
    points = [(x, y1)]
    height = y2 - y1
    for i in range(turns * 2 + 1):
        yy = y1 + height * (i + 1) / (turns * 2 + 2)
        xx = x + (-18 if i % 2 == 0 else 18)
        points.append((xx, yy))
    points.append((x, y2))
    draw.line(points, fill=color, width=width, joint="curve")


def arrow(draw, start, end):
    draw.line((start, end), fill="#d33", width=4)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    for delta in (-0.55, 0.55):
        draw.line((end, (end[0] - 18 * math.cos(angle + delta), end[1] - 18 * math.sin(angle + delta))), fill="#d33", width=4)


def draw_physics(draw, slug):
    if slug == "series-circuit-switch":
        draw.line((150, 150, 315, 150), fill="black", width=6)
        draw.line((370, 150, 610, 150, 610, 365, 150, 365, 150, 325), fill="black", width=6)
        draw.line((150, 285, 150, 150), fill="black", width=6)
        draw.line((315, 150, 355, 118), fill="black", width=6)
        draw.ellipse((515, 278, 605, 368), outline="black", width=6)
        draw.line((535, 300, 585, 350), fill="black", width=4); draw.line((585, 300, 535, 350), fill="black", width=4)
        draw.line((120, 285, 180, 285), fill="black", width=8); draw.line((135, 325, 165, 325), fill="black", width=5)
    elif slug == "incline-fixed-pulley":
        draw.polygon([(95, 390), (430, 390), (430, 175)], outline="black", fill="#e8dcc7")
        draw.rectangle((245, 285, 325, 350), outline="black", width=5, fill="#aaccee")
        draw.ellipse((435, 115, 525, 205), outline="black", width=6, fill="white")
        draw.line((300, 285, 435, 160), fill="black", width=5); draw.arc((435, 115, 525, 205), 180, 360, fill="black", width=5); draw.line((525, 160, 525, 330), fill="black", width=5)
        draw.rectangle((490, 330, 560, 405), outline="black", width=5, fill="#f2c47f")
    elif slug == "lens-screen-apparatus":
        draw.line((80, 370, 690, 370), fill="black", width=5)
        draw.polygon([(125, 315), (165, 335), (125, 355)], outline="black", fill="#f1c75b")
        draw.ellipse((350, 155, 405, 345), outline="black", width=6, fill="#cfe9ee")
        draw.line((378, 345, 378, 370), fill="black", width=6)
        draw.rectangle((575, 150, 600, 345), outline="black", width=6, fill="#ddd")
    elif slug == "spring-two-states":
        draw.line((80, 90, 330, 90), fill="black", width=6); draw.line((438, 90, 688, 90), fill="black", width=6)
        spring(draw, 205, 90, 285); spring(draw, 563, 90, 350)
        draw.rectangle((160, 285, 250, 365), outline="black", width=5, fill="#b8d5a7")
        draw.rectangle((518, 350, 608, 430), outline="black", width=5, fill="#b8d5a7")
        draw.line((384, 60, 384, 455), fill="#999", width=2)
    else:
        for x in range(250, 505, 25):
            draw.arc((x - 18, 180, x + 18, 320), 85, 275, fill="black", width=4)
        draw.line((232, 250, 150, 250, 150, 390, 610, 390, 610, 250, 523, 250), fill="black", width=5)
        draw.line((360, 180, 360, 125), fill="black", width=4); draw.ellipse((315, 70, 405, 160), outline="black", width=5, fill="white"); draw.line((335, 115, 385, 115), fill="black", width=5)
        draw.line((285, 372, 285, 410), fill="black", width=5); draw.line((315, 360, 315, 422), fill="black", width=8)


def draw_chemistry(draw, slug):
    if slug == "simple-distillation":
        draw.ellipse((110, 220, 290, 400), outline="black", width=6, fill="#cfe6f4")
        draw.rectangle((175, 145, 225, 250), outline="black", width=6, fill="white")
        draw.line((215, 155, 215, 285), fill="black", width=4)
        draw.line((225, 180, 485, 180, 485, 300), fill="black", width=6)
        vessel(draw, (450, 300, 590, 420), fill="#e7f2fa")
        draw.rectangle((125, 405, 275, 440), outline="black", width=5, fill="#f0b37e")
    elif slug == "separatory-funnel":
        # A closed pear-shaped separatory funnel: stopper, two bounded liquid
        # layers, stopcock, outlet stem, support clamp, and receiving beaker.
        outline = [(365, 100), (410, 100), (410, 130), (447, 175), (452, 225),
                   (440, 285), (405, 345), (370, 345), (335, 285), (323, 225),
                   (328, 175), (365, 130)]
        draw.polygon(outline, outline="black", fill="white")
        draw.rectangle((358, 72, 417, 103), outline="black", width=5, fill="white")
        draw.polygon([(326, 210), (450, 210), (444, 250), (332, 250)], fill="#e8eef2")
        draw.polygon([(332, 250), (444, 250), (438, 283), (402, 340), (373, 340), (338, 283)], fill="#a7cde3")
        draw.line((326, 210, 450, 210), fill="black", width=4)
        draw.line((332, 250, 444, 250), fill="black", width=4)
        draw.line((387, 345, 387, 410), fill="black", width=6)
        draw.line((350, 354, 425, 354), fill="black", width=6)
        draw.line((520, 80, 520, 430), fill="black", width=6)
        draw.line((448, 165, 520, 165), fill="black", width=5)
        vessel(draw, (320, 405, 465, 485), fill=None)
    elif slug == "gas-over-water":
        draw.ellipse((70, 250, 220, 405), outline="black", width=6, fill="#f5d3c4"); draw.rectangle((125, 205, 165, 270), outline="black", width=5, fill="white")
        draw.line((165, 225, 340, 225, 340, 360, 455, 360), fill="black", width=5)
        draw.rectangle((300, 300, 680, 445), outline="black", width=6, fill="#b9def0")
        draw.rectangle((430, 170, 570, 405), fill="#eaf7fc")
        draw.line((430, 405, 430, 170, 570, 170, 570, 405), fill="black", width=6)
    elif slug == "particle-two-states":
        for ox in (70, 410):
            draw.rectangle((ox, 100, ox + 285, 410), outline="black", width=5)
            for i in range(6):
                x = ox + 45 + (i % 3) * 80; y = 160 + (i // 3) * 150
                draw.ellipse((x - 18, y - 18, x + 18, y + 18), outline="black", width=4, fill="#a8cbea")
            for i in range(4):
                x = ox + 85 + (i % 2) * 120; y = 235 + (i // 2) * 120
                draw.polygon([(x, y - 20), (x + 20, y), (x, y + 20), (x - 20, y)], outline="black", fill="#e8b08d")
    else:
        vessel(draw, (245, 170, 520, 410), fill="#bfdcec")
        draw.rectangle((300, 95, 325, 330), outline="black", width=5, fill="#bbb"); draw.rectangle((440, 95, 465, 330), outline="black", width=5, fill="#bbb")
        draw.line((312, 95, 312, 65, 155, 65, 155, 390), fill="black", width=5); draw.line((452, 95, 452, 65, 610, 65, 610, 390), fill="black", width=5)
        draw.line((555, 365, 555, 415), fill="black", width=5); draw.line((580, 350, 580, 430), fill="black", width=8)


def draw_biology(draw, slug):
    if slug == "heart-four-chambers":
        draw.ellipse((235, 85, 535, 430), outline="black", width=7, fill="#f2d4d4")
        draw.line((385, 175, 385, 410), fill="black", width=6); draw.line((250, 235, 520, 235), fill="black", width=5)
        draw.arc((210, 20, 360, 210), 250, 60, fill="black", width=6); draw.arc((410, 20, 560, 210), 120, 290, fill="black", width=6)
        draw.line((290, 115, 250, 45), fill="black", width=6); draw.line((480, 115, 520, 45), fill="black", width=6)
    elif slug == "nephron-path":
        draw.ellipse((110, 150, 260, 300), outline="black", width=6, fill="#efd1d8")
        points = [(235, 230), (330, 165), (420, 250), (330, 340), (460, 405), (560, 330), (560, 105)]
        draw.line(points, fill="black", width=9, joint="curve")
        draw.line((145, 145, 80, 95), fill="#a54", width=7); draw.line((165, 300, 90, 370), fill="#4575b4", width=7)
    elif slug == "lungs-two-states":
        for ox, scale in ((55, 1.0), (410, 0.82)):
            draw.rectangle((ox, 75, ox + 300, 440), outline="#aaa", width=3)
            draw.line((ox + 150, 90, ox + 150, 185), fill="black", width=6)
            draw.line((ox + 150, 165, ox + 105, 210), fill="black", width=5); draw.line((ox + 150, 165, ox + 195, 210), fill="black", width=5)
            draw.ellipse((ox + 55, 175, ox + 145, 175 + 190 * scale), outline="black", width=6, fill="#d7d7d7")
            draw.ellipse((ox + 155, 175, ox + 245, 175 + 190 * scale), outline="black", width=6, fill="#d7d7d7")
            draw.arc((ox + 45, 310, ox + 255, 430), 190, 350, fill="black", width=6)
    elif slug == "plant-stem-transport":
        draw.line((380, 400, 380, 125), fill="black", width=16)
        for y, side in ((165, -1), (240, 1), (315, -1)):
            draw.line((380, y, 380 + side * 100, y - 45), fill="black", width=7); draw.ellipse((210 if side < 0 else 430, y - 100, 340 if side < 0 else 560, y - 20), outline="black", width=5, fill="#cde6c0")
        draw.line((370, 390, 300, 475), fill="black", width=7); draw.line((390, 390, 470, 475), fill="black", width=7)
        draw.line((370, 445, 370, 145), fill="#5676b8", width=4); draw.line((392, 445, 392, 145), fill="#b35d4d", width=4)
    else:
        draw.ellipse((145, 55, 625, 455), outline="black", width=6)
        centers = [(280, 185), (490, 185), (280, 335), (490, 335)]
        for i, (x, y) in enumerate(centers):
            color = "#bbb" if i >= 2 else "white"
            draw.line((x - 30, y - 55, x + 30, y + 55), fill="black", width=9); draw.line((x + 30, y - 55, x - 30, y + 55), fill="black", width=9)
            draw.ellipse((x - 9, y - 9 + (12 if i % 2 else -12), x + 9, y + 9 + (12 if i % 2 else -12)), fill=color, outline="black", width=3)


def draw_earth(draw, slug):
    if slug == "volcano-cross-section":
        draw.polygon([(90, 405), (320, 120), (390, 90), (455, 125), (690, 405)], outline="black", fill="#ddd2bf")
        for y in (290, 335, 375): draw.line((120 + (405-y)//2, y, 655 - (405-y)//2, y), fill="black", width=4)
        draw.line((385, 110, 385, 350), fill="#b44", width=24); draw.ellipse((300, 340, 470, 440), outline="black", width=5, fill="#b44")
    elif slug == "subduction-boundary":
        draw.rectangle((40, 65, 730, 450), outline="black", width=5, fill="#e5d7bd")
        draw.polygon([(40, 190), (330, 190), (650, 420), (570, 445), (310, 245), (40, 245)], outline="black", fill="#9ec5de")
        draw.polygon([(330, 190), (730, 150), (730, 260), (390, 255)], outline="black", fill="#c9b18a")
        draw.polygon([(510, 150), (565, 70), (620, 150)], outline="black", fill="#caa17a")
    elif slug == "faulted-strata":
        colors = ["#ead8b5", "#b9d4e5", "#d9c3dc", "#c9dfb2"]
        def fault_edges(y):
            center = 390 - (98 * (y - 65) / 390)
            return center - 33, center + 33
        for i, color in enumerate(colors):
            y1 = 90 + i * 85; y2 = y1 + 85
            left_top, _ = fault_edges(y1)
            left_bottom, _ = fault_edges(y2)
            draw.polygon([(70, y1), (left_top, y1), (left_bottom, y2), (70, y2)], outline="black", fill=color)
            # The right block is displaced downward by one constant amount for
            # every layer, making the fault relation testable rather than decorative.
            ry1, ry2 = y1 + 35, y2 + 35
            _, right_top = fault_edges(ry1)
            _, right_bottom = fault_edges(ry2)
            draw.polygon([(right_top, ry1), (680, ry1), (680, ry2), (right_bottom, ry2)], outline="black", fill=color)
        draw.polygon([(360, 65), (425, 65), (325, 455), (260, 455)], fill="white", outline="black")
        draw.line((390, 65, 292, 455), fill="#b44", width=5)
    elif slug == "eclipse-alignment":
        draw.ellipse((60, 130, 270, 340), outline="black", width=6, fill="#f0cb55")
        draw.ellipse((350, 185, 490, 325), outline="black", width=6, fill="#7db6d8")
        draw.ellipse((600, 220, 670, 290), outline="black", width=5, fill="#bbb")
    else:
        draw.polygon([(35, 95), (220, 310), (310, 355), (385, 420), (465, 355), (555, 310), (730, 95), (730, 460), (35, 460)], outline="black", fill="#d6c3a1")
        draw.polygon([(310, 355), (385, 420), (465, 355), (440, 390), (385, 440), (330, 390)], outline="black", fill="#8ec7e8")
        for x in (340, 365, 390, 415, 440, 455): draw.ellipse((x - 9, 398, x + 9, 416), outline="black", width=3, fill="#aaa")


def render(subject, scenario, out_path, sketch=False):
    image = Image.new("RGB", (W, H), "white")
    draw = ImageDraw.Draw(image)
    slug = scenario["slug"]
    {"physics": draw_physics, "chemistry": draw_chemistry, "biology": draw_biology, "earth_science": draw_earth}[subject](draw, slug)
    if sketch:
        # Convert semantic color regions into rough boundary strokes. A direct
        # grayscale threshold collapses adjacent colored regions into one black
        # mass and destroys the very topology the sketch mode must preserve.
        edges = image.filter(ImageFilter.FIND_EDGES).convert("L")
        grayscale = edges.point(lambda p: 55 if p > 18 else 255)
        image = Image.merge("RGB", (grayscale, grayscale, grayscale))
        rng = random.Random(f"{subject}:{slug}")
        overlay = ImageDraw.Draw(image)
        for _ in range(10):
            x1, y1 = rng.randint(60, 680), rng.randint(70, 430)
            rough_line(overlay, [(x1, y1), (x1 + rng.randint(-25, 25), y1 + rng.randint(-25, 25))], "#777", 2, rng)
        overlay.text((22, 18), "rough sketch", fill="#777")
    else:
        draw = ImageDraw.Draw(image)
        draw.text((22, 18), f"SOURCE {scenario['title']}", fill="#444")
        arrow(draw, (90, 55), (175, 90))
        draw.text((650, 465), "A 1", fill="#d33")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path)


def main() -> int:
    root = Path(__file__).resolve().parents[4]
    benchmark = root / "benchmarks" / "exam-diagram-engine-v2" / "inputs"
    for subject, scenarios in SCENARIOS.items():
        for scenario in scenarios:
            render(subject, scenario, benchmark / "reference" / subject / f"{scenario['slug']}.png", sketch=False)
            render(subject, scenario, benchmark / "sketch" / subject / f"{scenario['slug']}.png", sketch=True)
    print(benchmark)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
