import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".agents/skills/exam-diagram-engine-v2/scripts/compare_source.py"
SPEC = importlib.util.spec_from_file_location("compare_source", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_identical_locked_region_passes_and_annotation_is_clear():
    source = Image.new("RGB", (200, 100), "white")
    draw = ImageDraw.Draw(source)
    draw.rectangle((50, 30, 150, 80), outline="black", width=3)
    draw.line((5, 5, 30, 5), fill="red", width=2)
    output = Image.new("RGB", (400, 200), "white")
    draw = ImageDraw.Draw(output)
    draw.rectangle((100, 60, 300, 160), outline="black", width=6)
    request = {
        "case_id": "test-case",
        "spatial_contract": {
            "edit_masks": [],
            "annotation_masks": [[0, 0, 0.2, 0.15]],
            "minimum_locked_edge_f1": 0.9,
            "maximum_annotation_ink_fraction": 0.01,
        },
    }
    report = MODULE.compare(request, source, output)
    assert report["locked_edge_f1"] >= 0.9
    assert report["annotation_ink_fraction"] == 0
    assert report["passed"] is True


def test_unmasked_geometry_drift_fails():
    source = Image.new("RGB", (200, 100), "white")
    output = Image.new("RGB", (200, 100), "white")
    ImageDraw.Draw(source).rectangle((30, 20, 80, 70), outline="black", width=3)
    ImageDraw.Draw(output).rectangle((110, 20, 160, 70), outline="black", width=3)
    request = {"case_id": "drift", "spatial_contract": {"edit_masks": [], "annotation_masks": [], "minimum_locked_edge_f1": 0.8}}
    assert MODULE.compare(request, source, output)["passed"] is False
