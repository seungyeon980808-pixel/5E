# -*- coding: utf-8 -*-
"""오프라인 키워드 자동 태깅.
문항 본문 텍스트 → 통제어휘 태그(상한 5 · 목표 4 · 하한 목표 3, 희소도순).
사물/이미지 분석은 하지 않는다(문항 텍스트만 사용)."""
import json
from pathlib import Path

CAP = 5              # 문항당 태그 상한
LEX_PATH = Path(__file__).with_name("lexicon.json")


def _norm(s):
    return s.replace(" ", "")


class Tagger:
    def __init__(self, lex_path=LEX_PATH):
        data = json.loads(Path(lex_path).read_text(encoding="utf-8"))
        self.broad = set(data.get("_broad", []))
        # 과목군(p/c/b/e)별 [(canonical, [trigger_norm...])]
        self.lex = {}
        for grp, mapping in data.items():
            if grp.startswith("_"):
                continue
            self.lex[grp] = [(canon, [_norm(t) for t in trigs])
                             for canon, trigs in mapping.items()]

    def tag(self, subject_code, text, cap=CAP):
        """subject_code 예: 'p1','c1'. 첫 글자로 과목군 선택.
        반환: 태그 리스트(희소도순, 최대 cap개)."""
        grp = subject_code[0].lower()
        table = self.lex.get(grp)
        if not table:
            return []
        tnorm = _norm(text)
        matched = []
        for canon, trigs in table:
            if any(tr and tr in tnorm for tr in trigs):
                matched.append(canon)
        # 희소도순: broad(흔한) 태그는 뒤로, 그 외는 통제어휘 등장 순 유지
        matched.sort(key=lambda c: (1 if c in self.broad else 0))
        return matched[:cap]
