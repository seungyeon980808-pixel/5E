# -*- coding: utf-8 -*-
"""Build or verify the curated parts-library manifest.

The SVG directory is a retained source collection, not an implicit catalog. A
rebuild may use a complete local triage result, or it must preserve the IDs in
the committed manifest. This prevents missing triage input from silently
publishing every harvested SVG.
"""

import argparse
import collections
import io
import json
import pathlib
import re
import sys
from datetime import date

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_LIBRARY = HERE.parent / "assets" / "parts-library"
SUBJECT_LABEL = {"p": "물리", "c": "화학", "b": "생명", "e": "지구", "x": "공통"}
TRIAGE_FILES = ("marks.json", "clusters.json", "grades.json", "scores.json")
DRAW_RE = re.compile(r"<(path|circle|ellipse|rect|polygon|polyline|line)\b")


class CurationError(RuntimeError):
    pass


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare effective IDs without writing")
    parser.add_argument("--library", type=pathlib.Path, default=DEFAULT_LIBRARY,
                        help="parts-library directory (defaults to the repository library)")
    return parser.parse_args()


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise CurationError(f"필수 파일이 없습니다: {path}") from error
    except json.JSONDecodeError as error:
        raise CurationError(f"JSON 형식이 잘못되었습니다: {path} ({error.msg})") from error


def rows_by_id(path):
    value = read_json(path)
    if not isinstance(value, list):
        raise CurationError(f"목록이어야 합니다: {path}")
    rows = {}
    for row in value:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"]:
            raise CurationError(f"id가 있는 객체 목록이어야 합니다: {path}")
        if row["id"] in rows:
            raise CurationError(f"중복 id가 있습니다: {path} ({row['id']})")
        rows[row["id"]] = row
    return rows


def manifest_ids(path):
    value = read_json(path)
    if not isinstance(value, dict) or not isinstance(value.get("items"), list):
        raise CurationError(f"manifest items가 없습니다: {path}")
    ids = set()
    for item in value["items"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not item["id"]:
            raise CurationError(f"manifest item id가 없습니다: {path}")
        if item["id"] in ids:
            raise CurationError(f"manifest id가 중복되었습니다: {path} ({item['id']})")
        ids.add(item["id"])
    return ids


def triage_drop(triage):
    present = [name for name in TRIAGE_FILES if (triage / name).exists()]
    if not present:
        return None
    if len(present) != len(TRIAGE_FILES):
        missing = ", ".join(sorted(set(TRIAGE_FILES) - set(present)))
        raise CurationError(f"triage 결과가 불완전합니다: {missing}")

    marks = read_json(triage / "marks.json")
    clusters = read_json(triage / "clusters.json")
    grades = read_json(triage / "grades.json")
    scores = read_json(triage / "scores.json")
    if not all(isinstance(value, dict) for value in (marks, clusters, grades, scores)):
        raise CurationError("triage 결과는 객체여야 합니다")

    drop, reasons = set(), {}
    for name, mark in marks.items():
        if isinstance(mark, dict) and mark.get("mark") == "X":
            drop.add(name)
            reasons[name] = "X"
    for lead, members in clusters.items():
        if not isinstance(members, list):
            raise CurationError(f"중복 묶음이 목록이 아닙니다: {lead}")
        for name in members:
            if isinstance(name, str) and name != lead and name not in drop:
                drop.add(name)
                reasons[name] = "중복"
    for name, grade in grades.items():
        if grade != "A" and name not in drop:
            drop.add(name)
            reasons[name] = f"{grade}등급"
    for name, score in scores.items():
        if isinstance(score, dict) and score.get("fail") and name not in drop:
            drop.add(name)
            reasons[name] = "안그려짐"
    return drop, reasons


def curated_ids(library, files):
    triage = triage_drop(library.parent.parent / "_work" / "triage")
    if triage is None:
        manifest = library / "manifest.json"
        if not manifest.exists():
            raise CurationError("triage 결과와 보존된 manifest가 모두 없어 catalog를 만들 수 없습니다")
        return manifest_ids(manifest), {}, "보존된 manifest 선택"
    drop, reasons = triage
    keep_path = library / "keep.json"
    if keep_path.exists():
        value = read_json(keep_path)
        if not isinstance(value, list) or not all(isinstance(name, str) for name in value):
            raise CurationError(f"문자열 목록이어야 합니다: {keep_path}")
        keep = set(value)
        for name in drop & keep:
            drop.remove(name)
            reasons.pop(name, None)
    return {name.removesuffix(".svg") for name in files if name not in drop}, reasons, "완전한 triage"


def effective_manifest(library):
    svg_dir = library / "svg"
    if not svg_dir.is_dir():
        raise CurationError(f"SVG 폴더가 없습니다: {svg_dir}")
    meta = rows_by_id(library / "meta.json")
    harvest_path = library / "harvest.json"
    harvest = rows_by_id(harvest_path) if harvest_path.exists() else {}
    files = {file.name: file for file in svg_dir.glob("*.svg")}
    selected, reasons, source = curated_ids(library, files)

    items, missing, orphan = [], [], []
    for pid in sorted(selected):
        file = files.get(f"{pid}.svg")
        if file is None:
            missing.append(pid)
            continue
        metadata = {**harvest.get(pid, {}), **meta.get(pid, {})}
        if not metadata:
            orphan.append(pid)
            continue
        text = file.read_text(encoding="utf-8", errors="replace")
        subject = metadata.get("subject", "x")
        items.append({
            "id": pid,
            "file": file.name,
            "subject": subject,
            "subjectLabel": SUBJECT_LABEL.get(subject, "공통"),
            "part": metadata.get("part", "기타"),
            "name": metadata.get("name", pid),
            "keywords": metadata.get("keywords", []),
            "sourceTags": metadata.get("sourceTags", []),
            "license": metadata.get("license", "unknown"),
            "source": metadata.get("source", ""),
            "elements": len(DRAW_RE.findall(text)),
            "bytes": file.stat().st_size,
            "defaultLevel": metadata.get("defaultLevel", "L2"),
        })
    if missing:
        raise CurationError("선택된 SVG가 없습니다: " + ", ".join(missing))
    if orphan:
        raise CurationError("선택된 SVG에 메타데이터가 없습니다: " + ", ".join(orphan))
    document = {
        "version": 1,
        "generated": date.today().isoformat(),
        "count": len(items),
        "subjects": sorted({item["subject"] for item in items}),
        "parts": sorted({item["part"] for item in items}),
        "items": items,
    }
    return document, reasons, source


def report(document, reasons, source):
    print(f"선택 기준: {source}")
    print(f"manifest {document['count']}건")
    if reasons:
        summary = collections.Counter(reasons.values())
        print("  뺀 것 " + str(len(reasons)) + "장 — " + " · ".join(
            f"{reason} {count}" for reason, count in summary.most_common()))


def main():
    options = arguments()
    library = options.library.resolve()
    try:
        document, reasons, source = effective_manifest(library)
        output = library / "manifest.json"
        if options.check:
            expected = manifest_ids(output)
            actual = {item["id"] for item in document["items"]}
            if actual != expected:
                print("manifest ID 불일치: "
                      f"missing={','.join(sorted(expected - actual)) or '-'} "
                      f"unexpected={','.join(sorted(actual - expected)) or '-'}")
                return 1
            report(document, reasons, source)
            print("검사 통과: manifest 파일을 쓰지 않았습니다")
            return 0
        output.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
        report(document, reasons, source)
        print(f"생성 → {output}")
        return 0
    except CurationError as error:
        print(f"생성 중단: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
