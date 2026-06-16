"""
왼쪽 콘솔 패널 - 카테고리별 심볼 팔레트.

- 드래그앤드롭: 일반 심볼
- 더블클릭: 두 점 그리기(DRAW_MODE = True) 심볼
"""
from __future__ import annotations
from PyQt6.QtCore import (
    Qt, QSize, QPointF, QRectF, QMimeData, QByteArray, pyqtSignal, QTimer
)
from PyQt6.QtGui import (
    QPixmap, QPainter, QPen, QColor, QBrush, QDrag, QIcon, QFont, QPolygonF
)
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QToolBox, QListWidget, QListWidgetItem,
    QListView, QAbstractItemView, QPushButton, QLabel, QFrame, QDoubleSpinBox,
    QSpinBox, QComboBox, QFormLayout, QGroupBox, QCheckBox, QApplication,
    QToolButton, QGridLayout, QSizePolicy
)

import items
from items import (
    BasePhysicsItem, TextItem, TwoPointItem, MultiPointItem, SYMBOL_REGISTRY,
    set_default_pen_width, set_default_arrow_size,
    apply_pen_width_to_items, apply_arrow_size_to_items,
)
from canvas import MIME_SYMBOL
import units


CATEGORY_ORDER = ["기본", "광학", "역학", "전자기학", "현대물리학"]


def _draw_two_point_preview(painter: QPainter, cls: type, size: int):
    """두 점 그리기 클래스의 미리보기 — 좌→우 사선."""
    p1 = QPointF(8, size - 8)
    p2 = QPointF(size - 8, 8)
    pen = QPen(QColor(20, 20, 20), 1)  # 기본 1pt
    if getattr(cls, "DASHED", False):
        pen.setStyle(Qt.PenStyle.DashLine)
        pen.setDashPattern([4, 3])
    pen.setCapStyle(Qt.PenCapStyle.RoundCap)
    painter.setPen(pen)
    painter.drawLine(p1, p2)
    if getattr(cls, "HAS_ARROW", False):
        pen2 = QPen(QColor(20, 20, 20), 1)
        pen2.setStyle(Qt.PenStyle.SolidLine)
        painter.setPen(pen2)
        painter.setBrush(QBrush(QColor(20, 20, 20)))
        import math
        ang = math.atan2(p2.y() - p1.y(), p2.x() - p1.x())
        head = 10
        left = QPointF(p2.x() - head * math.cos(ang - 0.45),
                       p2.y() - head * math.sin(ang - 0.45))
        right = QPointF(p2.x() - head * math.cos(ang + 0.45),
                        p2.y() - head * math.sin(ang + 0.45))
        painter.drawPolygon(QPolygonF([p2, left, right]))


def make_preview_icon(cls: type, size: int = 60) -> QIcon:
    pm = QPixmap(size, size)
    pm.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pm)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
    painter.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)

    if cls is TextItem:
        painter.setPen(QPen(QColor(40, 40, 40)))
        f = QFont("맑은 고딕", 18, QFont.Weight.Bold)
        painter.setFont(f)
        painter.drawText(QRectF(0, 0, size, size), Qt.AlignmentFlag.AlignCenter, "T")
        painter.end()
        return QIcon(pm)

    if isinstance(cls, type) and issubclass(cls, TwoPointItem):
        _draw_two_point_preview(painter, cls, size)
        painter.end()
        return QIcon(pm)

    try:
        inst = cls()
        default = inst.size()
        margin = 6
        avail = size - 2 * margin
        scale = min(avail / max(default.width(), 1), avail / max(default.height(), 1))
        painter.translate((size - default.width() * scale) / 2,
                          (size - default.height() * scale) / 2)
        painter.scale(scale, scale)
        pen = QPen(QColor(20, 20, 20), 1)  # 기본 1pt
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        painter.setPen(pen)
        painter.setBrush(inst.fillBrush())
        inst.paintSymbol(painter)
    except Exception:
        painter.setPen(QPen(QColor(150, 50, 50)))
        painter.drawText(QRectF(0, 0, size, size), Qt.AlignmentFlag.AlignCenter, "?")
    finally:
        painter.end()
    return QIcon(pm)


