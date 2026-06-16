"""
물리 시험문항 출제용 도형/심볼.

설계 원칙
- 무채색만 사용 (검정·회색·흰색). 컬러 금지.
- 모든 아이템은 선택 시 8방향 리사이즈 핸들 + 회전 핸들을 노출.
- "용수철·코일·점패턴·해칭"처럼 반복 요소를 가진 심볼은 크기를 늘리면
  요소가 추가되는 방식으로 다시 그려진다 (단순 스트레치가 아님).
- 두 점 클릭으로 그리는 선/화살표는 TwoPointItem 계열로 분리.
"""
from __future__ import annotations
import math
from PyQt6.QtCore import Qt, QRectF, QPointF, QLineF, QSizeF, pyqtSignal
from PyQt6.QtGui import (
    QPainter, QPen, QBrush, QColor, QFont, QPainterPath, QPolygonF,
    QTransform, QAction, QPixmap, QImage
)
import base64
from PyQt6.QtWidgets import (
    QGraphicsItem, QGraphicsObject, QGraphicsTextItem, QMenu,
    QGraphicsSceneContextMenuEvent, QStyleOptionGraphicsItem,
    QFontDialog, QInputDialog, QDialog, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QSlider, QPushButton, QDialogButtonBox, QWidget, QDoubleSpinBox,
    QFormLayout, QApplication, QLineEdit
)

import units


# ---- 전역 기본값 (콘솔 설정에서 변경 가능) ---- #
DEFAULT_PEN_WIDTH = 1.0
DEFAULT_ARROW_SIZE = 12.0


def set_default_pen_width(w: float) -> None:
    global DEFAULT_PEN_WIDTH
    DEFAULT_PEN_WIDTH = max(0.5, float(w))


def set_default_arrow_size(s: float) -> None:
    global DEFAULT_ARROW_SIZE
    DEFAULT_ARROW_SIZE = max(3.0, float(s))


def apply_pen_width_to_items(items_iter, w: float) -> None:
    """기존 아이템들에 새 선 굵기 적용."""
    for it in items_iter:
        if hasattr(it, "_pen_width"):
            it._pen_width = max(0.5, float(w))
            it.update()


def apply_arrow_size_to_items(items_iter, s: float) -> None:
    for it in items_iter:
        if hasattr(it, "_arrow_size"):
            it._arrow_size = max(3.0, float(s))
            it.update()

# ---- 무채색 톤 ---- #
INK = QColor(20, 20, 20)             # 본문 검정
INK_LIGHT = QColor(80, 80, 80)       # 보조선
GRAY_LIGHT = QColor(225, 225, 225)   # 옅은 채움
GRAY_MED = QColor(190, 190, 190)     # 중간 채움
GRAY_DARK = QColor(150, 150, 150)    # 짙은 채움
WHITE = QColor(255, 255, 255)


class GrayGradientBar(QWidget):
    """검정→흰색 그라데이션 바. 클릭/드래그로 회색 레벨 선택."""
    valueChanged = pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(36)
        self.setMinimumWidth(280)
        self._value = 0
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def setValue(self, v: int):
        v = max(0, min(255, int(v)))
        if v != self._value:
            self._value = v
            self.update()

    def value(self) -> int:
        return self._value

    def paintEvent(self, ev):
        p = QPainter(self)
        w = max(1, self.width() - 1)
        for x in range(self.width()):
            g = int(x * 255 / w)
            p.setPen(QPen(QColor(g, g, g)))
            p.drawLine(x, 0, x, self.height())
        # 현재 위치 표시 (회색 대비를 위해 자동으로 검정/흰색 선택)
        mx = int(self._value * w / 255)
        mark = QColor(255, 255, 255) if self._value < 128 else QColor(0, 0, 0)
        p.setPen(QPen(mark, 2))
        p.drawLine(mx, 0, mx, self.height())
        p.drawRect(QRectF(mx - 3, 1, 6, self.height() - 2))
        p.end()

    def _set_from_x(self, x: float):
        v = max(0, min(255, int(round(x * 255 / max(1, self.width() - 1)))))
        if v != self._value:
            self._value = v
            self.update()
            self.valueChanged.emit(v)

    def mousePressEvent(self, ev):
        self._set_from_x(ev.position().x())

    def mouseMoveEvent(self, ev):
        if ev.buttons() & Qt.MouseButton.LeftButton:
            self._set_from_x(ev.position().x())


class GrayPickerDialog(QDialog):
    """시각적 회색 선택기 — 그라데이션 바 + 프리셋 스워치 + 슬라이더."""
    def __init__(self, parent, initial: int = 0, title: str = "회색 레벨 선택"):
        super().__init__(parent)
        self.setWindowTitle(title)
        self._value = max(0, min(255, int(initial)))

        v = QVBoxLayout(self)

        v.addWidget(QLabel("그라데이션 바 (클릭/드래그로 선택)"))
        self.bar = GrayGradientBar()
        self.bar.setValue(self._value)
        self.bar.valueChanged.connect(self._on_bar)
        v.addWidget(self.bar)

        v.addWidget(QLabel("팔레트 (클릭으로 선택, 더블클릭으로 확정)"))
        gw = QWidget()
        grid = QGridLayout(gw)
        grid.setSpacing(3)
        grid.setContentsMargins(0, 0, 0, 0)
        presets = [0, 32, 64, 96, 128, 160, 180, 200, 215,
                   225, 235, 245, 250, 255]
        for i, val in enumerate(presets):
            btn = QPushButton()
            btn.setFixedSize(34, 28)
            btn.setStyleSheet(
                f"background:rgb({val},{val},{val});"
                f"border:1px solid #555; border-radius:2px;")
            btn.setToolTip(f"회색 {val}")
            btn.clicked.connect(lambda _, x=val: self._set_value(x))
            btn.installEventFilter(self)
            btn.setProperty("gray_val", val)
            grid.addWidget(btn, i // 7, i % 7)
        v.addWidget(gw)

        v.addWidget(QLabel("정밀 조정 슬라이더"))
        row = QHBoxLayout()
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(0, 255); self.slider.setValue(self._value)
        self.slider.valueChanged.connect(self._on_slider)
        self.value_label = QLabel(str(self._value))
        self.value_label.setFixedWidth(40)
        row.addWidget(self.slider, 1); row.addWidget(self.value_label)
        v.addLayout(row)

        v.addWidget(QLabel("선택된 색"))
        self.preview = QLabel()
        self.preview.setFixedHeight(36)
        v.addWidget(self.preview)
        self._refresh_preview()

        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(self.accept); bb.rejected.connect(self.reject)
        v.addWidget(bb)

    def eventFilter(self, obj, ev):
        # 스워치 더블클릭 → 즉시 확정
        if ev.type() == ev.Type.MouseButtonDblClick:
            val = obj.property("gray_val")
            if val is not None:
                self._set_value(int(val))
                self.accept()
                return True
        return super().eventFilter(obj, ev)

    def _on_bar(self, v: int):
        self._value = v
        self.slider.blockSignals(True); self.slider.setValue(v); self.slider.blockSignals(False)
        self.value_label.setText(str(v))
        self._refresh_preview()

    def _on_slider(self, v: int):
        self._value = v
        self.bar.setValue(v)
        self.value_label.setText(str(v))
        self._refresh_preview()

    def _set_value(self, v: int):
        self._value = max(0, min(255, int(v)))
        self.bar.setValue(self._value)
        self.slider.blockSignals(True); self.slider.setValue(self._value); self.slider.blockSignals(False)
        self.value_label.setText(str(self._value))
        self._refresh_preview()

    def _refresh_preview(self):
        v = self._value
        self.preview.setStyleSheet(
            f"background:rgb({v},{v},{v}); border:1px solid #888;")

    def value(self) -> int:
        return self._value


def _gray_picker(parent, initial_gray: int, title: str) -> tuple[int, bool]:
    """시각적 회색 선택기. (value, ok) 반환."""
    d = GrayPickerDialog(parent, initial_gray, title)
    if d.exec() == QDialog.DialogCode.Accepted:
        return d.value(), True
    return initial_gray, False


# ============================================================================ #
# 베이스 — 사각 컨테이너 형 심볼
# ============================================================================ #
HANDLE_HALF = 3.5             # (레거시) 핸들 반쪽 크기 — 현재는 paint 시점에 view-pixel 기준으로 재계산
ROT_HANDLE_OFFSET = 14        # 회전 핸들이 컨텐츠 위로 떨어진 거리
# 핸들 시각·히트 테스트 상수 (모두 view-pixel 단위, 줌과 무관하게 일정)
HANDLE_VIEW_PX = 5.0          # 리사이즈 사각 핸들 한 변 (view px)
ROT_HANDLE_VIEW_PX = 6.0      # 회전 원형 핸들 지름 (view px)
HANDLE_HIT_TOL_VIEW_PX = 3.0  # 추가 히트 여유 (view px)
HANDLE_FILL = QColor(50, 130, 220, 120)
HANDLE_STROKE = QColor(50, 130, 220, 255)


def _view_unit_px(item: QGraphicsItem) -> float:
    """현재 뷰의 1 view-pixel 에 해당하는 item-local 좌표 단위.

    줌이 2배면 0.5, 0.5배면 2.0 을 돌려준다.
    뷰가 없거나 변환을 알 수 없을 때는 1.0.
    """
    scn = item.scene()
    if scn is None:
        return 1.0
    views = scn.views()
    if not views:
        return 1.0
    t = views[0].transform()
    sx = math.hypot(t.m11(), t.m12())
    sy = math.hypot(t.m21(), t.m22())
    scale = (sx + sy) / 2.0
    return 1.0 / scale if scale else 1.0

_HANDLE_CURSORS = {
    'tl': Qt.CursorShape.SizeFDiagCursor, 'br': Qt.CursorShape.SizeFDiagCursor,
    'tr': Qt.CursorShape.SizeBDiagCursor, 'bl': Qt.CursorShape.SizeBDiagCursor,
    'tm': Qt.CursorShape.SizeVerCursor,   'bm': Qt.CursorShape.SizeVerCursor,
    'ml': Qt.CursorShape.SizeHorCursor,   'mr': Qt.CursorShape.SizeHorCursor,
    'rot': Qt.CursorShape.CrossCursor,
}


def _canvas_manager_of(item):
    """아이템이 속한 씬의 뷰에서 CanvasManager 를 찾아 반환 (없으면 None)."""
    scn = item.scene()
    if scn is None:
        return None
    for v in scn.views():
        mgr = getattr(v, "canvas_manager", None)
        if mgr is not None:
            return mgr
    return None


def _reorder_via_manager(item, mode: str) -> bool:
    """레이어 경계를 지키는 z-순서 변경을 CanvasManager 에 위임."""
    mgr = _canvas_manager_of(item)
    if mgr is not None and hasattr(mgr, "reorderItem"):
        return mgr.reorderItem(item, mode)
    return False


class BasePhysicsItem(QGraphicsObject):
    """공통: 무채색, 리사이즈 핸들, 회전 핸들, 잠금, 우클릭 메뉴."""

    DEFAULT_SIZE = QSizeF(80, 80)
    MIN_W = 10
    MIN_H = 6
    ASPECT_LOCKED = False    # True면 항상 비율 고정 리사이즈
    HAS_ARROW_HEAD = False   # 우클릭 메뉴에 "화살표 크기" 노출 여부

    def __init__(self, parent: QGraphicsItem | None = None):
        super().__init__(parent)
        self._size = QSizeF(self.DEFAULT_SIZE)
        self._gray_pen = 0                # 0=검정
        self._pen_width = DEFAULT_PEN_WIDTH
        self._arrow_size = DEFAULT_ARROW_SIZE
        self._fill_gray = -1              # -1 = 채움 없음, 0..255
        # 면 채우기 패턴: "none" | "solid" | "dots" | "hatch" | "cross"
        # ("solid" 은 _fill_gray 를 평면 채움으로 사용, 나머지 패턴은 penColor 로 그림)
        self._fill_pattern = "none"
        self._locked = False
        self._pinned_top = False
        self._layer = 0                   # 소속 레이어 인덱스 (0 = "레이어 1")
        self._order = 0                   # 레이어 내 순서 (클수록 같은 레이어에서 전면)
        self._active_handle: str | None = None
        # press 캡처용
        self._press_scene_pos = QPointF()
        self._press_size = QSizeF()
        self._press_item_pos = QPointF()
        self._press_rotation = 0.0

        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges, True)
        self.setAcceptHoverEvents(True)
        self.setTransformOriginPoint(self.DEFAULT_SIZE.width() / 2,
                                     self.DEFAULT_SIZE.height() / 2)

    # ---- 기본 속성 ---- #
    def penColor(self) -> QColor:
        return QColor(self._gray_pen, self._gray_pen, self._gray_pen)

    def fillBrush(self) -> QBrush:
        if self._fill_gray < 0:
            return QBrush(Qt.BrushStyle.NoBrush)
        return QBrush(QColor(self._fill_gray, self._fill_gray, self._fill_gray))

    def size(self) -> QSizeF:
        return self._size

    def setSize(self, size: QSizeF) -> None:
        self.prepareGeometryChange()
        self._size = QSizeF(max(self.MIN_W, size.width()),
                            max(self.MIN_H, size.height()))
        self.setTransformOriginPoint(self._size.width() / 2,
                                     self._size.height() / 2)
        self.update()

    # ---- 핸들 위치 ---- #
    def contentRect(self) -> QRectF:
        return QRectF(0, 0, self._size.width(), self._size.height())

    def _handle_positions(self) -> dict[str, QPointF]:
        r = self.contentRect()
        cx, cy = r.center().x(), r.center().y()
        return {
            'tl': QPointF(r.left(),  r.top()),
            'tm': QPointF(cx,        r.top()),
            'tr': QPointF(r.right(), r.top()),
            'ml': QPointF(r.left(),  cy),
            'mr': QPointF(r.right(), cy),
            'bl': QPointF(r.left(),  r.bottom()),
            'bm': QPointF(cx,        r.bottom()),
            'br': QPointF(r.right(), r.bottom()),
            'rot': QPointF(cx, r.top() - ROT_HANDLE_OFFSET),
        }

    def _hit_handle(self, pos: QPointF) -> str | None:
        if not self.isSelected():
            return None
        unit = _view_unit_px(self)
        # 사각 핸들은 8 view-px, 회전 핸들은 10 view-px → 가장 큰 반쪽 + 여유
        half = (ROT_HANDLE_VIEW_PX / 2 + HANDLE_HIT_TOL_VIEW_PX) * unit
        for name, p in self._handle_positions().items():
            if abs(pos.x() - p.x()) <= half and \
               abs(pos.y() - p.y()) <= half:
                return name
        return None

    # ---- bounding ---- #
    def boundingRect(self) -> QRectF:
        # 회전 핸들이 위로 ROT_HANDLE_OFFSET 만큼 떨어진 곳에 그려지고,
        # 거기에 반지름 ROT_HANDLE_VIEW_PX/2 의 원이 더해진다. 리사이즈 사각 핸들은
        # 컨텐츠 모서리 바깥으로 HANDLE_VIEW_PX/2 만큼 튀어나온다. 회전 시
        # 잔상이 남지 않도록 모두 boundingRect 안에 들어오게 패딩을 잡는다.
        pad = max(ROT_HANDLE_OFFSET + ROT_HANDLE_VIEW_PX + 4,
                  HANDLE_VIEW_PX + 4,
                  self._pen_width + 4)
        return QRectF(-pad, -pad,
                      self._size.width() + 2 * pad,
                      self._size.height() + 2 * pad)

    # ---- 그리기 ---- #
    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget=None):
        pen = QPen(self.penColor(), self._pen_width)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.RoundJoin)
        painter.setPen(pen)
        painter.setBrush(self.fillBrush())
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing, True)
        self.paintSymbol(painter)
        # 선택된 면 채우기 패턴을 컨텐츠 영역에 덧그린다 ("none" 이면 아무것도 안 함).
        self._paint_fill_pattern(painter, self.contentRect())
        if self.isSelected():
            self._paint_selection(painter)
        # 잠금 표시(점)는 선택 상태에서만, 그리고 내보내기 중에는 절대 그리지 않음.
        if self._locked and self.isSelected():
            scn = self.scene()
            if scn is None or not getattr(scn, "_exporting", False):
                painter.setPen(Qt.PenStyle.NoPen)
                painter.setBrush(QBrush(QColor(80, 80, 80)))
                painter.drawEllipse(QRectF(-7, -7, 8, 8))

    def paintSymbol(self, painter: QPainter) -> None:
        painter.drawRect(self.contentRect())

    def fillPath(self) -> QPainterPath:
        """면 채우기 패턴이 갇혀야 하는 실제 윤곽(클립 영역).

        기본값은 contentRect 사각형이라 사각형 도형은 기존과 동일하게 동작한다.
        원·삼각형 등 사각형이 아닌 도형은 이 메서드를 오버라이드해 자신의
        실제 외곽선을 돌려주어, 패턴이 외곽 밖으로 새지 않게 한다.
        """
        p = QPainterPath()
        p.addRect(self.contentRect())
        return p

    def _paint_fill_pattern(self, painter: QPainter, rect: QRectF) -> None:
        """self._fill_pattern 에 따라 rect 를 패턴으로 채운다.

        과거 영역(Region) 심볼들의 그리기 수식을 그대로 이식했다:
        도트(SPACING=18, r=1.8) / 해칭(STEP=8, 0.8pt, rect 클립) /
        엑스(SPACING=20, 작은 X) / 단색(_fill_gray 기반 fillBrush).
        패턴 선은 원본과 동일하게 self.penColor() 를 사용한다.
        """
        pat = getattr(self, "_fill_pattern", "none")
        if pat == "none":
            return
        painter.save()
        # 패턴(과 단색)을 도형의 실제 외곽선으로 클리핑한다. 사각형은 fillPath()
        # 기본값이 contentRect 라 기존과 동일하지만, 원·삼각형 등은 외곽 안쪽에만
        # 패턴이 그려진다.
        painter.setClipPath(self.fillPath())
        if pat == "solid":
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(self.fillBrush())
            painter.drawPath(self.fillPath())
        elif pat == "dots":
            SPACING = 18
            painter.setPen(Qt.PenStyle.NoPen)
            painter.setBrush(QBrush(self.penColor()))
            y = SPACING / 2
            while y < rect.height():
                x = SPACING / 2
                while x < rect.width():
                    painter.drawEllipse(QRectF(rect.left() + x - 1.8,
                                               rect.top() + y - 1.8, 3.6, 3.6))
                    x += SPACING
                y += SPACING
        elif pat == "hatch":
            STEP = 8
            # 클립은 위에서 fillPath() 로 이미 설정됨 (외곽선 기준).
            painter.setPen(QPen(self.penColor(), 0.8))
            painter.setBrush(Qt.BrushStyle.NoBrush)
            x = rect.left() - rect.height()
            while x < rect.right():
                painter.drawLine(QPointF(x, rect.top()),
                                 QPointF(x + rect.height(), rect.bottom()))
                x += STEP
        elif pat == "cross":
            SPACING = 20
            painter.setPen(QPen(self.penColor(), 1))
            d = 3
            y = SPACING / 2
            while y < rect.height():
                x = SPACING / 2
                while x < rect.width():
                    cx = rect.left() + x
                    cy = rect.top() + y
                    painter.drawLine(QPointF(cx - d, cy - d), QPointF(cx + d, cy + d))
                    painter.drawLine(QPointF(cx - d, cy + d), QPointF(cx + d, cy - d))
                    x += SPACING
                y += SPACING
        painter.restore()

    def _paint_selection(self, p: QPainter):
        # painter 의 현재 변환에서 1 view-pixel 의 로컬 단위 도출.
        # 회전이 섞여 있으면 m11() 만 보면 단위가 부풀어 핸들이 거대해진다 —
        # 변환된 x/y 축 길이의 평균(회전 불변)을 사용한다.
        t = p.transform()
        sx = math.hypot(t.m11(), t.m12())
        sy = math.hypot(t.m21(), t.m22())
        scale = (sx + sy) / 2.0
        unit = 1.0 / scale if scale else 1.0
        h_half = (HANDLE_VIEW_PX / 2) * unit
        r_half = (ROT_HANDLE_VIEW_PX / 2) * unit
        stroke_w = 1.0 * unit
        # 선택 박스 (점선)
        pen_box = QPen(HANDLE_STROKE, stroke_w, Qt.PenStyle.DashLine)
        p.setPen(pen_box)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(self.contentRect())
        hs = self._handle_positions()
        # 회전 핸들 연결선
        p.setPen(QPen(HANDLE_STROKE, stroke_w))
        p.drawLine(hs['tm'], hs['rot'])
        # 8개 사각 리사이즈 핸들 (반투명 파랑)
        p.setPen(QPen(HANDLE_STROKE, stroke_w))
        p.setBrush(QBrush(HANDLE_FILL))
        for name in ('tl', 'tm', 'tr', 'ml', 'mr', 'bl', 'bm', 'br'):
            pt = hs[name]
            p.drawRect(QRectF(pt.x() - h_half, pt.y() - h_half,
                              2 * h_half, 2 * h_half))
        # 회전 핸들 (원, 반투명)
        rp = hs['rot']
        p.drawEllipse(QRectF(rp.x() - r_half, rp.y() - r_half,
                             2 * r_half, 2 * r_half))

    # ---- 마우스: 핸들 기반 리사이즈/회전 ---- #
    def hoverMoveEvent(self, event):
        h = self._hit_handle(event.pos())
        if h:
            self.setCursor(_HANDLE_CURSORS.get(h, Qt.CursorShape.ArrowCursor))
        else:
            self.unsetCursor()
        super().hoverMoveEvent(event)

    def mousePressEvent(self, event):
        h = self._hit_handle(event.pos())
        if h and not self._locked:
            self._active_handle = h
            self._press_scene_pos = event.scenePos()
            self._press_size = QSizeF(self._size)
            self._press_item_pos = QPointF(self.pos())
            self._press_rotation = self.rotation()
            event.accept()
            return
        self._active_handle = None
        # 멀티 선택 그룹 이동 추적을 위해 현재 선택된 아이템들의 시작 위치 캡처
        scn = self.scene()
        if scn is not None:
            self._pre_move_state = [(it, QPointF(it.pos())) for it in scn.selectedItems()]
            if not any(it is self for it, _ in self._pre_move_state):
                self._pre_move_state.append((self, QPointF(self.pos())))
        else:
            self._pre_move_state = [(self, QPointF(self.pos()))]
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._active_handle is None:
            super().mouseMoveEvent(event)
            return
        if self._active_handle == 'rot':
            cx = self._press_size.width() / 2
            cy = self._press_size.height() / 2
            center_parent = self.mapToParent(QPointF(cx, cy))
            parent = self.parentItem()
            scene_p = event.scenePos()
            cursor_parent = parent.mapFromScene(scene_p) if parent else scene_p
            dx = cursor_parent.x() - center_parent.x()
            dy = cursor_parent.y() - center_parent.y()
            ang_deg = math.degrees(math.atan2(dy, dx)) + 90.0
            # Ctrl 누르면 15도 단위 스냅
            if event.modifiers() & Qt.KeyboardModifier.ControlModifier:
                ang_deg = round(ang_deg / 15.0) * 15.0
            self.setRotation(ang_deg)
            return

        # 리사이즈 — scene delta를 로컬 프레임으로 회전 변환
        sd = event.scenePos() - self._press_scene_pos
        ang_rad = -math.radians(self._press_rotation)
        cos_a, sin_a = math.cos(ang_rad), math.sin(ang_rad)
        ldx = sd.x() * cos_a - sd.y() * sin_a
        ldy = sd.x() * sin_a + sd.y() * cos_a

        w0, h0 = self._press_size.width(), self._press_size.height()
        new_w, new_h = w0, h0
        off_x = off_y = 0.0
        h = self._active_handle
        if 'l' in h:
            new_w = max(self.MIN_W, w0 - ldx)
            off_x = w0 - new_w
        if 'r' in h:
            new_w = max(self.MIN_W, w0 + ldx)
        if 't' in h:
            new_h = max(self.MIN_H, h0 - ldy)
            off_y = h0 - new_h
        if 'b' in h:
            new_h = max(self.MIN_H, h0 + ldy)

        # Shift 또는 ASPECT_LOCKED = 비율 유지
        is_corner = h in ('tl', 'tr', 'bl', 'br')
        force_aspect = (self.ASPECT_LOCKED or
                        bool(event.modifiers() & Qt.KeyboardModifier.ShiftModifier))
        if force_aspect:
            sw = new_w / w0 if w0 != 0 else 1.0
            sh = new_h / h0 if h0 != 0 else 1.0
            if is_corner:
                # 더 크게 변한 쪽을 기준으로 양쪽 동일 비율 적용
                scale = sw if abs(sw - 1) > abs(sh - 1) else sh
            else:
                # 변 핸들: 그 핸들의 차원만 변했으므로 그 비율 사용
                scale = sw if h in ('ml', 'mr') else sh
            new_w = max(self.MIN_W, w0 * scale)
            new_h = max(self.MIN_H, h0 * scale)
            # 오프셋 재계산 (반대편이 고정되도록)
            off_x = (w0 - new_w) if 'l' in h else 0.0
            off_y = (h0 - new_h) if 't' in h else 0.0

        # 경계 스냅 (회전 0일 때만 적용 — 회전된 경우 박스가 어긋남)
        if self._press_rotation == 0:
            new_w, new_h, off_x, off_y = self._snap_resize(
                h, new_w, new_h, off_x, off_y)

        cos_p = math.cos(math.radians(self._press_rotation))
        sin_p = math.sin(math.radians(self._press_rotation))
        pox = off_x * cos_p - off_y * sin_p
        poy = off_x * sin_p + off_y * cos_p

        self.setSize(QSizeF(new_w, new_h))
        self.setPos(QPointF(self._press_item_pos.x() + pox,
                            self._press_item_pos.y() + poy))

    SNAP_PX = 7  # 스냅 임계값

    def _snap_targets_x(self) -> list[float]:
        """부모 좌표 기준 x 스냅 후보."""
        targets: list[float] = []
        parent = self.parentItem()
        if parent is not None and hasattr(parent, 'rect'):
            r = parent.rect()
            targets += [0.0, r.width() / 2, r.width()]
            for sib in parent.childItems():
                if sib is self:
                    continue
                try:
                    if hasattr(sib, 'size') and callable(sib.size):
                        sz = sib.size(); sp = sib.pos()
                        targets += [sp.x(), sp.x() + sz.width() / 2, sp.x() + sz.width()]
                    else:
                        br = sib.boundingRect(); sp = sib.pos()
                        targets += [sp.x() + br.left(), sp.x() + br.center().x(), sp.x() + br.right()]
                except Exception:
                    pass
        return targets

    def _snap_targets_y(self) -> list[float]:
        targets: list[float] = []
        parent = self.parentItem()
        if parent is not None and hasattr(parent, 'rect'):
            r = parent.rect()
            targets += [0.0, r.height() / 2, r.height()]
            for sib in parent.childItems():
                if sib is self:
                    continue
                try:
                    if hasattr(sib, 'size') and callable(sib.size):
                        sz = sib.size(); sp = sib.pos()
                        targets += [sp.y(), sp.y() + sz.height() / 2, sp.y() + sz.height()]
                    else:
                        br = sib.boundingRect(); sp = sib.pos()
                        targets += [sp.y() + br.top(), sp.y() + br.center().y(), sp.y() + br.bottom()]
                except Exception:
                    pass
        return targets

    def _snap_resize(self, h: str, new_w: float, new_h: float,
                     off_x: float, off_y: float) -> tuple[float, float, float, float]:
        """리사이즈 중 끌고 있는 모서리가 가까운 경계에 닿으면 스냅."""
        base_pos = self._press_item_pos
        # 변경 후 박스의 부모 좌표 (rotation=0 가정)
        new_left = base_pos.x() + off_x
        new_top  = base_pos.y() + off_y
        new_right = new_left + new_w
        new_bottom = new_top + new_h
        xs = self._snap_targets_x(); ys = self._snap_targets_y()

        def closest(target_val: float, candidates: list[float]) -> float | None:
            best_d = self.SNAP_PX; best = None
            for c in candidates:
                d = c - target_val
                if abs(d) < best_d:
                    best_d = abs(d); best = d
            return best

        # 끌고 있는 모서리만 스냅
        if 'r' in h:
            d = closest(new_right, xs)
            if d is not None: new_w = max(self.MIN_W, new_w + d)
        if 'l' in h:
            d = closest(new_left, xs)
            if d is not None:
                new_w = max(self.MIN_W, new_w - d)
                off_x += d
        if 'b' in h:
            d = closest(new_bottom, ys)
            if d is not None: new_h = max(self.MIN_H, new_h + d)
        if 't' in h:
            d = closest(new_top, ys)
            if d is not None:
                new_h = max(self.MIN_H, new_h - d)
                off_y += d
        return new_w, new_h, off_x, off_y

    # ---- 자석 부착 (Ctrl 누른 상태로 이동 시) ---- #
    MAGNET_ATTACH_PX = 22

    def _magnetic_attach(self, new_pos: QPointF) -> QPointF | None:
        parent = self.parentItem()
        if parent is None:
            return None
        w, hgt = self._size.width(), self._size.height()
        best = None; best_d = self.MAGNET_ATTACH_PX
        for sib in parent.childItems():
            if sib is self:
                continue
            if not (hasattr(sib, 'size') and callable(sib.size)):
                continue
            try:
                sz = sib.size(); sp = sib.pos(); srot = sib.rotation()
            except Exception:
                continue
            sw, sh = sz.width(), sz.height()
            cands = [
                # self가 sib의 오른쪽에 부착 (top·center·bottom 정렬)
                (QPointF(sp.x() + sw, sp.y()), srot),
                (QPointF(sp.x() + sw, sp.y() + (sh - hgt) / 2), srot),
                (QPointF(sp.x() + sw, sp.y() + sh - hgt), srot),
                # 왼쪽
                (QPointF(sp.x() - w, sp.y()), srot),
                (QPointF(sp.x() - w, sp.y() + (sh - hgt) / 2), srot),
                (QPointF(sp.x() - w, sp.y() + sh - hgt), srot),
                # 아래
                (QPointF(sp.x(), sp.y() + sh), srot),
                (QPointF(sp.x() + (sw - w) / 2, sp.y() + sh), srot),
                (QPointF(sp.x() + sw - w, sp.y() + sh), srot),
                # 위
                (QPointF(sp.x(), sp.y() - hgt), srot),
                (QPointF(sp.x() + (sw - w) / 2, sp.y() - hgt), srot),
                (QPointF(sp.x() + sw - w, sp.y() - hgt), srot),
            ]
            for cp, cr in cands:
                d = math.hypot(cp.x() - new_pos.x(), cp.y() - new_pos.y())
                if d < best_d:
                    best_d = d; best = (cp, cr)
        if best is None:
            return None
        if abs(self.rotation() - best[1]) > 0.5:
            self.setRotation(best[1])
        return best[0]

    # ---- 위치 변경 시 스냅 ---- #
    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionChange:
            # Ctrl 누른 채로 이동 → 자석 부착 (회전 다른 아이템에도 동작)
            mods = QApplication.keyboardModifiers()
            if (mods & Qt.KeyboardModifier.ControlModifier and
                    self.parentItem() is not None and
                    self._active_handle is None):
                attached = self._magnetic_attach(QPointF(value))
                if attached is not None:
                    return attached
            # 회전된 경우 박스 경계가 부모 축과 어긋나므로 일반 스냅은 건너뜀
            if self.rotation() == 0 and self.parentItem() is not None \
                    and self._active_handle is None:
                new_pos = QPointF(value)
                xs = self._snap_targets_x(); ys = self._snap_targets_y()
                w, hgt = self._size.width(), self._size.height()
                # 후보: 왼쪽/가운데/오른쪽 (x), 위/가운데/아래 (y)
                item_xs = [new_pos.x(), new_pos.x() + w / 2, new_pos.x() + w]
                item_ys = [new_pos.y(), new_pos.y() + hgt / 2, new_pos.y() + hgt]
                best_dx = 0.0; best_d = self.SNAP_PX
                for ix in item_xs:
                    for tx in xs:
                        d = tx - ix
                        if abs(d) < best_d:
                            best_d = abs(d); best_dx = d
                best_dy = 0.0; best_d = self.SNAP_PX
                for iy in item_ys:
                    for ty in ys:
                        d = ty - iy
                        if abs(d) < best_d:
                            best_d = abs(d); best_dy = d
                if best_dx or best_dy:
                    return QPointF(new_pos.x() + best_dx, new_pos.y() + best_dy)
        return super().itemChange(change, value)

    def mouseReleaseEvent(self, event):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        h = self._active_handle
        if h is not None and stack is not None and not self._locked:
            from commands import ResizeItemCommand, RotateItemCommand
            if h == 'rot':
                if abs(self.rotation() - self._press_rotation) > 1e-6:
                    stack.push(RotateItemCommand(self, self._press_rotation,
                                                 self.rotation()))
            else:
                old_size = self._press_size
                new_size = self._size
                if (abs(old_size.width() - new_size.width()) > 1e-6 or
                        abs(old_size.height() - new_size.height()) > 1e-6 or
                        self.pos() != self._press_item_pos):
                    stack.push(ResizeItemCommand(
                        self,
                        {'size': QSizeF(old_size), 'pos': QPointF(self._press_item_pos)},
                        {'size': QSizeF(new_size), 'pos': QPointF(self.pos())}))
        elif h is None and stack is not None:
            pre = getattr(self, "_pre_move_state", None)
            if pre:
                from commands import MoveItemCommand
                moved, olds, news = [], [], []
                for it, op in pre:
                    if it.scene() is None:
                        continue
                    cur = it.pos()
                    if cur != op:
                        moved.append(it); olds.append(op); news.append(QPointF(cur))
                if moved:
                    stack.push(MoveItemCommand(moved, olds, news))
        self._active_handle = None
        self._pre_move_state = None
        super().mouseReleaseEvent(event)

    # ---- 잠금/레이어 ---- #
    def setLocked(self, locked: bool):
        self._locked = locked
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, not locked)
        self.update()

    def isLocked(self) -> bool:
        return self._locked

    def _toggle_lock_undoable(self):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        new_state = not self._locked
        if stack is not None:
            from commands import LockCommand
            stack.push(LockCommand(self, self._locked, new_state))
        else:
            self.setLocked(new_state)

    def setPinnedTop(self, pinned: bool):
        self._pinned_top = pinned
        mgr = _canvas_manager_of(self)
        if mgr is not None and hasattr(mgr, "_refresh_layer_view"):
            mgr._refresh_layer_view()      # z 는 _refresh_layer_view 가 결정
        else:
            self.setZValue(1e6 if pinned else 0)  # 뷰 부착 전 임시값

    # ---- 우클릭 메뉴 ---- #
    def contextMenuEvent(self, event: QGraphicsSceneContextMenuEvent):
        scene = self.scene()
        if scene is None:
            return
        m = QMenu()
        lm = m.addMenu("레이어")
        lm.addAction("맨 앞으로", self._bring_to_front)
        lm.addAction("앞으로", self._bring_forward)
        lm.addAction("뒤로",   self._send_backward)
        lm.addAction("맨 뒤로", self._send_to_back)
        m.addAction("위치 고정 해제" if self._locked else "위치 고정",
                    self._toggle_lock_undoable)
        m.addAction("최상단 고정 해제" if self._pinned_top else "최상단 고정",
                    lambda: self.setPinnedTop(not self._pinned_top))
        m.addSeparator()
        m.addAction("선 명도 (회색 레벨)…", self._change_pen_gray)
        m.addAction("채우기 명도…", self._change_fill_gray)
        m.addAction("채우기 제거", lambda: self._set_fill(-1))
        pm = m.addMenu("면 채우기 (패턴)")
        for label, key in (("없음", "none"), ("단색(회색)", "solid"),
                           ("도트", "dots"), ("해칭", "hatch"), ("엑스", "cross")):
            act = pm.addAction(label, lambda k=key: self._set_fill_pattern(k))
            act.setCheckable(True)
            act.setChecked(getattr(self, "_fill_pattern", "none") == key)
        m.addAction("선 굵기…", self._change_pen_width)
        if getattr(self, "HAS_ARROW_HEAD", False):
            m.addAction("화살표 크기…", self._change_arrow_size)
        m.addAction("크기 입력…", self._change_size_dialog)
        m.addAction("회전 입력…", self._change_rotation_dialog)
        m.addSeparator()
        # 서브클래스가 자체 항목을 주입할 수 있는 훅 (수능 광학 심볼 등에서 사용)
        self._extra_menu_actions(m)
        m.addAction("복제", self._duplicate)
        m.addAction("삭제", self._delete_undoable)
        m.exec(event.screenPos())
        event.accept()

    def _extra_menu_actions(self, menu: QMenu) -> None:
        """서브클래스 훅: 우클릭 메뉴에 추가 항목을 넣는다 (기본은 비어 있음)."""
        return

    def setLayer(self, idx: int) -> None:
        """소속 레이어 인덱스를 지정. 표시 갱신(딤/z-오프셋)은 호출 측에서
        CanvasManager._refresh_layer_view() 로 처리한다."""
        self._layer = int(idx)
        self.update()

    def serialize(self) -> dict:
        """서브클래스 훅: 직렬화에 추가로 저장할 키-값 쌍.

        기본 구현은 소속 레이어를 저장한다. 오버라이드하는 서브클래스는
        super().serialize() 를 호출해 이 값을 보존해야 한다."""
        return {"_layer": getattr(self, "_layer", 0)}

    def deserialize(self, d: dict) -> None:
        """서브클래스 훅: 직렬화에서 복원할 추가 속성.

        기본 구현은 소속 레이어를 복원한다. 오버라이드하는 서브클래스는
        super().deserialize(d) 를 호출해야 한다."""
        self._layer = int(d.get("_layer", getattr(self, "_layer", 0)))

    def _delete_undoable(self):
        scn = self.scene()
        if scn is None:
            return
        stack = getattr(scn, "_undo_stack", None)
        if stack is not None:
            from commands import DeleteItemCommand
            stack.push(DeleteItemCommand(scn, [self]))
        else:
            scn.removeItem(self)

    # 레이어 경계를 지키는 z-순서 변경 (같은 레이어 안에서만 이동).
    def _bring_to_front(self):
        _reorder_via_manager(self, "front")

    def _bring_forward(self):
        _reorder_via_manager(self, "forward")

    def _send_backward(self):
        _reorder_via_manager(self, "backward")

    def _send_to_back(self):
        _reorder_via_manager(self, "back")

    def _push_property(self, prop: str, old, new, label: str | None = None):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import PropertyChangeCommand
            stack.push(PropertyChangeCommand(self, prop, old, new, label))
        else:
            setattr(self, prop, new)
            self.update()

    def _change_pen_gray(self):
        v, ok = _gray_picker(None, self._gray_pen, "선 회색 레벨")
        if ok and v != self._gray_pen:
            self._push_property("_gray_pen", self._gray_pen, v, "선 회색")

    def _change_fill_gray(self):
        init = self._fill_gray if self._fill_gray >= 0 else 230
        v, ok = _gray_picker(None, init, "채우기 회색 레벨")
        if ok and v != self._fill_gray:
            self._push_property("_fill_gray", self._fill_gray, v, "채우기 회색")

    def _set_fill(self, v: int):
        if v != self._fill_gray:
            self._push_property("_fill_gray", self._fill_gray, v, "채우기")
        else:
            self.update()

    def _set_fill_pattern(self, pattern: str):
        old = getattr(self, "_fill_pattern", "none")
        if pattern != old:
            self._push_property("_fill_pattern", old, pattern, "면 채우기")
        else:
            self.update()

    def _change_pen_width(self):
        w, ok = QInputDialog.getDouble(None, "선 굵기", "굵기(pt):",
                                       self._pen_width, 0.5, 30.0, 1)
        if ok and abs(w - self._pen_width) > 1e-9:
            self._push_property("_pen_width", self._pen_width, w, "선 굵기")

    def _change_arrow_size(self):
        w, ok = QInputDialog.getDouble(None, "화살표 크기",
                                       "머리 길이(px):",
                                       self._arrow_size, 3.0, 80.0, 0)
        if ok and abs(w - self._arrow_size) > 1e-9:
            self._push_property("_arrow_size", self._arrow_size, w, "화살표 크기")

    def _change_size_dialog(self):
        # 단위 변환 — 내부는 px이지만 UI는 현재 단위로 표시
        unit = units.get_unit()
        cur_w = units.from_px(self._size.width())
        cur_h = units.from_px(self._size.height())
        dec = units.decimals()
        w, ok = QInputDialog.getDouble(
            None, "크기", f"가로 ({unit}):", cur_w,
            units.from_px(self.MIN_W), 5000.0, dec)
        if not ok:
            return
        h, ok = QInputDialog.getDouble(
            None, "크기", f"세로 ({unit}):", cur_h,
            units.from_px(self.MIN_H), 5000.0, dec)
        if ok:
            new_w = units.to_px(w); new_h = units.to_px(h)
            if (abs(new_w - self._size.width()) > 1e-6 or
                    abs(new_h - self._size.height()) > 1e-6):
                scn = self.scene()
                stack = getattr(scn, "_undo_stack", None) if scn is not None else None
                if stack is not None:
                    from commands import ResizeItemCommand
                    stack.push(ResizeItemCommand(
                        self,
                        {'size': QSizeF(self._size), 'pos': QPointF(self.pos())},
                        {'size': QSizeF(new_w, new_h), 'pos': QPointF(self.pos())}))
                else:
                    self.setSize(QSizeF(new_w, new_h))

    def _change_rotation_dialog(self):
        a, ok = QInputDialog.getDouble(None, "회전", "각도(°):",
                                       self.rotation(), -360, 360, 1)
        if ok and abs(a - self.rotation()) > 1e-9:
            scn = self.scene()
            stack = getattr(scn, "_undo_stack", None) if scn is not None else None
            if stack is not None:
                from commands import RotateItemCommand
                stack.push(RotateItemCommand(self, self.rotation(), a))
            else:
                self.setRotation(a)

    def _duplicate(self):
        scene = self.scene()
        if not scene:
            return
        c = self.__class__()
        c.setSize(QSizeF(self._size))
        c._gray_pen = self._gray_pen
        c._fill_gray = self._fill_gray
        c._pen_width = self._pen_width
        c._arrow_size = self._arrow_size
        # 서브클래스 고유 속성도 복제 (serialize/deserialize 훅을 통해 일괄 복사)
        try:
            c.deserialize(self.serialize())
        except Exception:
            pass
        c.setPos(self.pos() + QPointF(20, 20))
        c.setRotation(self.rotation())
        if self.parentItem():
            c.setParentItem(self.parentItem())
        else:
            scene.addItem(c)


