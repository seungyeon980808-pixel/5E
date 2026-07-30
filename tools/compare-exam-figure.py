"""기출 원본과 5E 재현본을 대조한다 (2026-07-27).

왜 필요한가: 눈으로만 보면 "파면 기울기가 뒤집혔다" 같은 구조 오류를 놓친다.
실제로 물리1 2027-06 4번에서 두 번 놓쳤다.

왜 단순 픽셀 IoU 는 못 쓰나 (첫 시도 실패에서 배운 것):
  원본은 **스캔**이고 재현본은 **벡터**다. 선 굵기가 3~4배 다르고 여백·배율도 다르다.
  그래서 잘 맞은 그림도 IoU 0.04 가 나왔고, 기울기가 뒤집힌 그림(0.037)과 구별되지 않았다.
  선 그림 비교에는 ① **허용오차(선을 굵혀 비교)** ② **평행이동 정렬** 이 반드시 필요하다.

무엇을 하나:
  1) 회색조 → 이진화(잉크=검정). 배경 회색 음영은 잉크로 보지 않는다.
  2) 잉크 바운딩 박스로 자르고 같은 폭으로 맞춘다.
  3) 양쪽 마스크를 TOL 픽셀만큼 굵힌다(선 굵기 차이를 흡수).
  4) 평행이동을 훑어 가장 잘 맞는 위치를 찾는다(여백 차이를 흡수).
  5) 두 방향 덮임률을 낸다:
       recall    = 원본 잉크 중 재현본이 덮은 비율 → **빠뜨린 것**을 잡는다
       precision = 재현본 잉크 중 원본에 있는 비율 → **잘못 넣은 것**을 잡는다
       score     = 두 값의 조화평균(F1)
  6) 차이 이미지: 빨강=원본에만, 파랑=재현본에만, 검정=둘 다

점수 읽는 법 (절대 기준이 아니라 실측 경험값):
  · 0.75 이상 — 구조·요소가 대체로 맞음
  · 0.55~0.75 — 부분 일치. 빠진 요소나 위치 차이를 차이 이미지로 확인
  · 0.55 미만 — 구조 의심(기울기 반전·비율 오류·큰 누락)
  · **절대값보다 변화량이 중요하다.** 고쳤는데 점수가 내려가면 잘못 고친 것이다.
  · 원본에 5E 로 못 그리는 요소(캐릭터 삽화 등)가 있으면 recall 이 원리적으로 낮다.

사용법:
  python compare.py <원본.png> <재현본.png> [차이이미지.png]
"""
import sys

import numpy as np
from PIL import Image

INK = 200      # 이 값보다 어두우면 잉크
SIZE = 700     # 비교용 공통 폭
TOL = 4        # 허용오차(px) — 선 굵기·미세 위치 차이를 흡수
SHIFT = 120    # 정렬 탐색 범위(px) — 주기적 무늬(파면 등)는 반주기가 크므로 넓게 본다
STEP = 4       # 정렬 탐색 간격(px)


def ink_mask(path):
    return np.asarray(Image.open(path).convert("L")) < INK


def crop(m):
    ys, xs = np.where(m)
    if len(xs) == 0:
        return m
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def fit(m, w=SIZE):
    m = crop(m)
    h = max(1, round(m.shape[0] * w / m.shape[1]))
    im = Image.fromarray((m * 255).astype("uint8")).resize((w, h), Image.LANCZOS)
    return np.asarray(im) > 110


def dilate(m, r):
    """정사각 커널로 굵히기 — scipy 없이 누적합으로 처리한다."""
    p = np.pad(m.astype(np.int32), r, mode="constant")
    c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)), mode="constant")
    k = 2 * r + 1
    H, W = m.shape
    box = (c[k:k + H, k:k + W] - c[0:H, k:k + W] - c[k:k + H, 0:W] + c[0:H, 0:W])
    return box > 0


def shift(m, dy, dx):
    out = np.zeros_like(m)
    H, W = m.shape
    ys, ye = max(0, dy), min(H, H + dy)
    xs, xe = max(0, dx), min(W, W + dx)
    out[ys:ye, xs:xe] = m[ys - dy:ye - dy, xs - dx:xe - dx]
    return out


def compare(ref_path, mine_path, diff_path=None):
    a = fit(ink_mask(ref_path))
    b = fit(ink_mask(mine_path))
    h = min(a.shape[0], b.shape[0])
    ratio_gap = abs(a.shape[0] - b.shape[0]) / max(a.shape[0], b.shape[0])
    a, b = a[:h], b[:h]

    aD, bD = dilate(a, TOL), dilate(b, TOL)

    best = None
    for dy in range(-SHIFT, SHIFT + 1, STEP):
        for dx in range(-SHIFT, SHIFT + 1, STEP):
            bs, bsD = shift(b, dy, dx), shift(bD, dy, dx)
            rec = np.logical_and(a, bsD).sum() / max(1, a.sum())
            pre = np.logical_and(bs, aD).sum() / max(1, bs.sum())
            f1 = 0 if rec + pre == 0 else 2 * rec * pre / (rec + pre)
            if best is None or f1 > best[0]:
                best = (f1, rec, pre, dy, dx)

    f1, rec, pre, dy, dx = best

    if diff_path:
        bs = shift(b, dy, dx)
        rgb = np.full(a.shape + (3,), 255, dtype="uint8")
        rgb[np.logical_and(a, dilate(bs, TOL))] = (0, 0, 0)
        rgb[np.logical_and(a, ~dilate(bs, TOL))] = (220, 40, 40)
        rgb[np.logical_and(bs, ~dilate(a, TOL))] = (40, 90, 220)
        Image.fromarray(rgb).save(diff_path)

    print(f"참고 점수(F1)  : {f1:.3f}  (덮임 {rec:.3f} / 정확 {pre:.3f})")
    print(f"정렬 보정      : dx={dx}px dy={dy}px   세로비율 차이 {ratio_gap:.1%}")
    print("")
    print("⚠️ 이 점수를 통과 기준으로 쓰지 말 것. 스캔(원본) 대 벡터(재현본)라 선 굵기·글꼴이")
    print("   달라 절대값이 낮게 나오고, 주기적 무늬는 반주기 밀려도 겹쳐서 **틀린 그림이 더")
    print("   높은 점수를 받는 것이 실측으로 확인됐다**(0.251 대 0.296).")
    print("   판단은 ① 물리적 제약 검사 ② 아래 차이 이미지 ③ 요소 체크리스트로 한다.")
    print("   → docs/DRAWING_GUIDE.md 4장")
    if diff_path:
        print("")
        print(f"차이 이미지    : {diff_path}")
        print("   빨강=원본에만(빠뜨린 것) · 파랑=재현본에만(잘못 넣은 것) · 검정=둘 다")
    return f1


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    compare(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
