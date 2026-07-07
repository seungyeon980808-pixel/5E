#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""기출 그림 태깅 뷰어.

라이브러리 manifest를 열어 그림을 하나씩 보며 태그를 직접 확인·추가·삭제한다.
편집한 태그는 태그 원천(tags.xlsx/csv)에 저장되고, [manifest 재생성]으로 검색에 반영된다.

  좌: 그림 목록(검색·필터) | 중: 그림 미리보기 | 우: 태그 편집 + 어휘집 제안
"""
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

sys.path.insert(0, str(Path(__file__).resolve().parent))
import tags_store

try:
    from PIL import Image, ImageTk
    PIL_OK = True
except ImportError:
    PIL_OK = False

import json

TOOL_DIR = Path(__file__).resolve().parent
ROOT = TOOL_DIR.parents[1]
LIB_DIR = ROOT / "assets" / "exam-library"
IMG_DIR = LIB_DIR / "images"
MANIFEST = LIB_DIR / "manifest.json"
BUILD_SCRIPT = ROOT / "scripts" / "build_manifest.py"
VOCAB = LIB_DIR / "tag-vocab.json"
VOCAB_PROPOSED = TOOL_DIR / "tag-vocab.proposed.json"


def load_vocab():
    """어휘집 태그 목록(제안본이 있으면 그것 우선)."""
    for p in (VOCAB, VOCAB_PROPOSED):
        if p.is_file():
            data = json.loads(p.read_text(encoding="utf-8"))
            return [t for c in data.get("categories", []) for t in c.get("tags", [])]
    return []


class Viewer:
    def __init__(self, root):
        self.root = root
        root.title("기출 그림 태깅 뷰어")
        root.geometry("1080x680")
        self.vocab = load_vocab()
        self.tags_path = tags_store.default_tags_path(LIB_DIR)
        self.store = tags_store.load_tags(self.tags_path)
        self.items = self._load_items()
        self.dirty = False
        self.cur = None
        self._thumb = None
        self._build_ui()
        self._apply_filter()

    def _load_items(self):
        if MANIFEST.is_file():
            data = json.loads(MANIFEST.read_text(encoding="utf-8"))
            return data.get("items", [])
        # manifest 없으면 이미지 파일명으로 최소 목록 구성
        items = []
        for p in sorted(IMG_DIR.glob("*.png")):
            items.append({"id": p.stem, "file": p.name, "title": p.stem, "tags": []})
        return items

    def _tags_of(self, item_id, fallback):
        rec = self.store.get(item_id)
        return list(rec["tags"]) if rec and rec["tags"] else list(fallback or [])

    # ---------- UI ----------
    def _build_ui(self):
        top = tk.Frame(self.root)
        top.pack(fill="x", padx=8, pady=6)
        tk.Label(top, text="검색:", font=("맑은 고딕", 10)).pack(side="left")
        self.q = tk.StringVar()
        e = tk.Entry(top, textvariable=self.q, width=30, font=("맑은 고딕", 10))
        e.pack(side="left", padx=4)
        e.bind("<KeyRelease>", lambda ev: self._apply_filter())
        self.only_untagged = tk.BooleanVar(value=False)
        tk.Checkbutton(top, text="태그 없는 것만", variable=self.only_untagged,
                       command=self._apply_filter, font=("맑은 고딕", 10)).pack(side="left", padx=8)
        self.count_lbl = tk.Label(top, text="", font=("맑은 고딕", 10), fg="#555")
        self.count_lbl.pack(side="left", padx=8)
        tk.Button(top, text="저장", command=self.save, font=("맑은 고딕", 10),
                  width=8).pack(side="right", padx=2)
        tk.Button(top, text="manifest 재생성", command=self.rebuild,
                  font=("맑은 고딕", 10)).pack(side="right", padx=2)

        body = tk.Frame(self.root)
        body.pack(fill="both", expand=True, padx=8, pady=4)

        # 좌: 목록
        left = tk.Frame(body, width=280)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)
        self.listbox = tk.Listbox(left, font=("맑은 고딕", 10), activestyle="none")
        self.listbox.pack(side="left", fill="both", expand=True)
        sb = tk.Scrollbar(left, command=self.listbox.yview)
        sb.pack(side="right", fill="y")
        self.listbox.config(yscrollcommand=sb.set)
        self.listbox.bind("<<ListboxSelect>>", self.on_select)

        # 중: 미리보기
        mid = tk.Frame(body, bg="#fafafa", bd=1, relief="sunken")
        mid.pack(side="left", fill="both", expand=True, padx=8)
        self.title_lbl = tk.Label(mid, text="", font=("맑은 고딕", 12, "bold"), bg="#fafafa")
        self.title_lbl.pack(pady=6)
        self.canvas = tk.Label(mid, bg="#fafafa")
        self.canvas.pack(fill="both", expand=True, padx=8, pady=8)

        # 우: 태그 편집
        right = tk.Frame(body, width=300)
        right.pack(side="right", fill="y")
        right.pack_propagate(False)
        tk.Label(right, text="태그 (클릭해 삭제)", font=("맑은 고딕", 10, "bold")).pack(anchor="w")
        self.tag_frame = tk.Frame(right)
        self.tag_frame.pack(fill="x", pady=4)
        addf = tk.Frame(right)
        addf.pack(fill="x", pady=4)
        self.new_tag = tk.StringVar()
        ent = tk.Entry(addf, textvariable=self.new_tag, font=("맑은 고딕", 10))
        ent.pack(side="left", fill="x", expand=True)
        ent.bind("<Return>", lambda ev: self.add_typed())
        tk.Button(addf, text="추가", command=self.add_typed, width=6).pack(side="left", padx=2)
        tk.Label(right, text="어휘집 제안 (클릭해 추가)", font=("맑은 고딕", 10, "bold")).pack(anchor="w", pady=(10, 2))
        self.sugg_wrap = tk.Frame(right)
        self.sugg_wrap.pack(fill="both", expand=True)

        if not PIL_OK:
            self.title_lbl.configure(
                text="⚠ Pillow 미설치 — 이미지 미리보기 불가 (pip install pillow)")

    # ---------- 목록/필터 ----------
    def _apply_filter(self):
        q = self.q.get().strip()
        only = self.only_untagged.get()
        self.filtered = []
        for it in self.items:
            tags = self._tags_of(it["id"], it.get("tags"))
            if only and tags:
                continue
            if q:
                hay = it.get("title", "") + " " + it["id"] + " " + " ".join(tags)
                if q not in hay:
                    continue
            self.filtered.append(it)
        self.listbox.delete(0, "end")
        for it in self.filtered:
            mark = "" if self._tags_of(it["id"], it.get("tags")) else "· "
            self.listbox.insert("end", mark + it.get("title", it["id"]))
        self.count_lbl.config(text=f"{len(self.filtered)} / {len(self.items)}개")

    def on_select(self, ev):
        sel = self.listbox.curselection()
        if not sel:
            return
        self.cur = self.filtered[sel[0]]
        self._show(self.cur)

    def _show(self, it):
        self.title_lbl.config(text=it.get("title", it["id"]))
        if PIL_OK:
            path = IMG_DIR / it.get("file", it["id"] + ".png")
            if path.is_file():
                img = Image.open(path)
                img.thumbnail((460, 460))
                self._thumb = ImageTk.PhotoImage(img)
                self.canvas.config(image=self._thumb)
            else:
                self.canvas.config(image="", text="(이미지 없음)")
        self._render_tags()

    # ---------- 태그 편집 ----------
    def _cur_tags(self):
        return self._tags_of(self.cur["id"], self.cur.get("tags"))

    def _set_tags(self, tags):
        self.store.setdefault(self.cur["id"], {"tags": [], "part": []})
        self.store[self.cur["id"]]["tags"] = tags
        self.dirty = True

    def _render_tags(self):
        for w in self.tag_frame.winfo_children():
            w.destroy()
        for t in self._cur_tags():
            b = tk.Button(self.tag_frame, text=f"{t} ✕", font=("맑은 고딕", 10),
                          bg="#e7f0ff", relief="ridge",
                          command=lambda x=t: self.remove_tag(x))
            b.pack(side="left", padx=2, pady=2)
        # 어휘집 제안: 아직 안 단 것 중 앞 30개
        for w in self.sugg_wrap.winfo_children():
            w.destroy()
        cur = set(self._cur_tags())
        row = None
        for i, t in enumerate([v for v in self.vocab if v not in cur][:40]):
            if i % 2 == 0:
                row = tk.Frame(self.sugg_wrap)
                row.pack(fill="x")
            tk.Button(row, text="+ " + t, font=("맑은 고딕", 9), anchor="w",
                      command=lambda x=t: self.add_tag(x)).pack(side="left", fill="x",
                                                                expand=True, padx=1, pady=1)

    def add_tag(self, t):
        if not self.cur:
            return
        tags = self._cur_tags()
        if t and t not in tags:
            tags.append(t)
            self._set_tags(tags)
            self._render_tags()
            self._apply_filter()

    def add_typed(self):
        t = self.new_tag.get().strip()
        if t:
            self.add_tag(t)
            self.new_tag.set("")

    def remove_tag(self, t):
        tags = [x for x in self._cur_tags() if x != t]
        self._set_tags(tags)
        self._render_tags()
        self._apply_filter()

    # ---------- 저장/재빌드 ----------
    def save(self):
        tags_store.save_tags(self.tags_path, self.store)
        self.dirty = False
        messagebox.showinfo("저장", f"{self.tags_path.name}에 저장했습니다 (백업 생성됨).")

    def rebuild(self):
        if self.dirty:
            self.save()
        if not BUILD_SCRIPT.is_file():
            messagebox.showerror("오류", f"build_manifest.py 없음:\n{BUILD_SCRIPT}")
            return
        r = subprocess.run([sys.executable, str(BUILD_SCRIPT)],
                           capture_output=True, text=True, cwd=str(ROOT))
        if r.returncode == 0:
            self.items = self._load_items()
            self._apply_filter()
            messagebox.showinfo("완료", "manifest 재생성 완료.\n" + (r.stdout or "")[-400:])
        else:
            messagebox.showerror("오류", (r.stderr or "")[-600:])


def main():
    root = tk.Tk()
    Viewer(root)
    root.mainloop()


if __name__ == "__main__":
    main()
