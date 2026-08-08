#!/usr/bin/env python3
"""Build the balanced 36-development/24-final V2 benchmark manifests."""

from __future__ import annotations

import json
from pathlib import Path

ENGINE_VERSION = "2.0.0"
MODES = ["reference_image", "description_only", "sketch_plus_description"]

SCENARIOS = {
    "physics": [
        {
            "slug": "series-circuit-switch",
            "title": "전지-스위치-전구 직렬 회로",
            "objects": ["battery", "open switch", "bulb", "three wire segments"],
            "relations": ["one series path with the switch gap as the only break", "the upper and lower left conductors terminate at different battery plates", "wire crossings: zero"],
            "invariants": ["battery long and short plates remain distinct and interrupt the left conductor", "no line bypasses the battery plates", "switch contacts do not touch"],
            "gray": [], "difficulty": "medium"
        },
        {
            "slug": "incline-fixed-pulley",
            "title": "경사면의 물체와 고정 도르래",
            "objects": ["inclined plane", "one block", "one fixed pulley", "one hanging mass", "one continuous string"],
            "relations": ["one continuous string starts at the block, is tangent to the upper-left pulley rim, follows the upper circumference, exits vertically at the right rim, and ends at the hanging mass"],
            "invariants": ["string never crosses the pulley interior", "block contacts the incline", "pulley is fixed above the incline"],
            "gray": [], "difficulty": "hard"
        },
        {
            "slug": "lens-screen-apparatus",
            "title": "광원-볼록 렌즈-스크린 장치",
            "objects": ["one source object", "one convex lens on a stand", "one screen on a stand", "one baseline"],
            "relations": ["left-to-right order is source, lens, screen", "no light rays in illustration-only output"],
            "invariants": ["all three centers share one horizontal optical axis"],
            "gray": [], "difficulty": "medium"
        },
        {
            "slug": "spring-two-states",
            "title": "용수철 길이 두 상태 비교",
            "objects": ["two equal panels", "two identical supports", "two springs", "two identical masses"],
            "relations": ["one spring hangs from each support and holds one mass"],
            "invariants": ["only spring length and mass height differ", "coil count remains equal"],
            "gray": [], "difficulty": "hard"
        },
        {
            "slug": "coil-compass",
            "title": "코일과 나침반 연결 장치",
            "objects": ["one coil with two terminals", "one compass", "one battery", "two wires"],
            "relations": ["each coil terminal connects to a different battery terminal"],
            "invariants": ["compass needle is an arrowhead-free rod", "wire endpoints remain visible"],
            "gray": [], "difficulty": "hard"
        }
    ],
    "chemistry": [
        {
            "slug": "simple-distillation",
            "title": "단순 증류 장치",
            "objects": ["round flask", "stopper", "thermometer", "delivery tube", "receiver", "heater"],
            "relations": ["flask neck holds stopper and thermometer", "delivery tube runs from flask to receiver"],
            "invariants": ["heater lies directly below flask", "receiver remains open and separate"],
            "gray": ["liquid in flask", "collected liquid"], "difficulty": "hard"
        },
        {
            "slug": "separatory-funnel",
            "title": "분별 깔때기의 두 액체층",
            "objects": ["one stoppered separatory funnel", "one stopcock", "one receiving beaker", "one support stand"],
            "relations": ["funnel is supported above the beaker", "two liquid layers remain physically separate"],
            "invariants": ["stopcock is below the lower layer", "two horizontal liquid interfaces are visible"],
            "gray": ["lower liquid layer"], "difficulty": "medium"
        },
        {
            "slug": "gas-over-water",
            "title": "수상 치환 기체 포집",
            "objects": ["reaction flask", "stopper", "delivery tube", "water trough", "inverted gas jar"],
            "relations": ["tube starts at flask and terminates inside inverted jar under water"],
            "invariants": ["jar opening is below water surface", "gas region is above water inside jar"],
            "gray": ["water in trough and jar"], "difficulty": "hard"
        },
        {
            "slug": "particle-two-states",
            "title": "두 종류 입자의 전후 상태",
            "objects": ["two equal containers", "six round particles per panel", "four angular particles per panel"],
            "relations": ["particles are contained by their own panel only"],
            "invariants": ["species counts stay constant", "round and angular species remain distinguishable"],
            "gray": [], "difficulty": "hard"
        },
        {
            "slug": "electrolysis-vessel",
            "title": "두 전극이 담긴 전기 분해 용기",
            "objects": ["one vessel", "one liquid region", "two electrodes", "one battery", "two wires"],
            "relations": ["each electrode connects to a different battery terminal", "electrodes enter liquid without touching"],
            "invariants": ["no polarity symbols", "electrodes remain separated"],
            "gray": ["electrolyte"], "difficulty": "medium"
        }
    ],
    "biology": [
        {
            "slug": "heart-four-chambers",
            "title": "심장 네 방과 주요 혈관 단면",
            "objects": ["one heart outline", "two atria", "two ventricles", "one septum", "four major vessel stubs"],
            "relations": ["each atrium lies above its ventricle", "septum separates left and right ventricles"],
            "invariants": ["four chambers remain distinct", "vessel stubs terminate at the heart boundary"],
            "gray": ["one ventricular wall region"], "difficulty": "hard"
        },
        {
            "slug": "nephron-path",
            "title": "신소체와 세뇨관 연결",
            "objects": ["one renal corpuscle", "one continuous tubule", "one collecting duct", "two vessel stubs"],
            "relations": ["tubule starts at corpuscle and joins collecting duct", "vessel stubs connect only to corpuscle"],
            "invariants": ["tubule remains continuous", "collecting duct is not merged with vessels"],
            "gray": [], "difficulty": "hard"
        },
        {
            "slug": "lungs-two-states",
            "title": "폐와 가로막 두 상태 비교",
            "objects": ["two equal torso panels", "two pairs of lungs", "two diaphragm curves", "two tracheae"],
            "relations": ["each trachea branches to its pair of lungs"],
            "invariants": ["viewpoint and torso size remain identical", "only lung size and diaphragm curvature differ"],
            "gray": ["lung interiors"], "difficulty": "medium"
        },
        {
            "slug": "plant-stem-transport",
            "title": "뿌리-줄기-잎 관다발 구조",
            "objects": ["one root system", "one stem", "three leaves", "two continuous vascular paths"],
            "relations": ["both vascular paths run continuously from roots through stem to leaves"],
            "invariants": ["paths do not merge", "no directional arrows"],
            "gray": [], "difficulty": "hard"
        },
        {
            "slug": "chromosome-pairs",
            "title": "동원체 위치가 다른 염색체 쌍",
            "objects": ["one cell boundary", "four replicated chromosomes"],
            "relations": ["all chromosomes are contained by the cell boundary"],
            "invariants": ["two homologous pairs remain", "centromere positions distinguish the pairs"],
            "gray": ["one homologous pair"], "difficulty": "medium"
        }
    ],
    "earth_science": [
        {
            "slug": "volcano-cross-section",
            "title": "화산체와 마그마 통로 단면",
            "objects": ["one volcanic cone", "one crater", "one main conduit", "one magma chamber", "three strata"],
            "relations": ["conduit continuously connects crater to chamber", "strata are cut by conduit"],
            "invariants": ["chamber remains below all strata", "crater is open at the summit"],
            "gray": ["magma chamber and conduit"], "difficulty": "hard"
        },
        {
            "slug": "subduction-boundary",
            "title": "해양판 섭입 경계 단면",
            "objects": ["oceanic plate", "continental plate", "mantle region", "trench", "volcanic cone"],
            "relations": ["oceanic plate bends beneath continental plate", "trench lies at their surface contact"],
            "invariants": ["subducting slab remains continuous", "volcano stands on continental side"],
            "gray": ["mantle region"], "difficulty": "hard"
        },
        {
            "slug": "faulted-strata",
            "title": "단층으로 어긋난 지층",
            "objects": ["four strata", "one inclined fault plane", "one ground surface"],
            "relations": ["each stratum is offset across the same fault plane"],
            "invariants": ["layer order remains unchanged", "offset direction is consistent for all layers"],
            "gray": ["second stratum"], "difficulty": "medium"
        },
        {
            "slug": "eclipse-alignment",
            "title": "태양-지구-달의 일직선 배치",
            "objects": ["one sun disk", "one earth disk", "one moon disk"],
            "relations": ["left-to-right order is sun, earth, moon"],
            "invariants": ["centers lie on one horizontal line", "no rays, arrows, glow, or starfield"],
            "gray": ["one uniform half of earth disk"], "difficulty": "medium"
        },
        {
            "slug": "river-valley-section",
            "title": "하천 계곡 횡단면",
            "objects": ["one valley boundary", "one river channel", "three sediment layers", "six rounded clasts"],
            "relations": ["river occupies the lowest channel", "clasts lie only in the channel bed"],
            "invariants": ["six clasts exactly", "layer boundaries do not become texture"],
            "gray": ["river water"], "difficulty": "hard"
        }
    ]
}


