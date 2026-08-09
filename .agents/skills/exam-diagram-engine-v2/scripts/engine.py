#!/usr/bin/env python3
"""Compile, inspect, score, and summarize KICE-style science-diagram runs."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ENGINE_VERSION = "2.0.0"
INPUT_MODES = {"reference_image", "description_only", "sketch_plus_description"}
SUBJECTS = {"physics", "chemistry", "biology", "earth_science"}
FORBIDDEN_DEFAULTS = [
    "text", "letters", "korean_characters", "digits", "mathematical_symbols",
    "labels", "captions", "leader_lines", "arrowheads", "direction_arrows",
    "watermarks", "qr_codes", "empty_annotation_boxes", "decorative_context",
]
SCORE_MAX = {
    "core_structure": 25,
    "scientific_accuracy": 20,
    "proportion_layout": 15,
    "kice_lineart": 15,
    "restrained_gray": 10,
    "no_forbidden_marks": 10,
    "editability": 5,
}
FAILURE_TAGS = {
    "STRUCTURE_LOSS", "SCIENCE_ERROR", "TOPOLOGY_LOSS", "CATEGORY_ENCODING",
    "RATIO_LAYOUT", "OVER_SHADE", "3DIFICATION", "EXTRA_TEXT_SYMBOL",
    "EXTRA_CONTEXT", "EDIT_UNSUITABLE", "BENCHMARK_DEFECT",
    "CATEGORY_COLLAPSE", "TEXT_RESIDUE", "MODEL_VARIANCE",
}


def read_json(path: str | Path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path: str | Path, value) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_json(value) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def validate_request(request: dict) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    required = [
        "case_id", "input_mode", "subject", "description", "objects", "connections",
        "layout", "scientific_invariants", "allowed_gray_regions", "category_encoding", "forbidden",
    ]
    for key in required:
        if key not in request:
            errors.append(f"missing required field: {key}")
    if errors:
        return errors, warnings
    mode = request["input_mode"]
    if mode not in INPUT_MODES:
        errors.append(f"invalid input_mode: {mode}")
    if request["subject"] not in SUBJECTS:
        errors.append(f"invalid subject: {request['subject']}")
    objects = request.get("objects", [])
    if not objects:
        errors.append("objects must not be empty")
    ids: list[str] = []
    panel_count = request.get("layout", {}).get("panel_count", 0)
    for index, obj in enumerate(objects):
        oid = obj.get("id")
        if not oid:
            errors.append(f"objects[{index}] has no id")
            continue
        ids.append(oid)
        if not isinstance(obj.get("count"), int) or obj.get("count", 0) < 1:
            errors.append(f"object {oid} has invalid count")
        bbox = obj.get("bbox")
        if not isinstance(bbox, list) or len(bbox) != 4 or any(not isinstance(v, (int, float)) or v < 0 or v > 1 for v in (bbox or [])):
            errors.append(f"object {oid} bbox must be four normalized numbers")
        elif bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            errors.append(f"object {oid} bbox must satisfy left < right and top < bottom")
        if not isinstance(obj.get("panel"), int) or not 1 <= obj.get("panel", 0) <= panel_count:
            errors.append(f"object {oid} refers to an invalid panel")
    duplicates = [oid for oid, count in Counter(ids).items() if count > 1]
    if duplicates:
        errors.append("duplicate object ids: " + ", ".join(sorted(duplicates)))
    id_set = set(ids)
    terminal_map = {obj.get("id"): set(obj.get("terminals", [])) for obj in objects}
    for index, edge in enumerate(request.get("connections", [])):
        if edge.get("from") not in id_set or edge.get("to") not in id_set:
            errors.append(f"connections[{index}] refers to an unknown object")
        if edge.get("from") == edge.get("to"):
            warnings.append(f"connections[{index}] is a self-edge; verify it is intentional")
        for side in ("from", "to"):
            terminal = edge.get(f"{side}_terminal")
            object_id = edge.get(side)
            if terminal and terminal not in terminal_map.get(object_id, set()):
                errors.append(f"connections[{index}] refers to unknown terminal {object_id}.{terminal}")
    sources = request.get("source_images", [])
    roles = [source.get("role") for source in sources if isinstance(source, dict)]
    if mode == "reference_image" and "full_composition" not in roles:
        errors.append("reference_image mode requires a full_composition source image")
    if mode == "sketch_plus_description" and "sketch" not in roles:
        errors.append("sketch_plus_description mode requires a sketch source image")
    if mode == "sketch_plus_description" and "conflict_resolutions" not in request:
        errors.append("sketch_plus_description mode requires conflict_resolutions")
    for ambiguity in request.get("ambiguities", []):
        if ambiguity.get("severity") == "critical" and ambiguity.get("status") != "resolved":
            errors.append("unresolved critical ambiguity: " + ambiguity.get("question", "(missing question)"))
    encodings = [item.get("encoding") for item in request.get("category_encoding", [])]
    categories = [item.get("category") for item in request.get("category_encoding", [])]
    if len(categories) != len(set(categories)):
        errors.append("category names must be unique")
    if len(encodings) != len(set(encodings)):
        errors.append("each scientific category must use a unique monochrome encoding")
    forbidden = set(request.get("forbidden", []))
    missing_forbidden = [item for item in FORBIDDEN_DEFAULTS if item not in forbidden]
    if missing_forbidden:
        warnings.append("compiler added mandatory forbidden items: " + ", ".join(missing_forbidden))
    if not request.get("scientific_invariants"):
        errors.append("at least one scientific invariant is required")
    margin = request.get("layout", {}).get("minimum_margin_fraction", 0.06)
    if margin < 0.06:
        warnings.append("minimum margin below recommended 6%")
    return errors, warnings


def normalize_request(request: dict) -> dict:
    result = json.loads(json.dumps(request, ensure_ascii=False))
    result["forbidden"] = sorted(set(result.get("forbidden", [])) | set(FORBIDDEN_DEFAULTS))
    result.setdefault("source_images", [])
    result.setdefault("state_variables", [])
    result.setdefault("ambiguities", [])
    result.setdefault("conflict_resolutions", [])
    result["layout"].setdefault("minimum_margin_fraction", 0.06)
    result["layout"].setdefault("overlap_order", [])
    return result


def _object_line(obj: dict) -> str:
    bbox = ", ".join(f"{float(v):.3f}" for v in obj["bbox"])
    details = "; ".join(obj.get("details", [])) or "no extra detail"
    crop = ", ".join(obj.get("cropped_edges", [])) or "none"
    terminals = ", ".join(obj.get("terminals", [])) or "none"
    return f"- {obj['id']}: {obj['kind']}; exact count {obj['count']}; panel {obj['panel']}; bbox [{bbox}]; cropped edges {crop}; named terminals {terminals}; {details}."


def compile_prompt(request: dict) -> str:
    objects = "\n".join(_object_line(obj) for obj in request["objects"])
    if request["connections"]:
        connections = "\n".join(
            f"- {edge['from']}" + (f".{edge['from_terminal']}" if edge.get("from_terminal") else "")
            + f" -> {edge['to']}" + (f".{edge['to_terminal']}" if edge.get("to_terminal") else "")
            + f": {edge['kind']}" + (f"; {edge['details']}" if edge.get("details") else "") + "."
            for edge in request["connections"]
        )
    else:
        connections = "- No physical connection edges. Keep separate objects visibly separate."
    invariants = "\n".join(f"- {item}" for item in request["scientific_invariants"])
    categories = "\n".join(
        f"- {item['category']}: {item['encoding']}" for item in request["category_encoding"]
    ) or "- No category encoding beyond black outlines and white interiors."
    gray = ", ".join(request["allowed_gray_regions"]) or "none"
    empties = "; ".join(request["layout"]["empty_regions"]) or "no additional declared empty region"
    forbidden = ", ".join(request["forbidden"])
    mode_instruction = {
        "reference_image": "Transform the provided full-composition reference faithfully. The reference is the sole authority for visible composition and structure. Do not substitute a familiar apparatus.",
        "description_only": "Construct only the minimum closed-world scene specified below. Do not add conventional accessories or implied laboratory context.",
        "sketch_plus_description": "Clean the sketch into precise line art. Preserve its resolved panel layout and geometry; use the description only for the recorded scientific meaning and explicit conflict resolutions. Collapse close parallel edge-extraction duplicates to one centerline unless the inventory explicitly defines a tube, wall, or other physically thick object.",
    }[request["input_mode"]]
    subject_note = {
        "physics": "Do not turn alignment, force, motion, or optical constraints into visible guide lines or arrows.",
        "chemistry": "Render any thermometer as a plain unmarked capillary ending in a bulb: zero scale ticks, numerals, pointer, or arrowhead.",
        "biology": "Keep compartments and branches countable; do not replace them with texture or decorative anatomy. Draw each comparison-panel frame and each diaphragm as exactly one stroke, never a close parallel pair.",
        "earth_science": "Keep every layer boundary and contact explicit; do not add terrain texture or atmospheric effects. Draw each section frame and each stratum boundary as exactly one stroke. A volcanic cone is an empty outline unless a conduit or chamber is explicitly listed: zero decorative interior strokes.",
    }[request["subject"]]
    return f"""Use case: scientific-educational