# ============================================================================ #
# 두 점 클릭 그리기 베이스 (선·점선·화살표)
# ============================================================================ #
class TwoPointItem(QGraphicsObject):
    """두 점 클릭으로 끝점이 결정되는 선형 아이템.

    팔레트에서 더블클릭 → 캔버스 첫 클릭(p1) → 두 번째 클릭(p2).
    선택 시 양 끝점에 핸들이 표시되어 드래그로 위치 조정 가능.
    """
    DRAW_MODE = True            # 팔레트의 더블클릭 트리거 표시
    DASHED = False
    HAS_ARROW = False
    HAS_BACK_ARROW = False
    HAS_MID_ARROW = False       # 선 중간에 화살표
    DEFAULT_LEN = 120

    def __init__(self, parent: QGraphicsItem | None = None):
        super().__init__(parent)
        self._p1 = QPointF(0, 0)
        self._p2 = QPointF(self.DEFAULT_LEN, 0)
        self._gray_pen = 0
        self._pen_width = DEFAULT_PEN_WIDTH
        self._arrow_size = DEFAULT_ARROW_SIZE
        self._locked = False
        self._pinned_top = False
        self._layer = 0                   # 소속 레이어 인덱스 (0 = "레이어 1")
        self._order = 0                   # 레이어 내 순서 (클수록 같은 레이어에서 전면)
        self._active_endpoint: str | None = None
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setAcceptHoverEvents(True)

    def setEndpoints(self, p1: QPointF, p2: QPointF):
        self.prepareGeometryChange()
        self._p1 = QPointF(p1)
        self._p2 = QPointF(p2)
        self.update()

    def boundingRect(self) -> QRectF:
        # 끝점 핸들이 HANDLE_VIEW_PX/2 만큼 바깥으로 튀어나오는 것까지 포함.
        pad = max(20, self._pen_width * 4, HANDLE_VIEW_PX + 4)
        x_min = min(self._p1.x(), self._p2.x()) - pad
        x_max = max(self._p1.x(), self._p2.x()) + pad
        y_min = min(self._p1.y(), self._p2.y()) - pad
        y_max = max(self._p1.y(), self._p2.y()) + pad
        return QRectF(x_min, y_min, x_max - x_min, y_max - y_min)

    def paint(self, painter, option, widget=None):
        pen = QPen(QColor(self._gray_pen, self._gray_pen, self._gray_pen),
                   self._pen_width)
        if self.DASHED:
            pen.setStyle(Qt.PenStyle.DashLine)
            dlen = getattr(self, "dash_length", 6.0)
            glen = getattr(self, "gap_length", 4.0)
            pen.setDashPattern([dlen, glen])
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        painter.setPen(pen)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing, True)

        # 화살표 머리 길이만큼 끝점을 안쪽으로 당겨 본선이 머리에 가리지 않도록
        line_p1, line_p2 = self._p1, self._p2
        dx = self._p2.x() - self._p1.x()
        dy = self._p2.y() - self._p1.y()
        L = math.hypot(dx, dy) or 1.0
        ux, uy = dx / L, dy / L
        head = self._arrow_size
        if self.HAS_ARROW and L > head:
            line_p2 = QPointF(self._p2.x() - ux * head * 0.5,
                              self._p2.y() - uy * head * 0.5)
        if self.HAS_BACK_ARROW and L > head:
            line_p1 = QPointF(self._p1.x() + ux * head * 0.5,
                              self._p1.y() + uy * head * 0.5)
        painter.drawLine(line_p1, line_p2)

        # 화살표 머리 (실선)
        if self.HAS_ARROW:
            self._draw_head(painter, self._p2, ux, uy)
        if self.HAS_BACK_ARROW:
            self._draw_head(painter, self._p1, -ux, -uy)
        if self.HAS_MID_ARROW and L > head:
            mid = QPointF((self._p1.x() + self._p2.x()) / 2 + ux * head * 0.4,
                          (self._p1.y() + self._p2.y()) / 2 + uy * head * 0.4)
            self._draw_head(painter, mid, ux, uy)

        if self.isSelected():
            t = painter.transform()
            sx = math.hypot(t.m11(), t.m12())
            sy = math.hypot(t.m21(), t.m22())
            scale = (sx + sy) / 2.0
            unit = 1.0 / scale if scale else 1.0
            h_half = (HANDLE_VIEW_PX / 2) * unit
            stroke_w = 1.0 * unit
            painter.setPen(QPen(HANDLE_STROKE, stroke_w, Qt.PenStyle.DashLine))
            painter.drawLine(self._p1, self._p2)
            painter.setPen(QPen(HANDLE_STROKE, stroke_w))
            painter.setBrush(QBrush(HANDLE_FILL))
            for p in (self._p1, self._p2):
                painter.drawRect(QRectF(p.x() - h_half, p.y() - h_half,
                                        2 * h_half, 2 * h_half))

    def _draw_head(self, painter, tip: QPointF, ux: float, uy: float):
        pen = QPen(QColor(self._gray_pen, self._gray_pen, self._gray_pen),
                   self._pen_width)
        pen.setStyle(Qt.PenStyle.SolidLine)
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        pen.setJoinStyle(Qt.PenJoinStyle.MiterJoin)
        painter.setPen(pen)
        painter.setBrush(QBrush(pen.color()))
        head_len = self._arrow_size
        head_w = self._arrow_size * 0.45
        bx = tip.x() - ux * head_len
        by = tip.y() - uy * head_len
        nx, ny = -uy, ux
        p_left = QPointF(bx + nx * head_w, by + ny * head_w)
        p_right = QPointF(bx - nx * head_w, by - ny * head_w)
        painter.drawPolygon(QPolygonF([tip, p_left, p_right]))

    # ---- 핸들/잠금/메뉴 ---- #
    def _hit_endpoint(self, pos: QPointF) -> str | None:
        if not self.isSelected():
            return None
        unit = _view_unit_px(self)
        half = (HANDLE_VIEW_PX / 2 + HANDLE_HIT_TOL_VIEW_PX) * unit
        for name, p in (('p1', self._p1), ('p2', self._p2)):
            if abs(pos.x() - p.x()) <= half and \
               abs(pos.y() - p.y()) <= half:
                return name
        return None

    def hoverMoveEvent(self, event):
        if self._hit_endpoint(event.pos()):
            self.setCursor(Qt.CursorShape.SizeAllCursor)
        else:
            self.unsetCursor()
        super().hoverMoveEvent(event)

    def mousePressEvent(self, event):
        h = self._hit_endpoint(event.pos())
        if h and not self._locked:
            self._active_endpoint = h
            self._press_p1 = QPointF(self._p1)
            self._press_p2 = QPointF(self._p2)
            event.accept()
            return
        self._active_endpoint = None
        # 멀티 선택 이동 추적
        scn = self.scene()
        if scn is not None:
            self._pre_move_state = [(it, QPointF(it.pos())) for it in scn.selectedItems()]
            if not any(it is self for it, _ in self._pre_move_state):
                self._pre_move_state.append((self, QPointF(self.pos())))
        else:
            self._pre_move_state = [(self, QPointF(self.pos()))]
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._active_endpoint:
            self.prepareGeometryChange()
            new_pos = event.pos()
            # Shift: 두 끝점 사이 각도를 15° 단위로 스냅
            if event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                if self._active_endpoint == 'p1':
                    new_pos = _snap_angle_15(self._p2, new_pos)
                else:
                    new_pos = _snap_angle_15(self._p1, new_pos)
            if self._active_endpoint == 'p1':
                self._p1 = new_pos
            else:
                self._p2 = new_pos
            self.update()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if self._active_endpoint and stack is not None:
            old_p1, old_p2 = self._press_p1, self._press_p2
            if old_p1 != self._p1 or old_p2 != self._p2:
                from commands import ResizeItemCommand
                stack.push(ResizeItemCommand(
                    self,
                    {'p1': QPointF(old_p1), 'p2': QPointF(old_p2)},
                    {'p1': QPointF(self._p1), 'p2': QPointF(self._p2)}))
        elif self._active_endpoint is None and stack is not None:
            pre = getattr(self, "_pre_move_state", None)
            if pre:
                from commands import MoveItemCommand
                moved, olds, news = [], [], []
                for it, op in pre:
                    if it.scene() is None:
                        continue
                    cur = it.pos()
                    if cur != op:
                        moved.append(it); olds.append(op); news.append(QPointF(cur))
                if moved:
                    stack.push(MoveItemCommand(moved, olds, news))
        self._active_endpoint = None
        self._pre_move_state = None
        super().mouseReleaseEvent(event)

    def setLocked(self, b: bool):
        self._locked = b
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, not b)
        self.update()

    def _toggle_lock_undoable(self):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        new_state = not self._locked
        if stack is not None:
            from commands import LockCommand
            stack.push(LockCommand(self, self._locked, new_state))
        else:
            self.setLocked(new_state)

    def _delete_undoable(self):
        scn = self.scene()
        if scn is None:
            return
        stack = getattr(scn, "_undo_stack", None)
        if stack is not None:
            from commands import DeleteItemCommand
            stack.push(DeleteItemCommand(scn, [self]))
        else:
            scn.removeItem(self)

    def _push_property(self, prop: str, old, new, label: str | None = None):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import PropertyChangeCommand
            stack.push(PropertyChangeCommand(self, prop, old, new, label))
        else:
            setattr(self, prop, new)
            self.update()

    def setPinnedTop(self, b: bool):
        self._pinned_top = b
        mgr = _canvas_manager_of(self)
        if mgr is not None and hasattr(mgr, "_refresh_layer_view"):
            mgr._refresh_layer_view()
        else:
            self.setZValue(1e6 if b else 0)

    # ---- 위치 스냅 (두 점 아이템 전체 이동 시) ---- #
    SNAP_PX = 7
    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionChange \
                and self.parentItem() is not None and self._active_endpoint is None \
                and self.rotation() == 0:
            new_pos = QPointF(value)
            parent = self.parentItem()
            if not hasattr(parent, 'rect'):
                return super().itemChange(change, value)
            r = parent.rect()
            # 두 끝점의 부모 좌표
            ex = [new_pos.x() + self._p1.x(), new_pos.x() + self._p2.x()]
            ey = [new_pos.y() + self._p1.y(), new_pos.y() + self._p2.y()]
            xs = [0.0, r.width() / 2, r.width()]
            ys = [0.0, r.height() / 2, r.height()]
            for sib in parent.childItems():
                if sib is self:
                    continue
                try:
                    if hasattr(sib, 'size') and callable(sib.size):
                        sz = sib.size(); sp = sib.pos()
                        xs += [sp.x(), sp.x() + sz.width() / 2, sp.x() + sz.width()]
                        ys += [sp.y(), sp.y() + sz.height() / 2, sp.y() + sz.height()]
                except Exception:
                    pass
            best_dx = 0.0; bd = self.SNAP_PX
            for ix in ex:
                for tx in xs:
                    d = tx - ix
                    if abs(d) < bd:
                        bd = abs(d); best_dx = d
            best_dy = 0.0; bd = self.SNAP_PX
            for iy in ey:
                for ty in ys:
                    d = ty - iy
                    if abs(d) < bd:
                        bd = abs(d); best_dy = d
            if best_dx or best_dy:
                return QPointF(new_pos.x() + best_dx, new_pos.y() + best_dy)
        return super().itemChange(change, value)

    def contextMenuEvent(self, event):
        scene = self.scene()
        if not scene:
            return
        m = QMenu()
        lm = m.addMenu("레이어")
        lm.addAction("맨 앞으로", self._bring_to_front)
        lm.addAction("앞으로", self._bring_forward)
        lm.addAction("뒤로",   self._send_backward)
        lm.addAction("맨 뒤로", self._send_to_back)
        m.addAction("위치 고정 해제" if self._locked else "위치 고정",
                    self._toggle_lock_undoable)
        m.addAction("최상단 고정 해제" if self._pinned_top else "최상단 고정",
                    lambda: self.setPinnedTop(not self._pinned_top))
        m.addSeparator()
        m.addAction("선 명도…", self._gray_dialog)
        m.addAction("선 굵기…", self._width_dialog)
        m.addSeparator()
        m.addAction("복제", self._duplicate)
        m.addAction("삭제", self._delete_undoable)
        m.exec(event.screenPos())
        event.accept()

    # 레이어 경계를 지키는 z-순서 변경 (같은 레이어 안에서만 이동).
    def _bring_to_front(self):
        _reorder_via_manager(self, "front")

    def _bring_forward(self):
        _reorder_via_manager(self, "forward")

    def _send_backward(self):
        _reorder_via_manager(self, "backward")

    def _send_to_back(self):
        _reorder_via_manager(self, "back")

    def _gray_dialog(self):
        v, ok = _gray_picker(None, self._gray_pen, "선 회색 레벨")
        if ok and v != self._gray_pen:
            self._push_property("_gray_pen", self._gray_pen, v, "선 회색")

    def _width_dialog(self):
        w, ok = QInputDialog.getDouble(None, "선 굵기", "굵기(px):",
                                       self._pen_width, 0.5, 30.0, 1)
        if ok and abs(w - self._pen_width) > 1e-9:
            self._push_property("_pen_width", self._pen_width, w, "선 굵기")

    def _duplicate(self):
        scene = self.scene()
        if not scene:
            return
        c = self.__class__()
        c._gray_pen = self._gray_pen
        c._pen_width = self._pen_width
        c.setEndpoints(self._p1 + QPointF(20, 20), self._p2 + QPointF(20, 20))
        c.setPos(self.pos())
        if self.parentItem():
            c.setParentItem(self.parentItem())
        else:
            scene.addItem(c)


