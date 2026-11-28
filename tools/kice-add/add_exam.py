"""평가원 시험(수능·모평) 과탐 문제지를 5E 기출 색인에 더한다(11-19, 2027학년도 수능부터).

하는 일 (README.md의 2단계):
  1. ExamPool 기출 색인 assets/exampool/convert/data/<과목>.json 맨 앞에 문항 줄 20개씩
     [id, year, month, no, page, box, pdfFile, parts, tags, hasFigure, record, text]
     - box: 기존 평가원 색인과 같은 규칙(번호 글자 위 −5.7pt ~ 같은 단 다음 번호 −5.7pt, 단의 마지막이면 1140pt,
       좌우는 단 경계 33.68·421·825.16). 2024~2027 기존 640문항 중 628개가 이 규칙과 소수 둘째 자리까지 같다
       (다른 12개는 사람이 손으로 고친 것).
     - text: 상자 안 글자를 빈칸 하나로 이은 것(기존과 같음, 마지막 문항은 쪽 아래 안내문까지 들어감).
     - parts·tags: tagger.py가 기존 같은 과목 문항에서 빌려 온 자동 추정.
     - hasFigure: 「5E 공유 자료」 묶음 색인(extend-pack.mjs 결과)의 그림 후보가 있으면 1.
  2. index.json: files(파일 → 공유 폴더 경로)와 과목별 문항 수.
  3. assets/exampool/answers/science-answers.json: 정답표 PDF를 읽어 papers(파일 → 문항 순서 정답)와
     documents(묶음 문서 id → 파일).
  그다음 `node scripts/build-library-tags.mjs`로 library-tags.json을 다시 만든다.

실행:
  python3 -I tools/kice-add/add_exam.py --pdf-dir <문제지·정답 폴더> --pack <extend-pack 결과 폴더> --year 2027 --month 11
  <문제지·정답 폴더>에는 p1_2027_11.pdf 와 p1_2027_11_answer.pdf 처럼 8과목 16개가 있어야 한다.
이미 들어간 시험은 다시 넣지 않는다(오류로 멈춤).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tagger import Tagger  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "assets" / "exampool" / "convert" / "data"
ANSWERS = REPO / "assets" / "exampool" / "answers" / "science-answers.json"
SUBJECTS = {"p1": "물리1", "p2": "물리2", "c1": "화학1", "c2": "화학2", "b1": "생명과학1", "b2": "생명과학2", "e1": "지구과학1", "e2": "지구과학2"}
LEFT, MID, RIGHT, BOTTOM, PAD = 33.68, 421, 825.16, 1140, 5.7
NUMBER = re.compile(r"^(\d{1,2})\.$")
CIRCLED = {"①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5}


def dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def num(value: float):
    value = round(value, 2)
    return int(value) if value == int(value) else value


def question_boxes(doc: pymupdf.Document, count: int = 20) -> dict[int, tuple[int, list]]:
    found: dict[int, tuple[int, int, float]] = {}
    expected = 1
    for page_number, page in enumerate(doc, 1):
        candidates = []
        for word in page.get_text("words"):
            match = NUMBER.match(word[4])
            if not match:
                continue
            column = 0 if word[0] < MID else 1
            if word[0] - (LEFT if column == 0 else MID) > 60:  # 단 왼쪽 끝에 붙은 번호만
                continue
            candidates.append((column, word[1], int(match.group(1))))
        for column, top, number in sorted(candidates):
            if number == expected:
                found[number] = (page_number, column, top)
                expected += 1
    if sorted(found) != list(range(1, count + 1)):
        raise SystemExit(f"문항 번호를 다 찾지 못했습니다: {sorted(found)}")
    boxes = {}
    for number, (page_number, column, top) in found.items():
        after = found.get(number + 1)
        bottom = after[2] - PAD if after and after[0] == page_number and after[1] == column else BOTTOM
        x0, x1 = (LEFT, MID) if column == 0 else (MID, RIGHT)
        boxes[number] = (page_number, [num(x0), num(top - PAD), num(x1), num(bottom)])
    return boxes


def answer_key(path: Path, count: int = 20) -> list[list[int]]:
    """평가원 정답표: 「문항 번호 · 정답 · 배점」이 네 묶음으로 가로로 이어진다."""
    with pymupdf.open(path) as doc:
        tokens = " ".join(page.get_text() for page in doc).split()
    found: dict[int, list[int]] = {}
    for i in range(len(tokens) - 2):
        a, b, c = tokens[i:i + 3]
        if a.isdigit() and b in CIRCLED and c in ("2", "3") and 1 <= int(a) <= count and int(a) not in found:
            found[int(a)] = [CIRCLED[b]]
    if sorted(found) != list(range(1, count + 1)):
        raise SystemExit(f"{path.name}: 정답 {len(found)}개만 읽었습니다.")
    return [found[n] for n in range(1, count + 1)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-dir", type=Path, required=True)
    parser.add_argument("--pack", type=Path, required=True)
    parser.add_argument("--year", type=int, required=True)
    parser.add_argument("--month", type=int, required=True)
    args = parser.parse_args()
    tail = f"{args.year}_{args.month:02d}"

    # 11-20: 첫 색인 + 조각 색인(search-index-parts.json → search-index-2.json …)을 모두 읽는다.
    index_names = ["search-index.json"]
    if (args.pack / "search-index-parts.json").exists():
        index_names += json.loads((args.pack / "search-index-parts.json").read_text(encoding="utf-8"))["parts"]
    pack_entries = [entry for name in index_names for entry in json.loads((args.pack / name).read_text(encoding="utf-8"))["entries"]]
    figures = {}
    for entry in pack_entries:
        if entry.get("itemNumber"):
            figures[(entry["documentTitle"], entry["itemNumber"])] = bool(entry.get("figureCandidates"))
    synonyms = json.loads((DATA / "synonyms.json").read_text(encoding="utf-8"))["map"]
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    answers = json.loads(ANSWERS.read_text(encoding="utf-8"))
    pack_docs = {d["title"]: d["id"] for d in json.loads((args.pack / "catalog.json").read_text(encoding="utf-8"))["documents"]}

    for code, folder in SUBJECTS.items():
        name = f"{code}_{tail}.pdf"
        if name in index["files"]:
            raise SystemExit(f"이미 색인에 있습니다: {name}")
        path = DATA / f"{code}.json"
        rows = json.loads(path.read_text(encoding="utf-8"))
        tagger = Tagger(rows, synonyms)
        new_rows = []
        with pymupdf.open(args.pdf_dir / name) as doc:
            for number, (page_number, box) in sorted(question_boxes(doc).items()):
                text = " ".join(doc[page_number - 1].get_text("text", clip=pymupdf.Rect(*box), sort=True).split())
                # 번호보다 조금 위에 놓인 위첨자(질량수 등)가 맨 앞에 올 때가 있다 — 번호 앞 몇 글자는 버린다.
                start = text.find(f"{number}. ")
                if 0 < start <= 8:
                    text = text[start:]
                if not text.startswith(f"{number}."):
                    raise SystemExit(f"{name} {number}번 글자가 번호로 시작하지 않습니다: {text[:30]}")
                parts, tags = tagger.tag(text)
                has_figure = figures.get((name, number))
                if has_figure is None:
                    raise SystemExit(f"묶음 색인에 {name} {number}번이 없습니다(extend-pack.mjs 먼저).")
                new_rows.append([f"{code}_{tail}_{number:02d}", args.year, args.month, number, page_number, box, name, parts, tags, int(has_figure), None, text])
        path.write_text(dump(new_rows + rows), encoding="utf-8")
        index["files"][name] = f"기출문제/{folder}/{name}"
        for subject in index["subjects"]:
            if subject[0] == code:
                subject[2] += len(new_rows)
        answers["papers"][name] = answer_key(args.pdf_dir / f"{code}_{tail}_answer.pdf")
        answers["documents"][pack_docs[name]] = name
        print(f"{name}\t문항 {len(new_rows)}\t그림 {sum(r[9] for r in new_rows)}\t정답 {''.join(str(a[0]) for a in answers['papers'][name])}")
    index["files"] = dict(sorted(index["files"].items()))
    (DATA / "index.json").write_text(dump(index), encoding="utf-8")
    ANSWERS.write_text(dump(answers), encoding="utf-8")


if __name__ == "__main__":
    main()
