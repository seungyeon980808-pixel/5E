import { FAST_SCENE_SCHEMA_ID } from "./ai-scene-fastpath.js?v=1.5.3";
import { AI_MOTIF_PROMPT_REFERENCE } from "./ai-motif-catalog.js?v=1.5.3";

export const FAST_SCENE_PROMPT_VERSION = "5e-fast-scene-prompt@8";

const TYPE_REFERENCE = `
Supported element forms (coordinates are millimetres, centred artboard):
- {"type":"rect|ellipse|triangle","box":[x,y,w,h],"tone":"white|gray|none","rotation":0}
- {"type":"line|polyline|curve","from":[x,y],"to":[x,y]} or {"points":[[x,y],...],"closed":false,"dashed":false,"arrow":"none"}
- {"type":"circuit","element":"resistor|dc_source|ac_source|capacitor|inductor|diode|lamp|led|switch|switch_spdt|unknown","from":[x,y],"to":[x,y],"closed":false}
- {"type":"pulley","box":[x,y,w,h],"variant":"ceiling"}
- {"type":"apparatus","apparatusKind":"wire|compass|pulley|clamp|device_box|speaker|phototube|slit|thermometer|fringe_pattern|electroscope","box":[x,y,w,h]}
- {"type":"spring","from":[x,y],"to":[x,y],"turns":10,"radius":2.5}
- {"type":"optics","opticsKind":"convex_lens|concave_lens|convex_mirror|concave_mirror|plane_mirror|point_light|screen|node","box":[x,y,w,h]}
- {"type":"vessel","vesselKind":"beaker|flask|test_tube|cylinder_graduated|funnel|u_tube|burette|round|box","box":[x,y,w,h],"liquid":0.5,"hasPiston":false,"pistonAt":0.3,"hasStopcock":false,"hasTicks":false}
- {"type":"particlebox","box":[x,y,w,h],"state":"solid|liquid|gas","count":12,"particleRadius":1,"particleShape":"circle|square","mix":false,"seed":1,"motion":"none"}
- {"type":"graph","box":[x,y,w,h],"xRange":[-5,5],"yRange":[-5,5],"axisVariant":"cross|quadrant|halfcross|single","grid":false,"showNumbers":false,"series":[{"kind":"line|curve|scatter|bar","points":[[x,y],...] }]}
- complete graph fields: xLabel,yLabel,originLabel,tickTextX,tickTextY,xStep,yStep,frame,y2Range,y2Label,tickTextY2,y2Step,markers,guides,guideLines,labels,arrows,legends,axisBreaks,panelLabel. Use bands:[{axis:"x|y",from,to,level,label}] for shaded intervals; leaders/dimensions/ranges:[{from:[x,y],to:[x,y],label,variant}] for editable callouts and interval marks. Omit step fields for an automatic readable interval. A point may be {x,y,label,labelRole:"label|quantity",labelSize,labelAngle,labelDistance}. A series may use axis:"y2", dashed, markers, label, labelRole:"label|quantity", area:{from,to,base,label}, barWidth, fillStyle:"white|gray|hatch". Typography rule: names/categories/point labels such as A, B, C, (가), 단열 are upright; only physical-quantity symbols such as x, t, v, I, P, V, E, f are italic. Units, numbers, parentheses, and Korean descriptions are upright. Use labelRole:"quantity" only when a label itself is a physical quantity; labels default to upright.
- pie graph: {"type":"graph","chartKind":"pie","box":[x,y,w,h],"values":[{"value":3,"label":"3/5","tone":"white|gray"},...]}
- {"type":"pedigree","box":[x,y,w,h],"gen2Kids":3,"gen3Kids":2,"gen3Parent":1,"affected":[],"carrier":[],"showNumbers":false}
- complete mode only: {"type":"annotation","at":[x,y],"text":"...","fontSize":3.5}
`;

export function buildFastScenePrompt({ request, mode = "diagram", revisionScene = "" } = {}) {
  const safeMode = mode === "complete" ? "complete" : "diagram";
  const prior = String(revisionScene || "").trim();
  return `You are the deterministic scene planner for the 5E Korean assessment science-diagram editor.
Return exactly one compact JSON object. No markdown fence, prose, analysis, tool call, web search, file access, question, or retry.

Root contract:
{"schema":"${FAST_SCENE_SCHEMA_ID}","mode":"${safeMode}","artboard":{"w":160,"h":90},"elements":[]}
Use 20-500 mm for artboard dimensions and at most 128 elements. Keep the full scene inside the artboard with useful margins.

CRITICAL COORDINATE RULE — THE ARTBOARD ORIGIN IS ITS CENTRE, NOT ITS TOP-LEFT CORNER.
- For artboard {"w":W,"h":H}, every point must use x in [-W/2,+W/2] and y in [-H/2,+H/2].
- A box [x,y,w,h] must satisfy -W/2 <= x, x+w <= +W/2, -H/2 <= y, and y+h <= +H/2.
- With the default 160 x 90 artboard, the exact ranges are x=-80..+80 and y=-45..+45; [0,0] is the centre.
- NEVER use browser-style top-left coordinates 0..W / 0..H.
${TYPE_REFERENCE}
${AI_MOTIF_PROMPT_REFERENCE}
Scientific and structural rules:
1. Preserve required part counts, contacts, connections, ordering, panel arrangement, relative proportions, and spatial relationships.
2. Do not add apparatus, labels, decorations, arrows, or structures not present in the request/reference.
3. Use black outlines on transparent/white space. Use flat gray only for physically distinct material or region; no shadows, highlights, gradients, texture, or decorative 3D.
4. In diagram mode, all labels, text, numbers, symbols, leader lines, and arrowheads are forbidden. Never use annotation, intrinsic-letter meters, bar_magnet, scale, transistor, or object_arrow in diagram mode. Build a label-free geometric substitute if needed.
5. Keep repeated devices on a shared master geometry and change only the scientifically meaningful state.
6. If the subject fundamentally requires an unsupported illustration (human/hand/anatomy/animal/plant/realistic vehicle or machinery), emit one element with type "unsupported_illustration" instead of approximating it. There are only three audited exceptions: student_trio_seated_dialogue for exactly three seated students at one table, spacecraft_flat_shell for the explicitly requested flat shell options, and verified_map_outline for exactly world, Pacific, East Asia or the Korean Peninsula. Do not generalize those exceptions to another pose, person count, vehicle, or geography.
7. Prefer one audited motif shortcut when it exactly matches the requested panel flow, dual-axis plot, wiring, contour bundle, explicitly generic schematic coastline, strict repeated apparatus assembly, generic unlabeled logistic curve, strict illustration exception, or one verified map variant. Do not use an apparatus motif for a different topology, part count or optical sequence. Never combine a motif shortcut with ordinary elements. verified_map_outline must be the whole output: do not add markers, paths, apparatus or any overlay in the same scene; the user adds those later in 5E.
8. Region-comment percentages are measured from the preview's top-left. Convert horizontal p% to x=-W/2+(p/100)*W and vertical q% to y=-H/2+(q/100)*H before matching the requested object; do not draw the selection rectangle or its number.
${prior ? `Current editable scene JSON. Modify this instead of rebuilding unaffected parts:\n${prior.slice(0, 120000)}\n` : ""}
User request and reference-image instructions:
${String(request || "").trim()}

Output the JSON object now.`;
}
