#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""기출 그림 추출기 (v5, 내장 이미지 기반) + 자동 키워드 태깅.

PDF를 끌어다 놓으면 → 문항별 그림 1개씩 추출 + 개념 자동 태깅 →
스테이징 폴더(_staging/images + new_tags.csv)에 저장한다.
'라이브러리에 병합'을 누르면 5E 기출 라이브러리로 옮기고 manifest를 재생성한다.

  · 검출: figure_core (표·글상자·〈보기〉 자동 배제, 경계 트림)
  · 태깅: tagger (오프라인 키워드, 상한 5·희소도순) — 사물 인식 없음
  · 파일명: <과목>_<학년도>_<월>_<번호2자리>.png  (build_manifest 규칙)
"""
import csv
import os
import shutil
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

try:
    import pymupdf
except ImportError:
    import fitz as pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import figure_core as fc
from tagger import Tagger
import tags_store

DND_AVAILABLE = True
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD
except ImportError:
    DND_AVAILABLE = False

TOOL_DIR = Path(__file__).resolve().parent
ROOT = TOOL_DIR.parents[1]                       # 5E_hub
LIB_DIR = ROOT / "assets" / "exam-library"
BUILD_SCRIPT = ROOT / "scripts" / "build_manifest.py"
STAGE = TOOL_DIR / "_staging"


def extract_pdf(pdf_path: Path, tagger: Tagger, stage_img: Path, log):
    """PDF 한 개 → 스테이징에 PNG 저장 + [(id, tags)] 반환."""
    doc = pymupdf.open(pdf_path)
    if len(doc) == 0:
        log(f"  ⚠ {pdf_path.name}: 열 수 없음(손상/빈 문서) — 건너뜀")
        doc.close()
        return []
    subj = pdf_path.stem.split("_")[0]
    rows = []
    for pno, page in enumerate(doc):
        figs = fc.detect_figures(page)
        if not figs:
            continue
        markers = fc.find_question_markers(page)
        spans = fc.question_spans(markers, page.rect.height)
        span_by_q = {q: (col, y0, y1) for col in (0, 1) for (q, y0, y1) in spans[col]}
        for q, bbox in sorted(figs.items()):
            item_id = f"{pdf_path.stem}_{q:02d}"
            fc.save_figure_png(page, bbox, stage_img / f"{item_id}.png")
            col, y0, y1 = span_by_q.get(q, (0, 0, page.rect.height))
            tags = tagger.tag(subj, fc.question_text(page, col, y0, y1))
            rows.append((item_id, tags))
    doc.close()
    log(f"  → {pdf_path.name}: 그림 {len(rows)}개 추출·태깅")
    return rows


class App:
    def __init__(self, root):
        self.root = root
        self.tagger = Tagger()
        root.title("기출 그림 추출기 v5 + 자동 태깅")
        root.geometry("640x600")
        root.configure(bg="#f4f4f7")

        tk.Label(root, text="📄 기출 PDF → 그림 추출 + 자동 태깅",
                 font=("맑은 고딕", 15, "bold"), bg="#f4f4f7").pack(pady=(16, 2))
        tk.Label(root, text="표·글상자·〈보기〉는 자동 제외 · 문항당 그림 1개 · 개념 태그 자동",
                 font=("맑은 고딕", 9), bg="#f4f4f7", fg="#666").pack()

        sub = "여기에 PDF를 끌어다 놓으세요" if DND_AVAILABLE else "아래 '파일 선택'을 누르세요"
        self.drop = tk.Label(root, text=sub, font=("맑은 고딕", 12), bg="#fff", fg="#666",
                             relief="ridge", bd=2, width=54, height=5)
        self.drop.pack(pady=10, padx=20, fill="x")
        if DND_AVAILABLE:
            self.drop.drop_target_register(DND_FILES)
            self.drop.dnd_bind("<<Drop>>", self.on_drop)

        btns = tk.Frame(root, bg="#f4f4f7")
        btns.pack(pady=4)
        tk.Button(btns, text="파일 선택", command=self.on_browse,
                  font=("맑은 고딕", 11), width=14).pack(side="left", padx=4)
        self.merge_btn = tk.Button(btns, text="라이브러리에 병합", command=self.on_merge,
                                   font=("맑은 고딕", 11), width=16, state="disabled")
        self.merge_btn.pack(side="left", padx=4)
        tk.Button(btns, text="스테이징 열기", command=self.open_stage,
                  font=("맑은 고딕", 10), width=12).pack(side="left", padx=4)

        self.progress = ttk.Progressbar(root, mode="indeterminate", length=560)
        self.progress.pack(pady=(8, 6))
        self.log_box = tk.Text(root, height=13, width=74, state="disabled",
                               bg="#111", fg="#0f0", font=("Consolas", 9))
        self.log_box.pack(padx=20, pady=(0, 12), fill="both", expand=True)

        STAGE.mkdir(exist_ok=True)
        (STAGE / "images").mkdir(exist_ok=True)
        self.staged = 0
        self.log(f"스테이징 폴더: {STAGE}")
        self.log(f"라이브러리: {LIB_DIR}")
        self._refresh_merge()

    # ---------- 로그/유틸 ----------
    def log(self, msg):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", msg + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")
        self.root.update_idletasks()

    def _refresh_merge(self):
        imgs = list((STAGE / "images").glob("*.png"))
        self.merge_btn.configure(state="normal" if imgs else "disabled")

    def open_stage(self):
        try:
            os.startfile(STAGE)
        except Exception:
            messagebox.showinfo("스테이징", str(STAGE))

    # ---------- 추출 ----------
    def on_drop(self, event):
        pdfs = [Path(p) for p in self.root.tk.splitlist(event.data)
                if p.lower().endswith(".pdf")]
        if pdfs:
            self.run(pdfs)

    def on_browse(self):
        paths = filedialog.askopenfilenames(title="기출 PDF 선택",
                                            filetypes=[("PDF 파일", "*.pdf")])
        if paths:
            self.run([Path(p) for p in paths])

    def run(self, pdfs):
        self.progress.start(12)
        self.log(f"\n총 {len(pdfs)}개 파일 처리 시작...")
        threading.Thread(target=self._worker, args=(pdfs,), daemon=True).start()

    def _worker(self, pdfs):
        stage_img = STAGE / "images"
        all_rows = []
        for p in pdfs:
            try:
                all_rows += extract_pdf(p, self.tagger, stage_img, self.log)
            except Exception as e:
                self.log(f"  ⚠ {p.name} 오류: {e}")
        # new_tags.csv 갱신(누적 병합)
        csv_path = STAGE / "new_tags.csv"
        existing = tags_store.load_tags(csv_path)
        for item_id, tags in all_rows:
            existing[item_id] = {"tags": tags, "part": []}
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["id", "tags", "part"])
            for k in sorted(existing):
                w.writerow([k, ",".join(existing[k]["tags"]), ""])
        self.staged = len(list(stage_img.glob("*.png")))
        self.progress.stop()
        n = len(all_rows)
        tagged = sum(1 for _, t in all_rows if t)
        self.log(f"✅ 추출 {n}개 (태그 달림 {tagged}) · 스테이징 누적 {self.staged}개")
        self.log("   확인 후 [라이브러리에 병합]을 누르세요. 태그는 뷰어에서 보강 가능.")
        self._refresh_merge()

    # ---------- 병합 ----------
    def on_merge(self):
        imgs = list((STAGE / "images").glob("*.png"))
        if not imgs:
            return
        if not messagebox.askyesno("병합 확인",
                f"{len(imgs)}개 그림을 라이브러리로 옮기고\nmanifest를 재생성합니다.\n\n"
                f"대상: {LIB_DIR}\n계속할까요?"):
            return
        self.progress.start(12)
        threading.Thread(target=self._merge_worker, daemon=True).start()

    def _merge_worker(self):
        try:
            lib_img = LIB_DIR / "images"
            lib_img.mkdir(parents=True, exist_ok=True)
            imgs = list((STAGE / "images").glob("*.png"))
            for p in imgs:
                shutil.copy2(p, lib_img / p.name)
            self.log(f"  이미지 {len(imgs)}개 → {lib_img}")

            # 태그 원천 병합
            new_tags = tags_store.load_tags(STAGE / "new_tags.csv")
            tags_path = tags_store.default_tags_path(LIB_DIR)
            store = tags_store.load_tags(tags_path)
            for k, v in new_tags.items():
                if k not in store or not store[k]["tags"]:   # 기존 수동 태그는 보존
                    store[k] = v
            tags_store.save_tags(tags_path, store)
            self.log(f"  태그 {len(new_tags)}건 병합 → {tags_path.name} (백업 생성됨)")

            # manifest 재생성
            if BUILD_SCRIPT.is_file():
                self.log("  build_manifest.py 실행 중...")
                r = subprocess.run([sys.executable, str(BUILD_SCRIPT)],
                                   capture_output=True, text=True, cwd=str(ROOT))
                for line in (r.stdout or "").splitlines():
                    self.log("    " + line)
                if r.returncode != 0:
                    self.log("  ⚠ build_manifest 오류:\n" + (r.stderr or ""))
            else:
                self.log(f"  ⚠ build_manifest.py 없음 → {BUILD_SCRIPT}")

            # 스테이징 비우기(이미지)
            for p in imgs:
                p.unlink()
            self.progress.stop()
            self.log("✅ 병합 완료. 앱을 새로고침하면 반영됩니다.")
            self._refresh_merge()
            messagebox.showinfo("완료", "라이브러리 병합 + manifest 재생성 완료")
        except Exception as e:
            self.progress.stop()
            self.log(f"  ⚠ 병합 오류: {e}")
            messagebox.showerror("오류", str(e))


def main():
    root = TkinterDnD.Tk() if DND_AVAILABLE else tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
