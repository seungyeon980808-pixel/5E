/* ===== RIG — 스탠드·레일에 장치를 매달거나 얹는 조립체 (기출 13장) =====
 *
 * 없던 것은 부품이 아니라 **부착 관계**였다. 스탠드(clamp)·용수철(spring)·블록(rect)은
 * 전부 있는데, "가로대의 이 지점에 용수철저울을 매달고 그 끝에 블록을 건다"를 만들려면
 * 좌표를 손으로 다섯 번 맞춰야 했다. 여기서 그 계산만 한다.
 *
 * 좌표계: mm, 원점은 아트보드 중앙, +y 아래.
 */

const SW = 0.35;

/* 스탠드 가로대의 실제 위치 — js/render/optics-apparatus.js drawClamp 와 같은 비율.
 * (렌더가 바뀌면 여기도 같이 고쳐야 한다 — 그래서 한 곳에 모아 둔다.) */
function clampRod(box) {
  const { x, y, w, h } = box;
  return { y: y + h * 0.18, x0: x + w * 0.14, x1: x + w * 0.86 };
}

/* stand : 스탠드 상자 {x,y,w,h}  (생략 시 at 기준 18×34)
 * hang  : [{ s, kind:"spring"|"string", length, block:{size,label,labelType}, label }]
 *         s = 가로대에서의 위치 0~1 (0=기둥 쪽, 1=바깥 끝)
 * rail  : 레일 위에 얹는 것 — { y, from, to, items:[{ at, size, label }] }
 */
export function buildStandRig({ at, stand, hang = [], rail } = {}) {
  const objects = [], errors = [], notes = [];
  const box = stand && Number.isFinite(stand.w)
    ? { x: num(stand.x, 0), y: num(stand.y, 0), w: stand.w, h: num(stand.h, 34) }
    : { x: num(at && at.x, 0) - 9, y: num(at && at.y, 0) - 34, w: 18, h: 34 };

  if (hang.length || stand || !rail) {
    objects.push({
      type: "apparatus", kind: "clamp", x: r2(box.x), y: r2(box.y),
      w: r2(box.w), h: r2(box.h), strokeWidth: SW, rotation: 0,
    });
    const rod = clampRod(box);
    notes.push(`스탠드 ${r2(box.w)}×${r2(box.h)}mm — 가로대 y=${r2(rod.y)}, x ${r2(rod.x0)}~${r2(rod.x1)}`);

    for (const [i, hg] of hang.entries()) {
      const s = clamp01(num(hg.s, 0.75));
      const hx = rod.x0 + (rod.x1 - rod.x0) * s;
      const len = num(hg.length, 14);
      const top = { x: r2(hx), y: r2(rod.y) };
      const bot = { x: r2(hx), y: r2(rod.y + len) };
      if (hg.kind === "string") {
        objects.push({ type: "line", p1: top, p2: bot, strokeWidth: SW });
      } else {
        objects.push(trim({
          type: "spring", p1: top, p2: bot, turns: num(hg.turns, 9),
          radius: num(hg.radius, 1.6), leadLength: num(hg.leadLength, 1.2),
          strokeWidth: SW, label: hg.label || "", labelShow: !!hg.label, labelType: "quantity",
        }));
      }
      if (hg.block) {
        const sz = num(hg.block.size, 8);
        objects.push(trim({
          type: "rect", x: r2(hx - sz / 2), y: r2(rod.y + len), w: sz, h: sz,
          strokeWidth: SW, fillNone: true,
          labelInner: hg.block.label || "", labelInnerType: hg.block.labelType || "quantity",
        }));
      }
      notes.push(`  매단 것 ${i}: x=${r2(hx)}, ${hg.kind === "string" ? "실" : "용수철"} ${len}mm` +
        (hg.block ? ` + 블록 ${num(hg.block.size, 8)}mm` : ""));
    }
  }

  if (rail) {
    const y = num(rail.y, 12), x0 = num(rail.from, -30), x1 = num(rail.to, 30);
    if (x1 <= x0) errors.push("rail.to 는 rail.from 보다 커야 합니다");
    // 레일은 이중선(제도 관행) — 위 선 위에 물체가 얹힌다
    objects.push({ type: "line", p1: { x: x0, y }, p2: { x: x1, y }, strokeWidth: SW });
    objects.push({ type: "line", p1: { x: x0, y: y + 1.4 }, p2: { x: x1, y: y + 1.4 }, strokeWidth: SW });
    for (const [i, it] of (rail.items || []).entries()) {
      const t = clamp01(num(it.at, 0.5));
      const cx = x0 + (x1 - x0) * t;
      const sz = num(it.size, 9);
      objects.push(trim({
        type: "rect", x: r2(cx - sz / 2), y: r2(y - sz), w: sz, h: sz,
        strokeWidth: SW, fillNone: true,
        labelInner: it.label || "", labelInnerType: "label",
      }));
      // 바퀴 두 개 — 운반대/수레는 레일 위에 바퀴로 선다
      if (it.wheels !== false) {
        for (const d of [-0.28, 0.28]) {
          objects.push({
            type: "ellipse", x: r2(cx + sz * d - 1.1), y: r2(y - 2.2), w: 2.2, h: 2.2,
            strokeWidth: SW, fillNone: true,
          });
        }
      }
      notes.push(`  레일 위 ${i}: x=${r2(cx)}, ${sz}mm`);
    }
  }

  return { objects, errors, notes };
}

function num(v, d) { return Number.isFinite(v) ? v : d; }
function r2(v) { return Math.round(v * 100) / 100; }
function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function trim(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}
