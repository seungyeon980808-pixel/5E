#!/usr/bin/env python3
"""Deterministic, label-free raster renderer for Exam Diagram Engine V2.1."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw


VECTOR_ENGINE_VERSION = "2.1.0"
PRIMITIVE_TYPES = {"line", "polyline", "polygon", "rect", "ellipse", "arc", "path"}
ROLES = {
    "apparatus", "boundary", "connector", "material_region", "particle",
    "anatomy", "geology", "panel", "support",
}
FILLS = {"none", "white", "gray", "black"}
STROKES = {"none", "black"}
FORBIDDEN_TOKENS = {
    "text", "letter", "digit", "number", "label", "caption", "symbol",
    "arrow", "arrowhead", "leader", "watermark", "qr",
}


def read_json(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path: str | Path, value: dict) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _numbers(value) -> bool:
    return isinstance(value, list) and all(isinstance(item, (int, float)) for item in value)


def _point(value) -> bool:
    return _numbers(value) and len(value) == 2 and all(0 <= item <= 1 for item in value)


def _bbox(value) -> bool:
    return (
        _numbers(value) and len(value) == 4 and all(0 <= item <= 1 for item in value)
        and value[0] < value[2] and value[1] < value[3]
    )


def _contains_forbidden_token(value: str) -> bool:
    lowered = value.lower().replace("-", "_")
    return any(token in lowered for token in FORBIDDEN_TOKENS)


def validate_scene(scene: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(scene, dict):
        return ["scene must be a JSON object"]

    canvas = scene.get("canvas", {})
    width = canvas.get("width")
    height = canvas.get("height")
    if not isinstance(width, int) or not 256 <= width <= 4096:
        errors.append("canvas.width must be an integer from 256 to 4096")
    if not isinstance(height, int) or not 256 <= height <= 4096:
        errors.append("canvas.height must be an integer from 256 to 4096")
    if canvas.get("background") != "white":
        errors.append("canvas.background must be white")
    margin = canvas.get("minimum_margin_fraction", 0.04)
    if not isinstance(margin, (int, float)) or not 0.02 <= margin <= 0.25:
        errors.append("canvas.minimum_margin_fraction must be from 0.02 to 0.25")

    primitives = scene.get("primitives")
    if not isinstance(primitives, list) or not primitives:
        errors.append("primitives must be a non-empty array")
        primitives = []
    primitive_ids: set[str] = set()
    for index, primitive in enumerate(primitives):
        prefix = f"primitives[{index}]"
        if not isinstance(primitive, dict):
            errors.append(prefix + " must be an object")
            continue
        primitive_id = primitive.get("id")
        if not isinstance(primitive_id, str) or not primitive_id:
            errors.append(prefix + ".id must be a non-empty string")
        elif primitive_id in primitive_ids:
            errors.append(prefix + ".id is duplicated")
        elif _contains_forbidden_token(primitive_id):
            errors.append(prefix + ".id contains a forbidden semantic token")
        else:
            primitive_ids.add(primitive_id)
        kind = primitive.get("type")
        if kind not in PRIMITIVE_TYPES:
            errors.append(prefix + ".type is not an allowed geometric primitive")
        if primitive.get("role") not in ROLES:
            errors.append(prefix + ".role is invalid")
        if primitive.get("stroke", "black") not in STROKES:
            errors.append(prefix + ".stroke must be black or none")
        if primitive.get("fill", "none") not in FILLS:
            errors.append(prefix + ".fill must be none, white, gray, or black")
        line_width = primitive.get("line_width", 2.0)
        if not isinstance(line_width, (int, float)) or not 0.5 <= line_width <= 8:
            errors.append(prefix + ".line_width must be from 0.5 to 8")
        if kind in {"line", "polyline", "polygon"}:
            points = primitive.get("points")
            minimum = 2 if kind != "polygon" else 3
            if not isinstance(points, list) or len(points) < minimum or not all(_point(point) for point in points):
                errors.append(prefix + f".points must contain at least {minimum} normalized points")
        elif kind in {"rect", "ellipse", "arc"} and not _bbox(primitive.get("bbox")):
            errors.append(prefix + ".bbox must be [x0,y0,x1,y1] in normalized coordinates")
        elif kind == "path":
            commands = primitive.get("commands")
            if not isinstance(commands, list) or not commands:
                errors.append(prefix + ".commands must be non-empty")
            else:
                for command_index, command in enumerate(commands):
                    if not isinstance(command, list) or not command or command[0] not in {"M", "L", "C", "Q", "Z"}:
                        errors.append(f"{prefix}.commands[{command_index}] is invalid")
                        continue
                    expected = {"M": 3, "L": 3, "C": 7, "Q": 5, "Z": 1}[command[0]]
                    if len(command) != expected or not all(isinstance(item, (int, float)) for item in command[1:]):
                        errors.append(f"{prefix}.commands[{command_index}] has invalid arity")
                    elif not all(0 <= item <= 1 for item in command[1:]):
                        errors.append(f"{prefix}.commands[{command_index}] has out-of-range coordinates")
        if kind == "arc":
            for name in ("start", "end"):
                value = primitive.get(name)
                if not isinstance(value, (int, float)) or not -720 <= value <= 720:
                    errors.append(prefix + f".{name} must be an angle")

    instances = scene.get("instances")
    if not isinstance(instances, list) or not instances:
        errors.append("instances must be a non-empty closed inventory")
        instances = []
    instance_ids: set[str] = set()
    assigned: set[str] = set()
    for index, instance in enumerate(instances):
        prefix = f"instances[{index}]"
        if not isinstance(instance, dict):
            errors.append(prefix + " must be an object")
            continue
        instance_id = instance.get("id")
        if not isinstance(instance_id, str) or not instance_id or _contains_forbidden_token(instance_id):
            errors.append(prefix + ".id is invalid")
        elif instance_id in instance_ids:
            errors.append(prefix + ".id is duplicated")
        else:
            instance_ids.add(instance_id)
        refs = instance.get("primitive_ids")
        if not isinstance(refs, list) or not refs:
            errors.append(prefix + ".primitive_ids must be non-empty")
        else:
            for ref in refs:
                if ref not in primitive_ids:
                    errors.append(prefix + f" references unknown primitive {ref!r}")
                if ref in assigned:
                    errors.append(prefix + f" reuses primitive {ref!r}")
                assigned.add(ref)
    unassigned = primitive_ids - assigned
    if unassigned:
        errors.append("unassigned primitives violate the closed inventory: " + ", ".join(sorted(unassigned)))

    for index, connection in enumerate(scene.get("connections", [])):
        if not isinstance(connection, dict):
            errors.append(f"connections[{index}] must be an object")
            continue
        if connection.get("from") not in instance_ids or connection.get("to") not in instance_ids:
            errors.append(f"connections[{index}] references an unknown instance")
        if connection.get("kind") not in {"wire", "tube", "string", "continuous_path", "contained_by", "supported_by", "touching", "adjacent", "not_connected"}:
            errors.append(f"connections[{index}].kind is invalid")
    return errors


def _xy(point: list[float], width: int, height: int, scale: int) -> tuple[int, int]:
    return round(point[0] * width * scale), round(point[1] * height * scale)


def _box(box: list[float], width: int, height: int, scale: int) -> tuple[int, int, int, int]:
    return tuple(round(value * (width if index % 2 == 0 else height) * scale) for index, value in enumerate(box))


def _sample_quadratic(p0, p1, p2, steps=40):
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        yield (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])


def _sample_cubic(p0, p1, p2, p3, steps=60):
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        yield (
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        )


def _path_points(commands: list[list]) -> tuple[list[tuple[float, float]], bool]:
    points: list[tuple[float, float]] = []
    current = (0.0, 0.0)
    closed = False
    for command in commands:
        if command[0] == "M":
            current = (command[1], command[2])
            points.append(current)
        elif command[0] == "L":
            current = (command[1], command[2])
            points.append(current)
        elif command[0] == "Q":
            sampled = list(_sample_quadratic(current, (command[1], command[2]), (command[3], command[4])))
            points.extend(sampled[1:])
            current = sampled[-1]
        elif command[0] == "C":
            sampled = list(_sample_cubic(current, (command[1], command[2]), (command[3], command[4]), (command[5], command[6])))
            points.extend(sampled[1:])
            current = sampled[-1]
        elif command[0] == "Z":
            closed = True
    return points, closed


def render_scene(scene: dict, output: str | Path, supersample: int = 4) -> dict:
    errors = validate_scene(scene)
    if errors:
        raise ValueError("; ".join(errors))
    canvas = scene["canvas"]
    width, height = canvas["width"], canvas["height"]
    image = Image.new("L", (width * supersample, height * supersample), 255)
    draw = ImageDraw.Draw(image)
    colors = {"none": None, "white": 255, "gray": 210, "black": 0}
    for primitive in scene["primitives"]:
        kind = primitive["type"]
        stroke = colors[primitive.get("stroke", "black")]
        fill = colors[primitive.get("fill", "none")]
        line_width = max(1, round(primitive.get("line_width", 2.0) * supersample))
        if kind in {"line", "polyline", "polygon"}:
            points = [_xy(point, width, height, supersample) for point in primitive["points"]]
            if kind == "polygon" and fill is not None:
                draw.polygon(points, fill=fill)
            if stroke is not None:
                sequence = points + ([points[0]] if kind == "polygon" else [])
                draw.line(sequence, fill=stroke, width=line_width, joint="curve")
        elif kind == "rect":
            draw.rectangle(_box(primitive["bbox"], width, height, supersample), fill=fill, outline=stroke, width=line_width)
        elif kind == "ellipse":
            draw.ellipse(_box(primitive["bbox"], width, height, supersample), fill=fill, outline=stroke, width=line_width)
        elif kind == "arc":
            draw.arc(_box(primitive["bbox"], width, height, supersample), primitive["start"], primitive["end"], fill=stroke, width=line_width)
        elif kind == "path":
            normalized, closed = _path_points(primitive["commands"])
            points = [_xy(list(point), width, height, supersample) for point in normalized]
            if closed and fill is not None:
                draw.polygon(points, fill=fill)
            if stroke is not None and len(points) >= 2:
                draw.line(points + ([points[0]] if closed else []), fill=stroke, width=line_width, joint="curve")
    image = image.resize((width, height), Image.Resampling.LANCZOS)
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, format="PNG", optimize=True)
    result = {
        "vector_engine_version": VECTOR_ENGINE_VERSION,
        "scene_sha256": hashlib.sha256(json.dumps(scene, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "output_sha256": sha256_file(target),
        "width": width,
        "height": height,
        "mode": "L",
        "primitive_count": len(scene["primitives"]),
        "instance_count": len(scene["instances"]),
        "forbidden_primitive_types": 0,
        "palette_contract": ["white", "black", "flat gray"],
    }
    return result


def command_validate(args) -> int:
    scene = read_json(args.scene)
    errors = validate_scene(scene)
    report = {"vector_engine_version": VECTOR_ENGINE_VERSION, "passed": not errors, "errors": errors}
    if args.out:
        write_json(args.out, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


def command_render(args) -> int:
    scene = read_json(args.scene)
    try:
        report = render_scene(scene, args.out, args.supersample)
    except ValueError as error:
        print(json.dumps({"vector_engine_version": VECTOR_ENGINE_VERSION, "passed": False, "errors": str(error).split("; ")}, ensure_ascii=False, indent=2))
        return 1
    report_path = Path(args.report) if args.report else Path(args.out).with_suffix(".render.json")
    write_json(report_path, report)
    print(str(args.out))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate")
    validate.add_argument("--scene", required=True)
    validate.add_argument("--out")
    validate.set_defaults(func=command_validate)
    render = sub.add_parser("render")
    render.add_argument("--scene", required=True)
    render.add_argument("--out", required=True)
    render.add_argument("--report")
    render.add_argument("--supersample", type=int, default=4, choices=range(2, 9))
    render.set_defaults(func=command_render)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