def _arrow_head_polygon(tip: QPointF, ux: float, uy: float,
                        size: float) -> QPolygonF:
    """tip을 머리 끝, (ux,uy)를 진행 방향으로 하는 화살표 머리."""
    bx = tip.x() - ux * size
    by = tip.y() - uy * size
    nx, ny = -uy, ux
    w = size * 0.45
    return QPolygonF([tip,
                      QPointF(bx + nx * w, by + ny * w),
                      QPointF(bx - nx * w, by - ny * w)])


def _snap_angle_15(anchor: QPointF, free: QPointF) -> QPointF:
    """anchor → free 의 각도를 15° 단위로 스냅하여 새 free 점 반환."""
    dx = free.x() - anchor.x(); dy = free.y() - anchor.y()
    L = math.hypot(dx, dy)
    if L < 0.5:
        return free
    ang = math.degrees(math.atan2(dy, dx))
    snapped = round(ang / 15.0) * 15.0
    rad = math.radians(snapped)
    return QPointF(anchor.x() + L * math.cos(rad),
                   anchor.y() + L * math.sin(rad))


# ---- 두 점 그리기 2종 ---- #
class SolidLine(TwoPointItem):
    LABEL = "선"; CATEGORY = "기본"
    HAS_ARROW_HEAD = False


class DashedLine(TwoPointItem):
    LABEL = "점선"; CATEGORY = "기본"
    DASHED = True
    HAS_ARROW_HEAD = False

    def __init__(self, parent: QGraphicsItem | None = None):
        super().__init__(parent)
        self.dash_length = 4.0
        self.gap_length = 3.0

    def contextMenuEvent(self, event):
        scene = self.scene()
        if not scene:
            return
        m = QMenu()
        lm = m.addMenu("레이어")
        lm.addAction("맨 앞으로", self._bring_to_front)
        lm.addAction("앞으로", self._bring_forward)
        lm.addAction("뒤로",   self._send_backward)
        lm.addAction("맨 뒤로", self._send_to_back)
        m.addAction("위치 고정 해제" if self._locked else "위치 고정",
                    self._toggle_lock_undoable)
        m.addAction("최상단 고정 해제" if self._pinned_top else "최상단 고정",
                    lambda: self.setPinnedTop(not self._pinned_top))
        m.addSeparator()
        m.addAction("선 명도…", self._gray_dialog)
        m.addAction("선 굵기…", self._width_dialog)
        m.addAction("점선 간격 설정…", self._dash_dialog)
        m.addSeparator()
        m.addAction("복제", self._duplicate)
        m.addAction("삭제", self._delete_undoable)
        m.exec(event.screenPos())
        event.accept()

    def _dash_dialog(self):
        d = QDialog()
        d.setWindowTitle("점선 간격 설정")
        form = QFormLayout(d)
        spin_dash = QDoubleSpinBox()
        spin_dash.setRange(0.5, 30.0); spin_dash.setSingleStep(0.5)
        spin_dash.setDecimals(1); spin_dash.setSuffix(" pt")
        spin_dash.setValue(self.dash_length)
        spin_gap = QDoubleSpinBox()
        spin_gap.setRange(0.5, 30.0); spin_gap.setSingleStep(0.5)
        spin_gap.setDecimals(1); spin_gap.setSuffix(" pt")
        spin_gap.setValue(self.gap_length)
        form.addRow("Dash 길이", spin_dash)
        form.addRow("Gap 길이", spin_gap)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        new_dash = spin_dash.value(); new_gap = spin_gap.value()
        if (abs(new_dash - self.dash_length) <= 1e-9 and
                abs(new_gap - self.gap_length) <= 1e-9):
            return
        old_dash, old_gap = self.dash_length, self.gap_length
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import PropertyChangeCommand
            stack.beginMacro("점선 간격 설정")
            if abs(new_dash - old_dash) > 1e-9:
                stack.push(PropertyChangeCommand(
                    self, "dash_length", old_dash, new_dash, "점선 dash 길이"))
            if abs(new_gap - old_gap) > 1e-9:
                stack.push(PropertyChangeCommand(
                    self, "gap_length", old_gap, new_gap, "점선 gap 길이"))
            stack.endMacro()
        else:
            self.dash_length = new_dash
            self.gap_length = new_gap
            self.update()

    def _duplicate(self):
        scene = self.scene()
        if not scene:
            return
        c = self.__class__()
        c._gray_pen = self._gray_pen
        c._pen_width = self._pen_width
        c.dash_length = self.dash_length
        c.gap_length = self.gap_length
        c.setEndpoints(self._p1 + QPointF(20, 20), self._p2 + QPointF(20, 20))
        c.setPos(self.pos())
        if self.parentItem():
            c.setParentItem(self.parentItem())
        else:
            scene.addItem(c)


class ArrowHead(BasePhysicsItem):
    """단독 화살촉. 회전·크기 조절 가능, 끝점 근처에 놓이면 스냅."""
    LABEL = "화살촉"; CATEGORY = "기본"
    DEFAULT_SIZE = QSizeF(12, 14)
    ASPECT_LOCKED = True
    MIN_W = 4; MIN_H = 4
    SNAP_TO_ENDPOINT_PX = 10.0

    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(self.penColor()))
        pen = QPen(self.penColor(), self._pen_width)
        pen.setJoinStyle(Qt.PenJoinStyle.MiterJoin)
        p.setPen(pen)
        p.drawPolygon(QPolygonF([
            QPointF(r.width() / 2, 0),
            QPointF(0, r.height()),
            QPointF(r.width(), r.height()),
        ]))

    def _tip_scene(self) -> QPointF:
        return self.mapToScene(QPointF(self._size.width() / 2, 0))

    def _find_snap_target(self):
        """근처 선 끝점을 찾아 (scene_endpoint, (ux, uy)) 반환."""
        scn = self.scene()
        if scn is None:
            return None
        tip = self._tip_scene()
        best = None
        best_d = self.SNAP_TO_ENDPOINT_PX
        for it in scn.items():
            if it is self:
                continue
            if not isinstance(it, TwoPointItem):
                continue
            for which, pt_local in (('p2', it._p2), ('p1', it._p1)):
                ep_scene = it.mapToScene(pt_local)
                d = math.hypot(ep_scene.x() - tip.x(), ep_scene.y() - tip.y())
                if d < best_d:
                    best_d = d
                    if which == 'p2':
                        other_scene = it.mapToScene(it._p1)
                    else:
                        other_scene = it.mapToScene(it._p2)
                    dx = ep_scene.x() - other_scene.x()
                    dy = ep_scene.y() - other_scene.y()
                    L = math.hypot(dx, dy) or 1.0
                    best = (ep_scene, (dx / L, dy / L))
        return best

    def mouseReleaseEvent(self, event):
        was_handle = self._active_handle is not None
        pos_before = QPointF(self.pos())
        rot_before = self.rotation()
        super().mouseReleaseEvent(event)
        if was_handle or self._locked:
            return
        snap = self._find_snap_target()
        if snap is None:
            return
        target_scene, (ux, uy) = snap
        # local "up" (tip 방향) = (0, -1) → 부모 좌표에서 (ux, uy) 가 되게 회전 각 산정.
        # ASSUMPTION: 부모 (CanvasFrame) 는 회전하지 않는다고 가정 — scene 방향 == parent 방향.
        new_rot = math.degrees(math.atan2(ux, -uy))
        self.setRotation(new_rot)
        tip_now_scene = self._tip_scene()
        dx = target_scene.x() - tip_now_scene.x()
        dy = target_scene.y() - tip_now_scene.y()
        self.setPos(QPointF(self.pos().x() + dx,
                            self.pos().y() + dy))
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import ResizeItemCommand
            stack.push(ResizeItemCommand(
                self,
                {'pos': pos_before, 'rotation': rot_before},
                {'pos': QPointF(self.pos()), 'rotation': self.rotation()}))

    # ---- Round 6 Fix 2: 회전 핸들만 노출, 리사이즈 핸들 제거 ---- #
    # ASSUMPTION: 선택 시각화는 점선 박스 + 회전 핸들 + 연결선만 남긴다.
    # 8개 리사이즈 사각 핸들은 그리지 않는다 — 화살촉은 점 마커이므로
    # 크기는 우클릭 메뉴에서만 조정한다.
    def _paint_selection(self, p: QPainter):
        t = p.transform()
        sx = math.hypot(t.m11(), t.m12())
        sy = math.hypot(t.m21(), t.m22())
        scale = (sx + sy) / 2.0
        unit = 1.0 / scale if scale else 1.0
        r_half = (ROT_HANDLE_VIEW_PX / 2) * unit
        stroke_w = 1.0 * unit
        pen_box = QPen(HANDLE_STROKE, stroke_w, Qt.PenStyle.DashLine)
        p.setPen(pen_box)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(self.contentRect())
        hs = self._handle_positions()
        p.setPen(QPen(HANDLE_STROKE, stroke_w))
        p.drawLine(hs['tm'], hs['rot'])
        p.setBrush(QBrush(HANDLE_FILL))
        rp = hs['rot']
        p.drawEllipse(QRectF(rp.x() - r_half, rp.y() - r_half,
                             2 * r_half, 2 * r_half))

    # ASSUMPTION: 리사이즈 핸들의 히트 영역을 완전히 제거한다.
    # hoverMoveEvent / mousePressEvent 가 모두 _hit_handle 을 통과하므로
    # 이 메서드만 오버라이드하면 커서 변경·드래그 리사이즈가 모두 차단된다.
    def _hit_handle(self, pos: QPointF) -> str | None:
        if not self.isSelected():
            return None
        unit = _view_unit_px(self)
        half = (ROT_HANDLE_VIEW_PX / 2 + HANDLE_HIT_TOL_VIEW_PX) * unit
        rot = self._handle_positions()['rot']
        if abs(pos.x() - rot.x()) <= half and \
           abs(pos.y() - rot.y()) <= half:
            return 'rot'
        return None

    def _extra_menu_actions(self, m: QMenu) -> None:
        m.addAction("크기 설정…", self._set_length_dialog)

    def _set_length_dialog(self):
        # ASSUMPTION: "길이" 는 화살촉의 끝-기저 거리(=height) 이며
        # width 는 length * 0.86 으로 파생한다. 기본값 14 px 와 일치.
        cur_length = self._size.height()
        d = QDialog()
        d.setWindowTitle("화살촉 크기 설정")
        form = QFormLayout(d)
        spin = QDoubleSpinBox()
        spin.setRange(4.0, 200.0)
        spin.setSingleStep(1.0)
        spin.setDecimals(1)
        spin.setValue(cur_length)
        form.addRow("길이 (px)", spin)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept)
        bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        new_length = spin.value()
        if abs(new_length - cur_length) <= 1e-6:
            return
        new_size = QSizeF(new_length * 0.86, new_length)
        old_size = QSizeF(self._size)
        # ASSUMPTION: 크기 변경 undo 는 코드베이스 관례에 따라 ResizeItemCommand
        # 를 사용한다. PropertyChangeCommand 로 _size 를 직접 setattr 하면
        # prepareGeometryChange 가 호출되지 않아 boundingRect 캐시가 어긋나
        # 잔상이 생긴다. 지시문의 "PropertyChangeCommand" 는 "undo 명령" 의
        # 일반화된 의미로 해석.
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import ResizeItemCommand
            stack.push(ResizeItemCommand(
                self,
                {'size': old_size, 'pos': QPointF(self.pos())},
                {'size': new_size, 'pos': QPointF(self.pos())}))
        else:
            self.prepareGeometryChange()
            self.setSize(new_size)
            self.update()


# ============================================================================ #
# 기본 도형 (드래그앤드롭 형)
# ============================================================================ #
class RectItem(BasePhysicsItem):
    LABEL = "사각형"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(100, 60)
    def paintSymbol(self, p): p.drawRect(self.contentRect())

class CircleItem(BasePhysicsItem):
    LABEL = "원"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(80, 80)
    def paintSymbol(self, p): p.drawEllipse(self.contentRect())
    def fillPath(self) -> QPainterPath:
        p = QPainterPath(); p.addEllipse(self.contentRect()); return p

class TriangleItem(BasePhysicsItem):
    LABEL = "삼각형"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(100, 80)
    def _triangle(self) -> QPolygonF:
        r = self.contentRect()
        return QPolygonF([QPointF(r.width()/2, 0),
                          QPointF(0, r.height()),
                          QPointF(r.width(), r.height())])
    def paintSymbol(self, p):
        p.drawPolygon(self._triangle())
    def fillPath(self) -> QPainterPath:
        p = QPainterPath(); p.addPolygon(self._triangle()); p.closeSubpath()
        return p

class PointItem(BasePhysicsItem):
    LABEL = "점"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(10, 10)
    MIN_W = 4; MIN_H = 4
    def paintSymbol(self, p):
        p.setBrush(QBrush(self.penColor()))
        p.drawEllipse(self.contentRect())
    def fillPath(self) -> QPainterPath:
        p = QPainterPath(); p.addEllipse(self.contentRect()); return p

class AxisItem(BasePhysicsItem):
    LABEL = "좌표축 (x-y)"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(180, 140)
    HAS_ARROW_HEAD = True
    def paintSymbol(self, p):
        r = self.contentRect()
        ox, oy = 14, r.height() - 14
        a = self._arrow_size
        p.drawLine(QPointF(ox, oy), QPointF(r.width() - a * 0.4, oy))
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(r.width(), oy), 1, 0, a))
        p.drawLine(QPointF(ox, oy), QPointF(ox, a * 0.4))
        p.drawPolygon(_arrow_head_polygon(QPointF(ox, 0), 0, -1, a))
        f = p.font(); f.setPointSize(10); p.setFont(f)
        p.drawText(QPointF(r.width() - 12, oy + 15), "x")
        p.drawText(QPointF(ox - 15, 10), "y")

class GridItem(BasePhysicsItem):
    """점선 격자 — 셀 크기는 고정, 셀 개수는 크기 비례로 늘어남."""
    LABEL = "점선 격자"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(180, 140)
    CELL = 20
    def paintSymbol(self, p):
        r = self.contentRect()
        pen = QPen(QColor(140, 140, 140), 0.8, Qt.PenStyle.DashLine)
        pen.setDashPattern([3, 3])
        p.setPen(pen)
        x = self.CELL
        while x < r.width():
            p.drawLine(QPointF(x, 0), QPointF(x, r.height()))
            x += self.CELL
        y = self.CELL
        while y < r.height():
            p.drawLine(QPointF(0, y), QPointF(r.width(), y))
            y += self.CELL
        p.setPen(QPen(self.penColor(), self._pen_width))
        p.drawRect(r)

class AngleArcItem(BasePhysicsItem):
    LABEL = "각도 호"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(70, 70)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawLine(QPointF(0, r.height()), QPointF(r.width(), r.height()))
        p.drawLine(QPointF(0, r.height()), QPointF(r.width(), 0))
        arc = QRectF(-r.width() * 0.4, r.height() * 0.2,
                     r.width() * 0.8, r.height() * 0.8)
        p.drawArc(arc, 0 * 16, 45 * 16)

class LengthMarkItem(BasePhysicsItem):
    LABEL = "길이 표시"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(140, 30)
    HAS_ARROW_HEAD = True
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        a = self._arrow_size
        p.drawLine(QPointF(0, 0), QPointF(0, r.height()))
        p.drawLine(QPointF(r.width(), 0), QPointF(r.width(), r.height()))
        p.drawLine(QPointF(a * 0.4, y), QPointF(r.width() - a * 0.4, y))
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(0, y), -1, 0, a))
        p.drawPolygon(_arrow_head_polygon(QPointF(r.width(), y), 1, 0, a))


