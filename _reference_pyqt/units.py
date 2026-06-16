"""
단위 변환 모듈.

내부 좌표는 모두 px (QGraphicsView 기준, 96 DPI 가정).
사용자에게 보여줄 때만 현재 단위로 변환한다.
"""
from __future__ import annotations

PX_PER_INCH = 96.0
PX_PER_MM = PX_PER_INCH / 25.4
PX_PER_CM = PX_PER_MM * 10.0

UNITS = ("mm", "cm", "inch", "px")

_current_unit: str = "mm"  # 기본은 mm


def get_unit() -> str:
    return _current_unit


def set_unit(unit: str) -> None:
    global _current_unit
    if unit in UNITS:
        _current_unit = unit


def to_px(value: float, unit: str | None = None) -> float:
    u = unit or _current_unit
    if u == "mm":
        return value * PX_PER_MM
    if u == "cm":
        return value * PX_PER_CM
    if u == "inch":
        return value * PX_PER_INCH
    return float(value)


def from_px(px: float, unit: str | None = None) -> float:
    u = unit or _current_unit
    if u == "mm":
        return px / PX_PER_MM
    if u == "cm":
        return px / PX_PER_CM
    if u == "inch":
        return px / PX_PER_INCH
    return float(px)


def suffix(unit: str | None = None) -> str:
    """단위 접미사 (스핀박스에 붙임)."""
    u = unit or _current_unit
    return f" {u}"


def decimals(unit: str | None = None) -> int:
    """단위별 적절한 소수점 자리수."""
    u = unit or _current_unit
    if u == "px":
        return 0
    if u == "inch":
        return 2
    return 1
