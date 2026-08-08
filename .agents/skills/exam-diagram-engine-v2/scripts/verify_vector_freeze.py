#!/usr/bin/env python3
"""Verify that every V2.1 frozen-final artifact still matches its pinned hash."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--root",default="."); args=parser.parse_args(); root=Path(args.root).resolve()
    freeze_path=root/"benchmarks"/"exam-diagram-engine-v2-1"/"FINAL_FREEZE.json"; freeze=json.loads(freeze_path.read_text(encoding="utf-8")); mismatches=[]
    for relative,expected in freeze["hashes"].items():
        path=root/relative; actual=hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
        if actual!=expected: mismatches.append({"path":relative,"expected":expected,"actual":actual})
    report={"benchmark":freeze["benchmark"],"version":freeze["version"],"passed":not mismatches,"checked":len(freeze["hashes"]),"mismatches":mismatches}
    print(json.dumps(report,ensure_ascii=False,indent=2)); raise SystemExit(0 if not mismatches else 1)


if __name__=="__main__": main()