# ---- 구버전 호환: 과거 "영역" 심볼들 ---------------------------------------- #
# Phase 3-A 부터 면 채우기는 모든 BasePhysicsItem 의 _fill_pattern 속성으로
# 통합되었다. 아래 5개 클래스는 더 이상 팔레트(SYMBOL_REGISTRY)에 노출하지
# 않지만, 옛 저장 파일이 이 클래스 이름을 참조하므로 로드 호환용으로 남겨 둔다.
# 각 클래스는 적절한 _fill_pattern 프리셋을 가진 일반 사각형(RectItem)으로
# 동작하며, 패턴 그리기는 BasePhysicsItem._paint_fill_pattern 가 담당한다.
class GrayRegionItem(RectItem):
    LABEL = "회색 영역"; DEFAULT_SIZE = QSizeF(140, 100)
    def __init__(self, parent=None):
        super().__init__(parent)
        self._fill_gray = 225
        self._fill_pattern = "solid"

class DarkGrayRegionItem(RectItem):
    LABEL = "짙은 회색 영역"; DEFAULT_SIZE = QSizeF(140, 100)
    def __init__(self, parent=None):
        super().__init__(parent)
        self._fill_gray = 180
        self._fill_pattern = "solid"

class DotRegionItem(RectItem):
    LABEL = "도트 영역 (자기장)"; DEFAULT_SIZE = QSizeF(140, 100)
    def __init__(self, parent=None):
        super().__init__(parent)
        self._fill_pattern = "dots"

class HatchRegionItem(RectItem):
    LABEL = "사선 해칭 영역"; DEFAULT_SIZE = QSizeF(140, 100)
    def __init__(self, parent=None):
        super().__init__(parent)
        self._fill_pattern = "hatch"

class XRegionItem(RectItem):
    LABEL = "엑스 영역"; DEFAULT_SIZE = QSizeF(140, 100)
    def __init__(self, parent=None):
        super().__init__(parent)
        self._fill_pattern = "cross"


# ============================================================================ #
# 광학
# ============================================================================ #
class ConvexLensItem(BasePhysicsItem):
    LABEL = "볼록렌즈"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(40, 140)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 235
    def fillPath(self) -> QPainterPath:
        r = self.contentRect()
        cx = r.width() / 2
        path = QPainterPath()
        path.moveTo(cx, 0)
        path.quadTo(QPointF(r.width(), r.height() / 2), QPointF(cx, r.height()))
        path.quadTo(QPointF(0, r.height() / 2), QPointF(cx, 0))
        return path
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawPath(self.fillPath())

class ConcaveLensItem(BasePhysicsItem):
    LABEL = "오목렌즈"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(40, 140)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 235
    def fillPath(self) -> QPainterPath:
        r = self.contentRect()
        cx = r.width() / 2
        path = QPainterPath()
        path.moveTo(0, 0); path.lineTo(r.width(), 0)
        path.quadTo(QPointF(cx, r.height() / 2), QPointF(r.width(), r.height()))
        path.lineTo(0, r.height())
        path.quadTo(QPointF(cx, r.height() / 2), QPointF(0, 0))
        return path
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawPath(self.fillPath())

def _draw_mirror_hatching(p: QPainter, path: QPainterPath,
                          clip_rect: QRectF, step: float = 9.0,
                          tick: float = 7.0, flip_to_right: bool = False):
    """곡선·직선 경로의 한쪽에 짧은 사선 해칭을 그린다.

    `flip_to_right=False` 이면 경로의 왼쪽(법선이 -x 방향)에 해칭,
    True 이면 오른쪽(+x 방향)에 해칭.
    """
    if path.length() <= 0:
        return
    p.save()
    p.setClipRect(clip_rect.adjusted(-2, -2, 2, 2))
    n = max(6, int(path.length() / step))
    for i in range(1, n):
        t = i / n
        pt = path.pointAtPercent(t)
        # 수치 접선
        dt = 0.005
        pt2 = path.pointAtPercent(min(0.999, t + dt))
        tx, ty = pt2.x() - pt.x(), pt2.y() - pt.y()
        L = math.hypot(tx, ty) or 1.0
        # 법선 (왼쪽 = -y_tangent, +x_tangent 회전)
        nx, ny = -ty / L, tx / L
        # 방향 강제
        if (flip_to_right and nx < 0) or (not flip_to_right and nx > 0):
            nx, ny = -nx, -ny
        # 약간 위로 기울어진 사선이 보기 좋음
        end = QPointF(pt.x() + nx * tick, pt.y() + ny * tick)
        p.drawLine(pt, end)
    p.restore()


class FlatMirrorItem(BasePhysicsItem):
    """평면거울 - 반사면(오른쪽 굵은 선) + 뒷면 짧은 해칭."""
    LABEL = "평면거울"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(24, 140)
    HATCH_STEP = 9
    HATCH_TICK = 9
    def paintSymbol(self, p):
        r = self.contentRect()
        # 반사면 (오른쪽 굵은 선)
        pen = QPen(self.penColor(), max(1.8, self._pen_width * 2))
        p.setPen(pen)
        p.drawLine(QPointF(r.width(), 0), QPointF(r.width(), r.height()))
        # 뒷면 해칭 (오른쪽 끝에서 왼쪽 위로 짧은 사선)
        p.setPen(QPen(self.penColor(), 0.7))
        p.save()
        p.setClipRect(r)
        y = -self.HATCH_TICK
        while y <= r.height() + self.HATCH_TICK:
            p.drawLine(QPointF(r.width(), y),
                       QPointF(r.width() - self.HATCH_TICK,
                               y + self.HATCH_TICK))
            y += self.HATCH_STEP
        p.restore()


class ConcaveMirrorItem(BasePhysicsItem):
    """오목거울 - 반사면이 오른쪽(안쪽 그릇면). 곡선이 왼쪽으로 휨."""
    LABEL = "오목거울"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(46, 140)
    def paintSymbol(self, p):
        r = self.contentRect()
        # 양 끝이 오른쪽 위·아래, 가운데가 왼쪽으로 휜 호
        path = QPainterPath()
        path.moveTo(r.width(), 0)
        # 컨트롤 포인트를 좌측 외부에 두면 중앙이 contentRect 안에서 적당히 휨
        path.quadTo(QPointF(-r.width() * 0.4, r.height() / 2),
                    QPointF(r.width(), r.height()))
        pen = QPen(self.penColor(), max(1.8, self._pen_width * 2))
        p.setPen(pen)
        p.drawPath(path)
        # 해칭: 곡선의 왼쪽(뒷면)에 짧은 사선
        p.setPen(QPen(self.penColor(), 0.7))
        _draw_mirror_hatching(p, path, r, step=9, tick=8, flip_to_right=False)


class ConvexMirrorItem(BasePhysicsItem):
    """볼록거울 - 반사면이 오른쪽(바깥 볼록면). 곡선이 오른쪽으로 휨."""
    LABEL = "볼록거울"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(46, 140)
    def paintSymbol(self, p):
        r = self.contentRect()
        # 양 끝이 왼쪽 위·아래, 가운데가 오른쪽으로 휜 호
        path = QPainterPath()
        path.moveTo(0, 0)
        path.quadTo(QPointF(r.width() * 1.4, r.height() / 2),
                    QPointF(0, r.height()))
        pen = QPen(self.penColor(), max(1.8, self._pen_width * 2))
        p.setPen(pen)
        p.drawPath(path)
        # 해칭: 곡선의 왼쪽(뒷면, 오목한 안쪽)에 짧은 사선
        p.setPen(QPen(self.penColor(), 0.7))
        _draw_mirror_hatching(p, path, r, step=9, tick=8, flip_to_right=False)

class SlitItem(BasePhysicsItem):
    LABEL = "단일 슬릿"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(20, 140)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(self.penColor()))
        p.drawRect(QRectF(0, 0, r.width(), r.height() / 2 - 6))
        p.drawRect(QRectF(0, r.height() / 2 + 6, r.width(), r.height() / 2 - 6))

class DoubleSlitItem(BasePhysicsItem):
    LABEL = "이중 슬릿"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(20, 160)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(self.penColor()))
        h = r.height()
        p.drawRect(QRectF(0, 0, r.width(), h * 0.30))
        p.drawRect(QRectF(0, h * 0.40, r.width(), h * 0.20))
        p.drawRect(QRectF(0, h * 0.70, r.width(), h * 0.30))

class ScreenItem(BasePhysicsItem):
    LABEL = "스크린"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(14, 160)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 215
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawRect(self.contentRect())

class PrismItem(BasePhysicsItem):
    LABEL = "프리즘"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(100, 90)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 225
    def _triangle(self) -> QPolygonF:
        r = self.contentRect()
        return QPolygonF([QPointF(r.width() / 2, 0),
                          QPointF(0, r.height()),
                          QPointF(r.width(), r.height())])
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawPolygon(self._triangle())
    def fillPath(self) -> QPainterPath:
        p = QPainterPath(); p.addPolygon(self._triangle()); p.closeSubpath()
        return p

class PointLightItem(BasePhysicsItem):
    LABEL = "점광원"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(46, 46)
    def paintSymbol(self, p):
        r = self.contentRect()
        c = r.center()
        p.setBrush(QBrush(self.penColor()))
        p.drawEllipse(QRectF(c.x() - 4, c.y() - 4, 8, 8))
        p.setBrush(Qt.BrushStyle.NoBrush)
        for i in range(8):
            a = i * math.pi / 4
            r0 = min(r.width(), r.height()) * 0.18
            r1 = min(r.width(), r.height()) * 0.48
            p.drawLine(QPointF(c.x() + r0 * math.cos(a), c.y() + r0 * math.sin(a)),
                       QPointF(c.x() + r1 * math.cos(a), c.y() + r1 * math.sin(a)))

class OpticalObjectItem(BasePhysicsItem):
    LABEL = "광학 물체(↑)"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(20, 80)
    HAS_ARROW_HEAD = True
    def paintSymbol(self, p):
        r = self.contentRect()
        x = r.width() / 2
        a = self._arrow_size
        p.drawLine(QPointF(x, r.height()), QPointF(x, a * 0.5))
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(x, 0), 0, -1, a))


# ---- 광학 신규 오브젝트 ---- #
class LaserItem(BasePhysicsItem):
    """레이저 (소형 광원). 본체 + 출사구 + 라벨."""
    LABEL = "레이저"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(90, 32)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 230
    def paintSymbol(self, p):
        r = self.contentRect()
        body = QRectF(0, 0, r.width() * 0.82, r.height())
        p.setBrush(self.fillBrush())
        p.drawRect(body)
        # 출사구 (어두운 사각)
        p.setBrush(QBrush(QColor(70, 70, 70)))
        p.drawRect(QRectF(body.right(), r.height() * 0.30,
                          r.width() - body.right(), r.height() * 0.40))
        # 작은 전원 표시
        p.setBrush(QBrush(QColor(80, 80, 80)))
        p.drawEllipse(QRectF(6, r.height() / 2 - 2, 4, 4))
        # 라벨
        f = p.font(); f.setBold(True)
        f.setPointSize(max(6, int(min(r.width(), r.height()) * 0.22)))
        p.setFont(f)
        p.drawText(body, Qt.AlignmentFlag.AlignCenter, "LASER")


class WaterCupItem(BasePhysicsItem):
    """물컵 (사다리꼴 모양 + 수면 + 물 영역). 굴절 문제용."""
    LABEL = "물컵"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(90, 110)
    def paintSymbol(self, p):
        r = self.contentRect()
        # 밑이 좁고 위가 넓은 사다리꼴
        narrow = r.width() * 0.12
        top_l = QPointF(0, 0); top_r = QPointF(r.width(), 0)
        bot_l = QPointF(narrow, r.height()); bot_r = QPointF(r.width() - narrow, r.height())
        # 수면 (상단에서 30% 지점)
        water_top_y = r.height() * 0.30
        # 사다리꼴 양 옆 변의 수면 교점
        t = water_top_y / r.height()
        wl = QPointF(narrow * t, water_top_y)
        wr = QPointF(r.width() - narrow * t, water_top_y)
        # 물 영역 채움
        water_poly = QPolygonF([wl, wr, bot_r, bot_l])
        p.setBrush(QBrush(QColor(220, 220, 220)))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawPolygon(water_poly)
        # 컵 외곽 (위쪽은 열림 - 컵의 입구)
        p.setPen(QPen(self.penColor(), self._pen_width))
        p.setBrush(Qt.BrushStyle.NoBrush)
        path = QPainterPath()
        path.moveTo(top_l); path.lineTo(bot_l)
        path.lineTo(bot_r); path.lineTo(top_r)
        p.drawPath(path)
        # 수면 점선
        pen = QPen(self.penColor(), max(0.7, self._pen_width * 0.8),
                   Qt.PenStyle.DashLine)
        pen.setDashPattern([4, 3])
        p.setPen(pen)
        p.drawLine(wl, wr)


class FishItem(BasePhysicsItem):
    """물고기 실루엣."""
    LABEL = "물고기"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(90, 50)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 235
    def paintSymbol(self, p):
        r = self.contentRect()
        # 본체 (타원)
        body = QRectF(0, r.height() * 0.20,
                      r.width() * 0.72, r.height() * 0.60)
        p.setBrush(self.fillBrush())
        p.drawEllipse(body)
        # 꼬리 (오른쪽 삼각형)
        tail = QPolygonF([
            QPointF(body.right() - 2, r.height() * 0.5),
            QPointF(r.width(), r.height() * 0.05),
            QPointF(r.width(), r.height() * 0.95),
        ])
        p.drawPolygon(tail)
        # 위 지느러미
        p.drawPolygon(QPolygonF([
            QPointF(body.left() + body.width() * 0.45, body.top() + 2),
            QPointF(body.left() + body.width() * 0.60, body.top() - body.height() * 0.30),
            QPointF(body.left() + body.width() * 0.75, body.top() + 2),
        ]))
        # 눈
        ex = body.left() + body.width() * 0.15
        ey = body.top() + body.height() * 0.45
        p.setBrush(QBrush(self.penColor()))
        p.drawEllipse(QRectF(ex - 2, ey - 2, 4, 4))


class BirdItem(BasePhysicsItem):
    """새 실루엣 (갈매기 형태 - 두 곡선)."""
    LABEL = "새"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(90, 30)
    def paintSymbol(self, p):
        r = self.contentRect()
        path = QPainterPath()
        # 좌측 날개
        path.moveTo(0, r.height() * 0.85)
        path.quadTo(QPointF(r.width() * 0.20, -r.height() * 0.20),
                    QPointF(r.width() * 0.50, r.height() * 0.55))
        # 우측 날개
        path.quadTo(QPointF(r.width() * 0.80, -r.height() * 0.20),
                    QPointF(r.width(), r.height() * 0.85))
        pen = QPen(self.penColor(), max(1.2, self._pen_width * 1.5))
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(pen)
        p.drawPath(path)


class PersonItem(BasePhysicsItem):
    """인물 (광학 물체로 사용되는 사람 형상)."""
    LABEL = "인물"; CATEGORY = "광학"; DEFAULT_SIZE = QSizeF(40, 110)
    def paintSymbol(self, p):
        r = self.contentRect()
        cx = r.width() / 2
        # 머리
        head_r = min(r.width() * 0.30, r.height() * 0.13)
        p.setBrush(QBrush(QColor(255, 255, 255)))
        p.drawEllipse(QRectF(cx - head_r, 0, 2 * head_r, 2 * head_r))
        # 몸통
        torso_top = 2 * head_r
        torso_bot = r.height() * 0.62
        p.drawLine(QPointF(cx, torso_top), QPointF(cx, torso_bot))
        # 양팔
        shoulder_y = torso_top + (torso_bot - torso_top) * 0.20
        p.drawLine(QPointF(cx, shoulder_y),
                   QPointF(cx - r.width() * 0.40, shoulder_y + r.height() * 0.22))
        p.drawLine(QPointF(cx, shoulder_y),
                   QPointF(cx + r.width() * 0.40, shoulder_y + r.height() * 0.22))
        # 양다리
        p.drawLine(QPointF(cx, torso_bot),
                   QPointF(cx - r.width() * 0.35, r.height()))
        p.drawLine(QPointF(cx, torso_bot),
                   QPointF(cx + r.width() * 0.35, r.height()))


# ============================================================================ #
# 광학 (수능 Round 5 추가 심볼)
# ============================================================================ #
# 공통 라벨 폰트 헬퍼
def _label_font(size: int = 10) -> QFont:
    return QFont("맑은 고딕", size)


def _push_focal_length_dialog(parent_widget, item, attr_name: str,
                              title: str = "초점거리 설정"):
    """초점거리(또는 유사) 길이 다이얼로그 — QDoubleSpinBox 기반.

    ASSUMPTION: 현재 단위(units 모듈)에 맞춰 표시/저장은 px로 한다.
    """
    cur_px = getattr(item, attr_name)
    d = QDialog(parent_widget)
    d.setWindowTitle(title)
    form = QFormLayout(d)
    unit = units.get_unit()
    spin = QDoubleSpinBox()
    spin.setRange(units.from_px(5), 5000.0)
    spin.setDecimals(units.decimals())
    spin.setSingleStep(max(0.1, units.from_px(5)))
    spin.setSuffix(units.suffix())
    spin.setValue(units.from_px(cur_px))
    form.addRow(title, spin)
    bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                          QDialogButtonBox.StandardButton.Cancel)
    bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
    form.addRow(bb)
    if d.exec() != QDialog.DialogCode.Accepted:
        return
    new_px = units.to_px(spin.value())
    if abs(new_px - cur_px) <= 1e-6:
        return
    item.prepareGeometryChange()
    item._push_property(attr_name, cur_px, new_px, title)
    item.update()


def _label_preset_dialog(parent_widget, current: str, presets: list[str],
                         title: str = "라벨 변경") -> tuple[str, bool]:
    """프리셋 + 직접 입력 라벨 다이얼로그. (값, ok) 반환."""
    items = list(presets) + ["직접 입력..."]
    idx = items.index(current) if current in items else 0
    choice, ok = QInputDialog.getItem(parent_widget, title, "라벨:",
                                      items, idx, False)
    if not ok:
        return current, False
    if choice == "직접 입력...":
        new, ok2 = QInputDialog.getText(parent_widget, title, "라벨:",
                                        text=current)
        if not ok2:
            return current, False
        return new, True
    return choice, True


class OpticalAxisItem(BasePhysicsItem):
    """광축 — 수평 실선 + 우측 끝에 라벨."""
    LABEL = "광축"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(400, 22)
    MIN_W = 30; MIN_H = 10

    def __init__(self, parent=None):
        super().__init__(parent)
        self._label = "광축"

    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        p.drawLine(QPointF(0, y), QPointF(r.width(), y))
        p.setFont(_label_font(10))
        metrics = p.fontMetrics()
        tw = metrics.horizontalAdvance(self._label)
        # 라벨: 선의 오른쪽 끝에서 위로 10 px
        p.drawText(QPointF(r.width() - tw, y - 10), self._label)

    def serialize(self) -> dict:
        return {"label": self._label}

    def deserialize(self, d: dict) -> None:
        self._label = d.get("label", "광축")

    def _extra_menu_actions(self, m):
        m.addAction("길이 설정…", self._set_length)
        m.addAction("라벨 변경…", self._set_label)
        m.addSeparator()

    def _set_length(self):
        unit = units.get_unit()
        cur = units.from_px(self._size.width())
        val, ok = QInputDialog.getDouble(
            None, "길이 설정", f"길이 ({unit}):",
            cur, units.from_px(self.MIN_W), 5000.0, units.decimals())
        if not ok:
            return
        new_w = units.to_px(val)
        if abs(new_w - self._size.width()) <= 1e-6:
            return
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            from commands import ResizeItemCommand
            stack.push(ResizeItemCommand(
                self,
                {'size': QSizeF(self._size), 'pos': QPointF(self.pos())},
                {'size': QSizeF(new_w, self._size.height()),
                 'pos': QPointF(self.pos())}))
        else:
            self.setSize(QSizeF(new_w, self._size.height()))

    def _set_label(self):
        new, ok = QInputDialog.getText(None, "라벨 변경", "라벨:",
                                       text=self._label)
        if ok and new != self._label:
            self._push_property("_label", self._label, new, "라벨 변경")


class ObjectArrowItem(BasePhysicsItem):
    """물체 — 위쪽 화살표 + 라벨 (광학 물체용)."""
    LABEL = "물체 (수능)"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(40, 60)
    MIN_W = 12; MIN_H = 20
    HAS_ARROW_HEAD = True
    LABEL_PRESETS = ["물체", "h", "h₁", "h₂"]

    def __init__(self, parent=None):
        super().__init__(parent)
        self._label = "물체"

    def paintSymbol(self, p):
        r = self.contentRect()
        x = r.width() / 2
        a = self._arrow_size
        p.drawLine(QPointF(x, r.height()), QPointF(x, a * 0.5))
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(x, 0), 0, -1, a))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(10))
        p.drawText(QPointF(x + 8, 12), self._label)

    def serialize(self) -> dict:
        return {"label": self._label}

    def deserialize(self, d: dict) -> None:
        self._label = d.get("label", "물체")

    def _extra_menu_actions(self, m):
        m.addAction("라벨 변경…", self._set_label)
        m.addSeparator()

    def _set_label(self):
        new, ok = _label_preset_dialog(None, self._label, self.LABEL_PRESETS,
                                       "라벨 변경")
        if ok and new != self._label:
            self._push_property("_label", self._label, new, "라벨 변경")


class ImageArrowItem(BasePhysicsItem):
    """상 — 수직 화살표 (실상=위/허상=아래 토글) + 라벨."""
    LABEL = "상"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(40, 60)
    MIN_W = 12; MIN_H = 20
    HAS_ARROW_HEAD = True
    LABEL_PRESETS = ["상", "h₁", "h₂"]

    def __init__(self, parent=None):
        super().__init__(parent)
        self._label = "상"
        self._up = True  # True=실상(위), False=허상(아래)

    def paintSymbol(self, p):
        r = self.contentRect()
        x = r.width() / 2
        a = self._arrow_size
        if self._up:
            p.drawLine(QPointF(x, r.height()), QPointF(x, a * 0.5))
            p.setBrush(QBrush(self.penColor()))
            p.drawPolygon(_arrow_head_polygon(QPointF(x, 0), 0, -1, a))
            label_y = 12
        else:
            p.drawLine(QPointF(x, 0), QPointF(x, r.height() - a * 0.5))
            p.setBrush(QBrush(self.penColor()))
            p.drawPolygon(_arrow_head_polygon(QPointF(x, r.height()), 0, 1, a))
            label_y = r.height() - 4
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(10))
        p.drawText(QPointF(x + 8, label_y), self._label)

    def serialize(self) -> dict:
        return {"label": self._label, "up": self._up}

    def deserialize(self, d: dict) -> None:
        self._label = d.get("label", "상")
        self._up = bool(d.get("up", True))

    def _extra_menu_actions(self, m):
        m.addAction("방향 전환 (실상/허상)", self._toggle_dir)
        m.addAction("라벨 변경…", self._set_label)
        m.addSeparator()

    def _toggle_dir(self):
        self._push_property("_up", self._up, not self._up, "방향 전환")

    def _set_label(self):
        new, ok = _label_preset_dialog(None, self._label, self.LABEL_PRESETS,
                                       "라벨 변경")
        if ok and new != self._label:
            self._push_property("_label", self._label, new, "라벨 변경")


class LightSourceItem(BasePhysicsItem):
    """광원 — 작은 채워진 원 + 라벨."""
    LABEL = "광원 (수능)"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(80, 18)
    MIN_W = 20; MIN_H = 12
    RADIUS = 6.0

    def __init__(self, parent=None):
        super().__init__(parent)
        self._label = "광원"

    def paintSymbol(self, p):
        r = self.contentRect()
        cy = r.height() / 2
        rad = self.RADIUS
        p.setBrush(QBrush(self.penColor()))
        p.drawEllipse(QRectF(0, cy - rad, 2 * rad, 2 * rad))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(10))
        p.drawText(QPointF(2 * rad + 6, cy + 4), self._label)

    def serialize(self) -> dict:
        return {"label": self._label}

    def deserialize(self, d: dict) -> None:
        self._label = d.get("label", "광원")

    def _extra_menu_actions(self, m):
        m.addAction("라벨 변경…", self._set_label)
        m.addSeparator()

    def _set_label(self):
        new, ok = QInputDialog.getText(None, "라벨 변경", "라벨:",
                                       text=self._label)
        if ok and new != self._label:
            self._push_property("_label", self._label, new, "라벨 변경")