class SymbolList(QListWidget):
    """심볼 목록 - 드래그(일반) 또는 더블클릭(두 점 그리기 시작 / 일반은 캔버스에 추가)."""

    ICON_SIZE = 56
    drawModeRequested = pyqtSignal(object)  # cls (두 점)
    multiDrawModeRequested = pyqtSignal(object)  # cls (다점)
    addItemRequested = pyqtSignal(object)   # cls (일반 아이템을 캔버스 중앙에 추가)
    clickToDrawRequested = pyqtSignal(object)  # cls (단일 클릭 → 캔버스 클릭&드래그 생성)

    def __init__(self, classes: list[type]):
        super().__init__()
        self.setViewMode(QListView.ViewMode.IconMode)
        self.setIconSize(QSize(self.ICON_SIZE, self.ICON_SIZE))
        self.setGridSize(QSize(self.ICON_SIZE + 36, self.ICON_SIZE + 32))
        self.setMovement(QListView.Movement.Static)
        self.setResizeMode(QListView.ResizeMode.Adjust)
        self.setDragEnabled(True)
        self.setDragDropMode(QAbstractItemView.DragDropMode.DragOnly)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.setSpacing(4)
        self.setWordWrap(True)
        self.setUniformItemSizes(True)
        # 단일-클릭 → click-drag 생성 트리거. 더블클릭과 충돌 방지를 위해
        # release 시점에 doubleClickInterval 만큼 지연 후 emit.
        self._press_pos: QPointF | None = None
        self._drag_started = False
        self._pending_click_cls: type | None = None
        self._click_timer = QTimer(self)
        self._click_timer.setSingleShot(True)
        self._click_timer.timeout.connect(self._emit_pending_click)
        for cls in classes:
            label = getattr(cls, "LABEL", cls.__name__)
            if getattr(cls, "MULTI_POINT_MODE", False):
                mark = "◇ "
            elif getattr(cls, "DRAW_MODE", False):
                mark = "✱ "
            else:
                mark = ""
            it = QListWidgetItem(make_preview_icon(cls, self.ICON_SIZE),
                                 mark + label)
            it.setData(Qt.ItemDataRole.UserRole, cls.__name__)
            tip = label
            if getattr(cls, "MULTI_POINT_MODE", False):
                tip += "\n더블클릭 후 캔버스에서 클릭으로 점들을 추가, Enter로 확정."
            elif getattr(cls, "DRAW_MODE", False):
                tip += "\n더블클릭 후 캔버스에서 두 점을 클릭하세요."
            else:
                tip += "\n드래그 또는 더블클릭으로 캔버스에 추가하세요."
            it.setToolTip(tip)
            self.addItem(it)
        self.itemDoubleClicked.connect(self._on_double_click)

    def _on_double_click(self, item: QListWidgetItem):
        # 더블클릭이 들어왔으니 단일-클릭 지연 emit 취소
        self._click_timer.stop()
        self._pending_click_cls = None
        cls_name = item.data(Qt.ItemDataRole.UserRole)
        cls = next((c for c in SYMBOL_REGISTRY if c.__name__ == cls_name), None)
        if not cls:
            return
        if getattr(cls, "MULTI_POINT_MODE", False):
            self.multiDrawModeRequested.emit(cls)
        elif getattr(cls, "DRAW_MODE", False):
            self.drawModeRequested.emit(cls)
        else:
            self.addItemRequested.emit(cls)

    def mousePressEvent(self, ev):
        if ev.button() == Qt.MouseButton.LeftButton:
            self._press_pos = ev.position().toPoint() if hasattr(ev, 'position') else ev.pos()
            self._drag_started = False
        super().mousePressEvent(ev)

    def mouseMoveEvent(self, ev):
        if self._press_pos is not None and (ev.buttons() & Qt.MouseButton.LeftButton):
            cur = ev.position().toPoint() if hasattr(ev, 'position') else ev.pos()
            if (cur - self._press_pos).manhattanLength() > \
                    QApplication.startDragDistance():
                self._drag_started = True
        super().mouseMoveEvent(ev)

    def mouseReleaseEvent(self, ev):
        if (ev.button() == Qt.MouseButton.LeftButton
                and self._press_pos is not None
                and not self._drag_started):
            cur = ev.position().toPoint() if hasattr(ev, 'position') else ev.pos()
            item = self.itemAt(cur)
            if item is not None:
                cls_name = item.data(Qt.ItemDataRole.UserRole)
                cls = next((c for c in SYMBOL_REGISTRY
                            if c.__name__ == cls_name), None)
                if (cls is not None
                        and not getattr(cls, "DRAW_MODE", False)
                        and not getattr(cls, "MULTI_POINT_MODE", False)):
                    self._pending_click_cls = cls
                    self._click_timer.start(QApplication.doubleClickInterval())
        self._press_pos = None
        self._drag_started = False
        super().mouseReleaseEvent(ev)

    def _emit_pending_click(self):
        cls = self._pending_click_cls
        self._pending_click_cls = None
        if cls is not None:
            self.clickToDrawRequested.emit(cls)

    def startDrag(self, supportedActions):
        it = self.currentItem()
        if it is None:
            return
        cls_name = it.data(Qt.ItemDataRole.UserRole)
        cls = next((c for c in SYMBOL_REGISTRY if c.__name__ == cls_name), None)
        # 두 점/다점 그리기 클래스는 드래그앤드롭 비활성 (더블클릭 전용)
        if cls and (getattr(cls, "DRAW_MODE", False)
                    or getattr(cls, "MULTI_POINT_MODE", False)):
            return
        # 실제 드래그가 시작되면 단일-클릭 대기 취소
        self._drag_started = True
        self._click_timer.stop()
        self._pending_click_cls = None
        mime = QMimeData()
        mime.setData(MIME_SYMBOL, QByteArray(cls_name.encode("utf-8")))
        drag = QDrag(self)
        drag.setMimeData(mime)
        drag.setPixmap(it.icon().pixmap(self.ICON_SIZE, self.ICON_SIZE))
        drag.exec(Qt.DropAction.CopyAction)