def make_case(mode: str, subject: str, scenario: dict, index: int, split: str) -> dict:
    prefix = {"reference_image": "ref", "description_only": "txt", "sketch_plus_description": "sketch"}[mode]
    case_id = f"v2-{prefix}-{subject.replace('_science', '')}-{index + 1:02d}-{scenario['slug']}"
    case = {
        "case_id": case_id,
        "split": split,
        "input_mode": mode,
        "subject": subject,
        "title": scenario["title"],
        "difficulty": scenario["difficulty"],
        "scenario_family": scenario["slug"],
        "required_objects": scenario["objects"],
        "required_relations": scenario["relations"],
        "scientific_invariants": scenario["invariants"],
        "allowed_gray_regions": scenario["gray"],
        "forbidden": ["text", "digits", "symbols", "labels", "leader_lines", "arrows", "unlisted_objects"],
        "evaluation": "V2_100_POINT_RUBRIC",
    }
    if mode == "reference_image":
        case["input_asset"] = f"inputs/reference/{subject}/{scenario['slug']}.png"
        case["instruction"] = "Preserve the supplied source composition and structure while removing its color and annotations."
    elif mode == "sketch_plus_description":
        case["input_asset"] = f"inputs/sketch/{subject}/{scenario['slug']}.png"
        case["instruction"] = "Use the sketch for layout and the written constraints for scientific meaning."
    else:
        case["instruction"] = "Construct the minimum diagram satisfying only the written constraints."
    return case


def build() -> tuple[dict, dict]:
    development = []
    final = []
    for mode in MODES:
        for subject, scenarios in SCENARIOS.items():
            for index, scenario in enumerate(scenarios):
                split = "development" if index < 3 else "final"
                case = make_case(mode, subject, scenario, index, split)
                (development if split == "development" else final).append(case)
    return (
        {
            "benchmark_version": "2.0.0",
            "engine_version": ENGINE_VERSION,
            "split": "development",
            "mutable_for_engine_iteration": True,
            "cases": development,
        },
        {
            "benchmark_version": "2.0.0",
            "engine_version": ENGINE_VERSION,
            "split": "final",
            "frozen": True,
            "frozen_at": "2026-08-08T00:00:00+09:00",
            "prohibition": "Do not use these cases to modify V2 specifications or prompts.",
            "cases": final,
        },
    )


def main() -> int:
    parser_root = Path(__file__).resolve().parents[4]
    out_dir = parser_root / "benchmarks" / "exam-diagram-engine-v2"
    out_dir.mkdir(parents=True, exist_ok=True)
    development, final = build()
    (out_dir / "development.json").write_text(json.dumps(development, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "final.json").write_text(json.dumps(final, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
