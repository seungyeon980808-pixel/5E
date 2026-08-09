import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".agents/skills/exam-diagram-engine-v2/scripts/flatten_gray_regions.py"
SPEC = importlib.util.spec_from_file_location("flatten_gray_regions", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_only_large_component_inside_mask_is_flattened():
    array = np.full((100, 200, 3), 255, dtype=np.uint8)
    for y in range(30, 80):
        array[y, 80:160] = 120 + (y - 30)
    array[10:20, 10:20] = 150
    image = Image.fromarray(array)
    spec = {"case_id": "gray", "parent_attempt": 1, "regions": [{"name": "liquid", "boxes": [[0.35, 0.2, 0.9, 0.9]], "flat_gray": 210}]}
    output, report = MODULE.flatten(image, spec)
    result = np.asarray(output)
    assert report["passed_preflight"] is True
    assert set(np.unique(result[30:80, 80:160])) == {210}
    assert set(np.unique(result[10:20, 10:20])) == {150}