Asset type: label-free Korean KICE assessment science diagram for later editing in 5E
Primary request: {request['description']}

ROLE AND OUTPUT
Create one clean raster diagram on a pure white background using black 2D linework. {mode_instruction}

CLOSED OBJECT INVENTORY
{objects}
The inventory is closed: zero objects outside this list.

TOPOLOGY AND CONTACTS
{connections}
Preserve every listed endpoint, branch, terminal, crossing/non-connection, containment, support, and contact exactly.
Treat relations and invariants as constraints, not extra drawable objects. Do not draw an optical axis, guide line, trajectory, force line, or boundary unless it is explicitly listed in the closed inventory.
The phrase "open and separate" requires a visibly open mouth plus a white gap: no stopper, cap, contact, tube entry, or connection at that vessel.

SUBJECT GUARDRAIL
{subject_note}

LAYOUT
- Canvas: {request['layout']['canvas']}; exact panel count {request['layout']['panel_count']}.
- Preserve all normalized bounding boxes, crop edges, relative scale, overlap order, and asymmetry.
- Keep at least {request['layout']['minimum_margin_fraction']:.0%} clear margin except at declared cropped edges.
- Intentional empty regions: {empties}. Do not fill them or enlarge nearby objects into them.

SCIENTIFIC INVARIANTS
{invariants}