class SymbolCell(QToolButton):
    """그리드 셀: 아이콘 + 이름. 클릭/더블클릭/드래그 동작은 SymbolList 와 동일."""

    drawModeRequested = pyqtSignal(object)
    multiDrawModeRequested = pyqtSignal(object)
    addItemRequested = pyqtSignal(object)
    clickToDrawRequested = pyqtSignal(object)

    ICON_SIZE = 48

    def __init__(self, cls: type, parent: QWidget | None = None):
        super().__init__(parent)
        self._cls = cls
        self.setIcon(make_preview_icon(cls, self.ICON_SIZE))
        self.setIconSize(QSize(self.ICON_SIZE, self.ICON_SIZE))
        label = getattr(cls, "LABEL", cls.__name__)
        if getattr(cls, "MULTI_POINT_MODE", False):
            mark = "◇ "
        elif getattr(cls, "DRAW_MODE", False):
            mark = "✱ "
        else:
            mark = ""
        self.setText(mark + label)
        self.setToolButtonStyle(Qt.ToolButtonStyle.ToolButtonTextUnderIcon)
        self.setAutoRaise(True)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.setMinimumSize(self.ICON_SIZE + 12, self.ICON_SIZE + 22)
        tip = label
        if getattr(cls, "MULTI_POINT_MODE", False):
            tip += "\n클릭 후 캔버스에서 클릭으로 점들을 추가, Enter로 확정."
        elif getattr(cls, "DRAW_MODE", False):
            tip += "\n클릭 후 캔버스에서 두 점을 클릭하세요."
        else:
            tip += "\n드래그/더블클릭으로 추가, 단일 클릭은 캔버스 클릭&드래그 모드."
        self.setToolTip(tip)

        self._press_pos = None
        self._drag_started = False
        self._pending_click = False
        self._click_timer = QTimer(self)
        self._click_timer.setSingleShot(True)
        self._click_timer.timeout.connect(self._emit_pending_click)

    def mousePressEvent(self, ev):
        if ev.button() == Qt.MouseButton.LeftButton:
            self._press_pos = ev.position().toPoint() if hasattr(ev, 'position') else ev.pos()
            self._drag_started = False
        super().mousePressEvent(ev)

    def mouseMoveEvent(self, ev):
        if (self._press_pos is not None
                and (ev.buttons() & Qt.MouseButton.LeftButton)
                and not self._drag_started):
            cur = ev.position().toPoint() if hasattr(ev, 'position') else ev.pos()
            if (cur - self._press_pos).manhattanLength() > \
                    QApplication.startDragDistance():
                self._drag_started = True
                self._click_timer.stop()
                self._pending_click = False
                self._start_drag()
                return
        super().mouseMoveEvent(ev)

    def mouseReleaseEvent(self, ev):
        if (ev.button() == Qt.MouseButton.LeftButton
                and self._press_pos is not None
                and not self._drag_started):
            cls = self._cls
            if getattr(cls, "MULTI_POINT_MODE", False):
                self.multiDrawModeRequested.emit(cls)
            elif getattr(cls, "DRAW_MODE", False):
                self.drawModeRequested.emit(cls)
            else:
                self._pending_click = True
                self._click_timer.start(QApplication.doubleClickInterval())
        self._press_pos = None
        self._drag_started = False
        super().mouseReleaseEvent(ev)

    def mouseDoubleClickEvent(self, ev):
        self._click_timer.stop()
        self._pending_click = False
        cls = self._cls
        if getattr(cls, "MULTI_POINT_MODE", False):
            self.multiDrawModeRequested.emit(cls)
        elif getattr(cls, "DRAW_MODE", False):
            self.drawModeRequested.emit(cls)
        else:
            self.addItemRequested.emit(cls)
        super().mouseDoubleClickEvent(ev)

    def _emit_pending_click(self):
        if self._pending_click:
            self._pending_click = False
            self.clickToDrawRequested.emit(self._cls)

    def _start_drag(self):
        cls = self._cls
        if (getattr(cls, "DRAW_MODE", False)
                or getattr(cls, "MULTI_POINT_MODE", False)):
            return
        mime = QMimeData()
        mime.setData(MIME_SYMBOL, QByteArray(cls.__name__.encode("utf-8")))
        drag = QDrag(self)
        drag.setMimeData(mime)
        drag.setPixmap(self.icon().pixmap(self.ICON_SIZE, self.ICON_SIZE))
        drag.exec(Qt.DropAction.CopyAction)


