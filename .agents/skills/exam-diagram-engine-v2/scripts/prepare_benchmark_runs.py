#!/usr/bin/env python3
"""Compile immutable per-case generation prompts from benchmark manifests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def make_prompt(case: dict) -> str:
    objects = "\n".join(f"- {item}." for item in case["required_objects"])
    relations = "\n".join(f"- {item}." for item in case["required_relations"])
    invariants = "\n".join(f"- {item}." for item in case["scientific_invariants"])
    gray = ", ".join(case["allowed_gray_regions"]) or "none"
    mode_text = {
        "reference_image": "Use the supplied synthetic reference as the sole authority for composition, proportions, cropping, object identity, and visible topology. Remove its colored fills, heading, red arrow, letters, and digits. Do not substitute any apparatus.",
        "description_only": "Use no unstated convention. Construct only the minimum closed-world scene described here; add zero conventional accessories.",
        "sketch_plus_description": "Use the supplied rough sketch for panel layout, relative position, orientation, and contacts. Replace rough strokes with clean line art. The edge-extracted sketch may show two close parallel traces for one rough stroke: collapse each duplicate pair to one centerline unless the inventory explicitly defines a tube, wall, or other physically thick object. Use the written requirements for scientific identity and correctness; do not redesign the composition.",
    }[case["input_mode"]]
    subject_note = {
        "physics": "Do not turn alignment, force, motion, or optical constraints into visible guide lines or arrows.",
        "chemistry": "Render any thermometer as a plain unmarked capillary ending in a bulb: zero scale ticks, numerals, pointer, or arrowhead.",
        "biology": "Keep compartments and branches countable; do not replace them with texture or decorative anatomy. Draw each comparison-panel frame and each diaphragm as exactly one stroke, never a close parallel pair.",
        "earth_science": "Keep every layer boundary and contact explicit; do not add terrain texture or atmospheric effects. Draw each section frame and each stratum boundary as exactly one stroke. A volcanic cone is an empty outline unless a conduit or chamber is explicitly listed: zero decorative interior strokes.",
    }[case["subject"]]
    return f"""Use case: scientific-educational
Asset type: label-free Korean KICE assessment science diagram for later 5E editing
Primary request: {case['title']}

Create one clear raster diagram on a pure white background with black 2D linework. {mode_text}

CLOSED OBJECT INVENTORY — preserve exact type and count; zero other objects:
{objects}

REQUIRED PHYSICAL RELATIONS AND TOPOLOGY:
{relations}

SCIENTIFIC HARD INVARIANTS:
{invariants}

Relations and invariants constrain geometry; they are not additional drawable objects. Do not draw an optical axis, guide line, trajectory, force line, or boundary unless it is explicitly listed in the closed inventory.
The phrase "open and separate" requires a visibly open mouth plus a white gap: no stopper, cap, contact, tube entry, or connection at that vessel.

SUBJECT GUARDRAIL:
{subject_note}

STYLE:
- clean black outer contours with slightly thinner black internal lines;
- white interiors by default; uniform flat gray allowed only for: {gray};
- simple front, section, elevation, or restrained oblique assessment drawing;
- preserve relative scale and intentional empty space; leave at least 7% clear outer margin where the input is not intentionally cropped;
- keep repeated-state master geometry identical and vary only stated variables.

ZERO-TOLERANCE:
- zero text, letters, Korean characters, digits, numbers, units, mathematical or chemical symbols, labels, captions, panel markers, watermarks, QR codes, leader lines, empty annotation boxes, arrowheads, arrows, or semantic direction lines;
- no unlisted object, conventional accessory, background context, decoration, realistic lighting, highlight, reflection, shadow, gradient, bloom, texture, stippling, hatching, or excessive 3D perspective;
- do not add, remove, merge, substitute, complete, beautify, or reinterpret scientific objects, categories, contacts, paths, states, or cropped boundaries.
"""


def main() -> int:
    root = Path(__file__).resolve().parents[4]
    benchmark_dir = root / "benchmarks" / "exam-diagram-engine-v2"
    results_dir = root / "results" / "exam-diagram-engine-v2"
    for filename in ("development.json", "final.json"):
        dataset = json.loads((benchmark_dir / filename).read_text(encoding="utf-8"))
        split = dataset["split"]
        for case in dataset["cases"]:
            case_dir = results_dir / split / case["case_id"] / "attempt-01"
            case_dir.mkdir(parents=True, exist_ok=True)
            prompt = make_prompt(case)
            (case_dir.parent / "case.json").write_text(json.dumps(case, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            (case_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
            record = {
                "engine_version": "2.0.0",
                "case_id": case["case_id"],
                "split": split,
                "input_mode": case["input_mode"],
                "subject": case["subject"],
                "source_image": str((benchmark_dir / case["input_asset"]).resolve()) if case.get("input_asset") else None,
                "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
                "prompt": prompt,
            }
            (case_dir / "prompt.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(results_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