CATEGORY MAP
{categories}
Every category must remain visually distinct using only its declared encoding.

STYLE
- Pure white background; clean black outer contours; slightly thinner black internal structure lines.
- White interiors by default. Uniform flat gray is allowed only in: {gray}.
- Orthographic, section, elevation, or restrained oblique assessment drawing; no realistic product rendering.
- Leave clear whitespace for labels and supplementary marks to be added later in 5E.

ZERO-TOLERANCE NEGATIVES
- Generate exactly zero of: {forbidden}.
- No realistic lighting, highlights, reflections, shadows, gradients, bloom, photographic texture, decorative stippling, hatching, or excessive 3D perspective.
- Do not add, remove, merge, substitute, complete, beautify, or reinterpret any scientific object, path, state, or cropped boundary.
"""


def command_compile(args) -> int:
    raw = read_json(args.request)
    normalized = normalize_request(raw)
    errors, warnings = validate_request(normalized)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    preflight = {
        "engine_version": ENGINE_VERSION,
        "case_id": raw.get("case_id"),
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "request_sha256": sha256_json(normalized),
    }
    write_json(out_dir / "preflight.json", preflight)
    write_json(out_dir / "structure.json", normalized)
    if errors:
        print("preflight failed", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 2
    prompt = compile_prompt(normalized)
    (out_dir / "prompt.txt").write_text(prompt, encoding="utf-8")
    prompt_record = {
        "engine_version": ENGINE_VERSION,
        "case_id": normalized["case_id"],
        "input_mode": normalized["input_mode"],
        "subject": normalized["subject"],
        "request_sha256": sha256_json(normalized),
        "prompt_sha256": hashlib.sha256(prompt.encode("utf-8")).hexdigest(),
        "prompt": prompt,
        "compiled_at": datetime.now(timezone.utc).isoformat(),
    }
    write_json(out_dir / "prompt.json", prompt_record)
    print(out_dir / "prompt.txt")
    return 0


def command_score(args) -> int:
    evaluation = read_json(args.evaluation)
    errors: list[str] = []
    scores = evaluation.get("scores", {})
    for key, maximum in SCORE_MAX.items():
        value = scores.get(key)
        if not isinstance(value, (int, float)) or math.isnan(value) or value < 0 or value > maximum:
            errors.append(f"score {key} must be between 0 and {maximum}")
    gates = evaluation.get("hard_gates", {})
    gate_keys = ["severe_science_error", "forbidden_mark_count", "unlisted_object_count", "critical_structure_broken", "category_encoding_valid"]
    for key in gate_keys:
        if key not in gates:
            errors.append(f"missing hard gate: {key}")
    unknown_tags = sorted(set(evaluation.get("failure_tags", [])) - FAILURE_TAGS)
    if unknown_tags:
        errors.append("unknown failure tags: " + ", ".join(unknown_tags))
    total = sum(float(scores.get(key, 0)) for key in SCORE_MAX)
    hard_gate_pass = (
        gates.get("severe_science_error") is False
        and gates.get("forbidden_mark_count") == 0
        and gates.get("unlisted_object_count") == 0
        and gates.get("critical_structure_broken") is False
        and gates.get("category_encoding_valid") is True
    )
    result = {
        "engine_version": ENGINE_VERSION,
        "case_id": evaluation.get("case_id"),
        "attempt": evaluation.get("attempt"),
        "total": total,
        "threshold": 85,
        "hard_gate_pass": hard_gate_pass,
        "verdict": "PASS" if total >= 85 and hard_gate_pass and not errors else "FAIL",
        "validation_errors": errors,
    }
    write_json(args.out, result)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["verdict"] == "PASS" else 1


def command_inspect_image(args) -> int:
    try:
        from PIL import Image, ImageStat
    except ImportError:
        print("Pillow is required for inspect-image", file=sys.stderr)
        return 2
    path = Path(args.image)
    image = Image.open(path).convert("RGB")
    width, height = image.size
    flatten = lambda img: list(img.get_flattened_data()) if hasattr(img, "get_flattened_data") else list(img.getdata())
    pixels = flatten(image)
    colored = sum(1 for r, g, b in pixels if max(r, g, b) - min(r, g, b) > 3)
    luminance = [round(0.2126 * r + 0.7152 * g + 0.0722 * b) for r, g, b in pixels]
    nonwhite = sum(1 for value in luminance if value < 245)
    levels = sorted(set(luminance))
    border = flatten(image.crop((0, 0, width, max(1, height // 50))))
    border += flatten(image.crop((0, height - max(1, height // 50), width, height)))
    border += flatten(image.crop((0, 0, max(1, width // 50), height)))
    border += flatten(image.crop((width - max(1, width // 50), 0, width, height)))
    border_nonwhite = sum(1 for r, g, b in border if min(r, g, b) < 245)
    result = {
        "image": str(path),
        "width": width,
        "height": height,
        "pixel_count": width * height,
        "nonwhite_fraction": nonwhite / len(pixels),
        "colored_pixel_fraction": colored / len(pixels),
        "luminance_level_count": len(levels),
        "luminance_levels_preview": levels[:32],
        "border_nonwhite_fraction": border_nonwhite / len(border),
        "channel_means": ImageStat.Stat(image).mean,
        "notes": [
            "Palette and border metrics are supporting evidence only.",
            "Text, arrows, structure, topology, and science require visual review.",
        ],
    }
    write_json(args.out, result)
    print(args.out)
    return 0


def command_validate_benchmark(args) -> int:
    development = read_json(args.development)
    final = read_json(args.final)
    errors: list[str] = []
    if len(development.get("cases", [])) != 36:
        errors.append("development benchmark must contain 36 cases")
    if len(final.get("cases", [])) != 24:
        errors.append("final benchmark must contain 24 cases")
    if final.get("frozen") is not True:
        errors.append("final benchmark must be frozen")
    all_cases = development.get("cases", []) + final.get("cases", [])
    ids = [case.get("case_id") for case in all_cases]
    if len(ids) != len(set(ids)):
        errors.append("case_ids must be unique across development and final sets")
    mode_counts = Counter(case.get("input_mode") for case in all_cases)
    subject_counts = Counter(case.get("subject") for case in all_cases)
    if mode_counts != Counter({mode: 20 for mode in INPUT_MODES}):
        errors.append(f"combined input-mode balance is invalid: {dict(mode_counts)}")
    if subject_counts != Counter({subject: 15 for subject in SUBJECTS}):
        errors.append(f"combined subject balance is invalid: {dict(subject_counts)}")
    for name, dataset, expected in [("development", development, 3), ("final", final, 2)]:
        cells = Counter((case.get("input_mode"), case.get("subject")) for case in dataset.get("cases", []))
        for mode in INPUT_MODES:
            for subject in SUBJECTS:
                if cells[(mode, subject)] != expected:
                    errors.append(f"{name} cell {mode}/{subject} must contain {expected}, found {cells[(mode, subject)]}")
    result = {
        "engine_version": ENGINE_VERSION,
        "passed": not errors,
        "errors": errors,
        "development_cases": len(development.get("cases", [])),
        "final_cases": len(final.get("cases", [])),
        "combined_input_modes": dict(mode_counts),
        "combined_subjects": dict(subject_counts),
        "development_sha256": sha256_json(development),
        "final_sha256": sha256_json(final),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


def command_summarize(args) -> int:
    records = []
    for path in sorted(Path(args.evaluations).rglob("score.json")):
        try:
            record = read_json(path)
            record["path"] = str(path)
            records.append(record)
        except (OSError, json.JSONDecodeError):
            continue
    passed = [record for record in records if record.get("verdict") == "PASS"]
    report = {
        "engine_version": ENGINE_VERSION,
        "evaluated": len(records),
        "passed": len(passed),
        "pass_rate": len(passed) / len(records) if records else 0,
        "records": records,
    }
    write_json(args.out, report)
    print(args.out)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    compile_parser = sub.add_parser("compile")
    compile_parser.add_argument("--request", required=True)
    compile_parser.add_argument("--out-dir", required=True)
    compile_parser.set_defaults(func=command_compile)
    score_parser = sub.add_parser("score")
    score_parser.add_argument("--evaluation", required=True)
    score_parser.add_argument("--out", required=True)
    score_parser.set_defaults(func=command_score)
    inspect_parser = sub.add_parser("inspect-image")
    inspect_parser.add_argument("--image", required=True)
    inspect_parser.add_argument("--out", required=True)
    inspect_parser.set_defaults(func=command_inspect_image)
    benchmark_parser = sub.add_parser("validate-benchmark")
    benchmark_parser.add_argument("--development", required=True)
    benchmark_parser.add_argument("--final", required=True)
    benchmark_parser.set_defaults(func=command_validate_benchmark)
    summarize_parser = sub.add_parser("summarize")
    summarize_parser.add_argument("--evaluations", required=True)
    summarize_parser.add_argument("--out", required=True)
    summarize_parser.set_defaults(func=command_summarize)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