class BiconvexLensItem(BasePhysicsItem):
    """볼록렌즈 (수능) — 두 초점 + 수렴 화살표, 두께가 초점거리에 반비례."""
    LABEL = "볼록렌즈 (수능)"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(30, 120)
    MIN_W = 8; MIN_H = 30
    REF_FOCAL = 60.0  # 두께 스케일 기준점

    def __init__(self, parent=None):
        super().__init__(parent)
        self._focal_length = 60.0

    def boundingRect(self) -> QRectF:
        pad = max(ROT_HANDLE_OFFSET + 6, self._pen_width + 4)
        extra = self._focal_length + 30  # 초점 마커 + "F" 라벨 여유
        return QRectF(-pad - extra, -pad,
                      self._size.width() + 2 * pad + 2 * extra,
                      self._size.height() + 2 * pad)

    def fillPath(self) -> QPainterPath:
        r = self.contentRect()
        w, h = r.width(), r.height()
        cx, cy = w / 2, h / 2
        # 두께(t)는 초점거리에 반비례. 기준 focal=60 → t=w.
        t = max(6.0, min(w, w * self.REF_FOCAL /
                         max(20.0, self._focal_length)))
        # Biconvex outline: 양쪽 호 사이의 풋볼 모양
        path = QPainterPath()
        path.moveTo(cx, 0)
        path.quadTo(QPointF(cx + t / 2, cy), QPointF(cx, h))
        path.quadTo(QPointF(cx - t / 2, cy), QPointF(cx, 0))
        return path
    def paintSymbol(self, p):
        r = self.contentRect()
        w, h = r.width(), r.height()
        cx, cy = w / 2, h / 2
        p.setBrush(self.fillBrush())
        p.drawPath(self.fillPath())
        # 수렴 화살표 (위/아래에서 안쪽 방향)
        head = 8.0
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(cx, head * 0.5), 0, 1, head))
        p.drawPolygon(_arrow_head_polygon(QPointF(cx, h - head * 0.5), 0, -1, head))
        p.setBrush(Qt.BrushStyle.NoBrush)
        # 광축(점선)과 초점
        pen_axis = QPen(self.penColor(), max(0.7, self._pen_width * 0.8),
                        Qt.PenStyle.DashLine)
        pen_axis.setDashPattern([4, 3])
        p.save()
        p.setPen(pen_axis)
        p.drawLine(QPointF(cx - self._focal_length - 14, cy),
                   QPointF(cx + self._focal_length + 14, cy))
        p.restore()
        p.setBrush(QBrush(self.penColor()))
        for sign in (-1, 1):
            fx = cx + sign * self._focal_length
            p.drawEllipse(QRectF(fx - 2.8, cy - 2.8, 5.6, 5.6))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(10))
        p.drawText(QPointF(cx - self._focal_length - 4, cy + 16), "F")
        p.drawText(QPointF(cx + self._focal_length - 4, cy + 16), "F")

    def serialize(self) -> dict:
        return {"focal_length": self._focal_length}

    def deserialize(self, d: dict) -> None:
        self.prepareGeometryChange()
        self._focal_length = float(d.get("focal_length", 60.0))

    def _extra_menu_actions(self, m):
        m.addAction("초점거리 설정…", self._set_focal)
        m.addSeparator()

    def _set_focal(self):
        _push_focal_length_dialog(None, self, "_focal_length", "초점거리 설정")


class BiconcaveLensItem(BasePhysicsItem):
    """오목렌즈 (수능) — 두 호로 이루어진 외곽 + 발산 화살표 + 초점."""
    LABEL = "오목렌즈 (수능)"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(30, 120)
    MIN_W = 8; MIN_H = 30
    REF_FOCAL = 60.0

    def __init__(self, parent=None):
        super().__init__(parent)
        self._focal_length = 60.0

    def boundingRect(self) -> QRectF:
        pad = max(ROT_HANDLE_OFFSET + 6, self._pen_width + 4)
        extra = self._focal_length + 30
        return QRectF(-pad - extra, -pad,
                      self._size.width() + 2 * pad + 2 * extra,
                      self._size.height() + 2 * pad)

    def fillPath(self) -> QPainterPath:
        r = self.contentRect()
        w, h = r.width(), r.height()
        cy = h / 2
        # 두께(굽힘 깊이)는 초점거리에 반비례.
        depth = max(2.0, min(w * 0.45, w * self.REF_FOCAL /
                             max(20.0, self._focal_length) * 0.5))
        # Biconcave outline: 위 가로선 → 우측 호(왼쪽으로 휨) → 아래 가로선 → 좌측 호
        path = QPainterPath()
        path.moveTo(0, 0); path.lineTo(w, 0)
        path.quadTo(QPointF(w - depth, cy), QPointF(w, h))
        path.lineTo(0, h)
        path.quadTo(QPointF(depth, cy), QPointF(0, 0))
        return path
    def paintSymbol(self, p):
        r = self.contentRect()
        w, h = r.width(), r.height()
        cx, cy = w / 2, h / 2
        p.setBrush(self.fillBrush())
        p.drawPath(self.fillPath())
        # 발산 화살표 (위/아래에서 바깥 방향)
        head = 8.0
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(cx, -head), 0, -1, head))
        p.drawPolygon(_arrow_head_polygon(QPointF(cx, h + head), 0, 1, head))
        p.setBrush(Qt.BrushStyle.NoBrush)
        # 광축 + 초점
        pen_axis = QPen(self.penColor(), max(0.7, self._pen_width * 0.8),
                        Qt.PenStyle.DashLine)
        pen_axis.setDashPattern([4, 3])
        p.save()
        p.setPen(pen_axis)
        p.drawLine(QPointF(cx - self._focal_length - 14, cy),
                   QPointF(cx + self._focal_length + 14, cy))
        p.restore()
        p.setBrush(QBrush(self.penColor()))
        for sign in (-1, 1):
            fx = cx + sign * self._focal_length
            p.drawEllipse(QRectF(fx - 2.8, cy - 2.8, 5.6, 5.6))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(10))
        p.drawText(QPointF(cx - self._focal_length - 4, cy + 16), "F")
        p.drawText(QPointF(cx + self._focal_length - 4, cy + 16), "F")

    def serialize(self) -> dict:
        return {"focal_length": self._focal_length}

    def deserialize(self, d: dict) -> None:
        self.prepareGeometryChange()
        self._focal_length = float(d.get("focal_length", 60.0))

    def _extra_menu_actions(self, m):
        m.addAction("초점거리 설정…", self._set_focal)
        m.addSeparator()

    def _set_focal(self):
        _push_focal_length_dialog(None, self, "_focal_length", "초점거리 설정")


class SemicircularMediumItem(BasePhysicsItem):
    """반원형 매질 — 평평한 면을 경계로 하는 반원."""
    LABEL = "반원형 매질"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(160, 80)
    MIN_W = 30; MIN_H = 20

    def __init__(self, parent=None):
        super().__init__(parent)
        self._filled = False
        self._label = ""

    def fillPath(self) -> QPainterPath:
        r = self.contentRect()
        w, h = r.width(), r.height()
        # 평평한 면이 아래, 곡선이 위 (contentRect 안에서 위쪽 반원)
        path = QPainterPath()
        full = QRectF(0, 0, w, h * 2)  # 전체 타원이 들어있다 가정
        path.moveTo(0, h)
        path.arcTo(full, 180, -180)
        path.closeSubpath()
        return path
    def paintSymbol(self, p):
        path = self.fillPath()
        if self._filled:
            p.setBrush(QBrush(QColor(225, 225, 225)))
        else:
            p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawPath(path)
        if self._label:
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.setFont(_label_font(10))
            metrics = p.fontMetrics()
            tw = metrics.horizontalAdvance(self._label)
            p.drawText(QPointF(w / 2 - tw / 2, h * 0.65), self._label)

    def serialize(self) -> dict:
        return {"filled": self._filled, "label": self._label}

    def deserialize(self, d: dict) -> None:
        self._filled = bool(d.get("filled", False))
        self._label = d.get("label", "")

    def _extra_menu_actions(self, m):
        m.addAction("채움 켜기/끄기", self._toggle_fill)
        m.addAction("라벨 추가…", self._set_label)
        m.addSeparator()

    def _toggle_fill(self):
        self._push_property("_filled", self._filled, not self._filled, "채움 토글")

    def _set_label(self):
        new, ok = QInputDialog.getText(None, "라벨 추가", "라벨:",
                                       text=self._label)
        if ok and new != self._label:
            self._push_property("_label", self._label, new, "라벨 추가")


class CircularMediumItem(BasePhysicsItem):
    """원형 매질 — 외곽 원 + 내부 동심원 (2층 매질)."""
    LABEL = "원형 매질"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(160, 160)
    MIN_W = 40; MIN_H = 40

    def __init__(self, parent=None):
        super().__init__(parent)
        self._inner_radius = 40.0  # px
        self._label_outer = "A"
        self._label_inner = "B"

    def fillPath(self) -> QPainterPath:
        r = self.contentRect()
        cx, cy = r.width() / 2, r.height() / 2
        outer_r = min(r.width(), r.height()) / 2
        path = QPainterPath()
        path.addEllipse(QRectF(cx - outer_r, cy - outer_r,
                               2 * outer_r, 2 * outer_r))
        return path
    def paintSymbol(self, p):
        r = self.contentRect()
        cx, cy = r.width() / 2, r.height() / 2
        outer_r = min(r.width(), r.height()) / 2
        inner_r = max(2.0, min(self._inner_radius, outer_r - 4))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawEllipse(QRectF(cx - outer_r, cy - outer_r,
                             2 * outer_r, 2 * outer_r))
        p.drawEllipse(QRectF(cx - inner_r, cy - inner_r,
                             2 * inner_r, 2 * inner_r))
        p.setFont(_label_font(11))
        metrics = p.fontMetrics()
        tw_o = metrics.horizontalAdvance(self._label_outer)
        # 외곽 라벨: 내부와 외곽 사이 (위쪽)
        p.drawText(QPointF(cx - tw_o / 2,
                           cy - (outer_r + inner_r) / 2 + 4),
                   self._label_outer)
        tw_i = metrics.horizontalAdvance(self._label_inner)
        p.drawText(QPointF(cx - tw_i / 2, cy + 4), self._label_inner)

    def serialize(self) -> dict:
        return {"inner_radius": self._inner_radius,
                "label_outer": self._label_outer,
                "label_inner": self._label_inner}

    def deserialize(self, d: dict) -> None:
        self._inner_radius = float(d.get("inner_radius", 40.0))
        self._label_outer = d.get("label_outer", "A")
        self._label_inner = d.get("label_inner", "B")

    def _extra_menu_actions(self, m):
        m.addAction("라벨 설정…", self._set_labels)
        m.addAction("내부 반지름 설정…", self._set_inner_r)
        m.addSeparator()

    def _set_labels(self):
        d = QDialog(); d.setWindowTitle("라벨 설정")
        form = QFormLayout(d)
        eo = QLineEdit(self._label_outer)
        ei = QLineEdit(self._label_inner)
        form.addRow("외곽 라벨", eo)
        form.addRow("내부 라벨", ei)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        new_o = eo.text(); new_i = ei.text()
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        from commands import PropertyChangeCommand
        if stack is not None:
            stack.beginMacro("라벨 설정")
            if new_o != self._label_outer:
                stack.push(PropertyChangeCommand(
                    self, "_label_outer", self._label_outer, new_o, "외곽 라벨"))
            if new_i != self._label_inner:
                stack.push(PropertyChangeCommand(
                    self, "_label_inner", self._label_inner, new_i, "내부 라벨"))
            stack.endMacro()
        else:
            self._label_outer = new_o
            self._label_inner = new_i
            self.update()

    def _set_inner_r(self):
        unit = units.get_unit()
        cur = units.from_px(self._inner_radius)
        val, ok = QInputDialog.getDouble(
            None, "내부 반지름 설정", f"반지름 ({unit}):",
            cur, units.from_px(2), 5000.0, units.decimals())
        if not ok:
            return
        new_px = units.to_px(val)
        if abs(new_px - self._inner_radius) > 1e-6:
            self._push_property("_inner_radius", self._inner_radius,
                                new_px, "내부 반지름")


class RightTrianglePrismItem(BasePhysicsItem):
    """프리즘 (직각삼각형) — 빗변 방향 토글 가능."""
    LABEL = "프리즘 (직각삼각형)"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(100, 100)
    MIN_W = 30; MIN_H = 30

    def __init__(self, parent=None):
        super().__init__(parent)
        self._fill_gray = 230
        self._label = "A"
        self._flip = False  # False: 직각이 좌하단, True: 직각이 우하단

    def _triangle(self) -> QPolygonF:
        r = self.contentRect()
        w, h = r.width(), r.height()
        if self._flip:
            return QPolygonF([QPointF(w, 0), QPointF(w, h), QPointF(0, h)])
        return QPolygonF([QPointF(0, 0), QPointF(0, h), QPointF(w, h)])
    def fillPath(self) -> QPainterPath:
        path = QPainterPath(); path.addPolygon(self._triangle())
        path.closeSubpath(); return path
    def paintSymbol(self, p):
        r = self.contentRect()
        w, h = r.width(), r.height()
        if self._flip:
            label_pos = QPointF(w * 0.7, h * 0.72)
        else:
            label_pos = QPointF(w * 0.18, h * 0.72)
        p.setBrush(self.fillBrush())
        p.drawPolygon(self._triangle())
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(12))
        p.drawText(label_pos, self._label)

    def serialize(self) -> dict:
        return {"label": self._label, "flip": self._flip}

    def deserialize(self, d: dict) -> None:
        self._label = d.get("label", "A")
        self._flip = bool(d.get("flip", False))

    def _extra_menu_actions(self, m):
        m.addAction("라벨 변경…", self._set_label)
        m.addAction("방향 전환", self._toggle_flip)
        m.addSeparator()

    def _set_label(self):
        new, ok = QInputDialog.getText(None, "라벨 변경", "라벨:",
                                       text=self._label)
        if ok and new != self._label:
            self._push_property("_label", self._label, new, "라벨 변경")

    def _toggle_flip(self):
        self._push_property("_flip", self._flip, not self._flip, "방향 전환")


class OpticalFiberBoundaryItem(BasePhysicsItem):
    """광섬유 경계 — 상층(클래딩, 회색) + 하층(코어, 투명)."""
    LABEL = "광섬유 경계"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(200, 80)
    MIN_W = 40; MIN_H = 20

    def __init__(self, parent=None):
        super().__init__(parent)
        self._split_ratio = 0.5  # 경계 y 위치 (0~1, 위에서)
        self._label_top = "C"
        self._label_bottom = "A"

    def paintSymbol(self, p):
        r = self.contentRect()
        w, h = r.width(), r.height()
        split_y = max(2.0, min(h - 2.0, h * self._split_ratio))
        # 상층 (클래딩, 회색 채움)
        p.setBrush(QBrush(QColor(225, 225, 225)))
        p.drawRect(QRectF(0, 0, w, split_y))
        # 하층 (코어, 투명)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(QRectF(0, split_y, w, h - split_y))
        p.setFont(_label_font(11))
        p.drawText(QPointF(10, split_y / 2 + 4), self._label_top)
        p.drawText(QPointF(10, split_y + (h - split_y) / 2 + 4),
                   self._label_bottom)

    def serialize(self) -> dict:
        return {"split_ratio": self._split_ratio,
                "label_top": self._label_top,
                "label_bottom": self._label_bottom}

    def deserialize(self, d: dict) -> None:
        self._split_ratio = float(d.get("split_ratio", 0.5))
        self._label_top = d.get("label_top", "C")
        self._label_bottom = d.get("label_bottom", "A")

    def _extra_menu_actions(self, m):
        m.addAction("라벨 설정…", self._set_labels)
        m.addAction("경계 위치 (0~1)…", self._set_split)
        m.addSeparator()

    def _set_labels(self):
        d = QDialog(); d.setWindowTitle("라벨 설정")
        form = QFormLayout(d)
        et = QLineEdit(self._label_top)
        eb = QLineEdit(self._label_bottom)
        form.addRow("위 라벨", et); form.addRow("아래 라벨", eb)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        new_t = et.text(); new_b = eb.text()
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        from commands import PropertyChangeCommand
        if stack is not None:
            stack.beginMacro("라벨 설정")
            if new_t != self._label_top:
                stack.push(PropertyChangeCommand(
                    self, "_label_top", self._label_top, new_t, "위 라벨"))
            if new_b != self._label_bottom:
                stack.push(PropertyChangeCommand(
                    self, "_label_bottom", self._label_bottom, new_b, "아래 라벨"))
            stack.endMacro()
        else:
            self._label_top = new_t
            self._label_bottom = new_b
            self.update()

    def _set_split(self):
        val, ok = QInputDialog.getDouble(
            None, "경계 위치", "분할 비율 (0~1):",
            self._split_ratio, 0.05, 0.95, 2)
        if ok and abs(val - self._split_ratio) > 1e-6:
            self._push_property("_split_ratio", self._split_ratio,
                                val, "경계 위치")


class RippleTankItem(BasePhysicsItem):
    """물결파 실험 장치 — 수조 + 파동 발생기 + (옵션) 유리판 + 스트라이프 영역."""
    LABEL = "물결파 실험 장치"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(264, 180)  # 240(tank) + 24(generator) wide, 120(tank) + 60(stripe) tall
    MIN_W = 120; MIN_H = 100

    def __init__(self, parent=None):
        super().__init__(parent)
        self._show_glass = True
        self._stripe_spacing = 12.0
        self._label_a = "I"
        self._label_b = "II"
        self._glass_label = "유리판"

    def paintSymbol(self, p):
        r = self.contentRect()
        w, h = r.width(), r.height()
        # 비율 (default 264 x 180 기준)
        tank_w = w * (240.0 / 264.0)
        tank_h = h * (120.0 / 180.0)
        gen_w = w - tank_w
        gen_h = h * (40.0 / 180.0)
        stripe_top = tank_h + h * (6.0 / 180.0)
        stripe_h = h - stripe_top
        # 수조 외곽
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(QRectF(0, 0, tank_w, tank_h))
        # 파동 발생기 (오른쪽 채움 사각형)
        gen_y = (tank_h - gen_h) / 2
        p.setBrush(QBrush(QColor(80, 80, 80)))
        p.drawRect(QRectF(tank_w, gen_y, gen_w, gen_h))
        p.setBrush(Qt.BrushStyle.NoBrush)
        # 유리판
        if self._show_glass:
            gw_pl = tank_w * 0.35
            gh_pl = tank_h * 0.45
            glass_rect = QRectF((tank_w - gw_pl) / 2,
                                (tank_h - gh_pl) / 2, gw_pl, gh_pl)
            p.setBrush(QBrush(QColor(210, 210, 210)))
            p.drawRect(glass_rect)
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.setFont(_label_font(9))
            metrics = p.fontMetrics()
            tw2 = metrics.horizontalAdvance(self._glass_label)
            p.drawText(QPointF(glass_rect.center().x() - tw2 / 2,
                               glass_rect.center().y() + 4),
                       self._glass_label)
        # 스트라이프 영역
        if stripe_h > 4:
            stripe_rect = QRectF(0, stripe_top, tank_w, stripe_h)
            p.drawRect(stripe_rect)
            spacing = max(2.0, self._stripe_spacing)
            p.save()
            p.setClipRect(stripe_rect)
            p.setPen(Qt.PenStyle.NoPen)
            x = stripe_rect.left()
            i = 0
            while x < stripe_rect.right():
                if i % 2 == 1:
                    p.fillRect(QRectF(x, stripe_rect.top(), spacing,
                                      stripe_rect.height()),
                               QBrush(QColor(170, 170, 170)))
                x += spacing
                i += 1
            p.restore()
            # 외곽선 다시 (clip 해제 후)
            p.setPen(QPen(self.penColor(), self._pen_width))
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawRect(stripe_rect)
            # I / II 라벨
            p.setFont(_label_font(10))
            p.drawText(QPointF(tank_w * 0.25, stripe_top - 4), self._label_a)
            p.drawText(QPointF(tank_w * 0.72, stripe_top - 4), self._label_b)

    def serialize(self) -> dict:
        return {"show_glass": self._show_glass,
                "stripe_spacing": self._stripe_spacing,
                "label_a": self._label_a,
                "label_b": self._label_b,
                "glass_label": self._glass_label}

    def deserialize(self, d: dict) -> None:
        self._show_glass = bool(d.get("show_glass", True))
        self._stripe_spacing = float(d.get("stripe_spacing", 12.0))
        self._label_a = d.get("label_a", "I")
        self._label_b = d.get("label_b", "II")
        self._glass_label = d.get("glass_label", "유리판")

    def _extra_menu_actions(self, m):
        m.addAction("유리판 표시 켜기/끄기", self._toggle_glass)
        m.addAction("스트라이프 간격 설정…", self._set_spacing)
        m.addAction("라벨 변경…", self._set_labels)
        m.addSeparator()

    def _toggle_glass(self):
        self._push_property("_show_glass", self._show_glass,
                            not self._show_glass, "유리판 표시")

    def _set_spacing(self):
        val, ok = QInputDialog.getDouble(
            None, "스트라이프 간격", "간격(px):",
            self._stripe_spacing, 2.0, 100.0, 1)
        if ok and abs(val - self._stripe_spacing) > 1e-6:
            self._push_property("_stripe_spacing", self._stripe_spacing,
                                val, "스트라이프 간격")

    def _set_labels(self):
        d = QDialog(); d.setWindowTitle("라벨 변경")
        form = QFormLayout(d)
        ea = QLineEdit(self._label_a)
        eb = QLineEdit(self._label_b)
        eg = QLineEdit(self._glass_label)
        form.addRow("I 라벨", ea); form.addRow("II 라벨", eb)
        form.addRow("유리판 라벨", eg)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        na, nb, ng = ea.text(), eb.text(), eg.text()
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        from commands import PropertyChangeCommand
        if stack is not None:
            stack.beginMacro("라벨 변경")
            if na != self._label_a:
                stack.push(PropertyChangeCommand(
                    self, "_label_a", self._label_a, na, "I 라벨"))
            if nb != self._label_b:
                stack.push(PropertyChangeCommand(
                    self, "_label_b", self._label_b, nb, "II 라벨"))
            if ng != self._glass_label:
                stack.push(PropertyChangeCommand(
                    self, "_glass_label", self._glass_label, ng, "유리판 라벨"))
            stack.endMacro()
        else:
            self._label_a = na; self._label_b = nb; self._glass_label = ng
            self.update()


