"""
속성(Property) 인스펙터 패널 — Phase 3-B.

캔버스에서 오브젝트를 단일 선택하면 오른쪽 도크에 그 오브젝트의 편집 가능한
속성이 표시되고, 값을 바꾸면 즉시 반영되며 undo/redo 가 가능하다.

모든 변경은 items.BasePhysicsItem 의 기존 메서드/_push_property 를 통해 라우팅되어
우클릭 메뉴와 동일한 undo 명령(commands.*)을 재사용한다. (속성 로직을 재구현하지 않음)
"""
from __future__ import annotations

from PyQt6.QtCore import Qt, QSizeF, QPointF
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QLabel, QSpinBox, QDoubleSpinBox,
    QComboBox, QCheckBox, QPushButton, QHBoxLayout, QGroupBox, QScrollArea,
    QFrame,
)

import units

# 콤보박스 라벨 <-> 내부 패턴 키 (Phase 3-A 의 _fill_pattern 값)
_FILL_PATTERNS = (
    ("없음", "none"),
    ("단색(회색)", "solid"),
    ("도트", "dots"),
    ("해칭", "hatch"),
    ("엑스", "cross"),
)


class PropertyInspector(QWidget):
    """현재 선택된 단일 아이템의 속성을 편집하는 패널."""

    def __init__(self, on_group=None, on_ungroup=None, manager=None, parent=None):
        super().__init__(parent)
        self._item = None            # 현재 편집 대상 (없으면 None)
        self._loading = False        # True 인 동안에는 핸들러가 undo 명령을 푸시하지 않음
        self._on_group = on_group
        self._on_ungroup = on_ungroup
        self._manager = manager      # CanvasManager (레이어 목록/갱신용)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(8, 8, 8, 8)

        title = QLabel("속성")
        f = title.font(); f.setBold(True); f.setPointSize(f.pointSize() + 1)
        title.setFont(f)
        outer.addWidget(title)

        # 선택 없음 안내
        self._placeholder = QLabel("오브젝트를 선택하세요")
        self._placeholder.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._placeholder.setStyleSheet("color: #888; padding: 20px;")
        outer.addWidget(self._placeholder)

        # 스크롤 가능한 컨트롤 영역
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        self._controls = QWidget()
        scroll.setWidget(self._controls)
        outer.addWidget(scroll, 1)
        self._scroll = scroll

        form = QVBoxLayout(self._controls)
        form.setContentsMargins(0, 0, 0, 0)
        form.setSpacing(8)

        # --- 색/채우기 그룹 ---
        appearance = QGroupBox("모양")
        af = QFormLayout(appearance)

        self.pen_gray = QSpinBox()
        self.pen_gray.setRange(0, 255)
        self.pen_gray.valueChanged.connect(self._on_pen_gray)
        af.addRow("선 명도(0=검정)", self.pen_gray)

        self.fill_none = QCheckBox("채우기 없음")
        self.fill_none.toggled.connect(self._on_fill_none)
        af.addRow("", self.fill_none)

        self.fill_gray = QSpinBox()
        self.fill_gray.setRange(0, 255)
        self.fill_gray.valueChanged.connect(self._on_fill_gray)
        af.addRow("채우기 명도", self.fill_gray)

        self.fill_pattern = QComboBox()
        for label, _key in _FILL_PATTERNS:
            self.fill_pattern.addItem(label)
        self.fill_pattern.currentIndexChanged.connect(self._on_fill_pattern)
        af.addRow("면 채우기 패턴", self.fill_pattern)

        self.pen_width = QDoubleSpinBox()
        self.pen_width.setRange(0.5, 30.0)
        self.pen_width.setSingleStep(0.5)
        self.pen_width.setDecimals(1)
        self.pen_width.setSuffix(" pt")
        self.pen_width.valueChanged.connect(self._on_pen_width)
        af.addRow("선 굵기", self.pen_width)

        self.arrow_size = QDoubleSpinBox()
        self.arrow_size.setRange(3.0, 80.0)
        self.arrow_size.setDecimals(0)
        self.arrow_size.setSuffix(" px")
        self.arrow_size.valueChanged.connect(self._on_arrow_size)
        self._arrow_row_label = QLabel("화살표 크기")
        af.addRow(self._arrow_row_label, self.arrow_size)

        form.addWidget(appearance)

        # --- 기하 그룹 (크기/회전) ---
        geom = QGroupBox("크기 / 회전")
        gf = QFormLayout(geom)

        self.size_w = QDoubleSpinBox()
        self.size_w.setRange(0.0, 100000.0)
        self.size_w.valueChanged.connect(self._on_size_changed)
        gf.addRow("가로(W)", self.size_w)

        self.size_h = QDoubleSpinBox()
        self.size_h.setRange(0.0, 100000.0)
        self.size_h.valueChanged.connect(self._on_size_changed)
        gf.addRow("세로(H)", self.size_h)

        self.rotation = QDoubleSpinBox()
        self.rotation.setRange(-360.0, 360.0)
        self.rotation.setDecimals(1)
        self.rotation.setSuffix(" °")
        self.rotation.valueChanged.connect(self._on_rotation)
        gf.addRow("회전", self.rotation)

        form.addWidget(geom)

        # --- 잠금/고정 ---
        flags = QGroupBox("잠금 / 고정")
        ff = QVBoxLayout(flags)
        self.lock_chk = QCheckBox("위치 고정")
        self.lock_chk.toggled.connect(self._on_lock)
        ff.addWidget(self.lock_chk)
        self.pin_chk = QCheckBox("최상단 고정")
        self.pin_chk.toggled.connect(self._on_pin)
        ff.addWidget(self.pin_chk)
        form.addWidget(flags)

        # --- 레이어(쌓임 순서) ---
        layer = QGroupBox("레이어(쌓임 순서)")
        lf = QHBoxLayout(layer)
        btn_front = QPushButton("맨 앞으로")
        btn_front.clicked.connect(lambda: self._layer_op("front"))
        btn_fwd = QPushButton("앞으로")
        btn_fwd.clicked.connect(lambda: self._layer_op("forward"))
        btn_bwd = QPushButton("뒤로")
        btn_bwd.clicked.connect(lambda: self._layer_op("backward"))
        btn_back = QPushButton("맨 뒤로")
        btn_back.clicked.connect(lambda: self._layer_op("back"))
        for b in (btn_front, btn_fwd, btn_bwd, btn_back):
            lf.addWidget(b)
        form.addWidget(layer)

        # --- 레이어 이동 (소속 레이어 변경) ---
        layer_move = QGroupBox("레이어")
        lmf = QFormLayout(layer_move)
        self.layer_combo = QComboBox()
        self.layer_combo.currentIndexChanged.connect(self._on_layer_move)
        lmf.addRow("소속 레이어", self.layer_combo)
        form.addWidget(layer_move)

        # --- 그룹 ---
        grp = QGroupBox("개체 묶기")
        gpf = QHBoxLayout(grp)
        btn_group = QPushButton("개체 묶기")
        btn_group.clicked.connect(self._do_group)
        btn_ungroup = QPushButton("묶기 해제")
        btn_ungroup.clicked.connect(self._do_ungroup)
        gpf.addWidget(btn_group)
        gpf.addWidget(btn_ungroup)
        form.addWidget(grp)

        form.addStretch(1)

        self.setItem(None)

    # ------------------------------------------------------------------ #
    # 외부 API
    # ------------------------------------------------------------------ #
    def setItem(self, item) -> None:
        """편집 대상 아이템 설정. None 이면 컨트롤을 비활성/숨김 처리."""
        self._item = item
        if item is None:
            self._placeholder.show()
            self._scroll.hide()
            return

        self._placeholder.hide()
        self._scroll.show()
        self._populate(item)

    def refresh(self) -> None:
        """현재 아이템에서 값을 다시 읽어 컨트롤을 갱신 (undo/redo 후 동기화)."""
        if self._item is not None and self._item.scene() is not None:
            self._populate(self._item)
        elif self._item is not None:
            # 아이템이 씬에서 제거됨 -> 클리어
            self.setItem(None)

    # ------------------------------------------------------------------ #
    # 컨트롤 채우기 (guard 로 핸들러 차단)
    # ------------------------------------------------------------------ #
    def _populate(self, item) -> None:
        self._loading = True
        try:
            self.pen_gray.setValue(int(getattr(item, "_gray_pen", 0)))

            fg = int(getattr(item, "_fill_gray", -1))
            none_fill = fg < 0
            self.fill_none.setChecked(none_fill)
            self.fill_gray.setEnabled(not none_fill)
            self.fill_gray.setValue(fg if fg >= 0 else 230)

            pat = getattr(item, "_fill_pattern", "none")
            idx = next((i for i, (_l, k) in enumerate(_FILL_PATTERNS)
                        if k == pat), 0)
            self.fill_pattern.setCurrentIndex(idx)

            self.pen_width.setValue(float(getattr(item, "_pen_width", 1.0)))

            has_arrow = bool(getattr(item, "HAS_ARROW_HEAD", False))
            self.arrow_size.setVisible(has_arrow)
            self._arrow_row_label.setVisible(has_arrow)
            if has_arrow:
                self.arrow_size.setValue(float(getattr(item, "_arrow_size", 12.0)))

            # 크기 (현재 단위로 표시)
            has_size = hasattr(item, "size") and callable(item.size)
            self.size_w.setEnabled(has_size)
            self.size_h.setEnabled(has_size)
            if has_size:
                dec = units.decimals()
                sfx = units.suffix()
                self.size_w.setDecimals(dec); self.size_w.setSuffix(sfx)
                self.size_h.setDecimals(dec); self.size_h.setSuffix(sfx)
                sz = item.size()
                self.size_w.setValue(units.from_px(sz.width()))
                self.size_h.setValue(units.from_px(sz.height()))

            self.rotation.setValue(float(item.rotation()))

            self.lock_chk.setChecked(bool(getattr(item, "_locked", False)))
            self.pin_chk.setChecked(bool(getattr(item, "_pinned_top", False)))

            self._fill_layer_combo()
            li = int(getattr(item, "_layer", 0))
            if 0 <= li < self.layer_combo.count():
                self.layer_combo.setCurrentIndex(li)
        finally:
            self._loading = False

    # ------------------------------------------------------------------ #
    # 핸들러 — 사용자 편집 시에만 (loading 가드)
    # ------------------------------------------------------------------ #
    def _busy(self) -> bool:
        return self._loading or self._item is None

    def _on_pen_gray(self, v: int):
        if self._busy():
            return
        old = self._item._gray_pen
        if v != old:
            self._item._push_property("_gray_pen", old, v, "선 회색")

    def _on_fill_none(self, checked: bool):
        if self._busy():
            return
        self.fill_gray.setEnabled(not checked)
        old = self._item._fill_gray
        new = -1 if checked else self.fill_gray.value()
        if new != old:
            self._item._push_property("_fill_gray", old, new, "채우기 회색")

    def _on_fill_gray(self, v: int):
        if self._busy():
            return
        if self.fill_none.isChecked():
            return
        old = self._item._fill_gray
        if v != old:
            self._item._push_property("_fill_gray", old, v, "채우기 회색")

    def _on_fill_pattern(self, idx: int):
        if self._busy():
            return
        new = _FILL_PATTERNS[idx][1]
        old = getattr(self._item, "_fill_pattern", "none")
        if new != old:
            self._item._push_property("_fill_pattern", old, new, "면 채우기")

    def _on_pen_width(self, v: float):
        if self._busy():
            return
        old = self._item._pen_width
        if abs(v - old) > 1e-9:
            self._item._push_property("_pen_width", old, v, "선 굵기")

    def _on_arrow_size(self, v: float):
        if self._busy():
            return
        old = getattr(self._item, "_arrow_size", v)
        if abs(v - old) > 1e-9:
            self._item._push_property("_arrow_size", old, v, "화살표 크기")

    def _on_size_changed(self, _v: float):
        if self._busy():
            return
        item = self._item
        if not (hasattr(item, "size") and callable(item.size)):
            return
        new_w = units.to_px(self.size_w.value())
        new_h = units.to_px(self.size_h.value())
        cur = item.size()
        if (abs(new_w - cur.width()) <= 1e-6 and
                abs(new_h - cur.height()) <= 1e-6):
            return
        scn = item.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import ResizeItemCommand
            stack.push(ResizeItemCommand(
                item,
                {'size': QSizeF(cur), 'pos': QPointF(item.pos())},
                {'size': QSizeF(new_w, new_h), 'pos': QPointF(item.pos())}))
        else:
            item.setSize(QSizeF(new_w, new_h))

    def _on_rotation(self, v: float):
        if self._busy():
            return
        item = self._item
        old = item.rotation()
        if abs(v - old) <= 1e-9:
            return
        scn = item.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import RotateItemCommand
            stack.push(RotateItemCommand(item, old, v))
        else:
            item.setRotation(v)

    def _on_lock(self, checked: bool):
        if self._busy():
            return
        # _toggle_lock_undoable 은 현재 상태를 반전시키므로, 체크박스가 이미
        # 새 상태를 표시할 때만(=상태 불일치) 호출한다.
        if bool(getattr(self._item, "_locked", False)) != checked:
            self._item._toggle_lock_undoable()

    def _on_pin(self, checked: bool):
        if self._busy():
            return
        # 우클릭 메뉴와 동일하게 setPinnedTop 직접 호출 (기존 동작 일치)
        self._item.setPinnedTop(checked)

    def _fill_layer_combo(self):
        """콤보 항목을 CanvasManager.layerNames() 로 다시 채운다."""
        names = []
        if self._manager is not None and hasattr(self._manager, "layerNames"):
            names = self._manager.layerNames()
        self.layer_combo.blockSignals(True)
        self.layer_combo.clear()
        self.layer_combo.addItems(names)
        self.layer_combo.blockSignals(False)
        self.layer_combo.setEnabled(len(names) > 1)

    def refresh_layer_names(self):
        """레이어 목록(추가/삭제/이름변경) 변경 시 외부에서 호출 — 현재
        아이템의 소속을 유지하며 콤보 항목을 갱신한다."""
        self._loading = True
        try:
            self._fill_layer_combo()
            if self._item is not None:
                li = int(getattr(self._item, "_layer", 0))
                if 0 <= li < self.layer_combo.count():
                    self.layer_combo.setCurrentIndex(li)
        finally:
            self._loading = False

    def _on_layer_move(self, idx: int):
        if self._busy():
            return
        if idx < 0:
            return
        old = int(getattr(self._item, "_layer", 0))
        if idx != old:
            # Phase 3-B 의 undo 패턴 재사용 — PropertyChangeCommand("_layer", ...).
            self._item._push_property("_layer", old, idx, "레이어 이동")
            if self._manager is not None and hasattr(self._manager, "_refresh_layer_view"):
                self._manager._refresh_layer_view()

    def _layer_op(self, which: str):
        """레이어 내(=같은 레이어) z-순서만 바꾼다. 매니저에 위임해 레이어
        경계를 넘지 않으며 undo 가능하다."""
        item = self._item
        if item is None:
            return
        if self._manager is not None and hasattr(self._manager, "reorderItem"):
            self._manager.reorderItem(item, which)
        else:
            # 폴백: 아이템 메서드 경로 (동일하게 매니저로 위임됨)
            {"front": getattr(item, "_bring_to_front", None),
             "forward": getattr(item, "_bring_forward", None),
             "backward": getattr(item, "_send_backward", None),
             "back": getattr(item, "_send_to_back", None)}.get(which, lambda: None)()

    def _do_group(self):
        if self._on_group is not None:
            self._on_group()

    def _do_ungroup(self):
        if self._on_ungroup is not None:
            self._on_ungroup()
