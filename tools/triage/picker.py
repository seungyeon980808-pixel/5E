# -*- coding: utf-8 -*-
"""후보 고르기 — "기준에 맞을 것 같은" 그림을 10장씩 골라 온다.

사람이 4천 장을 다 볼 수는 없다. 그래서 **10장씩 보여 주고 O/X 를 받아 기준을 좁힌
다음**, 그 기준으로 전체를 분류한다. 이 파일은 그 '10장 고르기'만 맡는다.

## 무엇을 기준으로 고르나

처음 기준은 손으로 고른 레퍼런스 10장이다(assets/parts-library/meta.json).
그 뒤로는 라운드마다 받은 O/X 가 기준에 더해진다 — O 는 닮은 것을 더 가져오게,
X 는 닮은 것을 밀어내게 한다.

## 어떻게 닮음을 재나

거창한 학습을 하지 않는다. 재료가 50장뿐이라 그럴 수도 없다. 대신 셋을 본다:

  1. 제목 낱말이 겹치는 정도 (accept 쪽에 가까울수록 +, reject 쪽에 가까울수록 −)
  2. 잉크가 덮은 넓이가 레퍼런스 범위에 드는가
  3. 도형 개수가 레퍼런스 범위에 드는가

여기에 확실히 아닌 것(화학 구조식·문장紋章·규격기호·언어 중복)은 아예 뺀다.
한 라운드에 같은 분류가 몰리지 않게 분류당 최대 3장으로 끊는다.
"""

import math
import re

STOP = set("""the of and for a an in on with to from by at is are as or svg png jpg
en de fr es it ru uk pl nl pt ja zh ko cs sv fi da no hu tr ar he el vi id th
diagram scheme file image picture new old version copy""".split())

TOKEN = re.compile(r"[a-zA-Z][a-zA-Z]{2,}")


def tokens(title):
    return {t.lower() for t in TOKEN.findall(title or "") if t.lower() not in STOP}


def _band(v, lo, hi):
    """범위 안이면 1, 밖이면 멀어질수록 0 으로."""
    if v is None:
        return 0.0
    if lo <= v <= hi:
        return 1.0
    d = (lo - v) if v < lo else (v - hi)
    span = max(hi - lo, 1e-6)
    return max(0.0, 1.0 - d / span)


def pick(order, meta, static, scores, accepted, rejected, n=10,
         ink_band=(0.05, 0.36), draw_band=(12, 600),
         per_part=2, per_subject=3, exclude=()):
    """다음 라운드에 보여 줄 n 장을 고른다.

    accepted / rejected 는 파일명 목록. 반환은 [(파일명, 점수, 왜)] 이다.
    """
    acc_tok, rej_tok = set(), set()
    for f in accepted:
        acc_tok |= tokens((meta.get(f) or {}).get("sourceTitle") or f)
    for f in rejected:
        rej_tok |= tokens((meta.get(f) or {}).get("sourceTitle") or f)

    seen_base = set()
    cand = []
    for f in order:
        if f in exclude or f in accepted or f in rejected:
            continue
        st = static.get(f, {})
        sc = scores.get(f) or {}
        if sc.get("fail") or st.get("flag") or st.get("dup"):
            continue                      # 확실히 아닌 것은 후보에서 뺀다
        ink, draw = sc.get("ink"), st.get("draw", 0)
        if ink is None or not (0.015 < ink < 0.60) or not (8 <= draw <= 900):
            continue

        it = meta.get(f) or {}
        title = it.get("sourceTitle") or f
        tk = tokens(title)
        if not tk:
            continue
        base = " ".join(sorted(tk))
        if base in seen_base:             # 제목이 사실상 같은 것 한 장만
            continue
        seen_base.add(base)

        hit = len(tk & acc_tok) / math.sqrt(len(tk))
        bad = len(tk & rej_tok) / math.sqrt(len(tk))
        s = (2.2 * hit - 1.6 * bad
             + 1.0 * _band(ink, *ink_band)
             + 0.8 * _band(draw, *draw_band))
        why = []
        if hit:
            why.append(f"기준과 낱말 {int(hit*10)/10} 겹침")
        if _band(ink, *ink_band) == 1.0:
            why.append("잉크량 적정")
        if _band(draw, *draw_band) == 1.0:
            why.append(f"도형 {draw}개")
        cand.append((f, s, " · ".join(why) or "범위 안"))

    cand.sort(key=lambda x: -x[1])

    # 한 과목·한 분류가 독식하지 않게 끊는다. 상한만으로 n 장을 못 채우면
    # 두 번째 바퀴에서 상한을 풀어 남은 자리를 메운다.
    out, taken = [], set()
    for relax in (False, True):
        by_part, by_subj = {}, {}
        for f, s, why in out:
            it = meta.get(f) or {}
            by_part[it.get("part", "?")] = by_part.get(it.get("part", "?"), 0) + 1
            by_subj[it.get("subjectLabel", "?")] = by_subj.get(it.get("subjectLabel", "?"), 0) + 1
        for f, s, why in cand:
            if len(out) >= n:
                break
            if f in taken:
                continue
            it = meta.get(f) or {}
            p, sj = it.get("part", "?"), it.get("subjectLabel", "?")
            if not relax and (by_part.get(p, 0) >= per_part or by_subj.get(sj, 0) >= per_subject):
                continue
            by_part[p] = by_part.get(p, 0) + 1
            by_subj[sj] = by_subj.get(sj, 0) + 1
            taken.add(f)
            out.append((f, round(s, 3), why))
        if len(out) >= n:
            break
    return out