class RefractionGraphItem(BasePhysicsItem):
    """굴절각-입사각 그래프 — x: 입사각(0~80°), y: 굴절각(0~50°)."""
    LABEL = "굴절각-입사각 그래프"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(240, 180)
    MIN_W = 120; MIN_H = 100

    PLOT_M_L = 38
    PLOT_M_R = 18
    PLOT_M_T = 14
    PLOT_M_B = 30

    def __init__(self, parent=None):
        super().__init__(parent)
        self._x_range = (0.0, 80.0)
        self._y_range = (0.0, 50.0)
        # 기본 4개 제어점 (축 단위 = 도)
        self._curve_a = [(10.0, 8.0), (30.0, 22.0), (50.0, 35.0), (70.0, 45.0)]
        self._curve_b = [(10.0, 5.0), (30.0, 14.0), (50.0, 24.0), (70.0, 32.0)]

    def _plot_rect(self) -> QRectF:
        r = self.contentRect()
        return QRectF(self.PLOT_M_L, self.PLOT_M_T,
                      max(10.0, r.width() - self.PLOT_M_L - self.PLOT_M_R),
                      max(10.0, r.height() - self.PLOT_M_T - self.PLOT_M_B))

    def _axis_to_px(self, x: float, y: float, plot: QRectF) -> QPointF:
        x0, x1 = self._x_range
        y0, y1 = self._y_range
        px = plot.left() + (x - x0) / max(1e-6, x1 - x0) * plot.width()
        py = plot.bottom() - (y - y0) / max(1e-6, y1 - y0) * plot.height()
        return QPointF(px, py)

    def paintSymbol(self, p):
        plot = self._plot_rect()
        # 축
        p.drawLine(plot.bottomLeft(), plot.bottomRight())
        p.drawLine(plot.bottomLeft(), plot.topLeft())
        # 축 화살촉
        a = 7.0
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(
            QPointF(plot.right() + 6, plot.bottom()), 1, 0, a))
        p.drawPolygon(_arrow_head_polygon(
            QPointF(plot.left(), plot.top() - 6), 0, -1, a))
        p.setBrush(Qt.BrushStyle.NoBrush)
        # 축 라벨
        p.setFont(_label_font(9))
        p.drawText(QPointF(plot.right() - 56, plot.bottom() + 22),
                   "입사각(°)")
        p.save()
        p.translate(plot.left() - 26, plot.center().y() + 28)
        p.rotate(-90)
        p.drawText(QPointF(0, 0), "굴절각(°)")
        p.restore()
        # 곡선
        for pts, dashed, name in (
                (self._curve_a, False, "A"),
                (self._curve_b, True, "B")):
            pen_c = QPen(self.penColor(), self._pen_width)
            if dashed:
                pen_c.setStyle(Qt.PenStyle.DashLine)
                pen_c.setDashPattern([5, 4])
            pen_c.setCapStyle(Qt.PenCapStyle.RoundCap)
            p.setPen(pen_c)
            px_pts = [self._axis_to_px(x, y, plot) for (x, y) in pts]
            if len(px_pts) >= 2:
                p.drawPath(_catmull_rom_path(px_pts))
            if px_pts:
                p.setPen(QPen(self.penColor(), self._pen_width))
                p.setFont(_label_font(10))
                last = px_pts[-1]
                p.drawText(QPointF(last.x() + 6, last.y() + 4), name)
        p.setPen(QPen(self.penColor(), self._pen_width))

    def serialize(self) -> dict:
        return {"x_range": list(self._x_range),
                "y_range": list(self._y_range),
                "curve_a": [list(pt) for pt in self._curve_a],
                "curve_b": [list(pt) for pt in self._curve_b]}

    def deserialize(self, d: dict) -> None:
        xr = d.get("x_range", (0.0, 80.0))
        yr = d.get("y_range", (0.0, 50.0))
        self._x_range = (float(xr[0]), float(xr[1]))
        self._y_range = (float(yr[0]), float(yr[1]))
        if "curve_a" in d:
            self._curve_a = [(float(pt[0]), float(pt[1])) for pt in d["curve_a"]]
        if "curve_b" in d:
            self._curve_b = [(float(pt[0]), float(pt[1])) for pt in d["curve_b"]]

    def _extra_menu_actions(self, m):
        m.addAction("곡선 A 점 편집…", lambda: self._edit_curve("a"))
        m.addAction("곡선 B 점 편집…", lambda: self._edit_curve("b"))
        m.addAction("축 범위 설정…", self._edit_axis)
        m.addSeparator()

    def _edit_curve(self, which: str):
        cur = self._curve_a if which == "a" else self._curve_b
        d = QDialog(); d.setWindowTitle(f"곡선 {which.upper()} 점 편집")
        form = QFormLayout(d)
        spins: list[tuple[QDoubleSpinBox, QDoubleSpinBox]] = []
        for i, (x, y) in enumerate(cur):
            sx = QDoubleSpinBox(); sy = QDoubleSpinBox()
            sx.setRange(self._x_range[0], self._x_range[1])
            sx.setDecimals(1); sx.setSingleStep(1.0); sx.setValue(x)
            sy.setRange(self._y_range[0], self._y_range[1])
            sy.setDecimals(1); sy.setSingleStep(1.0); sy.setValue(y)
            roww = QWidget(); row = QHBoxLayout(roww)
            row.setContentsMargins(0, 0, 0, 0)
            row.addWidget(QLabel("x")); row.addWidget(sx)
            row.addWidget(QLabel("y")); row.addWidget(sy)
            form.addRow(f"점 {i + 1}", roww)
            spins.append((sx, sy))
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        new_pts = [(s[0].value(), s[1].value()) for s in spins]
        attr = "_curve_a" if which == "a" else "_curve_b"
        old = list(cur)
        self._push_property(attr, old, new_pts,
                            f"곡선 {which.upper()} 편집")

    def _edit_axis(self):
        d = QDialog(); d.setWindowTitle("축 범위 설정")
        form = QFormLayout(d)
        sx0 = QDoubleSpinBox(); sx1 = QDoubleSpinBox()
        sy0 = QDoubleSpinBox(); sy1 = QDoubleSpinBox()
        for sp in (sx0, sx1, sy0, sy1):
            sp.setRange(0.0, 1000.0); sp.setDecimals(1); sp.setSingleStep(1.0)
        sx0.setValue(self._x_range[0]); sx1.setValue(self._x_range[1])
        sy0.setValue(self._y_range[0]); sy1.setValue(self._y_range[1])
        form.addRow("x 최소", sx0); form.addRow("x 최대", sx1)
        form.addRow("y 최소", sy0); form.addRow("y 최대", sy1)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        new_x = (sx0.value(), sx1.value())
        new_y = (sy0.value(), sy1.value())
        if new_x[0] >= new_x[1] or new_y[0] >= new_y[1]:
            return
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        from commands import PropertyChangeCommand
        if stack is not None:
            stack.beginMacro("축 범위 설정")
            if new_x != self._x_range:
                stack.push(PropertyChangeCommand(
                    self, "_x_range", self._x_range, new_x, "x 범위"))
            if new_y != self._y_range:
                stack.push(PropertyChangeCommand(
                    self, "_y_range", self._y_range, new_y, "y 범위"))
            stack.endMacro()
        else:
            self._x_range = new_x; self._y_range = new_y; self.update()


class SinSinGraphItem(BasePhysicsItem):
    """sin r vs sin i 그래프 — 두 직선, 0~1 정규화 축."""
    LABEL = "sin r vs sin i 그래프"; CATEGORY = "광학"
    DEFAULT_SIZE = QSizeF(200, 200)
    MIN_W = 100; MIN_H = 100

    PLOT_M_L = 36
    PLOT_M_R = 18
    PLOT_M_T = 14
    PLOT_M_B = 28

    def __init__(self, parent=None):
        super().__init__(parent)
        self._slope_i = 0.8
        self._slope_ii = 0.4
        self._label_i = "I"
        self._label_ii = "II"

    def _plot_rect(self) -> QRectF:
        r = self.contentRect()
        return QRectF(self.PLOT_M_L, self.PLOT_M_T,
                      max(10.0, r.width() - self.PLOT_M_L - self.PLOT_M_R),
                      max(10.0, r.height() - self.PLOT_M_T - self.PLOT_M_B))

    def paintSymbol(self, p):
        plot = self._plot_rect()
        # 축
        p.drawLine(plot.bottomLeft(), plot.bottomRight())
        p.drawLine(plot.bottomLeft(), plot.topLeft())
        a = 7.0
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(
            QPointF(plot.right() + 6, plot.bottom()), 1, 0, a))
        p.drawPolygon(_arrow_head_polygon(
            QPointF(plot.left(), plot.top() - 6), 0, -1, a))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.setFont(_label_font(9))
        p.drawText(QPointF(plot.right() - 30, plot.bottom() + 18), "sin i")
        p.save()
        p.translate(plot.left() - 28, plot.center().y() + 16)
        p.rotate(-90)
        p.drawText(QPointF(0, 0), "sin r")
        p.restore()
        origin = plot.bottomLeft()
        for slope, dashed, name in (
                (self._slope_i, False, self._label_i),
                (self._slope_ii, True, self._label_ii)):
            # x 끝 = 1.0 (또는 y가 1을 넘으면 잘라낸 위치)
            end_x = 1.0
            end_y = slope * end_x
            if end_y > 1.0:
                end_x = 1.0 / max(1e-6, slope)
                end_y = 1.0
            ex_px = origin.x() + end_x * plot.width()
            ey_px = origin.y() - end_y * plot.height()
            pen_line = QPen(self.penColor(), self._pen_width)
            if dashed:
                pen_line.setStyle(Qt.PenStyle.DashLine)
                pen_line.setDashPattern([5, 4])
            pen_line.setCapStyle(Qt.PenCapStyle.RoundCap)
            p.setPen(pen_line)
            p.drawLine(origin, QPointF(ex_px, ey_px))
            p.setPen(QPen(self.penColor(), self._pen_width))
            p.setFont(_label_font(10))
            p.drawText(QPointF(ex_px + 4, ey_px + 4), name)
        p.setPen(QPen(self.penColor(), self._pen_width))

    def serialize(self) -> dict:
        return {"slope_i": self._slope_i, "slope_ii": self._slope_ii,
                "label_i": self._label_i, "label_ii": self._label_ii}

    def deserialize(self, d: dict) -> None:
        self._slope_i = float(d.get("slope_i", 0.8))
        self._slope_ii = float(d.get("slope_ii", 0.4))
        self._label_i = d.get("label_i", "I")
        self._label_ii = d.get("label_ii", "II")

    def _extra_menu_actions(self, m):
        m.addAction("기울기 I 설정…", lambda: self._set_slope("i"))
        m.addAction("기울기 II 설정…", lambda: self._set_slope("ii"))
        m.addAction("라벨 변경…", self._set_labels)
        m.addSeparator()

    def _set_slope(self, which: str):
        attr = "_slope_i" if which == "i" else "_slope_ii"
        cur = getattr(self, attr)
        val, ok = QInputDialog.getDouble(
            None, f"기울기 {which.upper()}", "기울기 (sin r / sin i):",
            cur, 0.01, 100.0, 2)
        if ok and abs(val - cur) > 1e-6:
            self._push_property(attr, cur, val, f"기울기 {which.upper()}")

    def _set_labels(self):
        d = QDialog(); d.setWindowTitle("라벨 변경")
        form = QFormLayout(d)
        ei = QLineEdit(self._label_i)
        eii = QLineEdit(self._label_ii)
        form.addRow("I 라벨", ei); form.addRow("II 라벨", eii)
        bb = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok |
                              QDialogButtonBox.StandardButton.Cancel)
        bb.accepted.connect(d.accept); bb.rejected.connect(d.reject)
        form.addRow(bb)
        if d.exec() != QDialog.DialogCode.Accepted:
            return
        ni, nii = ei.text(), eii.text()
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        from commands import PropertyChangeCommand
        if stack is not None:
            stack.beginMacro("라벨 변경")
            if ni != self._label_i:
                stack.push(PropertyChangeCommand(
                    self, "_label_i", self._label_i, ni, "I 라벨"))
            if nii != self._label_ii:
                stack.push(PropertyChangeCommand(
                    self, "_label_ii", self._label_ii, nii, "II 라벨"))
            stack.endMacro()
        else:
            self._label_i = ni; self._label_ii = nii; self.update()


# ============================================================================ #
# 역학
# ============================================================================ #
class BoxItem(BasePhysicsItem):
    LABEL = "물체 (박스)"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(70, 60)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 245
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawRect(self.contentRect())

class BallItem(BasePhysicsItem):
    LABEL = "공"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(50, 50)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 235
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawEllipse(self.contentRect())

class InclinedPlaneItem(BasePhysicsItem):
    LABEL = "빗면"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(220, 110)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 235
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(self.fillBrush())
        p.drawPolygon(QPolygonF([QPointF(0, r.height()),
                                  QPointF(r.width(), r.height()),
                                  QPointF(r.width(), 0)]))

class PulleyItem(BasePhysicsItem):
    LABEL = "도르래"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(50, 50)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 245
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(self.fillBrush())
        p.drawEllipse(r)
        c = r.center()
        p.setBrush(QBrush(self.penColor()))
        p.drawEllipse(QRectF(c.x() - 3, c.y() - 3, 6, 6))

class SpringItem(BasePhysicsItem):
    """용수철 — 코일 개수가 너비에 비례하여 자동 증가."""
    LABEL = "용수철"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(140, 28)
    COIL_LEN = 14  # 한 코일이 차지하는 가로 길이 (px)
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        lead = 10
        avail = r.width() - 2 * lead
        coils = max(2, int(avail / self.COIL_LEN))
        step = avail / coils
        path = QPainterPath()
        path.moveTo(0, y)
        path.lineTo(lead, y)
        for i in range(coils):
            x0 = lead + i * step
            path.lineTo(x0 + step * 0.25, 2)
            path.lineTo(x0 + step * 0.75, r.height() - 2)
            path.lineTo(x0 + step, y)
        path.lineTo(r.width(), y)
        p.drawPath(path)

class RopeItem(BasePhysicsItem):
    LABEL = "줄/끈"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(140, 6)
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        pen = QPen(self.penColor(), max(1.2, self._pen_width)); p.setPen(pen)
        p.drawLine(QPointF(0, y), QPointF(r.width(), y))

class FrictionSurfaceItem(BasePhysicsItem):
    LABEL = "마찰면"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(220, 14)
    STEP = 10
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawLine(QPointF(0, 0), QPointF(r.width(), 0))
        x = 0
        while x < r.width():
            p.drawLine(QPointF(x, 0), QPointF(x - 8, r.height()))
            x += self.STEP

class WallItem(BasePhysicsItem):
    LABEL = "벽 (오른쪽 면)"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(14, 160)
    STEP = 10
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawLine(QPointF(r.width(), 0), QPointF(r.width(), r.height()))
        y = 0
        while y < r.height():
            p.drawLine(QPointF(r.width(), y), QPointF(r.width() + 8, y - 8))
            y += self.STEP

class CeilingItem(BasePhysicsItem):
    LABEL = "천장"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(160, 14)
    STEP = 10
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawLine(QPointF(0, r.height()), QPointF(r.width(), r.height()))
        x = 0
        while x < r.width():
            p.drawLine(QPointF(x, r.height()), QPointF(x + 8, r.height() - 8))
            x += self.STEP

class GroundLineItem(BasePhysicsItem):
    LABEL = "바닥 (해칭)"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(220, 14)
    STEP = 10
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawLine(QPointF(0, 0), QPointF(r.width(), 0))
        x = 0
        while x < r.width():
            p.drawLine(QPointF(x, 0), QPointF(x + 8, r.height()))
            x += self.STEP

class CartItem(BasePhysicsItem):
    LABEL = "수레"; CATEGORY = "역학"; DEFAULT_SIZE = QSizeF(110, 60)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 245
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(self.fillBrush())
        p.drawRect(QRectF(0, 0, r.width(), r.height() * 0.65))
        wr = min(r.width(), r.height()) * 0.22
        wy = r.height() * 0.65 + wr / 2 - 2
        p.setBrush(QBrush(QColor(60, 60, 60)))
        p.drawEllipse(QRectF(r.width() * 0.15 - wr / 2, wy - wr / 2, wr, wr))
        p.drawEllipse(QRectF(r.width() * 0.85 - wr / 2, wy - wr / 2, wr, wr))


# ============================================================================ #
# 전자기학
# ============================================================================ #
class ResistorItem(BasePhysicsItem):
    """저항 — 지그재그 모양. 가로 크기에 따라 봉우리 개수 증가."""
    LABEL = "저항 (지그재그)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(110, 26)
    ZIG_LEN = 10
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        lead = 8
        avail = r.width() - 2 * lead
        zigs = max(3, int(avail / self.ZIG_LEN))
        step = avail / zigs
        path = QPainterPath()
        path.moveTo(0, y); path.lineTo(lead, y)
        for i in range(zigs):
            x0 = lead + i * step
            y_top = 2 if i % 2 == 0 else r.height() - 2
            path.lineTo(x0 + step / 2, y_top)
            path.lineTo(x0 + step, y)
        path.lineTo(r.width(), y)
        p.drawPath(path)

class ResistorBoxItem(BasePhysicsItem):
    LABEL = "저항 (네모)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(100, 30)
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        bw = r.width() * 0.55
        bx = (r.width() - bw) / 2
        p.drawLine(QPointF(0, y), QPointF(bx, y))
        p.drawLine(QPointF(bx + bw, y), QPointF(r.width(), y))
        p.setBrush(QBrush(WHITE))
        p.drawRect(QRectF(bx, y - 8, bw, 16))

class CapacitorItem(BasePhysicsItem):
    LABEL = "축전기"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(70, 40)
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        cx = r.width() / 2
        p.drawLine(QPointF(0, y), QPointF(cx - 5, y))
        p.drawLine(QPointF(cx + 5, y), QPointF(r.width(), y))
        p.setPen(QPen(self.penColor(), max(2.5, self._pen_width)))
        p.drawLine(QPointF(cx - 5, y - 12), QPointF(cx - 5, y + 12))
        p.drawLine(QPointF(cx + 5, y - 12), QPointF(cx + 5, y + 12))

class InductorItem(BasePhysicsItem):
    """코일 — 봉우리 개수가 너비에 비례."""
    LABEL = "코일(인덕터)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(120, 30)
    BUMP_W = 18
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        lead = 10
        avail = r.width() - 2 * lead
        bumps = max(2, int(avail / self.BUMP_W))
        bw = avail / bumps
        p.drawLine(QPointF(0, y), QPointF(lead, y))
        for i in range(bumps):
            x = lead + i * bw
            p.drawArc(QRectF(x, y - bw / 2, bw, bw), 0 * 16, 180 * 16)
        p.drawLine(QPointF(lead + bumps * bw, y), QPointF(r.width(), y))

class BatteryItem(BasePhysicsItem):
    LABEL = "전지"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(60, 40)
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2; cx = r.width() / 2
        p.drawLine(QPointF(0, y), QPointF(cx - 4, y))
        p.drawLine(QPointF(cx + 4, y), QPointF(r.width(), y))
        p.setPen(QPen(self.penColor(), max(2.5, self._pen_width)))
        p.drawLine(QPointF(cx - 4, y - 12), QPointF(cx - 4, y + 12))
        p.drawLine(QPointF(cx + 4, y - 6),  QPointF(cx + 4, y + 6))

class PowerSourceItem(BasePhysicsItem):
    LABEL = "전원 (∼)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(60, 60)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawEllipse(r)
        path = QPainterPath()
        path.moveTo(r.width() * 0.2, r.height() / 2)
        path.cubicTo(QPointF(r.width() * 0.35, 0),
                     QPointF(r.width() * 0.65, r.height()),
                     QPointF(r.width() * 0.8, r.height() / 2))
        p.drawPath(path)

class SwitchItem(BasePhysicsItem):
    LABEL = "스위치"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(80, 40)
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        cx1, cx2 = r.width() * 0.25, r.width() * 0.75
        p.drawLine(QPointF(0, y), QPointF(cx1, y))
        p.drawLine(QPointF(cx2, y), QPointF(r.width(), y))
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(QRectF(cx1 - 3, y - 3, 6, 6))
        p.drawEllipse(QRectF(cx2 - 3, y - 3, 6, 6))
        p.drawLine(QPointF(cx1, y), QPointF(cx2 - 4, y - 18))

class BulbItem(BasePhysicsItem):
    LABEL = "전구"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(60, 60)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawEllipse(r)
        c = r.center()
        rr = min(r.width(), r.height()) / 2
        d = rr / math.sqrt(2)
        p.drawLine(QPointF(c.x() - d, c.y() - d), QPointF(c.x() + d, c.y() + d))
        p.drawLine(QPointF(c.x() - d, c.y() + d), QPointF(c.x() + d, c.y() - d))

class AmmeterItem(BasePhysicsItem):
    LABEL = "전류계 (A)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(60, 60)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawEllipse(r)
        f = p.font(); f.setBold(True); f.setPointSize(14); p.setFont(f)
        p.drawText(r, Qt.AlignmentFlag.AlignCenter, "A")

class VoltmeterItem(BasePhysicsItem):
    LABEL = "전압계 (V)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(60, 60)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.drawEllipse(r)
        f = p.font(); f.setBold(True); f.setPointSize(14); p.setFont(f)
        p.drawText(r, Qt.AlignmentFlag.AlignCenter, "V")

class GroundItem(BasePhysicsItem):
    LABEL = "접지"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(40, 40)
    def paintSymbol(self, p):
        r = self.contentRect()
        cx = r.width() / 2
        p.drawLine(QPointF(cx, 0), QPointF(cx, r.height() * 0.5))
        widths = [1.0, 0.7, 0.4]
        for i, w in enumerate(widths):
            y = r.height() * 0.5 + i * 6
            half = r.width() / 2 * w
            p.drawLine(QPointF(cx - half, y), QPointF(cx + half, y))

class BarMagnetItem(BasePhysicsItem):
    """N극 회색 + S극 짙은회색 + 검정 외곽선 (무채색)."""
    LABEL = "막대자석 (N/S)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(160, 44)
    def paintSymbol(self, p):
        r = self.contentRect()
        half = r.width() / 2
        p.setBrush(QBrush(QColor(235, 235, 235)))
        p.drawRect(QRectF(0, 0, half, r.height()))
        p.setBrush(QBrush(QColor(170, 170, 170)))
        p.drawRect(QRectF(half, 0, half, r.height()))
        f = p.font(); f.setBold(True); f.setPointSize(14); p.setFont(f)
        p.setPen(QPen(self.penColor()))
        p.drawText(QRectF(0, 0, half, r.height()), Qt.AlignmentFlag.AlignCenter, "N")
        p.drawText(QRectF(half, 0, half, r.height()), Qt.AlignmentFlag.AlignCenter, "S")

class FieldIntoItem(BasePhysicsItem):
    """자기장 들어감 (×) — 셀 수 자동 증가."""
    LABEL = "자기장 들어감 (×)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(100, 100)
    SPACING = 22
    def paintSymbol(self, p):
        r = self.contentRect()
        # 외곽 사각형은 그리지 않음 (자기장 영역 표시는 자유롭게 배치)
        cols = max(1, int(r.width() / self.SPACING))
        rows = max(1, int(r.height() / self.SPACING))
        cw = r.width() / cols; rh = r.height() / rows
        for ix in range(cols):
            for iy in range(rows):
                cx = (ix + 0.5) * cw; cy = (iy + 0.5) * rh
                d = min(cw, rh) * 0.18
                p.drawLine(QPointF(cx - d, cy - d), QPointF(cx + d, cy + d))
                p.drawLine(QPointF(cx - d, cy + d), QPointF(cx + d, cy - d))

class FieldOutItem(BasePhysicsItem):
    """자기장 나옴 (⊙) — 셀 수 자동 증가."""
    LABEL = "자기장 나옴 (⊙)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(100, 100)
    SPACING = 22
    def paintSymbol(self, p):
        r = self.contentRect()
        cols = max(1, int(r.width() / self.SPACING))
        rows = max(1, int(r.height() / self.SPACING))
        cw = r.width() / cols; rh = r.height() / rows
        for ix in range(cols):
            for iy in range(rows):
                cx = (ix + 0.5) * cw; cy = (iy + 0.5) * rh
                d = min(cw, rh) * 0.22
                p.setBrush(Qt.BrushStyle.NoBrush)
                p.drawEllipse(QRectF(cx - d, cy - d, 2 * d, 2 * d))
                p.setBrush(QBrush(self.penColor()))
                p.drawEllipse(QRectF(cx - 1.5, cy - 1.5, 3, 3))

class ChargePosItem(BasePhysicsItem):
    LABEL = "양전하 (⊕)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(28, 28)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(r)
        c = r.center()
        p.drawLine(QPointF(c.x() - r.width() / 4, c.y()),
                   QPointF(c.x() + r.width() / 4, c.y()))
        p.drawLine(QPointF(c.x(), c.y() - r.height() / 4),
                   QPointF(c.x(), c.y() + r.height() / 4))

class ChargeNegItem(BasePhysicsItem):
    LABEL = "음전하 (⊖)"; CATEGORY = "전자기학"; DEFAULT_SIZE = QSizeF(28, 28)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(r)
        c = r.center()
        p.drawLine(QPointF(c.x() - r.width() / 4, c.y()),
                   QPointF(c.x() + r.width() / 4, c.y()))


