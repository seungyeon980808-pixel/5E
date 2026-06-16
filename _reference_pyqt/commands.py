"""
QUndoCommand 서브클래스 — Round 3 Undo/Redo 시스템.

각 명령은 redo()/undo() 가 idempotent 하도록 설계되어 있어
사용자가 이미 적용한 변경 직후 push() 되어도 안전하다.
"""
from __future__ import annotations
from typing import Iterable
from PyQt6.QtCore import QPointF, QSizeF
from PyQt6.QtGui import QUndoCommand


# --------------------------------------------------------------------------- #
# Add / Delete
# --------------------------------------------------------------------------- #
class AddItemCommand(QUndoCommand):
    """단일 아이템을 캔버스 프레임에 추가."""

    def __init__(self, scene, item, parent_frame, pos: QPointF | None = None):
        super().__init__("아이템 추가")
        self.scene = scene
        self.item = item
        self.parent_frame = parent_frame
        self.pos = QPointF(pos) if pos is not None else None

    def redo(self):
        if self.item.scene() is None:
            self.item.setParentItem(self.parent_frame)
            if self.pos is not None:
                self.item.setPos(self.pos)
        if self.scene is not None:
            self.scene.clearSelection()
        try:
            self.item.setSelected(True)
        except Exception:
            pass

    def undo(self):
        if self.item.scene() is not None:
            self.scene.removeItem(self.item)


class DeleteItemCommand(QUndoCommand):
    """선택 아이템(들) 삭제. 부모/위치를 기억해 복원."""

    def __init__(self, scene, items: Iterable):
        super().__init__("아이템 삭제")
        self.scene = scene
        self.entries: list[tuple] = []
        for it in items:
            self.entries.append((it, it.parentItem(), QPointF(it.pos()),
                                 it.zValue(), it.isSelected()))

    def redo(self):
        for it, _, _, _, _ in self.entries:
            if it.scene() is not None:
                self.scene.removeItem(it)

    def undo(self):
        for it, parent, pos, z, sel in self.entries:
            if it.scene() is None:
                if parent is not None:
                    it.setParentItem(parent)
                else:
                    self.scene.addItem(it)
                it.setPos(pos)
                it.setZValue(z)
            if sel:
                try:
                    it.setSelected(True)
                except Exception:
                    pass


# --------------------------------------------------------------------------- #
# Move / Resize / Rotate
# --------------------------------------------------------------------------- #
class MoveItemCommand(QUndoCommand):
    """여러 아이템의 위치 변경 (멀티 선택 그룹 이동 지원)."""

    def __init__(self, items: list, old_positions: list, new_positions: list):
        super().__init__("이동")
        self.items = list(items)
        self.old_positions = [QPointF(p) for p in old_positions]
        self.new_positions = [QPointF(p) for p in new_positions]

    def redo(self):
        for it, p in zip(self.items, self.new_positions):
            if it.scene() is not None:
                it.setPos(p)

    def undo(self):
        for it, p in zip(self.items, self.old_positions):
            if it.scene() is not None:
                it.setPos(p)


class ResizeItemCommand(QUndoCommand):
    """단일 아이템의 크기/위치/엔드포인트/회전 변경.

    old_state / new_state 는 dict 로 다음 키 중 일부를 가질 수 있다.
    - 'pos'  : QPointF
    - 'size' : QSizeF (BasePhysicsItem)
    - 'p1', 'p2' : QPointF (TwoPointItem)
    - 'rotation' : float
    """

    def __init__(self, item, old_state: dict, new_state: dict):
        super().__init__("크기 변경")
        self.item = item
        self.old_state = dict(old_state)
        self.new_state = dict(new_state)

    def _apply(self, st: dict):
        if self.item.scene() is None:
            return
        if 'p1' in st and 'p2' in st and hasattr(self.item, 'setEndpoints'):
            self.item.setEndpoints(QPointF(st['p1']), QPointF(st['p2']))
        if 'size' in st and hasattr(self.item, 'setSize'):
            self.item.setSize(QSizeF(st['size']))
        if 'pos' in st:
            self.item.setPos(QPointF(st['pos']))
        if 'rotation' in st:
            self.item.setRotation(st['rotation'])

    def redo(self):
        self._apply(self.new_state)

    def undo(self):
        self._apply(self.old_state)


