# Strict illustration assets

`js/ai-illustration-assets.js` implements the only new illustration families that passed the strict reuse audit of 3,961 exam-library items and 936 hand-authored figure-atlas rows. The geometry is original code-native vector line art; it does not crop, embed, trace, or pixel-copy an exam image.

The two high-level IDs are also exposed by `js/ai-motif-catalog.js`, so a new session can request either asset through the existing single-motif fast-scene shortcut. This module has no UI dependency and does not modify `ai-panel.js`.

## Invariants

- mode is always `diagram`;
- no rendered text, numbers, symbols, labels, leader lines, or arrows;
- white fill is the default; gray is used only for a physically distinct spacecraft window or plane mirror;
- optional content defaults to `none` and is restricted to closed enums;
- each semantic component receives a separate `groupId` and `assetRole` when compiled through `compileIllustrationAsset()`, `compileAiMotif()`, or `compileFastSceneWithMotifs()`;
- `auditDiagramObjects()` and MCP `normalizeObject()` must pass before the result is accepted;
- every result records `sourcePixelsEmbedded:false` and points to the mining manifest.

## Student trio

ID: `student_trio_seated_dialogue`

Audit evidence: 13 strict seated/table/dialogue occurrences. The three figures are not clones: their head direction and arm contours differ. The table and each student compile into separate editable groups. Chairs, apparatus, labels, and other props are not options.

| Option | Allowed values | Default | Safety rule |
|---|---|---|---|
| `tableShape` | `rect`, `round` | `rect` | table only |
| `speechBubbles` | `none`, `three_blank` | `none` | blank outlines only |
| `speechBubbleEvidence` | `source`, `request` | absent | required when bubbles are requested |
| `bubbleTails` | exactly three of `down_left`, `down`, `down_right` | inward-facing set | valid only with `three_blank` |
| `artboard` | `w=100..300`, `h=60..180` mm | `150×90` | bounded |

The separate blank-bubble option is backed by 31 atlas mentions, but frequency does not authorize automatic insertion. Use it only when the current source image or user request explicitly contains speech bubbles. Each bubble is a single closed outline with its tail integrated into the boundary; it contains no text and has no separate leader.

```js
import { compileIllustrationAsset } from "./js/ai-illustration-assets.js";

const result = compileIllustrationAsset("student_trio_seated_dialogue", {
  tableShape: "round",
  speechBubbles: "three_blank",
  speechBubbleEvidence: "source",
  bubbleTails: ["down_right", "down", "down_left"],
});
```

## Flat spacecraft

ID: `spacecraft_flat_shell`

Audit evidence: 18 spacecraft/rocket occurrences. The shell, window, occupant, and explicitly selected device compile as separate groups. The asset is a generic evaluation-style family, not an exact reconstruction of a named exam spacecraft.

| Option | Allowed values | Default | Safety rule |
|---|---|---|---|
| `proportions` | `compact`, `long` | `long` | shell geometry only |
| `facing` | `left`, `right` | `right` | deterministic mirror |
| `window` | `none`, `single`, `wide` | `none` | gray physically distinct region |
| `occupant` | `none`, `seated` | `none` | requires an explicit window |
| `device` | `none`, `point_source`, `detector_box`, `plane_mirror` | `none` | requires an explicit window |
| `deviceSlot` | `rear`, `center`, `front` | `front` | rear is reserved when an occupant is present |
| `artboard` | `w=100..300`, `h=60..180` mm | `160×80` | bounded |

An occupant plus a device requires the wide window. No arbitrary apparatus name is accepted, and a device is never inferred from the subject or source family.

```js
const result = compileIllustrationAsset("spacecraft_flat_shell", {
  facing: "left",
  window: "wide",
  occupant: "seated",
  device: "detector_box",
  deviceSlot: "front",
});
```

## High-level Luna shortcut

Both IDs use the existing sole-element motif contract:

```json
{
  "type": "motif",
  "motif": "spacecraft_flat_shell",
  "options": { "window": "wide", "occupant": "seated" }
}
```

Do not mix a motif element with hand-written elements in the same request. `expandAiMotifScene()` rejects mixed input, extra root fields, a non-diagram mode, and unknown options.

For editable component groups, call `compileAiMotif()` or `compileFastSceneWithMotifs()` directly. `expandAiMotifScene()` is an inspection/expansion API; passing its returned ordinary scene into the generic `compileFastScene()` intentionally loses the private element-to-component mapping. The current UI path was not changed in this work.

## Source-derived hand wrappers

`tools/mcp-5e/lib/parts.js` retains the low-level `buildPart()` compositor for internal compatibility, but the public MCP `add_part` handler now calls `buildSafePart()` and lists only the provenance-locked policies below.

| Part | Authorized occurrence | Required context | Additional restriction |
|---|---|---|---|
| `hand_grip` | `p1_2023_09_20#panel-1`, `p1_2025_06_19#panel-1`, `p1_2027_06_18#panel-1` | `inclined-block-grip` | one unlabeled `rect` between back/front layers; both layers mandatory |
| `hand_press` | `p1_2024_11_08#panel-1` only | `dashed-two-finger-spring-compression` | exact scene only; no inserted object; do not solidify or reinterpret |

Every call must provide `purpose:"reference-reconstruction"`, `mode:"diagram"`, `examId`, `panelRef`, and the exact context. The wrapper rejects labels, formula/text/labeler objects, symbols, arrow fields, unknown apparatus, aspect distortion, excessive scaling, layer-only calls, and unapproved source panels.

The four source PNGs are verified against pinned SHA-256 hashes at call time. They are never modified. A small isolated component in `hand_grip_front.png` is hidden with a normalized non-destructive `cutouts` rectangle, so the cleanup follows movement and scaling without changing source bytes. Each returned object records the policy version and both source and authorized provenance.

```js
import { buildSafePart } from "./tools/mcp-5e/lib/parts.js";

const part = buildSafePart({
  part: "hand_grip",
  purpose: "reference-reconstruction",
  mode: "diagram",
  examId: "p1_2025_06_19",
  panelRef: "p1_2025_06_19#panel-1",
  context: "inclined-block-grip",
  gripAt: { x: 0, y: 0 },
  w: 12,
  between: [{ type: "rect", x: 0, y: -4, w: 8, h: 8, fillLevel: 255 }],
});
```

## Verification and benchmark

```powershell
node --test tests/test-ai-illustration-assets.mjs tests/test-safe-exam-parts.mjs tests/test-ai-motif-catalog.mjs
node scripts/engine-v2/benchmark-illustration-assets.mjs --iterations=4000
```

Reference local run on 2026-08-09: 4,000 deterministic compiles, 63,000 output objects, 279.364 ms total, 0.069841 ms mean, 14,318.2 compiles/s. This measures local scene construction and schema compilation only; it does not include an AI model call, raster generation, disk export, or UI rendering.

The integrity tests also hash all source hand PNGs before and after wrapper use, inline the source images, and pass every returned object through the MCP normalizer. Any future change to a pinned source crop intentionally fails closed until the provenance audit and expected hash are updated together.
