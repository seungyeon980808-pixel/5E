#!/usr/bin/env python3
"""Build the balanced 36-development/24-final V2.2 edit benchmark."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


DEV_CATALOG = {
    "series-circuit-switch": [
        ("move-bulb", "전구만 아래쪽 도선 중앙으로 옮기고 직렬 연결을 유지한다.", [[0.34, 0.44, 0.86, 0.82]], [("move", "the single bulb", "move horizontally to the center of the lower conductor while retaining series contact on both sides")]),
        ("close-switch", "열린 스위치만 닫힌 상태로 바꾸고 나머지 회로를 유지한다.", [[0.36, 0.14, 0.54, 0.36]], [("replace_state", "the single open switch", "rotate only the blade until it touches the opposite contact; make no other circuit change")]),
    ],
    "incline-fixed-pulley": [
        ("lower-mass", "매달린 추만 아래로 옮기고 줄을 연장하여 연결을 유지한다.", [[0.58, 0.18, 0.82, 0.94]], [("move", "the hanging mass", "move downward without resizing"), ("connect", "the vertical string segment", "extend to the moved mass without changing pulley tangency")]),
        ("move-block", "경사면 위 물체만 경사면을 따라 왼쪽 아래로 옮기고 줄 연결을 유지한다.", [[0.18, 0.28, 0.62, 0.76]], [("move", "the block on the incline", "move down the incline without resizing or losing surface contact"), ("connect", "the inclined string segment", "extend to the moved block while remaining tangent to the pulley")]),
    ],
    "lens-screen-apparatus": [
        ("move-screen", "스크린만 오른쪽으로 옮기고 높이와 광축 정렬을 유지한다.", [[0.68, 0.12, 0.98, 0.78]], [("move", "the single screen and its stand", "move horizontally right without resizing and keep its center aligned")]),
        ("move-source", "광원만 볼록 렌즈에 더 가깝게 옮기고 크기와 높이를 유지한다.", [[0.08, 0.40, 0.56, 0.78]], [("move", "the single source object", "move horizontally toward the lens without resizing or changing height")]),
    ],
    "simple-distillation": [
        ("move-receiver", "받는 용기만 오른쪽으로 옮기고 기존 전달관을 연장한다.", [[0.55, 0.20, 1.0, 0.94]], [("move", "the receiver and collected liquid", "move right as one rigid unit without resizing"), ("connect", "the existing delivery tube", "extend horizontally to preserve the same separated endpoint relation")]),
        ("lower-heater", "가열 장치만 아래로 조금 옮기고 플라스크와 나머지 장치는 유지한다.", [[0.10, 0.62, 0.45, 1.0]], [("move", "the rectangular heater", "move downward by about half its own height without resizing")]),
    ],
    "separatory-funnel": [
        ("lower-beaker", "받는 비커만 아래로 옮기고 분별 깔때기와 지지대는 유지한다.", [[0.34, 0.62, 0.66, 1.0]], [("move", "the receiving beaker", "move downward without resizing and keep it centered under the stopcock")]),
        ("remove-stopper", "분별 깔때기의 위 마개만 제거하여 입구를 열린 상태로 만든다.", [[0.42, 0.10, 0.58, 0.25]], [("delete", "the top stopper", "remove only the stopper and leave a visibly open funnel mouth")]),
    ],
    "gas-over-water": [
        ("move-jar", "집기병만 오른쪽으로 옮기고 수조 속 관 끝과의 관계를 유지한다.", [[0.48, 0.02, 1.0, 0.96]], [("move", "the inverted gas jar", "move right without resizing while keeping its mouth submerged"), ("connect", "the delivery tube endpoint", "extend inside the trough to terminate under the moved jar")]),
        ("shorten-jar", "집기병만 높이를 줄이고 입구가 물속에 잠긴 상태를 유지한다.", [[0.50, 0.04, 0.82, 0.88]], [("resize", "the inverted gas jar", "reduce height from the top while preserving width and submerged opening position")]),
    ],
    "heart-four-chambers": [
        ("spread-vessels", "위쪽 네 혈관 가지의 끝부분만 바깥쪽으로 벌리고 심장 내부는 유지한다.", [[0.26, 0.00, 0.74, 0.32]], [("move", "the four major vessel stubs", "spread their free endpoints outward symmetrically while preserving their heart-boundary contacts")]),
        ("shorten-septum", "아래쪽 세로 중격의 끝만 위로 올려 길이를 줄이고 네 방의 구분은 유지한다.", [[0.32, 0.34, 0.68, 0.88]], [("resize", "the ventricular septum", "shorten only its lower end while preserving its top junction and chamber separation")]),
    ],
    "nephron-path": [
        ("move-duct", "오른쪽 집합관만 더 오른쪽으로 옮기고 세뇨관 연결을 연장한다.", [[0.38, 0.12, 0.94, 0.94]], [("move", "the collecting duct", "move right without resizing"), ("connect", "the continuous tubule", "extend its terminal segment to the moved collecting duct")]),
        ("remove-upper-vessel", "신소체로 연결된 위쪽 혈관 가지 하나만 제거한다.", [[0.02, 0.08, 0.35, 0.38]], [("delete", "the upper vessel stub", "remove only this stub at the corpuscle boundary")]),
    ],
    "lungs-two-states": [
        ("move-right-panel", "오른쪽 상태 패널만 오른쪽으로 조금 옮기고 내부 구조를 그대로 유지한다.", [[0.50, 0.08, 1.0, 0.94]], [("move", "the complete right comparison panel", "move right as one rigid unit without changing its frame or anatomy")]),
        ("match-diaphragm", "오른쪽 패널의 가로막 곡률만 왼쪽 패널과 같게 바꾼다.", [[0.52, 0.48, 0.94, 0.80]], [("replace_state", "the right diaphragm curve", "match the curvature of the left diaphragm while keeping right lung geometry fixed")]),
    ],
    "volcano-cross-section": [
        ("lower-chamber", "마그마 방만 더 아래로 옮기고 주 통로를 연장한다.", [[0.30, 0.58, 0.70, 1.0]], [("move", "the magma chamber", "move downward without resizing"), ("connect", "the main conduit", "extend vertically to remain continuous with the moved chamber")]),
        ("narrow-conduit", "주 통로만 폭을 줄이고 분화구와 마그마 방 연결은 유지한다.", [[0.44, 0.12, 0.57, 0.78]], [("resize", "the main conduit", "reduce width around the same centerline while preserving both endpoints")]),
    ],
    "subduction-boundary": [
        ("move-volcano", "대륙 쪽 화산만 오른쪽으로 옮기고 판 경계는 유지한다.", [[0.60, 0.06, 0.92, 0.40]], [("move", "the volcanic cone", "move right on the continental surface without resizing")]),
        ("remove-volcano", "대륙 위 화산만 제거하고 나머지 판 구조는 그대로 둔다.", [[0.60, 0.06, 0.92, 0.40]], [("delete", "the volcanic cone", "remove only the cone and preserve the underlying continental surface")]),
    ],
    "faulted-strata": [
        ("raise-right-block", "단층 오른쪽 지층 블록만 위로 옮겨 변위를 증가시킨다.", [[0.40, 0.04, 0.96, 0.96]], [("move", "the complete right strata block", "move upward as one rigid unit while preserving layer order and thickness")]),
        ("narrow-fault", "단층대만 폭을 줄이고 기울기와 양쪽 지층은 유지한다.", [[0.31, 0.00, 0.57, 1.0]], [("resize", "the inclined fault zone", "reduce width about its centerline while preserving angle and endpoints")]),
    ],
}


FINAL_CATALOG = {
    "floating-cylinder": [
        ("move-cylinder-left", "떠 있는 원기둥만 왼쪽으로 옮기고 잠긴 깊이를 유지한다.", [[0.22, 0.20, 0.68, 0.72]], [("move", "the floating cylinder", "move left without resizing and keep the same immersion depth")]),
        ("sink-cylinder", "원기둥만 더 깊이 잠기게 아래로 옮기고 용기와 액체는 유지한다.", [[0.24, 0.20, 0.68, 0.80]], [("move", "the floating cylinder", "move downward without resizing so the liquid line crosses above its midpoint")]),
    ],
    "cart-track-collision": [
        ("closer-carts", "충돌 전 왼쪽의 두 수레만 서로 더 가깝게 옮긴다.", [[0.06, 0.34, 0.52, 0.74]], [("move", "the two pre-collision carts", "move toward each other equally without resizing or changing wheel contact")]),
        ("separate-after", "충돌 후 붙어 있는 두 수레 사이에 작은 간격을 만든다.", [[0.55, 0.34, 0.96, 0.74]], [("disconnect", "the two post-collision cart bodies", "separate them by a small horizontal white gap while preserving wheels and track contact")]),
    ],
    "chromatography": [
        ("raise-top-spot", "가장 위의 반점만 더 위로 옮기고 종이와 용매는 유지한다.", [[0.34, 0.10, 0.66, 0.46]], [("move", "the top chromatography spot", "move upward without resizing or changing fill category")]),
        ("duplicate-middle-spot", "가운데 회색 반점과 같은 반점을 그 위에 하나 추가한다.", [[0.34, 0.26, 0.66, 0.62]], [("duplicate", "the middle flat-gray spot", "add exactly one same-size flat-gray copy above it on the paper")]),
    ],
    "diffusion-membrane": [
        ("move-diamond", "왼쪽 아래 마름모 입자 하나만 막 오른쪽으로 옮긴다.", [[0.20, 0.22, 0.82, 0.82]], [("move", "the lower-left diamond particle", "move across the membrane into the lower-right chamber without resizing")]),
        ("duplicate-circle", "왼쪽 방에 원형 입자 하나를 같은 크기로 추가한다.", [[0.10, 0.16, 0.48, 0.78]], [("duplicate", "one left-chamber circle particle", "add exactly one same-size circle in unused left-chamber space")]),
    ],
    "digestive-path": [
        ("lengthen-lower-path", "아래쪽 굽은 관의 끝을 더 아래로 연장한다.", [[0.24, 0.46, 0.76, 1.0]], [("resize", "the lower winding digestive path", "lengthen downward while preserving continuity and width")]),
        ("move-mouth-left", "맨 위 타원형 입구만 왼쪽으로 옮기고 연결관을 이어 준다.", [[0.22, 0.00, 0.72, 0.34]], [("move", "the top oval opening", "move left without resizing"), ("connect", "the upper straight path", "adjust only its top segment to retain contact with the moved opening")]),
    ],
    "mitosis-cell": [
        ("lower-top-chromosome", "가장 위 염색체만 아래로 옮기고 방추사 연결을 유지한다.", [[0.26, 0.18, 0.74, 0.62]], [("move", "the top chromosome", "move downward without resizing"), ("connect", "its spindle fibers", "adjust endpoints to remain attached to both poles")]),
        ("remove-bottom-chromosome", "가장 아래 염색체 하나만 제거하고 나머지 구조를 유지한다.", [[0.34, 0.48, 0.66, 0.82]], [("delete", "the bottom chromosome", "remove it and only its incident spindle fibers")]),
    ],
    "crater-cross-section": [
        ("deepen-crater", "세 층의 중앙 함몰부를 더 깊게 만들고 층 순서를 유지한다.", [[0.18, 0.24, 0.82, 0.94]], [("replace_state", "the nested crater depression", "deepen all three boundaries coherently while preserving their spacing order")]),
        ("narrow-crater", "중앙 함몰부의 폭만 줄이고 깊이와 세 층을 유지한다.", [[0.18, 0.24, 0.82, 0.94]], [("resize", "the nested crater depression", "reduce horizontal width around the same centerline while preserving depth")]),
    ],
    "glacier-valley": [
        ("raise-ice", "빙하의 윗면만 위로 올려 빙하 영역을 두껍게 만든다.", [[0.18, 0.22, 0.82, 0.84]], [("resize", "the glacier region", "raise only its flat top boundary while preserving the curved base and valley walls")]),
        ("move-middle-clast", "바닥의 가운데 둥근 암석만 오른쪽으로 옮긴다.", [[0.34, 0.62, 0.72, 0.92]], [("move", "the middle basal clast", "move right without resizing and keep contact with the valley floor")]),
    ],
}


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_cases(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return [case for case in data["cases"] if case["input_mode"] == "reference_image"]


def make_request(case: dict, split: str, source_prefix: str, variant, annotation_masks):
    slug, instruction, masks, operations = variant
    family = case["scenario_family"]
    source = f"{source_prefix}/{case['input_asset']}"
    inventory = case["required_objects"]
    relations = case.get("required_relations", [])
    invariants = case.get("scientific_invariants", [])
    op_records = [{"type": op, "target": target, "change": change} for op, target, change in operations]
    return {
        "case_id": f"v22-{split[:3]}-{case['subject'].replace('_science', '')}-{family}-{slug}",
        "split": split,
        "subject": case["subject"],
        "source_image": source,
        "scenario_family": family,
        "user_instruction": instruction + " 문자·화살표·색은 제거하고 평가원식 흑백 선화로 정리한다.",
        "source_inventory": inventory,
        "source_annotations_to_remove": ["all source text", "all source arrows and leaders", "all panel markers"],
        "operations": op_records + [{"type": "style_cleanup", "target": "entire source image", "change": "remove annotations and color without changing geometry outside the declared edit masks"}],
        "locked_invariants": relations + invariants + ["all source properties outside the requested operations remain unchanged"],
        "expected_assertions": [instruction, "all locked source objects and relations remain unchanged", "zero text, symbols, leader lines, or arrows remain"],
        "allowed_gray_regions": case.get("allowed_gray_regions", []),
        "spatial_contract": {"edit_masks": masks, "annotation_masks": annotation_masks, "minimum_locked_edge_f1": 0.72, "maximum_annotation_ink_fraction": 0.015},
        "critical_uncertainties": [],
    }


def style_request(case: dict, split: str, source_prefix: str, annotation_masks):
    request = make_request(case, split, source_prefix, ("style-cleanup", "과학 구조와 배치를 그대로 유지한다.", [], []), annotation_masks)
    request["operations"] = [{"type": "style_cleanup", "target": "entire source image", "change": "remove annotations and color while preserving all scientific geometry and topology"}]
    request["spatial_contract"]["minimum_locked_edge_f1"] = 0.62
    return request


def build_split(cases, catalog, split, source_prefix, annotation_masks, out_root):
    requests = []
    for case in cases:
        family = case["scenario_family"]
        if family not in catalog:
            raise ValueError(f"missing catalog entry: {family}")
        requests.append(style_request(case, split, source_prefix, annotation_masks))
        requests.extend(make_request(case, split, source_prefix, variant, annotation_masks) for variant in catalog[family])
    case_dir = out_root / "cases" / split
    for request in requests:
        write_json(case_dir / f"{request['case_id']}.json", request)
    subjects = Counter(request["subject"] for request in requests)
    operations = Counter(op["type"] for request in requests for op in request["operations"] if op["type"] != "style_cleanup")
    manifest = {
        "benchmark_version": "2.2.0",
        "split": split,
        "frozen": split == "final",
        "case_count": len(requests),
        "subject_counts": dict(subjects),
        "edit_operation_counts": dict(operations),
        "cases": [str((case_dir / f"{request['case_id']}.json").relative_to(out_root)).replace("\\", "/") for request in requests],
    }
    write_json(out_root / f"{split}.json", manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    root = Path(args.root).resolve()
    out_root = root / "benchmarks/exam-diagram-engine-v2-2"
    dev = source_cases(root / "benchmarks/exam-diagram-engine-v2/development.json")
    final = source_cases(root / "benchmarks/exam-diagram-engine-v2-1/final.json")
    dev_manifest = build_split(dev, DEV_CATALOG, "development", "benchmarks/exam-diagram-engine-v2", [[0, 0, 0.25, 0.20], [0.82, 0.86, 0.94, 0.98]], out_root)
    final_manifest = build_split(final, FINAL_CATALOG, "final", "benchmarks/exam-diagram-engine-v2-1", [], out_root)
    if dev_manifest["case_count"] != 36 or final_manifest["case_count"] != 24:
        raise ValueError("benchmark must contain 36 development and 24 final cases")
    if set(dev_manifest["subject_counts"].values()) != {9} or set(final_manifest["subject_counts"].values()) != {6}:
        raise ValueError("subject balance is invalid")
    final_case_paths = [out_root / relative for relative in final_manifest["cases"]]
    final_source_paths = sorted({root / json.loads(path.read_text(encoding="utf-8"))["source_image"] for path in final_case_paths})
    core_paths = [
        out_root / "final.json",
        root / ".agents/skills/exam-diagram-engine-v2/assets/edit-request.schema.json",
        root / ".agents/skills/exam-diagram-engine-v2/assets/edit-rules.v2.2.json",
        root / ".agents/skills/exam-diagram-engine-v2/references/instruction-edit.md",
        root / ".agents/skills/exam-diagram-engine-v2/scripts/edit_engine.py",
        root / ".agents/skills/exam-diagram-engine-v2/scripts/compare_source.py",
    ]
    pinned = {}
    for path in core_paths + final_case_paths + final_source_paths:
        relative = str(path.relative_to(root)).replace("\\", "/")
        pinned[relative] = file_sha256(path)
    freeze = {
        "benchmark_version": "2.2.0",
        "final_manifest_sha256": pinned["benchmarks/exam-diagram-engine-v2-2/final.json"],
        "pinned_file_count": len(pinned),
        "pinned_files": pinned,
        "prohibition": "Do not use final outputs to modify V2.2 rules or prompts.",
    }
    write_json(out_root / "FINAL_FREEZE.json", freeze)
    print(json.dumps({"development": dev_manifest, "final": final_manifest, "freeze": freeze}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
