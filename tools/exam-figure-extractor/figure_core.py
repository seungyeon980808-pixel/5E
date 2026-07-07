# -*- coding: utf-8 -*-
"""기출 그림 추출 + 자동 키워드 태깅 엔진 (GUI 비의존).

[검출 방식]  ── v5: 내장 이미지 기반 ──
  평가원 시험지의 '진짜 그림'(그래프·지도·삽화·가계도·모형)은 전부 PDF에
  내장된 래스터 이미지이고, 표·글상자·〈보기〉 상자·괘선은 벡터 선으로만
  그려진다. 따라서 내장 이미지의 위치(get_image_info)만 잡으면 표·상자를
  구조적으로 배제하면서 그림만 정확히 추출된다. (4과목 전수 검증 완료)

  · 문항당 그림 1개: 맨 위 이미지부터 세로 간격 VGAP 이내로 이어지는
    이미지까지 하나로 병합. 그 아래(선택지 그림)는 버린다.
  · 경계 트림: 내장 이미지 bbox는 흰 여백이 넓거나 옆 지문·과목 사이드바에
    겹칠 수 있어, 실제 잉크 범위로 축소하고 오른쪽 과목 탭은 마스킹한다.

[파일 이름 규칙]  <과목코드>_<학년도>_<월2자리>_<문항번호2자리>.png
  예) p1_2026_11_06.png → 2026학년도 수능 물리1 6번  (build_manifest.py와 동일 규칙)
"""
import re
from collections import defaultdict

import numpy as np

try:
    import pymupdf
except ImportError:
    import fitz as pymupdf

# ---------------- 검출 파라미터 ----------------
MIN_IMG_DIM = 18       # 이보다 작은 내장 이미지는 장식/기호로 간주(pt)
ASSIGN_TOL = 30        # 문항 구간 시작보다 이만큼 위에서 시작한 옆그림도 배정(pt)
VGAP = 24              # 문항 내 이미지 병합 세로 간격(선택지 그림 차단, pt)
SIDEBAR_X_RATIO = 0.905  # 페이지 폭의 이 비율보다 오른쪽 = 과목 사이드바로 보고 잘라냄
TRIM_DPI = 150         # 경계 트림용 렌더 해상도
TRIM_INK = 245         # 이보다 어두우면 잉크(비백색)로 봄
PADDING = 3            # 트림 후 최종 여백(pt)
PNG_DPI = 300          # 저장 PNG 해상도
Q_PATTERN = re.compile(r"^(\d{1,2})\.$")


# ---------------- 문항 번호 인식 ----------------
def find_question_markers(page):
    """페이지에서 '1.' '2.' 같은 문항 번호 위치를 찾는다. (번호, 열, y)"""
    mid = page.rect.width / 2
    words = page.get_text("words")
    lefts = {0: [], 1: []}
    for w in words:
        lefts[0 if w[0] < mid else 1].append(w[0])
    col_left = {c: (min(v) if v else 0) for c, v in lefts.items()}
    markers = []
    for w in words:
        m = Q_PATTERN.match(w[4].strip())
        if not m:
            continue
        col = 0 if w[0] < mid else 1
        if w[0] - col_left[col] < 25:
            markers.append((int(m.group(1)), col, w[1]))
    return markers


def question_spans(markers, page_h):
    """열별 문항 세로 구간 목록: {col: [(번호, y시작, y끝), ...]}"""
    spans = {0: [], 1: []}
    for col in (0, 1):
        ms = sorted([m for m in markers if m[1] == col], key=lambda m: m[2])
        for i, m in enumerate(ms):
            y_end = ms[i + 1][2] if i + 1 < len(ms) else page_h
            spans[col].append((m[0], m[2], y_end))
    return spans


def assign_question(spans, page_w, box, tol=ASSIGN_TOL):
    """이미지 상자가 속한 문항 번호(같은 열, 문항 구간 안에 중심이 들어가면)."""
    cx = (box[0] + box[2]) / 2
    cy = (box[1] + box[3]) / 2
    col = 0 if cx < page_w / 2 else 1
    for q, y0, y1 in spans[col]:
        if y0 - tol <= cy < y1 and box[1] >= y0 - tol:
            return q
    return None


# ---------------- 경계 트림 ----------------
def trim_to_ink(page, bbox, dpi=TRIM_DPI):
    """bbox 영역을 렌더 → 실제 잉크(비백색) 범위로 축소한 bbox(pt)를 반환.
    내장 이미지의 흰 여백·옆 지문 겹침을 제거한다."""
    rect = pymupdf.Rect(*bbox)
    if rect.width <= 1 or rect.height <= 1:
        return bbox
    pix = page.get_pixmap(clip=rect, dpi=dpi)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    gray = arr[:, :, :3].mean(axis=2) if pix.n >= 3 else arr[:, :, 0].astype(float)
    ink = gray < TRIM_INK
    ys, xs = np.where(ink)
    if len(xs) == 0:
        return bbox
    sx, sy = rect.width / pix.width, rect.height / pix.height
    return (rect.x0 + xs.min() * sx, rect.y0 + ys.min() * sy,
            rect.x0 + (xs.max() + 1) * sx, rect.y0 + (ys.max() + 1) * sy)


# ---------------- 그림 검출 ----------------
def detect_figures(page):
    """페이지에서 문항별 그림 1개씩 검출.
    반환: {문항번호: (x0,y0,x1,y1)}  (트림·패딩 적용된 페이지 좌표 pt)"""
    pw, ph = page.rect.width, page.rect.height
    markers = find_question_markers(page)
    spans = question_spans(markers, ph)

    imgs = []
    for im in page.get_image_info():
        x0, y0, x1, y1 = im["bbox"]
        if x1 - x0 >= MIN_IMG_DIM and y1 - y0 >= MIN_IMG_DIM:
            imgs.append((x0, y0, x1, y1))

    by_q = defaultdict(list)
    for b in imgs:
        q = assign_question(spans, pw, b)
        if q is not None:
            by_q[q].append(b)

    out = {}
    for q, bs in by_q.items():
        bs = sorted(bs, key=lambda b: b[1])
        box = list(bs[0])
        for r in bs[1:]:
            if r[1] <= box[3] + VGAP:          # 위 그림에 이어짐 → 병합
                box = [min(box[0], r[0]), min(box[1], r[1]),
                       max(box[2], r[2]), max(box[3], r[3])]
            else:
                break                          # 아래 선택지 그림 → 제외
        if box[2] > SIDEBAR_X_RATIO * pw:      # 과목 사이드바 마스킹
            box[2] = min(box[2], SIDEBAR_X_RATIO * pw)
        box = trim_to_ink(page, box)           # 흰 여백·지문 겹침 트림
        out[q] = (max(0, box[0] - PADDING), max(0, box[1] - PADDING),
                  min(pw, box[2] + PADDING), min(ph, box[3] + PADDING))
    return out


def question_text(page, col, y0, y1):
    """해당 문항 구간(같은 열)의 텍스트 — 자동 태깅 입력."""
    pw = page.rect.width
    mid = pw / 2
    parts = []
    for w in page.get_text("words"):
        cx = (w[0] + w[2]) / 2
        cy = (w[1] + w[3]) / 2
        if (0 if cx < mid else 1) == col and y0 - 2 <= cy <= y1:
            parts.append(w[4])
    return " ".join(parts)


# ---------------- 저장 ----------------
def save_figure_png(page, bbox, out_path, dpi=PNG_DPI):
    page.get_pixmap(clip=pymupdf.Rect(*bbox), dpi=dpi).save(str(out_path))