# ============================================================================ #
# 현대물리학
# ============================================================================ #
class AtomItem(BasePhysicsItem):
    """원자 모형 — 모든 색을 검정/회색으로."""
    LABEL = "원자 모형"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(160, 160)
    def paintSymbol(self, p):
        r = self.contentRect()
        c = r.center()
        # 핵 (⊕)
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(QRectF(c.x() - 8, c.y() - 8, 16, 16))
        p.drawLine(QPointF(c.x() - 5, c.y()), QPointF(c.x() + 5, c.y()))
        p.drawLine(QPointF(c.x(), c.y() - 5), QPointF(c.x(), c.y() + 5))
        # 궤도 3개
        p.setBrush(Qt.BrushStyle.NoBrush)
        for ang in (0, 60, 120):
            p.save()
            p.translate(c); p.rotate(ang)
            p.drawEllipse(QRectF(-r.width() / 2 + 5, -r.height() / 4,
                                  r.width() - 10, r.height() / 2))
            p.restore()
        # 전자
        p.setBrush(QBrush(self.penColor()))
        for ang in (10, 130, 250):
            x = c.x() + (r.width() / 2 - 5) * math.cos(math.radians(ang))
            y = c.y() + (r.height() / 2 - 5) * math.sin(math.radians(ang)) * 0.5
            p.drawEllipse(QRectF(x - 4, y - 4, 8, 8))

class BohrOrbitItem(BasePhysicsItem):
    """보어 원자 궤도 — 동심원 호 (n=1..N), 크기 비례 궤도 수 증가."""
    LABEL = "보어 궤도 (n=...)"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(220, 160)
    STEP = 24
    def paintSymbol(self, p):
        r = self.contentRect()
        # 핵을 좌하단에 둠 (참고 이미지와 유사)
        cx, cy = 0, r.height()
        # 핵
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(QRectF(cx - 6, cy - 6, 12, 12))
        p.drawLine(QPointF(cx - 4, cy), QPointF(cx + 4, cy))
        p.drawLine(QPointF(cx, cy - 4), QPointF(cx, cy + 4))
        # 호 (n=1, 2, 3, …)
        p.setBrush(Qt.BrushStyle.NoBrush)
        max_r = max(r.width(), r.height())
        n = 1
        rr = self.STEP
        f = p.font(); f.setPointSize(9); p.setFont(f)
        while rr < max_r:
            arc_rect = QRectF(cx - rr, cy - rr, 2 * rr, 2 * rr)
            p.drawArc(arc_rect, 0, 90 * 16)
            p.drawText(QPointF(cx + rr * 0.05, cy - rr - 3), f"n={n}")
            n += 1; rr += self.STEP

class ElectronItem(BasePhysicsItem):
    LABEL = "전자 (e⁻)"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(24, 24)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(r)
        c = r.center()
        p.drawLine(QPointF(c.x() - r.width() / 4, c.y()),
                   QPointF(c.x() + r.width() / 4, c.y()))

class ProtonItem(BasePhysicsItem):
    LABEL = "양성자 (p⁺)"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(28, 28)
    def paintSymbol(self, p):
        r = self.contentRect()
        p.setBrush(QBrush(WHITE))
        p.drawEllipse(r)
        c = r.center()
        p.drawLine(QPointF(c.x() - r.width() / 4, c.y()),
                   QPointF(c.x() + r.width() / 4, c.y()))
        p.drawLine(QPointF(c.x(), c.y() - r.height() / 4),
                   QPointF(c.x(), c.y() + r.height() / 4))

class NeutronItem(BasePhysicsItem):
    LABEL = "중성자 (n)"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(28, 28)
    def __init__(self, parent=None):
        super().__init__(parent); self._fill_gray = 200
    def paintSymbol(self, p):
        p.setBrush(self.fillBrush())
        p.drawEllipse(self.contentRect())

class PhotonItem(BasePhysicsItem):
    """광자 — 파동선 + 화살표 (검정)."""
    LABEL = "광자 (파동 + 화살표)"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(160, 30)
    WAVELEN = 24
    HAS_ARROW_HEAD = True
    def paintSymbol(self, p):
        r = self.contentRect()
        y = r.height() / 2
        head = self._arrow_size
        avail = r.width() - head * 0.5
        n = max(2, int(avail / self.WAVELEN))
        step = avail / n
        path = QPainterPath(); path.moveTo(0, y)
        for i in range(n):
            x = i * step
            path.cubicTo(QPointF(x + step / 4, y - 10),
                         QPointF(x + 3 * step / 4, y + 10),
                         QPointF(x + step, y))
        p.drawPath(path)
        # 화살표 머리
        p.setBrush(QBrush(self.penColor()))
        p.drawPolygon(_arrow_head_polygon(QPointF(r.width(), y), 1, 0, head))

class EnergyLevelItem(BasePhysicsItem):
    """에너지 준위 — 위쪽으로 갈수록 간격 좁아지는 가로선들."""
    LABEL = "에너지 준위"; CATEGORY = "현대물리학"; DEFAULT_SIZE = QSizeF(180, 150)
    HAS_ARROW_HEAD = True
    def paintSymbol(self, p):
        r = self.contentRect()
        levels = [0.85, 0.55, 0.32, 0.18, 0.08]
        labels = ["n=1", "n=2", "n=3", "n=4", "n=∞"]
        f = p.font(); f.setPointSize(9); p.setFont(f)
        for v, lab in zip(levels, labels):
            y = r.height() * v
            p.drawLine(QPointF(0, y), QPointF(r.width() - 30, y))
            p.drawText(QPointF(r.width() - 28, y + 4), lab)
        # 전이 화살표 (n=3 → n=1)
        a = self._arrow_size
        p.setBrush(QBrush(self.penColor()))
        x = r.width() * 0.3
        y1 = r.height() * 0.32; y2 = r.height() * 0.85
        p.drawLine(QPointF(x, y1), QPointF(x, y2 - a * 0.4))
        p.drawPolygon(_arrow_head_polygon(QPointF(x, y2), 0, 1, a))


# ============================================================================ #
# 텍스트
# ============================================================================ #
class TextItem(QGraphicsTextItem):
    LABEL = "텍스트"; CATEGORY = "기본"

    def __init__(self, text: str = "텍스트"):
        super().__init__(text)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, True)
        self.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        self.setFont(QFont("맑은 고딕", 14))
        self.setDefaultTextColor(INK)
        self._locked = False
        self._pinned_top = False
        self._layer = 0                   # 소속 레이어 인덱스 (0 = "레이어 1")
        self._order = 0                   # 레이어 내 순서 (클수록 같은 레이어에서 전면)

    def setLocked(self, b):
        self._locked = b
        self.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsMovable, not b)
        self.update()

    def isLocked(self): return self._locked

    def setPinnedTop(self, b):
        self._pinned_top = b
        mgr = _canvas_manager_of(self)
        if mgr is not None and hasattr(mgr, "_refresh_layer_view"):
            mgr._refresh_layer_view()
        else:
            self.setZValue(1e6 if b else 0)

    SNAP_PX = 7
    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionChange \
                and self.parentItem() is not None and self.rotation() == 0:
            parent = self.parentItem()
            if hasattr(parent, 'rect'):
                new_pos = QPointF(value)
                br = self.boundingRect()
                w, h = br.width(), br.height()
                r = parent.rect()
                xs = [0.0, r.width() / 2, r.width()]
                ys = [0.0, r.height() / 2, r.height()]
                for sib in parent.childItems():
                    if sib is self:
                        continue
                    try:
                        if hasattr(sib, 'size') and callable(sib.size):
                            sz = sib.size(); sp = sib.pos()
                            xs += [sp.x(), sp.x() + sz.width() / 2, sp.x() + sz.width()]
                            ys += [sp.y(), sp.y() + sz.height() / 2, sp.y() + sz.height()]
                    except Exception:
                        pass
                ix = [new_pos.x(), new_pos.x() + w / 2, new_pos.x() + w]
                iy = [new_pos.y(), new_pos.y() + h / 2, new_pos.y() + h]
                best_dx = 0.0; bd = self.SNAP_PX
                for x in ix:
                    for tx in xs:
                        d = tx - x
                        if abs(d) < bd:
                            bd = abs(d); best_dx = d
                best_dy = 0.0; bd = self.SNAP_PX
                for y in iy:
                    for ty in ys:
                        d = ty - y
                        if abs(d) < bd:
                            bd = abs(d); best_dy = d
                if best_dx or best_dy:
                    return QPointF(new_pos.x() + best_dx, new_pos.y() + best_dy)
        return super().itemChange(change, value)

    def mouseDoubleClickEvent(self, event):
        self.setTextInteractionFlags(Qt.TextInteractionFlag.TextEditorInteraction)
        self.setFocus()
        super().mouseDoubleClickEvent(event)

    def focusOutEvent(self, event):
        self.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        super().focusOutEvent(event)

    def mousePressEvent(self, event):
        scn = self.scene()
        if scn is not None:
            self._pre_move_state = [(it, QPointF(it.pos())) for it in scn.selectedItems()]
            if not any(it is self for it, _ in self._pre_move_state):
                self._pre_move_state.append((self, QPointF(self.pos())))
        else:
            self._pre_move_state = [(self, QPointF(self.pos()))]
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        if stack is not None:
            pre = getattr(self, "_pre_move_state", None)
            if pre:
                from commands import MoveItemCommand
                moved, olds, news = [], [], []
                for it, op in pre:
                    if it.scene() is None:
                        continue
                    cur = it.pos()
                    if cur != op:
                        moved.append(it); olds.append(op); news.append(QPointF(cur))
                if moved:
                    stack.push(MoveItemCommand(moved, olds, news))
        self._pre_move_state = None
        super().mouseReleaseEvent(event)

    def _toggle_lock_undoable(self):
        scn = self.scene()
        stack = getattr(scn, "_undo_stack", None) if scn is not None else None
        new_state = not self._locked
        if stack is not None:
            from commands import LockCommand
            stack.push(LockCommand(self, self._locked, new_state))
        else:
            self.setLocked(new_state)

    def _delete_undoable(self):
        scn = self.scene()
        if scn is None:
            return
        stack = getattr(scn, "_undo_stack", None)
        if stack is not None:
            from commands import DeleteItemCommand
            stack.push(DeleteItemCommand(scn, [self]))
        else:
            scn.removeItem(self)

    def contextMenuEvent(self, event):
        scene = self.scene()
        if not scene: return
        m = QMenu()
        m.addAction("내용 편집…", self._edit_text)
        m.addAction("폰트…", self._choose_font)
        m.addAction("글자 회색 레벨…", self._choose_gray)
        m.addSeparator()
        lm = m.addMenu("레이어")
        lm.addAction("맨 앞으로", self._bring_to_front)
        lm.addAction("앞으로", self._bring_forward)
        lm.addAction("뒤로",   self._send_backward)
        lm.addAction("맨 뒤로", self._send_to_back)
        m.addAction("위치 고정 해제" if self._locked else "위치 고정",
                    self._toggle_lock_undoable)
        m.addAction("최상단 고정 해제" if self._pinned_top else "최상단 고정",
                    lambda: self.setPinnedTop(not self._pinned_top))
        m.addSeparator()
        m.addAction("회전…", self._rotate)
        m.addAction("복제", self._duplicate)
        m.addAction("삭제", self._delete_undoable)
        m.exec(event.screenPos())
        event.accept()

    def _edit_text(self):
        new, ok = QInputDialog.getText(None, "텍스트 편집", "내용:", text=self.toPlainText())
        if ok: self.setPlainText(new)

    def _choose_font(self):
        font, ok = QFontDialog.getFont(self.font(), None, "폰트 선택")
        if ok: self.setFont(font)

    def _choose_gray(self):
        cur = self.defaultTextColor()
        v, ok = _gray_picker(None, cur.red(), "글자 회색 레벨")
        if ok: self.setDefaultTextColor(QColor(v, v, v))

    def _rotate(self):
        a, ok = QInputDialog.getDouble(None, "회전", "각도(°):",
                                       self.rotation(), -360, 360, 1)
        if ok and abs(a - self.rotation()) > 1e-9:
            scn = self.scene()
            stack = getattr(scn, "_undo_stack", None) if scn is not None else None
            if stack is not None:
                from commands import RotateItemCommand
                stack.push(RotateItemCommand(self, self.rotation(), a))
            else:
                self.setRotation(a)

    # 레이어 경계를 지키는 z-순서 변경 (같은 레이어 안에서만 이동).
    def _bring_to_front(self):
        _reorder_via_manager(self, "front")

    def _bring_forward(self):
        _reorder_via_manager(self, "forward")

    def _send_backward(self):
        _reorder_via_manager(self, "backward")

    def _send_to_back(self):
        _reorder_via_manager(self, "back")

    def _duplicate(self):
        scene = self.scene()
        c = TextItem(self.toPlainText())
        c.setFont(self.font())
        c.setDefaultTextColor(self.defaultTextColor())
        c.setPos(self.pos() + QPointF(20, 20))
        c.setRotation(self.rotation())
        if self.parentItem():
            c.setParentItem(self.parentItem())
        else:
            scene.addItem(c)


# ============================================================================ #
# 직각 표시 (비율 고정) + 원호 + 다점(곡선/꺾은선)
# ============================================================================ #
class RightAngleItem(BasePhysicsItem):
    """직각 표시 — 항상 1:1 비율 유지. 모서리에서 두 선이 만나는 작은 사각."""
    LABEL = "직각 표시"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(20, 20)
    ASPECT_LOCKED = True
    MIN_W = 6; MIN_H = 6

    def paintSymbol(self, p):
        r = self.contentRect()
        # 좌하단에 작은 사각형 (직각 마커)
        size = min(r.width(), r.height())
        sq = QRectF(0, r.height() - size, size, size)
        p.drawRect(sq)


class ArcItem(BasePhysicsItem):
    """원호 — 시작 각도와 휨 각도(스윕) 설정 가능."""
    LABEL = "원호"; CATEGORY = "기본"; DEFAULT_SIZE = QSizeF(100, 100)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._start_angle = 0.0    # 도 (3시 방향 = 0, CCW +)
        self._sweep_angle = 90.0   # 도

    def paintSymbol(self, p):
        r = self.contentRect()
        # Qt drawArc 는 1/16 도 단위, CCW 양수
        p.drawArc(r, int(self._start_angle * 16), int(self._sweep_angle * 16))

    def contextMenuEvent(self, event):
        # 부모 메뉴에 호 각도 옵션 추가
        scene = self.scene()
        if not scene:
            return
        m = QMenu()
        m.addAction("시작 각도…", self._set_start_angle)
        m.addAction("호 각도(스윕)…", self._set_sweep_angle)
        m.addSeparator()
        # 부모 메뉴 항목 재사용 (간략판)
        lm = m.addMenu("레이어")
        lm.addAction("맨 앞으로", self._bring_to_front)
        lm.addAction("앞으로", self._bring_forward)
        lm.addAction("뒤로",   self._send_backward)
        lm.addAction("맨 뒤로", self._send_to_back)
        m.addAction("위치 고정 해제" if self._locked else "위치 고정",
                    self._toggle_lock_undoable)
        m.addAction("최상단 고정 해제" if self._pinned_top else "최상단 고정",
                    lambda: self.setPinnedTop(not self._pinned_top))
        m.addSeparator()
        m.addAction("선 명도…", self._change_pen_gray)
        m.addAction("선 굵기…", self._change_pen_width)
        m.addAction("크기 입력…", self._change_size_dialog)
        m.addAction("회전 입력…", self._change_rotation_dialog)
        m.addSeparator()
        m.addAction("복제", self._duplicate)
        m.addAction("삭제", self._delete_undoable)
        m.exec(event.screenPos())
        event.accept()

    def _set_start_angle(self):
        v, ok = QInputDialog.getDouble(None, "시작 각도",
                                       "도 (0=3시, CCW+):",
                                       self._start_angle, -360, 360, 1)
        if ok:
            self._start_angle = v; self.update()

    def _set_sweep_angle(self):
        v, ok = QInputDialog.getDouble(None, "호 각도",
                                       "도 (0~360, CCW+):",
                                       self._sweep_angle, -360, 360, 1)
        if ok:
            self._sweep_angle = v; self.update()


# ---- 다점(곡선·꺾은선) 헬퍼 ---- #
def _catmull_rom_path(pts: list[QPointF]) -> QPainterPath:
    """Catmull-Rom 보간 곡선 (큐빅 베지어로 변환)."""
    path = QPainterPath()
    n = len(pts)
    if n == 0:
        return path
    path.moveTo(pts[0])
    if n == 1:
        return path
    if n == 2:
        path.lineTo(pts[1])
        return path
    alpha = 1.0 / 6
    for i in range(n - 1):
        p1 = pts[i]; p2 = pts[i + 1]
        p0 = pts[i - 1] if i > 0 else pts[i]
        p3 = pts[i + 2] if i + 2 < n else pts[i + 1]
        c1 = QPointF(p1.x() + alpha * (p2.x() - p0.x()),
                     p1.y() + alpha * (p2.y() - p0.y()))
        c2 = QPointF(p2.x() - alpha * (p3.x() - p1.x()),
                     p2.y() - alpha * (p3.y() - p1.y()))
        path.cubicTo(c1, c2, p2)
    return path


class MultiPointItem(BasePhysicsItem):
    """다점 그리기 베이스. 점들은 로컬 좌표(0~size 사이로 정규화)."""
    MULTI_POINT_MODE = True   # 캔버스에 다점 그리기 트리거 표시
    SMOOTH = False
    DEFAULT_SIZE = QSizeF(100, 60)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._points: list[QPointF] = []
        self._initial_points: list[QPointF] = []
        self._initial_size = QSizeF(self.DEFAULT_SIZE)

    @classmethod
    def fromPoints(cls, points: list[QPointF]) -> 'MultiPointItem':
        item = cls()
        if not points:
            return item
        xs = [p.x() for p in points]
        ys = [p.y() for p in points]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w = max(max_x - min_x, 1.0)
        h = max(max_y - min_y, 1.0)
        item.setPos(QPointF(min_x, min_y))
        # 점을 (0,0)~(w,h) 로 정규화
        local_pts = [QPointF(p.x() - min_x, p.y() - min_y) for p in points]
        item._points = local_pts
        item._initial_points = [QPointF(p) for p in local_pts]
        item._size = QSizeF(w, h)
        item._initial_size = QSizeF(w, h)
        item.setTransformOriginPoint(w / 2, h / 2)
        return item

    def setSize(self, sz: QSizeF) -> None:
        # 점을 초기 크기 대비 비율로 재계산
        if self._initial_size.width() > 0 and self._initial_size.height() > 0:
            sx = sz.width() / self._initial_size.width()
            sy = sz.height() / self._initial_size.height()
            self._points = [QPointF(p.x() * sx, p.y() * sy)
                            for p in self._initial_points]
        super().setSize(sz)

    def paintSymbol(self, p):
        if not self._points:
            return
        if self.SMOOTH and len(self._points) >= 2:
            p.drawPath(_catmull_rom_path(self._points))
        elif len(self._points) >= 2:
            path = QPainterPath()
            path.moveTo(self._points[0])
            for pt in self._points[1:]:
                path.lineTo(pt)
            p.drawPath(path)


class FreeCurveItem(MultiPointItem):
    LABEL = "자유 곡선 (다점)"; CATEGORY = "기본"
    SMOOTH = True


class FreePolylineItem(MultiPointItem):
    LABEL = "자유 꺾은선 (다점)"; CATEGORY = "기본"
    SMOOTH = False


# ============================================================================ #
# 그룹 - 여러 아이템을 한 단위로 다룸
# ============================================================================ #
class PhysicsGroupItem(BasePhysicsItem):
    """선택된 아이템들을 하나의 그룹으로 묶는다.

    내부적으로 자식 아이템들의 부모를 이 그룹으로 옮기고, 그룹의 위치·회전·
    크기 변경 시 자식들이 함께 변환된다.
    """
    LABEL = "그룹"; CATEGORY = "_internal"
    MIN_W = 10; MIN_H = 10

    def __init__(self, parent=None):
        super().__init__(parent)
        self._initial_size = QSizeF(self.DEFAULT_SIZE)
        self._initial_child_specs: list[dict] = []  # child의 초기 pos/size 저장

    @staticmethod
    def fromItems(items: list[QGraphicsItem]) -> 'PhysicsGroupItem | None':
        """주어진 아이템들을 그룹으로 묶는다. 부모/씬은 첫 아이템 기준."""
        items = [it for it in items if it is not None]
        if len(items) < 2:
            return None
        parent = items[0].parentItem()
        scene = items[0].scene()
        # 통합 bbox (parent 좌표)
        bbox = None
        for it in items:
            br = it.mapToParent(it.boundingRect()).boundingRect() \
                if parent is None else \
                parent.mapFromScene(it.sceneBoundingRect()).boundingRect()
            # 위 시도는 QPolygonF -> QRectF 변환 필요. 단순화:
            sbr = it.sceneBoundingRect()
            if parent is not None:
                lbr = parent.boundingRect()  # placeholder
                # scene 좌표 → parent 로컬 좌표 변환 (4 모서리)
                pts = [parent.mapFromScene(sbr.topLeft()),
                       parent.mapFromScene(sbr.topRight()),
                       parent.mapFromScene(sbr.bottomLeft()),
                       parent.mapFromScene(sbr.bottomRight())]
                xs = [p.x() for p in pts]; ys = [p.y() for p in pts]
                lbr = QRectF(min(xs), min(ys), max(xs) - min(xs),
                             max(ys) - min(ys))
            else:
                lbr = sbr
            bbox = lbr if bbox is None else bbox.united(lbr)
        if bbox is None or bbox.width() < 1 or bbox.height() < 1:
            return None
        group = PhysicsGroupItem()
        if parent is not None:
            group.setParentItem(parent)
        elif scene is not None:
            scene.addItem(group)
        group.setPos(bbox.topLeft())
        group._size = QSizeF(bbox.width(), bbox.height())
        group._initial_size = QSizeF(bbox.width(), bbox.height())
        group.setTransformOriginPoint(bbox.width() / 2, bbox.height() / 2)
        # 자식들을 그룹의 자식으로 재부착
        for it in items:
            scene_pos = it.scenePos()
            scene_rot = it.rotation()  # 부모 변경에도 회전 자체는 유지
            it.setParentItem(group)
            # 새 부모 기준 위치 (현재는 grouping이라 회전 변환 없음 → 단순)
            new_pos = group.mapFromScene(scene_pos)
            it.setPos(new_pos)
            it.setRotation(scene_rot)
            # 자식이 마우스 이벤트 직접 받지 않도록 잠금 (그룹이 대신 받음)
            it.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, False)
            it.setAcceptedMouseButtons(Qt.MouseButton.NoButton)
            spec = {
                "item": it,
                "pos": QPointF(it.pos()),
                "size": (it.size() if hasattr(it, 'size') and callable(it.size) else None),
                "scale": float(it.scale()),
                # TwoPointItem 자식의 끝점도 함께 기억해 그룹 리사이즈 시 함께 스케일
                "p1": QPointF(it._p1) if isinstance(it, TwoPointItem) else None,
                "p2": QPointF(it._p2) if isinstance(it, TwoPointItem) else None,
                # _w / _h 속성을 가진 아이템도 처리 (있다면)
                "w_h": ((float(getattr(it, '_w')), float(getattr(it, '_h')))
                        if (hasattr(it, '_w') and hasattr(it, '_h')) else None),
            }
            group._initial_child_specs.append(spec)
        # 그룹은 자식(첫 아이템)의 레이어를 물려받는다 — 재그룹(redo) 시에도
        # 자식의 _layer 가 보존되므로 일관되게 복원된다. 같은 레이어에서의
        # 순서는 자식들 중 가장 앞(_order 최대)을 물려받아 위치를 유지한다.
        group._layer = int(getattr(items[0], "_layer", 0))
        group._order = max((int(getattr(it, "_order", 0)) for it in items),
                           default=0)
        group.setSelected(True)
        return group

    def setSize(self, sz: QSizeF) -> None:
        # 그룹 크기 변경 시 자식들을 비율 맞춰 재배치·재크기.
        # 피벗은 그룹 로컬 (0, 0). 자식의 pos 와 도형 (_p1/_p2/_size/_w/_h) 모두 스케일.
        if self._initial_size.width() > 0 and self._initial_size.height() > 0:
            sx = sz.width() / self._initial_size.width()
            sy = sz.height() / self._initial_size.height()
            avg = (abs(sx) + abs(sy)) / 2.0 if (sx and sy) else max(abs(sx), abs(sy), 1e-6)
            for spec in self._initial_child_specs:
                it = spec["item"]
                p0 = spec["pos"]
                it.setPos(QPointF(p0.x() * sx, p0.y() * sy))
                handled = False
                # TwoPointItem: 두 끝점도 함께 스케일
                if (spec.get("p1") is not None and spec.get("p2") is not None
                        and hasattr(it, 'setEndpoints')):
                    p1 = spec["p1"]; p2 = spec["p2"]
                    it.setEndpoints(QPointF(p1.x() * sx, p1.y() * sy),
                                    QPointF(p2.x() * sx, p2.y() * sy))
                    handled = True
                # size() 가 있는 아이템
                if not handled and spec["size"] is not None and hasattr(it, 'setSize'):
                    it.setSize(QSizeF(spec["size"].width() * sx,
                                      spec["size"].height() * sy))
                    handled = True
                # _w / _h 속성을 가진 아이템
                if not handled and spec.get("w_h") is not None:
                    w0, h0 = spec["w_h"]
                    try:
                        setattr(it, '_w', w0 * sx)
                        setattr(it, '_h', h0 * sy)
                        handled = True
                    except Exception:
                        pass
                # 폴백: 균등 스케일 적용
                if not handled:
                    try:
                        it.setScale(spec.get("scale", 1.0) * avg)
                    except Exception:
                        pass
                try:
                    it.update()
                except Exception:
                    pass
        super().setSize(sz)

    def paintSymbol(self, p):
        # 그룹 외곽 점선은 편집 보조용: 선택되었을 때만, 내보내기 중에는 절대 그리지 않음.
        # ASSUMPTION: 사양의 "locked items의 dashed boundary"는 본 코드에 존재하지 않으므로
        # 의미상 가장 가까운 그룹 점선 박스에 동일 규칙(선택 + 비-내보내기)을 적용.
        if not self.isSelected():
            return
        scn = self.scene()
        if scn is not None and getattr(scn, "_exporting", False):
            return
        pen = QPen(QColor(120, 120, 120), 0.6, Qt.PenStyle.DashLine)
        pen.setDashPattern([3, 3])
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(self.contentRect())

    def ungroup(self) -> list[QGraphicsItem]:
        """그룹을 풀고 자식 아이템들을 부모(또는 씬)로 분리. 자식 목록 반환."""
        parent = self.parentItem()
        scene = self.scene()
        released = []
        for spec in list(self._initial_child_specs):
            it = spec["item"]
            scene_pos = it.scenePos()
            scene_rot = it.rotation() + self.rotation()
            if parent is not None:
                it.setParentItem(parent)
                it.setPos(parent.mapFromScene(scene_pos))
            else:
                it.setParentItem(None)
                if scene and it.scene() is None:
                    scene.addItem(it)
                it.setPos(scene_pos)
            it.setRotation(scene_rot)
            it.setFlag(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable, True)
            it.setAcceptedMouseButtons(Qt.MouseButton.LeftButton |
                                       Qt.MouseButton.RightButton)
            released.append(it)
        if scene:
            scene.removeItem(self)
        return released


