"""새 평가원 문항의 단원(parts)·태그(tags)를 기존 같은 과목 문항에서 빌려 온다(11-19).

기존 색인의 단원·태그는 기출 탐색기(exam-search)가 붙인 값이다. 같은 분류기를 다시 돌릴 수 없어서,
본문 글자 두 개 묶음(bigram) TF-IDF로 가장 비슷한 기존 문항 7개를 찾고 그중 여럿이 가진 태그만 붙인다.
본문에 그 태그 이름이나 동의어(synonyms.json)가 실제로 나오면 표가 적어도 붙인다. 단원은 태그가 속한 단원.
자동 추정이므로 보고서·README에 그렇게 적는다.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

K = 7


def grams(text: str) -> Counter:
    t = re.sub(r"[^가-힣A-Za-z]", "", text)
    return Counter(t[i:i + 2] for i in range(len(t) - 1))


class Tagger:
    def __init__(self, rows: list, synonyms: dict[str, list[str]]):
        # rows: 색인 줄 [id,year,month,no,page,box,pdfFile,parts,tags,hasFigure,record,text]
        self.rows = [r for r in rows if r[8] or r[7]]
        docs = [grams(r[11]) for r in self.rows]
        df = Counter(g for d in docs for g in d)
        n = len(docs)
        self.idf = {g: math.log((n + 1) / (c + 1)) + 1 for g, c in df.items()}
        self.vecs = [self._vec(d) for d in docs]
        self.synonyms = synonyms
        part_of = defaultdict(Counter)
        for r in self.rows:
            for tag in r[8]:
                for part in r[7]:
                    part_of[tag][part] += 1
        self.part_of = part_of

    def _vec(self, counts: Counter) -> dict[str, float]:
        v = {g: c * self.idf.get(g, 1.0) for g, c in counts.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {g: x / norm for g, x in v.items()}

    def mentioned(self, tag: str, text: str) -> bool:
        flat = re.sub(r"\s+", "", text)
        return any(word and re.sub(r"\s+", "", word) in flat for word in [tag, *self.synonyms.get(tag, [])] if len(word) >= 2)

    def tag(self, text: str, exclude: set[str] = frozenset()) -> tuple[list[str], list[str]]:
        q = self._vec(grams(text))
        scored = sorted(((sum(q.get(g, 0) * w for g, w in v.items()), i) for i, v in enumerate(self.vecs) if self.rows[i][0] not in exclude), reverse=True)[:K]
        votes = Counter()
        for score, i in scored:
            for tag in self.rows[i][8]:
                votes[tag] += score
        top = scored[0][0] if scored else 0
        # 2026 수능 160문항으로 맞춘 값(11-19): 재현율 0.88·정밀도 0.57. 검색용이라 빠뜨리지 않는 쪽.
        tags = [t for t, s in votes.most_common() if s >= top * 2.5 or (s >= top * 0.5 and self.mentioned(t, text))][:4]
        parts = []
        for t in tags:
            best = self.part_of[t].most_common(1)
            if best and best[0][0] not in parts:
                parts.append(best[0][0])
        return parts, tags