class SymbolGrid(QWidget):
    """카테고리별 심볼 그리드. SymbolCell 들을 N열 그리드로 배치."""

    drawModeRequested = pyqtSignal(object)
    multiDrawModeRequested = pyqtSignal(object)
    addItemRequested = pyqtSignal(object)
    clickToDrawRequested = pyqtSignal(object)

    COLS = 4

    def __init__(self, classes: list[type], parent: QWidget | None = None):
        super().__init__(parent)
        grid = QGridLayout(self)
        grid.setContentsMargins(4, 4, 4, 4)
        grid.setHorizontalSpacing(4)
        grid.setVerticalSpacing(4)
        for i, cls in enumerate(classes):
            r, c = divmod(i, self.COLS)
            cell = SymbolCell(cls, self)
            cell.drawModeRequested.connect(self.drawModeRequested)
            cell.multiDrawModeRequested.connect(self.multiDrawModeRequested)
            cell.addItemRequested.connect(self.addItemRequested)
            cell.clickToDrawRequested.connect(self.clickToDrawRequested)
            grid.addWidget(cell, r, c)
        for c in range(self.COLS):
            grid.setColumnStretch(c, 1)
        # 빈 공간을 아래로 밀어내기
        last_row = (max(len(classes) - 1, 0)) // self.COLS + 1
        grid.setRowStretch(last_row, 1)