# ============================================================================ #
# JSON 직렬화 — 프로젝트 저장/불러오기
# ============================================================================ #
def _item_to_dict(it: QGraphicsItem) -> dict | None:
    """단일 아이템을 직렬화 가능한 딕셔너리로."""
    cls = type(it)
    d: dict = {
        "class": cls.__name__,
        "pos": [it.pos().x(), it.pos().y()],
        "rot": it.rotation(),
        "z": it.zValue(),
        # 모든 아이템 타입(선/텍스트/그룹 포함)에 대해 소속 레이어 + 레이어 내
        # 순서를 보존한다.
        "_layer": int(getattr(it, "_layer", 0)),
        "_order": int(getattr(it, "_order", 0)),
    }
    if isinstance(it, TwoPointItem):
        d.update({
            "p1": [it._p1.x(), it._p1.y()],
            "p2": [it._p2.x(), it._p2.y()],
            "gray_pen": it._gray_pen,
            "pen_width": it._pen_width,
            "arrow_size": it._arrow_size,
            "locked": it._locked,
            "pinned_top": it._pinned_top,
        })
        if isinstance(it, DashedLine):
            d["dash_length"] = it.dash_length
            d["gap_length"] = it.gap_length
        return d
    if isinstance(it, MultiPointItem):
        d.update({
            "points": [[p.x(), p.y()] for p in it._initial_points],
            "size": [it._initial_size.width(), it._initial_size.height()],
            "current_size": [it._size.width(), it._size.height()],
            "gray_pen": it._gray_pen,
            "pen_width": it._pen_width,
            "fill_gray": it._fill_gray,
            "fill_pattern": getattr(it, "_fill_pattern", "none"),
            "locked": it._locked,
            "pinned_top": it._pinned_top,
        })
        return d
    if isinstance(it, BasePhysicsItem):
        d.update({
            "size": [it._size.width(), it._size.height()],
            "gray_pen": it._gray_pen,
            "pen_width": it._pen_width,
            "fill_gray": it._fill_gray,
            "fill_pattern": getattr(it, "_fill_pattern", "none"),
            "arrow_size": it._arrow_size,
            "locked": it._locked,
            "pinned_top": it._pinned_top,
        })
        if isinstance(it, ArcItem):
            d["start_angle"] = it._start_angle
            d["sweep_angle"] = it._sweep_angle
        if isinstance(it, PhysicsGroupItem):
            # 그룹: 자식들도 함께 직렬화 (그룹 로컬 좌표 기준)
            d["children"] = [_item_to_dict(s["item"])
                             for s in it._initial_child_specs
                             if _item_to_dict(s["item"]) is not None]
            d["initial_size"] = [it._initial_size.width(), it._initial_size.height()]
        # 서브클래스 고유 직렬화 키를 머지 (BasePhysicsItem.serialize() 훅)
        try:
            extras = it.serialize()
            if extras:
                d.update(extras)
        except Exception:
            pass
        return d
    if isinstance(it, TextItem):
        f = it.font()
        c = it.defaultTextColor()
        d.update({
            "text": it.toPlainText(),
            "font_family": f.family(),
            "font_size": f.pointSize(),
            "font_bold": f.bold(),
            "font_italic": f.italic(),
            "gray": c.red(),
            "locked": it._locked,
            "pinned_top": it._pinned_top,
        })
        return d
    return None


def _legacy_arrow_line_substitute(d: dict, dashed: bool, mode: str) -> list:
    """구버전 화살표-라인을 (SolidLine|DashedLine) + 단독 ArrowHead 로 치환.

    mode: 'forward' = p2 에 화살촉, 'mid' = 중간점에 화살촉.
    ASSUMPTION: 구파일의 화살표 라인은 line.rotation()==0 인 케이스가 일반적이며,
    회전된 경우 ArrowHead 의 부착 위치는 부모 좌표 근사로 계산한다.
    """
    line_cls = DashedLine if dashed else SolidLine
    line = line_cls()
    pos = QPointF(*d.get("pos", [0, 0]))
    line.setPos(pos)
    line.setRotation(d.get("rot", 0))
    line.setZValue(d.get("z", 0))
    p1 = QPointF(*d.get("p1", [0, 0]))
    p2 = QPointF(*d.get("p2", [100, 0]))
    line.setEndpoints(p1, p2)
    line._gray_pen = d.get("gray_pen", 0)
    line._pen_width = d.get("pen_width", DEFAULT_PEN_WIDTH)
    line._arrow_size = d.get("arrow_size", DEFAULT_ARROW_SIZE)
    line.setLocked(d.get("locked", False))
    line.setPinnedTop(d.get("pinned_top", False))

    arrow = ArrowHead()
    arrow_size = d.get("arrow_size", DEFAULT_ARROW_SIZE)
    # 화살촉 크기를 구버전 _arrow_size 에 맞춰 폭=arrow_size 로.
    arrow.setSize(QSizeF(arrow_size, arrow_size * 14.0 / 12.0))
    if mode == 'mid':
        ep_local = QPointF((p1.x() + p2.x()) / 2.0, (p1.y() + p2.y()) / 2.0)
    else:
        ep_local = p2
    ep_parent = QPointF(pos.x() + ep_local.x(), pos.y() + ep_local.y())
    dx = p2.x() - p1.x(); dy = p2.y() - p1.y()
    L = math.hypot(dx, dy) or 1.0
    ux, uy = dx / L, dy / L
    new_rot = math.degrees(math.atan2(ux, -uy))
    arrow.setRotation(new_rot)
    w = arrow._size.width(); h = arrow._size.height()
    # tip 로컬 = (w/2, 0), origin = (w/2, h/2)
    # 매핑: parent_tip = pos + origin + R*(tip - origin)
    diff_x = 0.0; diff_y = -h / 2.0
    rad = math.radians(new_rot)
    cosr, sinr = math.cos(rad), math.sin(rad)
    rdx = cosr * diff_x - sinr * diff_y
    rdy = sinr * diff_x + cosr * diff_y
    arrow.setPos(QPointF(ep_parent.x() - rdx - w / 2.0,
                         ep_parent.y() - rdy - h / 2.0))
    arrow._gray_pen = d.get("gray_pen", 0)
    arrow._pen_width = d.get("pen_width", DEFAULT_PEN_WIDTH)
    arrow.setZValue(d.get("z", 0))
    return [line, arrow]


# 구파일에 들어있던 화살표-라인 클래스명 → (dashed, mode)
_LEGACY_ARROW_LINE_MAP = {
    "DrawSolidArrow":     (False, 'forward'),
    "DrawDashedArrow":    (True,  'forward'),
    "DrawSolidMidArrow":  (False, 'mid'),
    "DrawDashedMidArrow": (True,  'mid'),
    # 구버전 SolidLine/DashedLine 이름 변경에 대한 별칭
    "DrawSolidLine":      (False, None),
    "DrawDashedLine":     (True,  None),
}


def _dict_to_item(d: dict) -> QGraphicsItem | None:
    """딕셔너리에서 아이템 복원. CLASS_REGISTRY를 통해 클래스 lookup."""
    cls_name = d.get("class")
    # 구파일 호환: 화살표 라인 클래스는 SolidLine|DashedLine + ArrowHead 로 치환
    legacy = _LEGACY_ARROW_LINE_MAP.get(cls_name)
    if legacy is not None:
        dashed, mode = legacy
        if mode is None:
            # 단순 이름 별칭: SolidLine 또는 DashedLine 으로 복원
            d2 = dict(d)
            d2["class"] = "DashedLine" if dashed else "SolidLine"
            return _dict_to_item(d2)
        return ("__substitute__", _legacy_arrow_line_substitute(d, dashed, mode))
    cls = CLASS_REGISTRY.get(cls_name)
    if cls is None:
        return None
    if cls is TextItem:
        it = TextItem(d.get("text", ""))
        f = QFont(d.get("font_family", "맑은 고딕"),
                  d.get("font_size", 14))
        f.setBold(d.get("font_bold", False))
        f.setItalic(d.get("font_italic", False))
        it.setFont(f)
        g = d.get("gray", 0)
        it.setDefaultTextColor(QColor(g, g, g))
        it.setPos(QPointF(*d.get("pos", [0, 0])))
        it.setRotation(d.get("rot", 0))
        it.setZValue(d.get("z", 0))
        it.setLocked(d.get("locked", False))
        it.setPinnedTop(d.get("pinned_top", False))
        return it
    if issubclass(cls, TwoPointItem):
        it = cls()
        it.setPos(QPointF(*d.get("pos", [0, 0])))
        it.setRotation(d.get("rot", 0))
        it.setZValue(d.get("z", 0))
        it.setEndpoints(QPointF(*d.get("p1", [0, 0])),
                        QPointF(*d.get("p2", [100, 0])))
        it._gray_pen = d.get("gray_pen", 0)
        it._pen_width = d.get("pen_width", DEFAULT_PEN_WIDTH)
        it._arrow_size = d.get("arrow_size", DEFAULT_ARROW_SIZE)
        it.setLocked(d.get("locked", False))
        it.setPinnedTop(d.get("pinned_top", False))
        if isinstance(it, DashedLine):
            if "dash_length" in d:
                it.dash_length = float(d["dash_length"])
            if "gap_length" in d:
                it.gap_length = float(d["gap_length"])
        return it
    if issubclass(cls, MultiPointItem):
        pts = [QPointF(*p) for p in d.get("points", [])]
        it = cls()
        it.setPos(QPointF(*d.get("pos", [0, 0])))
        it.setRotation(d.get("rot", 0))
        it.setZValue(d.get("z", 0))
        # initial_points + size 복원
        it._initial_points = pts
        sz = d.get("size", [100, 60])
        cur = d.get("current_size", sz)
        it._initial_size = QSizeF(sz[0], sz[1])
        # setSize 호출로 _points 가 재계산됨
        it.setSize(QSizeF(cur[0], cur[1]))
        it.setTransformOriginPoint(cur[0] / 2, cur[1] / 2)
        it._gray_pen = d.get("gray_pen", 0)
        it._pen_width = d.get("pen_width", DEFAULT_PEN_WIDTH)
        it._fill_gray = d.get("fill_gray", -1)
        it._fill_pattern = d.get("fill_pattern", getattr(it, "_fill_pattern", "none"))
        it.setLocked(d.get("locked", False))
        it.setPinnedTop(d.get("pinned_top", False))
        return it
    if cls is PhysicsGroupItem:
        # 그룹: 자식들을 먼저 복원 후 묶음
        children_dicts = d.get("children", [])
        children = [_dict_to_item(cd) for cd in children_dicts]
        children = [c for c in children if c is not None]
        if not children:
            return None
        # 일단 임시로 씬에 추가 후 그룹화 (호출 측에서 부모/씬 설정 필요)
        return ("__group_pending__", children, d)
    if issubclass(cls, BasePhysicsItem):
        it = cls()
        it.setPos(QPointF(*d.get("pos", [0, 0])))
        it.setRotation(d.get("rot", 0))
        it.setZValue(d.get("z", 0))
        sz = d.get("size", [it.DEFAULT_SIZE.width(), it.DEFAULT_SIZE.height()])
        it.setSize(QSizeF(sz[0], sz[1]))
        it._gray_pen = d.get("gray_pen", 0)
        it._pen_width = d.get("pen_width", DEFAULT_PEN_WIDTH)
        # fill_gray / fill_pattern 의 기본값은 __init__ 가 설정한 값 — 이렇게 하면
        # fill_pattern 키가 없는 구버전 영역(Region) 파일도 프리셋이 보존된다.
        it._fill_gray = d.get("fill_gray", it._fill_gray)
        it._fill_pattern = d.get("fill_pattern", getattr(it, "_fill_pattern", "none"))
        it._arrow_size = d.get("arrow_size", DEFAULT_ARROW_SIZE)
        it.setLocked(d.get("locked", False))
        it.setPinnedTop(d.get("pinned_top", False))
        if isinstance(it, ArcItem):
            it._start_angle = d.get("start_angle", 0)
            it._sweep_angle = d.get("sweep_angle", 90)
        # 서브클래스 고유 속성 복원
        try:
            it.deserialize(d)
        except Exception:
            pass
        return it
    return None


def serialize_items(items: list[QGraphicsItem]) -> list[dict]:
    out = []
    for it in items:
        # 그룹의 자식은 그룹 안에서만 다루므로 최상위에서 건너뜀
        if not isinstance(it, (BasePhysicsItem, TwoPointItem, TextItem)):
            continue
        d = _item_to_dict(it)
        if d is not None:
            out.append(d)
    return out


def deserialize_into(parent_item: QGraphicsItem, dicts: list[dict],
                     scene=None) -> list[QGraphicsItem]:
    """딕셔너리 목록을 아이템으로 복원해 parent_item 의 자식으로 부착."""
    created = []
    for d in dicts:
        obj = _dict_to_item(d)
        if obj is None:
            continue
        layer = int(d.get("_layer", 0))
        order = int(d.get("_order", 0))
        # 그룹 보류
        if isinstance(obj, tuple) and obj[0] == "__group_pending__":
            _, children, gd = obj
            # 자식들을 임시로 parent 에 붙이고 그룹화
            for c in children:
                c.setParentItem(parent_item)
            grp = PhysicsGroupItem.fromItems(children)
            if grp is not None:
                grp.setPos(QPointF(*gd.get("pos", [0, 0])))
                grp.setRotation(gd.get("rot", 0))
                grp.setZValue(gd.get("z", 0))
                sz = gd.get("size", [grp._size.width(), grp._size.height()])
                grp.setSize(QSizeF(sz[0], sz[1]))
                grp._layer = int(gd.get("_layer", 0))
                grp._order = int(gd.get("_order", 0))
                created.append(grp)
        elif isinstance(obj, tuple) and obj[0] == "__substitute__":
            # 구버전 화살표-라인을 두 개의 아이템으로 치환하여 복원
            for sub in obj[1]:
                sub.setParentItem(parent_item)
                sub._layer = layer
                sub._order = order
                created.append(sub)
        else:
            obj.setParentItem(parent_item)
            # 모든 아이템 타입에 레이어/순서를 일괄 복원 (선/텍스트는 hook 미경유).
            try:
                obj._layer = layer
                obj._order = order
            except Exception:
                pass
            created.append(obj)
    return created


# --------------------------------------------------------------------------- #
# 외부 이미지 아이템 (PNG/JPG 불러오기 전용 — 팔레트에 등록하지 않음)
# --------------------------------------------------------------------------- #
class ImageItem(BasePhysicsItem):
    """파일에서 불러온 비트맵 이미지. 리사이즈/회전/잠금/그룹화 가능."""
    LABEL = "이미지"
    CATEGORY = "기타"
    DEFAULT_SIZE = QSizeF(200, 150)
    MIN_W = 8
    MIN_H = 8
    ASPECT_LOCKED = True

    # 캔버스 안에 들어갈 만한 적당한 초기 크기 (px). 거대한 사진을 그대로
    # 띄우면 캔버스를 꽉 채우므로 가장 긴 변을 이 값으로 클램프한다.
    DEFAULT_MAX_EDGE = 400

    def __init__(self, parent: QGraphicsItem | None = None):
        super().__init__(parent)
        self._pixmap: QPixmap = QPixmap()

    def setPixmap(self, pm: QPixmap):
        self._pixmap = QPixmap(pm) if pm is not None else QPixmap()
        if not self._pixmap.isNull():
            w = self._pixmap.width()
            h = self._pixmap.height()
            scale = 1.0
            longest = max(w, h)
            if longest > self.DEFAULT_MAX_EDGE:
                scale = self.DEFAULT_MAX_EDGE / longest
            self.setSize(QSizeF(max(self.MIN_W, w * scale),
                                max(self.MIN_H, h * scale)))
        self.update()

    def pixmap(self) -> QPixmap:
        return self._pixmap

    def paintSymbol(self, painter: QPainter):
        if self._pixmap.isNull():
            r = self.contentRect()
            painter.setPen(QPen(QColor(150, 150, 150), 1, Qt.PenStyle.DashLine))
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawRect(r)
            painter.drawLine(r.topLeft(), r.bottomRight())
            painter.drawLine(r.topRight(), r.bottomLeft())
            return
        painter.drawPixmap(self.contentRect(), self._pixmap,
                           QRectF(self._pixmap.rect()))

    def serialize(self) -> dict:
        d: dict = super().serialize()
        if not self._pixmap.isNull():
            img = self._pixmap.toImage()
            from PyQt6.QtCore import QBuffer, QIODevice
            buf = QBuffer()
            buf.open(QIODevice.OpenModeFlag.WriteOnly)
            img.save(buf, "PNG")
            d["image_b64"] = base64.b64encode(bytes(buf.data())).decode("ascii")
        return d

    def deserialize(self, d: dict) -> None:
        super().deserialize(d)
        b64 = d.get("image_b64")
        if not b64:
            return
        try:
            raw = base64.b64decode(b64)
        except Exception:
            return
        img = QImage.fromData(raw, "PNG")
        if img.isNull():
            return
        # 직렬화에서 복원할 때는 저장된 _size 가 따로 설정되므로 setPixmap 에서
        # 크기를 다시 클램프하지 않도록 raw pixmap 만 보관한다.
        self._pixmap = QPixmap.fromImage(img)
        self.update()


# --------------------------------------------------------------------------- #
# 레지스트리
# --------------------------------------------------------------------------- #
SYMBOL_REGISTRY: list[type] = [
    # 기본 — 두 점 그리기 (더블클릭으로 사용)
    SolidLine, DashedLine,
    # 기본 — 화살촉 (단독 회전·이동, 선 끝점 자동 스냅)
    ArrowHead,
    # 기본 — 다점 그리기 (Enter로 확정)
    FreeCurveItem, FreePolylineItem,
    # 기본 — 드래그앤드롭 도형
    RectItem, CircleItem, TriangleItem, PointItem,
    RightAngleItem, ArcItem,
    AxisItem, GridItem, AngleArcItem, LengthMarkItem,
    TextItem,
    # 광학
    ConvexLensItem, ConcaveLensItem,
    FlatMirrorItem, ConcaveMirrorItem, ConvexMirrorItem,
    SlitItem, DoubleSlitItem, ScreenItem, PrismItem,
    PointLightItem, LaserItem, OpticalObjectItem,
    WaterCupItem, FishItem, BirdItem, PersonItem,
    # 광학 (수능)
    OpticalAxisItem, ObjectArrowItem, ImageArrowItem, LightSourceItem,
    BiconvexLensItem, BiconcaveLensItem,
    SemicircularMediumItem, CircularMediumItem, RightTrianglePrismItem,
    OpticalFiberBoundaryItem,
    RippleTankItem, RefractionGraphItem, SinSinGraphItem,
    # 역학
    BoxItem, BallItem, InclinedPlaneItem, PulleyItem, SpringItem, RopeItem,
    FrictionSurfaceItem, WallItem, CeilingItem, GroundLineItem, CartItem,
    # 전자기학
    ResistorItem, ResistorBoxItem, CapacitorItem, InductorItem,
    BatteryItem, PowerSourceItem, SwitchItem, BulbItem,
    AmmeterItem, VoltmeterItem, GroundItem, BarMagnetItem,
    FieldIntoItem, FieldOutItem, ChargePosItem, ChargeNegItem,
    # 현대물리학
    AtomItem, BohrOrbitItem, ElectronItem, ProtonItem, NeutronItem,
    PhotonItem, EnergyLevelItem,
]


# 클래스 이름 → 클래스 매핑 (직렬화 복원용)
CLASS_REGISTRY: dict[str, type] = {cls.__name__: cls for cls in SYMBOL_REGISTRY}
CLASS_REGISTRY["PhysicsGroupItem"] = PhysicsGroupItem
CLASS_REGISTRY["TextItem"] = TextItem
# ImageItem 은 팔레트에는 등록하지 않고 (파일 로드 전용) 직렬화 매핑에만 추가.
CLASS_REGISTRY["ImageItem"] = ImageItem
# 구버전 호환: 과거 "영역" 심볼들은 팔레트에서 제거됐지만, 옛 저장 파일이
# 이 클래스 이름을 참조하므로 직렬화 매핑에는 그대로 남겨 둔다.
CLASS_REGISTRY["GrayRegionItem"] = GrayRegionItem
CLASS_REGISTRY["DarkGrayRegionItem"] = DarkGrayRegionItem
CLASS_REGISTRY["DotRegionItem"] = DotRegionItem
CLASS_REGISTRY["HatchRegionItem"] = HatchRegionItem
CLASS_REGISTRY["XRegionItem"] = XRegionItem