class RotateItemCommand(QUndoCommand):
    """단일 아이템의 회전 변경."""

    def __init__(self, item, old_angle: float, new_angle: float):
        super().__init__("회전")
        self.item = item
        self.old_angle = float(old_angle)
        self.new_angle = float(new_angle)

    def redo(self):
        if self.item.scene() is not None:
            self.item.setRotation(self.new_angle)

    def undo(self):
        if self.item.scene() is not None:
            self.item.setRotation(self.old_angle)


# --------------------------------------------------------------------------- #
# Group / Ungroup
# --------------------------------------------------------------------------- #
class GroupCommand(QUndoCommand):
    """선택된 여러 아이템을 PhysicsGroupItem 으로 묶는다."""

    def __init__(self, scene, items: list):
        super().__init__("그룹")
        self.scene = scene
        self.items = list(items)
        self.group = None

    def redo(self):
        from items import PhysicsGroupItem
        # 자식 아이템들이 살아있는지 확인
        live_items = [it for it in self.items if it.scene() is not None]
        if len(live_items) < 2:
            self.group = None
            return
        self.group = PhysicsGroupItem.fromItems(live_items)
        self.items = live_items

    def undo(self):
        if self.group is not None and self.group.scene() is not None:
            released = self.group.ungroup()
            if released:
                self.items = released
            self.group = None


class UngroupCommand(QUndoCommand):
    """PhysicsGroupItem 을 해제."""

    def __init__(self, scene, group):
        super().__init__("그룹 해제")
        self.scene = scene
        self.group = group
        self.items: list = []

    def redo(self):
        if self.group is not None and self.group.scene() is not None:
            released = self.group.ungroup()
            if released:
                self.items = released
            self.group = None

    def undo(self):
        from items import PhysicsGroupItem
        if self.items:
            live = [it for it in self.items if it.scene() is not None]
            if len(live) >= 2:
                self.group = PhysicsGroupItem.fromItems(live)
                self.items = live


# --------------------------------------------------------------------------- #
# Lock / Property
# --------------------------------------------------------------------------- #
class LockCommand(QUndoCommand):
    """아이템의 잠금 상태 토글."""

    def __init__(self, item, was_locked: bool, now_locked: bool):
        super().__init__("잠금 변경")
        self.item = item
        self.was = bool(was_locked)
        self.now = bool(now_locked)

    def redo(self):
        if hasattr(self.item, 'setLocked'):
            self.item.setLocked(self.now)

    def undo(self):
        if hasattr(self.item, 'setLocked'):
            self.item.setLocked(self.was)


class ReorderCommand(QUndoCommand):
    """레이어 내 z-순서(_order) 변경.

    영향받는 아이템들의 _order 를 일괄로 적용한 뒤 매니저의
    _refresh_layer_view() 로 최종 zValue 를 재계산한다. 레이어 경계는
    _refresh_layer_view 가 보장하므로 여기서는 같은 레이어 내부의
    상대 순서만 바꾼다."""

    def __init__(self, manager, changes, label="순서 변경"):
        super().__init__(label)
        self.manager = manager
        # changes: list[(item, old_order, new_order)]
        self.changes = list(changes)

    def _apply(self, use_new: bool):
        for it, old, new in self.changes:
            try:
                it._order = new if use_new else old
            except Exception:
                pass
        if self.manager is not None:
            self.manager._refresh_layer_view()

    def redo(self):
        self._apply(True)

    def undo(self):
        self._apply(False)


class PropertyChangeCommand(QUndoCommand):
    """아이템의 임의 속성값 변경 (선 굵기, 회색 레벨, 화살표 크기 등)."""

    def __init__(self, item, prop_name: str, old_value, new_value,
                 label: str | None = None):
        super().__init__(label or f"속성 변경: {prop_name}")
        self.item = item
        self.prop = prop_name
        self.old = old_value
        self.new = new_value

    def _set(self, val):
        if self.item.scene() is None:
            return
        setattr(self.item, self.prop, val)
        try:
            self.item.update()
        except Exception:
            pass

    def redo(self):
        self._set(self.new)

    def undo(self):
        self._set(self.old)