class ConsolePanel(QWidget):
    """왼쪽 콘솔: 상단 버튼 + 전역 설정 + 카테고리별 팔레트."""

    drawModeRequested = pyqtSignal(object)
    multiDrawModeRequested = pyqtSignal(object)
    addItemRequested = pyqtSignal(object)
    clickToDrawRequested = pyqtSignal(object)
    unitChanged = pyqtSignal(str)
    applyPenWidthToAll = pyqtSignal(float)
    applyArrowSizeToAll = pyqtSignal(float)
    groupRequested = pyqtSignal()
    ungroupRequested = pyqtSignal()
    gridToggled = pyqtSignal(bool)
    gridIntensityChanged = pyqtSignal(int)   # 0~255 (작을수록 짙음)
    gridSpacingChanged = pyqtSignal(float)   # mm
    gridMoveRequested = pyqtSignal()         # 격자 원점 이동 모드 진입
    projectSaveRequested = pyqtSignal()
    projectLoadRequested = pyqtSignal()
    imageLoadRequested = pyqtSignal()        # PNG/JPG 외부 이미지 불러오기
    undoRequested = pyqtSignal()
    redoRequested = pyqtSignal()

    def __init__(self, on_new_image, on_save, on_fit, on_reset_zoom):
        super().__init__()
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        title = QLabel("물리 출제용 그림 도구")
        f = title.font(); f.setBold(True); f.setPointSize(11); title.setFont(f)
        layout.addWidget(title)

        self.btn_toggle_settings = QPushButton("⚙ 설정 펼치기 / 접기")
        self.btn_toggle_settings.setCheckable(True)
        self.btn_toggle_settings.clicked.connect(self._on_toggle_settings)
        layout.addWidget(self.btn_toggle_settings)

        # Undo / Redo 버튼 행 — 이미지 생성하기 위
        row_undo = QHBoxLayout()
        self.btn_undo = QPushButton("↶ 실행취소")
        self.btn_undo.setToolTip("실행취소 (Ctrl+Z)")
        self.btn_undo.setEnabled(False)
        self.btn_undo.clicked.connect(lambda: self.undoRequested.emit())
        self.btn_redo = QPushButton("↷ 재실행")
        self.btn_redo.setToolTip("재실행 (Ctrl+Y / Ctrl+Shift+Z)")
        self.btn_redo.setEnabled(False)
        self.btn_redo.clicked.connect(lambda: self.redoRequested.emit())
        row_undo.addWidget(self.btn_undo); row_undo.addWidget(self.btn_redo)
        layout.addLayout(row_undo)

        btn_new = QPushButton("이미지 생성하기 (새 캔버스)")
        btn_new.clicked.connect(on_new_image)
        layout.addWidget(btn_new)

        row_file = QHBoxLayout()
        btn_load = QPushButton("이미지 불러오기")
        btn_load.clicked.connect(lambda: self.imageLoadRequested.emit())
        btn_save_prj = QPushButton("저장")
        btn_save_prj.clicked.connect(lambda: self.projectSaveRequested.emit())
        row_file.addWidget(btn_load); row_file.addWidget(btn_save_prj)
        layout.addLayout(row_file)

        row = QHBoxLayout()
        btn_save = QPushButton("이미지로 저장 (PNG/JPG/PDF)")
        btn_save.clicked.connect(on_save)
        row.addWidget(btn_save)
        layout.addLayout(row)

        row2 = QHBoxLayout()
        btn_fit = QPushButton("화면 맞춤")
        btn_fit.clicked.connect(on_fit)
        btn_reset = QPushButton("줌 리셋")
        btn_reset.clicked.connect(on_reset_zoom)
        row2.addWidget(btn_fit); row2.addWidget(btn_reset)
        layout.addLayout(row2)

        # 그룹화 / 해제
        row_grp = QHBoxLayout()
        self.btn_group = QPushButton("그룹 묶기")
        self.btn_group.setToolTip("같은 레이어의 2개 이상 오브젝트를 그룹으로 묶습니다 (Ctrl로 다중 선택)")
        self.btn_group.clicked.connect(lambda: self.groupRequested.emit())
        self.btn_group.setEnabled(False)
        btn_ungroup = QPushButton("그룹 풀기")
        btn_ungroup.clicked.connect(lambda: self.ungroupRequested.emit())
        row_grp.addWidget(self.btn_group); row_grp.addWidget(btn_ungroup)
        layout.addLayout(row_grp)

        # 전역 설정 + 배경 격자 — 단일 컨테이너로 묶어 토글
        self.settings_container = QWidget()
        sc_lay = QVBoxLayout(self.settings_container)
        sc_lay.setContentsMargins(0, 0, 0, 0); sc_lay.setSpacing(6)

        # 전역 설정 그룹
        gb = QGroupBox("전역 설정")
        gb_lay = QFormLayout(gb)
        gb_lay.setContentsMargins(8, 6, 8, 6); gb_lay.setSpacing(4)

        # 단위
        self.cmb_unit = QComboBox()
        for u in units.UNITS:
            self.cmb_unit.addItem(u)
        self.cmb_unit.setCurrentText(units.get_unit())
        self.cmb_unit.currentTextChanged.connect(self._on_unit_changed)
        gb_lay.addRow("단위", self.cmb_unit)

        # 기본 선 굵기
        pen_row = QHBoxLayout()
        self.spin_pen = QDoubleSpinBox()
        self.spin_pen.setRange(0.5, 20.0); self.spin_pen.setDecimals(1); self.spin_pen.setSingleStep(0.5)
        self.spin_pen.setValue(items.DEFAULT_PEN_WIDTH); self.spin_pen.setSuffix(" pt")
        self.spin_pen.valueChanged.connect(set_default_pen_width)
        btn_apply_pen = QPushButton("모두 적용")
        btn_apply_pen.setToolTip("현재 캔버스의 모든 오브젝트에 새 굵기 적용")
        btn_apply_pen.clicked.connect(
            lambda: self.applyPenWidthToAll.emit(self.spin_pen.value()))
        pen_row.addWidget(self.spin_pen, 1); pen_row.addWidget(btn_apply_pen)
        gb_lay.addRow("기본 선 굵기", pen_row)

        # 기본 화살표 크기
        arr_row = QHBoxLayout()
        self.spin_arr = QDoubleSpinBox()
        self.spin_arr.setRange(3.0, 60.0); self.spin_arr.setDecimals(0); self.spin_arr.setSingleStep(1.0)
        self.spin_arr.setValue(items.DEFAULT_ARROW_SIZE); self.spin_arr.setSuffix(" px")
        self.spin_arr.valueChanged.connect(set_default_arrow_size)
        btn_apply_arr = QPushButton("모두 적용")
        btn_apply_arr.setToolTip("현재 캔버스의 모든 화살표 아이템에 새 크기 적용")
        btn_apply_arr.clicked.connect(
            lambda: self.applyArrowSizeToAll.emit(self.spin_arr.value()))
        arr_row.addWidget(self.spin_arr, 1); arr_row.addWidget(btn_apply_arr)
        gb_lay.addRow("기본 화살표 크기", arr_row)

        sc_lay.addWidget(gb)

        # 배경 격자/눈금 (저장에 미포함)
        gb_grid = QGroupBox("배경 격자·눈금 (편집 보조, 저장 안 됨)")
        gl = QFormLayout(gb_grid)
        gl.setContentsMargins(8, 6, 8, 6); gl.setSpacing(4)
        self.chk_grid = QCheckBox("격자 표시 (10mm + 50mm 라벨)")
        self.chk_grid.toggled.connect(self.gridToggled)
        gl.addRow(self.chk_grid)
        self.spin_grid = QSpinBox()
        self.spin_grid.setRange(0, 250); self.spin_grid.setValue(200)
        self.spin_grid.setToolTip("0=짙음 ~ 250=옅음")
        self.spin_grid.valueChanged.connect(self.gridIntensityChanged)
        gl.addRow("격자 진하기", self.spin_grid)
        # 격자 간격 (mm)
        self.spin_grid_spacing = QDoubleSpinBox()
        self.spin_grid_spacing.setRange(1.0, 100.0)
        self.spin_grid_spacing.setDecimals(1)
        self.spin_grid_spacing.setSingleStep(1.0)
        self.spin_grid_spacing.setValue(10.0)
        self.spin_grid_spacing.setSuffix(" " + units.suffix(units.get_unit()))
        self.spin_grid_spacing.setToolTip("얇은 격자선 간격 (굵은 선은 5배)")
        self.spin_grid_spacing.valueChanged.connect(self.gridSpacingChanged)
        gl.addRow("격자 간격", self.spin_grid_spacing)
        # 격자 원점 이동 토글
        self.btn_grid_move = QPushButton("격자 이동")
        self.btn_grid_move.setCheckable(True)
        self.btn_grid_move.setToolTip("눌러서 활성화 후 캔버스를 클릭하면 그 점이 격자의 원점이 됩니다.")
        self.btn_grid_move.clicked.connect(self._on_grid_move_clicked)
        gl.addRow(self.btn_grid_move)
        sc_lay.addWidget(gb_grid)

        layout.addWidget(self.settings_container)
        self.settings_container.setVisible(False)

        sep = QFrame(); sep.setFrameShape(QFrame.Shape.HLine); sep.setFrameShadow(QFrame.Shadow.Sunken)
        layout.addWidget(sep)

        self.status_label = QLabel("심볼 팔레트  (✱ = 더블클릭 후 두 점 클릭으로 그리기)")
        layout.addWidget(self.status_label)

        toolbox = QToolBox()
        grouped: dict[str, list[type]] = {c: [] for c in CATEGORY_ORDER}
        for cls in SYMBOL_REGISTRY:
            cat = getattr(cls, "CATEGORY", "기본")
            grouped.setdefault(cat, []).append(cls)
        for cat in CATEGORY_ORDER:
            if not grouped[cat]:
                continue
            sg = SymbolGrid(grouped[cat])
            sg.drawModeRequested.connect(self.drawModeRequested)
            sg.multiDrawModeRequested.connect(self.multiDrawModeRequested)
            sg.addItemRequested.connect(self.addItemRequested)
            sg.clickToDrawRequested.connect(self.clickToDrawRequested)
            toolbox.addItem(sg, cat)
        layout.addWidget(toolbox, 1)

        tip = QLabel(
            "사용법:\n"
            " • 일반 심볼: 드래그 또는 더블클릭으로 캔버스에 추가\n"
            " • ✱ : 더블클릭 후 두 점 클릭으로 선·화살표 (Shift=15°)\n"
            " • ◇ : 더블클릭 후 여러 점 클릭, Enter로 확정 (곡선/꺾은선)\n"
            " • 핸들로 크기 조절 (Shift: 비율 유지)\n"
            "   위쪽 원형 핸들로 회전 (Ctrl: 15° 스냅)\n"
            " • 이동 중 Ctrl: 인접 오브젝트에 자석 부착 (각도 일치)\n"
            " • 이동·리사이즈 시 경계 자동 스냅\n"
            " • 그룹 묶기/풀기로 여러 오브젝트를 하나처럼 다루기\n"
            " • 우클릭 → 레이어/잠금/색·굵기·크기/회전/삭제\n"
            " • Ctrl+휠: 확대/축소, Delete: 삭제, Esc: 그리기 취소"
        )
        tip.setStyleSheet("color: #555; font-size: 11px;")
        tip.setWordWrap(True)
        layout.addWidget(tip)

        self.setMinimumWidth(300)
        self.setMaximumWidth(380)

    def setDrawModeStatus(self, on: bool):
        if on:
            self.status_label.setText(
                "그리기 모드 ON — 두 점을 클릭하세요 (Shift: 15° 스냅, Esc 취소)")
            self.status_label.setStyleSheet("color: #b35; font-weight: bold;")
        else:
            self.status_label.setText("심볼 팔레트  (✱ = 더블클릭 후 두 점 클릭으로 그리기)")
            self.status_label.setStyleSheet("")

    def _on_unit_changed(self, u: str):
        units.set_unit(u)
        self.unitChanged.emit(u)

    def _on_toggle_settings(self):
        self.settings_container.setVisible(not self.settings_container.isVisible())

    def setUndoEnabled(self, enabled: bool):
        self.btn_undo.setEnabled(bool(enabled))

    def setRedoEnabled(self, enabled: bool):
        self.btn_redo.setEnabled(bool(enabled))

    def setGroupEnabled(self, enabled: bool):
        self.btn_group.setEnabled(bool(enabled))

    def _on_grid_move_clicked(self):
        # 토글 버튼을 눌러 ON 이 되면 격자 이동 모드 진입 신호를 발사.
        # 캔버스 쪽에서 한 번 클릭 후 모드가 종료되면 setGridMoveActive(False) 로
        # 버튼 상태가 다시 풀린다.
        if self.btn_grid_move.isChecked():
            self.gridMoveRequested.emit()
        # OFF 로 다시 누르면 별도 신호 없이 토글만 풀려도 무방하다.

    def setGridMoveActive(self, active: bool):
        self.btn_grid_move.blockSignals(True)
        self.btn_grid_move.setChecked(bool(active))
        self.btn_grid_move.blockSignals(False)
