#!/usr/bin/env node

/**
 * Deterministic audit of recurring person / vehicle / hand illustrations.
 *
 * The audit is deliberately metadata-only. It never copies, edits, or generates
 * raster pixels. The complete 3,961-item exam manifest is used as the inventory
 * and subject/tag source; reliable visual taxonomy is limited to the 936 items
 * that have hand-authored figure-atlas notes.
 *
 * Usage:
 *   node scripts/engine-v2/audit-illustration-assets.mjs --json
 *   node scripts/engine-v2/audit-illustration-assets.mjs --write
 *   node scripts/engine-v2/audit-illustration-assets.mjs --check
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

export const OUTPUT = Object.freeze({
  manifest: "docs/engine-v2/ILLUSTRATION_ASSET_CANDIDATES.json",
  report: "docs/engine-v2/ILLUSTRATION_ASSET_MINING.md",
});

const SOURCE = Object.freeze({
  examManifest: "assets/exam-library/manifest.json",
  atlases: [
    "docs/figure-atlas.jsonl",
    "docs/figure-atlas-c.jsonl",
    "docs/figure-atlas-b.jsonl",
    "docs/figure-atlas-e.jsonl",
  ],
  examPartsManifest: "assets/exam-parts/manifest.json",
  examPartsDir: "assets/exam-parts",
});

const TARGET_BLOCKERS = Object.freeze(["person", "vehicle", "hand"]);

const PANEL_TERMS = Object.freeze({
  person: /학생|교사|사람|인물|우주인|우주복|관찰자|탑승자|승객|얼굴|눈 삽화|다리 삽화|다리 윤곽/,
  vehicle: /우주선|우주 정거장|로켓|자동차|차량|승용차|트럭|버스|군함|수레|자전거|spacecraft|rocket|vehicle/,
  hand: /손|손가락|장갑|잡은|쥔|누르|눌려|대는|들고|든 막대|칼을 쥔/,
});

const SUBJECT_FAMILY = Object.freeze({
  p: "physics",
  c: "chemistry",
  b: "biology",
  e: "earth_science",
});

const EXISTING_ASSET_POLICIES = Object.freeze({
  hand_grip: {
    exactSourceExamId: "p1_2025_06_19",
    eligibleExamIds: ["p1_2023_09_20", "p1_2025_06_19", "p1_2027_06_18"],
    matchingBasis: "one hand gripping a block on an incline; same contact family",
    doNotGeneralize: [
      "Do not use for pressing, touching, gloved laboratory work, or two-hand actions.",
      "Do not assume the crop fits a vertical rod or tool without a separate compositing check.",
      "The source-derived pixels may contain a tiny source-specific mark; require text/symbol contamination review before diagram-mode use.",
      "The back/front split only authorizes layering; it does not prove a new pose or viewing angle.",
    ],
  },
  hand_press: {
    exactSourceExamId: "p1_2024_11_08",
    eligibleExamIds: ["p1_2024_11_08"],
    matchingBasis: "dashed/ghost two-finger spring-compression pose; exact source scene only",
    doNotGeneralize: [
      "Do not convert the dashed ghost hand to a solid hand.",
      "Do not use for gripping, pointing, touching, or laboratory handling.",
      "Do not infer that every spring-compression scene uses the same hand silhouette.",
    ],
  },
});

function abs(root, rel) {
  return path.join(root, ...rel.split("/"));
}

function readUtf8(root, rel) {
  return fs.readFileSync(abs(root, rel), "utf8");
}

function readJson(root, rel) {
  return JSON.parse(readUtf8(root, rel));
}

function readJsonl(root, rel) {
  const text = readUtf8(root, rel).trim();
  return text ? text.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
}

function normalizeExamId(fileOrId) {
  return String(fileOrId || "").replace(/\.png$/i, "");
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function pct(numerator, denominator) {
  return denominator ? round((numerator / denominator) * 100, 2) : 0;
}

export function countBy(items, getter) {
  const counts = new Map();
  for (const item of items) {
    const key = String(getter(item) ?? "unknown");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "en"));
}

function sourceFingerprint(root) {
  const hash = crypto.createHash("sha256");
  for (const rel of [SOURCE.examManifest, ...SOURCE.atlases, SOURCE.examPartsManifest]) {
    hash.update(`${rel}\0`);
    hash.update(readUtf8(root, rel));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function firstMatch(value, rules, fallback = "unknown") {
  for (const [label, pattern] of rules) {
    if (pattern.test(value)) return label;
  }
  return fallback;
}

function classifyPerson(note) {
  const role = firstMatch(note, [
    ["anatomical_fragment", /눈 삽화|다리 삽화|다리 윤곽|해부 모식도/],
    ["student_group", /학생/],
    ["teacher", /교사/],
    ["astronaut_or_space_observer", /우주인|우주복/],
    ["vehicle_occupant", /(?:우주선|로켓|버스)[^.]{0,90}(?:사람|탑승자)|(?:사람|탑승자)[^.]{0,90}(?:우주선|로켓|버스)/],
    ["apparatus_operator", /실을 당|줄을 당|물체를 당|스톤 .*밀|저울판 위|받침대 위에 선|공 .*던져/],
    ["contextual_person", /가방을 멘|달리는 사람|먹는 사람|스마트워치/],
    ["observer", /관찰자/],
    ["generic_person", /사람|인물/],
  ]);
  const pose = firstMatch(note, [
    ["seated", /앉은|앉아|둘러앉|탁자 앞/],
    ["standing", /서 있|서 있고|서 있음|선 사람|사람이 서|나란히 서|저울판 위에 선|받침대 위에 선/],
    ["running", /달리는/],
    ["pulling", /당김|당겨|잡아당/],
    ["pushing", /밀고/],
    ["eating", /먹는/],
    ["hand_raised", /손을 든/],
    ["anatomical_fragment", /눈 삽화|다리 삽화|다리 윤곽|해부 모식도/],
  ]);
  const contact = firstMatch(note, [
    ["seated_at_table_or_desk", /책상|탁자/],
    ["inside_vehicle", /(?:우주선|로켓|버스)[^.]{0,100}(?:안|내부|탄|탑승)|(?:안|내부|탄|탑승)[^.]{0,100}(?:우주선|로켓|버스)/],
    ["standing_on_scale_or_platform", /저울판 위|받침대 위/],
    ["holding_or_pulling_rope", /실을 당|줄을 당|실의 한쪽 끝/],
    ["pushing_object", /스톤 .*밀/],
    ["beside_projectile", /공 [AB].*(?:던|최고점)|(?:던|최고점).*공 [AB]/],
  ], "not_described");
  const action = firstMatch(note, [
    ["dialogue", /말풍선|대화|발언|대사/],
    ["pull", /당김|당겨|잡아당/],
    ["push", /밀고/],
    ["run", /달리는/],
    ["eat", /먹는/],
    ["demonstrate_or_observe", /관찰자|검출기|실험|공 .*던/],
    ["stand", /서 있|서 있고|서 있음|선 사람/],
  ], "not_described");
  const groupSize = /학생\s*A[·ㆍ,/]?B[·ㆍ,/]?C|학생 A·B·C|학생 3명|학생 3인|세 명|세 사람/.test(note)
    ? "three"
    : /두 사람|사람 [A-Z].*사람 [A-Z]/.test(note)
      ? "two_or_more"
      : /사람|교사|우주인|관찰자|탑승자|학생/.test(note)
        ? "one_or_unspecified"
        : "unknown";
  return {
    subtype: role,
    pose,
    orientation: "unknown",
    contact,
    action,
    groupSize,
  };
}

function classifyVehicle(note) {
  const subtype = firstMatch(note, [
    ["spacecraft_or_rocket", /우주선|로켓|spacecraft|rocket/],
    ["road_bus", /버스/],
    ["road_car_or_truck", /자동차|승용차|트럭|차량/],
    ["military_ship", /군함/],
    ["cart", /수레/],
    ["bicycle_wheel", /자전거 바퀴/],
  ]);
  const orientation = firstMatch(note, [
    ["opposed_directions", /반대 방향|마주 보|서로 .*방향|B\(왼쪽 진행\).*C\(오른쪽 진행\)/],
    ["rightward", /(?:우주선|로켓|버스|자동차|수레)[^.]{0,80}오른쪽|오른쪽으로[^.]{0,80}(?:우주선|로켓|버스|자동차|수레)/],
    ["leftward", /(?:우주선|로켓|버스|자동차|수레)[^.]{0,80}왼쪽|왼쪽으로[^.]{0,80}(?:우주선|로켓|버스|자동차|수레)/],
    ["circular_path", /원궤도/],
    ["multiple_unspecified", /두 대|A·B 자동차|자동차 A·B|위아래 차선/],
  ]);
  const contact = firstMatch(note, [
    ["road_or_lane", /도로|차선/],
    ["track_or_ground", /수평면|바닥|벽을 향/],
    ["water", /바다 위/],
    ["circular_path", /원궤도/],
    ["wheel_only", /자전거 바퀴/],
    ["space", /우주선|로켓|우주 정거장/],
  ], "not_described");
  const action = firstMatch(note, [
    ["rebound_or_collision", /되튄|충돌|벽을 향/],
    ["orbital_motion", /원궤도/],
    ["moving", /운동 방향|진행|이동|속도|[0-9]\.?[0-9]*c|오른쪽|왼쪽|달리는/],
    ["static_context", /내부 사진|그림의 전부|삽화뿐/],
  ], "not_described");
  return {
    subtype,
    pose: "not_applicable",
    orientation,
    contact,
    action,
    occupant: /사람|우주인|관찰자|탑승자/.test(note) ? "present" : "not_described",
  };
}

function classifyHand(note) {
  const pose = firstMatch(note, [
    ["press", /누르|눌려/],
    ["touch", /손가락.*대|손가락을 대/],
    ["grip", /잡은|잡고|쥔|들고|든 손|손에 든/],
    ["manipulate", /조작/],
  ]);
  const orientation = firstMatch(note, [
    ["target_vertical", /수직 막대|세로 플라스틱관|뷰렛|막대 꼭짓점|막대에 실/],
    ["target_inclined", /빗면/],
    ["target_horizontal", /수평면|긴 판|용수철.*누|누.*용수철/],
  ]);
  const contact = firstMatch(note, [
    ["block", /블록 [A-Z]|[A-Z]\([^)]*\).*잡은 손|B를 잡은 손/],
    ["spring", /용수철/],
    ["rod_or_tube", /막대|플라스틱관/],
    ["magnet", /자석/],
    ["charged_sphere_or_electroscope", /금속구|대전된 구|대전체/],
    ["burette_or_flask", /뷰렛|삼각플라스크/],
    ["pump_bottle", /펌프|소독제/],
    ["skin_or_cotton", /솜|팔에 대/],
    ["knife", /칼을/],
    ["measurement_model", /각도기|외행성 막대/],
    ["instrument_or_tool", /비접촉 온도계|도구/],
  ], "not_described");
  // Require an explicit grammatical link. "점선 이전 위치와 손" describes two
  // different things and must not turn the hand into a dashed asset.
  const style = /점선\s*손|점선으로\s*그린\s*손|손[^.]{0,8}점선\s*윤곽/.test(note)
    ? "dashed_ghost"
    : /장갑/.test(note)
      ? "gloved"
      : "solid_or_not_described";
  const handCount = /두 손|양손|두 손가락/.test(note) ? "two_or_two_fingers" : "one_or_unspecified";
  return {
    subtype: style,
    pose,
    orientation,
    contact,
    action: pose,
    handCount,
  };
}

function classify(blocker, note) {
  if (blocker === "person") return classifyPerson(note);
  if (blocker === "vehicle") return classifyVehicle(note);
  return classifyHand(note);
}

function makePanelRef(row, panel, index, matched) {
  const label = panel.name == null || panel.name === "" ? `panel-${index + 1}` : String(panel.name);
  return {
    ref: `${normalizeExamId(row.file)}#panel-${index + 1}`,
    index,
    label,
    kind: panel.kind || "unknown",
    matchedByNote: matched,
  };
}

function attributePanels(row, blocker) {
  const panels = Array.isArray(row.panels) ? row.panels : [];
  const pattern = PANEL_TERMS[blocker];
  const matched = panels
    .map((panel, index) => ({ panel, index }))
    .filter(({ panel }) => pattern.test(String(panel.note || "")));
  const selected = matched.length ? matched : panels.map((panel, index) => ({ panel, index }));
  return {
    status: matched.length ? "resolved_from_panel_note" : "unresolved_row_level_only",
    refs: selected.map(({ panel, index }) => makePanelRef(row, panel, index, matched.length > 0)),
    note: selected.map(({ panel }) => String(panel.note || "")).join(" || "),
  };
}

function candidateIdsFor(occurrence) {
  const { blocker, examId, taxonomy } = occurrence;
  const ids = [];
  if (blocker === "person") {
    if (taxonomy.subtype === "student_group" && taxonomy.groupSize === "three" && taxonomy.pose === "seated" && taxonomy.action === "dialogue") {
      ids.push("candidate_student_trio_seated_dialogue");
    }
  }
  if (blocker === "vehicle" && taxonomy.subtype === "spacecraft_or_rocket") {
    ids.push("candidate_spacecraft_flat_shell_family");
  }
  if (blocker === "hand") {
    if (EXISTING_ASSET_POLICIES.hand_grip.eligibleExamIds.includes(examId)) ids.push("existing_hand_grip");
    if (EXISTING_ASSET_POLICIES.hand_press.eligibleExamIds.includes(examId)) ids.push("existing_hand_press");
  }
  return ids;
}

function buildOccurrence(row, item, blockerEntry) {
  const blocker = blockerEntry.what;
  const attribution = attributePanels(row, blocker);
  const examId = normalizeExamId(row.file);
  const occurrence = {
    occurrenceId: `${examId}#${blocker}`,
    examId,
    file: row.file,
    subject: row.subject,
    subjectLabel: item.subjectLabel,
    subjectFamily: SUBJECT_FAMILY[String(row.subject || "")[0]] || "unknown",
    subjectSubtypes: [...(item.parts || [])],
    tags: [...new Set([...(item.tags || []), ...(row.tags || [])])].sort((a, b) => a.localeCompare(b, "ko")),
    blocker,
    blockerType: blockerEntry.type || "unknown",
    atlasProjection: row.projection || "unknown",
    atlasRepro: row.repro || "unknown",
    panelAttribution: attribution.status,
    panelRefs: attribution.refs,
    taxonomy: classify(blocker, attribution.note),
    reusableCandidateIds: [],
    doNotGeneralize: [],
  };
  occurrence.reusableCandidateIds = candidateIdsFor(occurrence);
  if (occurrence.panelAttribution !== "resolved_from_panel_note") {
    occurrence.doNotGeneralize.push("Panel attribution is unresolved; do not crop or reuse until a human identifies the exact panel.");
  }
  if (occurrence.taxonomy.orientation === "unknown") {
    occurrence.doNotGeneralize.push("Orientation is not stated in atlas metadata; do not mirror or rotate by assumption.");
  }
  if (blocker === "person" && occurrence.taxonomy.subtype === "anatomical_fragment") {
    occurrence.doNotGeneralize.push("An anatomical fragment is not a generic person asset.");
  }
  if (blocker === "vehicle" && occurrence.taxonomy.occupant === "present") {
    occurrence.doNotGeneralize.push("Keep vehicle shell and occupant as separate provenance/components; do not bake a source person or label into a generic shell.");
  }
  if (blocker === "hand" && occurrence.taxonomy.pose === "unknown") {
    occurrence.doNotGeneralize.push("Hand pose is not recoverable from the note; exclude from asset matching.");
  }
  return occurrence;
}

function makeCandidate(id, config, occurrenceMap) {
  const occurrences = config.occurrenceIds.map((occurrenceId) => occurrenceMap.get(occurrenceId)).filter(Boolean);
  return {
    id,
    status: config.status,
    blocker: config.blocker,
    exactUseCase: config.exactUseCase,
    evidenceCount: occurrences.length,
    occurrenceIds: occurrences.map((row) => row.occurrenceId),
    sourceExamIds: [...new Set(occurrences.map((row) => row.examId))],
    sourcePanelRefs: [...new Set(occurrences.flatMap((row) => row.panelRefs.map((panel) => panel.ref)))],
    existingAssetId: config.existingAssetId || null,
    implementation: config.implementation || null,
    provenanceMode: config.provenanceMode,
    constraints: config.constraints,
    doNotGeneralize: config.doNotGeneralize,
  };
}

function buildCandidates(occurrences) {
  const occurrenceMap = new Map(occurrences.map((row) => [row.occurrenceId, row]));
  const ids = (candidateId) => occurrences
    .filter((row) => row.reusableCandidateIds.includes(candidateId))
    .map((row) => row.occurrenceId);
  const configs = {
    existing_hand_grip: {
      status: "implemented_safe_wrapper_provenance_locked",
      blocker: "hand",
      exactUseCase: "Layered one-hand grip around an incline block, entering from the same side as the source pose.",
      occurrenceIds: ids("existing_hand_grip"),
      existingAssetId: "hand_grip",
      implementation: { module: "tools/mcp-5e/lib/parts.js", entry: "buildSafePart", policyVersion: "5e-safe-exam-parts@1" },
      provenanceMode: "existing source-derived crop; pinned source hashes, exact audited panels, and non-destructive contamination cutout enforced by wrapper",
      constraints: ["solid line", "single hand", "block contact", "inclined target context"],
      doNotGeneralize: EXISTING_ASSET_POLICIES.hand_grip.doNotGeneralize,
    },
    existing_hand_press: {
      status: "implemented_safe_wrapper_exact_scene_only",
      blocker: "hand",
      exactUseCase: "Dashed/ghost two-finger hand compressing the spring in the source arrangement.",
      occurrenceIds: ids("existing_hand_press"),
      existingAssetId: "hand_press",
      implementation: { module: "tools/mcp-5e/lib/parts.js", entry: "buildSafePart", policyVersion: "5e-safe-exam-parts@1" },
      provenanceMode: "existing source-derived crop; exact source scene only",
      constraints: ["dashed ghost line", "two-finger press", "spring compression"],
      doNotGeneralize: EXISTING_ASSET_POLICIES.hand_press.doNotGeneralize,
    },
    candidate_student_trio_seated_dialogue: {
      status: "implemented_code_native",
      blocker: "person",
      exactUseCase: "Three seated students at a desk/round table; labels remain separate and blank bubble outlines are opt-in only for a source-confirmed bubble scene.",
      occurrenceIds: ids("candidate_student_trio_seated_dialogue"),
      implementation: { module: "js/ai-illustration-assets.js", assetId: "student_trio_seated_dialogue", sourcePixelsEmbedded: false },
      provenanceMode: "new original line-art redraw informed by frequency; never crop or trace a single exam pixel source",
      constraints: ["three students", "seated", "table/desk contact", "dialogue layout", "no embedded text", "blank bubble outlines require speechBubbleEvidence:source|request"],
      doNotGeneralize: [
        "Do not reuse for standing, portrait-only, teacher, or apparatus-operation poses.",
        "Do not bake A/B/C labels or speech-bubble text into the raster/SVG asset.",
        "Use pose variants rather than cloning one identical student three times.",
      ],
    },
    candidate_spacecraft_flat_shell_family: {
      status: "implemented_code_native",
      blocker: "vehicle",
      exactUseCase: "Flat evaluation-style spacecraft/rocket shell with optional window and internal apparatus layers.",
      occurrenceIds: ids("candidate_spacecraft_flat_shell_family"),
      implementation: { module: "js/ai-illustration-assets.js", assetId: "spacecraft_flat_shell", sourcePixelsEmbedded: false },
      provenanceMode: "new parametric shell or original redraw; exam occurrences are structural references, not crop sources",
      constraints: ["flat projection", "separate shell/window/occupant/apparatus layers", "no embedded labels", "left/right variants explicit"],
      doNotGeneralize: [
        "Do not merge occupants, light sources, mirrors, scales, or experiment-specific paths into the generic shell.",
        "Do not treat road vehicles, carts, military ships, or bicycle wheels as the same family.",
        "A flat atlas projection does not prove identical profile geometry; maintain more than one shell proportion variant.",
      ],
    },
  };
  return Object.entries(configs).map(([id, config]) => makeCandidate(id, config, occurrenceMap));
}

function buildDeferredClusters(occurrences) {
  const specs = [
    {
      id: "defer_student_trio_standing_dialogue",
      blocker: "person",
      test: (row) => row.taxonomy.subtype === "student_group"
        && row.taxonomy.groupSize === "three"
        && row.taxonomy.pose === "standing"
        && row.taxonomy.action === "dialogue",
      reason: "Only one occurrence satisfies all strict pose/group/action fields; other board-dialogue notes do not state standing pose.",
      doNotGeneralize: "Do not turn pose-unknown student groups into standing groups.",
    },
    {
      id: "defer_astronaut_observer",
      blocker: "person",
      test: (row) => row.taxonomy.subtype === "astronaut_or_space_observer",
      reason: "Rows often combine an embedded occupant and an external observer in one panel, while direction and exact pose are usually absent.",
      doNotGeneralize: "Do not collapse seated occupants, standing external astronauts, and ordinary observers into one figure.",
    },
    {
      id: "defer_road_vehicle_family",
      blocker: "vehicle",
      test: (row) => ["road_bus", "road_car_or_truck"].includes(row.taxonomy.subtype),
      reason: "The notes mix bus interior, bus front, side-road cars, autonomous sedan, and truck scenes; one shared silhouette is not evidenced.",
      doNotGeneralize: "Do not reuse one bus/car profile for front, interior, truck, and side views.",
    },
    {
      id: "defer_vertical_hand_grip",
      blocker: "hand",
      test: (row) => row.taxonomy.pose === "grip" && row.taxonomy.orientation === "target_vertical",
      reason: "Repeated vertical contact exists, but targets include rod, tube, charged-object apparatus, and burette/flask with different occlusion geometry.",
      doNotGeneralize: "Do not assume the existing incline-block grip crop fits a vertical target.",
    },
    {
      id: "defer_gloved_lab_hands",
      blocker: "hand",
      test: (row) => row.taxonomy.subtype === "gloved",
      reason: "Only two gloved scenes are described and their actions differ (cotton-on-skin versus two-hand burette/flask handling).",
      doNotGeneralize: "Do not use one gloved-hand pose for chemically distinct contacts and hand counts.",
    },
  ];
  return specs.map((spec) => {
    const rows = occurrences.filter((row) => row.blocker === spec.blocker && spec.test(row));
    return {
      id: spec.id,
      status: "insufficient_or_heterogeneous_evidence_do_not_build_yet",
      blocker: spec.blocker,
      evidenceCount: rows.length,
      occurrenceIds: rows.map((row) => row.occurrenceId),
      sourceExamIds: rows.map((row) => row.examId),
      sourcePanelRefs: [...new Set(rows.flatMap((row) => row.panelRefs.map((panel) => panel.ref)))],
      reason: spec.reason,
      doNotGeneralize: [spec.doNotGeneralize],
    };
  });
}

function buildExistingAssets(root, examParts, occurrences) {
  const byId = new Map(examParts.map((entry) => [entry.id, entry]));
  return Object.entries(EXISTING_ASSET_POLICIES).map(([id, policy]) => {
    const entry = byId.get(id);
    const files = Object.values(entry?.files || {});
    return {
      id,
      files,
      filesPresent: files.every((file) => fs.existsSync(abs(root, `${SOURCE.examPartsDir}/${file}`))),
      dimensionsPx: entry?.px || null,
      dimensionsMm: entry?.mm || null,
      split: entry?.split || null,
      source: {
        examId: policy.exactSourceExamId,
        raw: entry?.source || null,
      },
      eligibleOccurrenceIds: occurrences
        .filter((row) => row.blocker === "hand" && policy.eligibleExamIds.includes(row.examId))
        .map((row) => row.occurrenceId),
      matchingBasis: policy.matchingBasis,
      doNotGeneralize: policy.doNotGeneralize,
    };
  });
}

function dimensionCoverage(occurrences, field) {
  const known = occurrences.filter((row) => {
    const value = row.taxonomy[field];
    return value != null && !["unknown", "not_described"].includes(value);
  }).length;
  return { known, unknown: occurrences.length - known, knownRate: pct(known, occurrences.length) };
}

export function buildIllustrationAudit(root = REPO_ROOT) {
  const examManifest = readJson(root, SOURCE.examManifest);
  const examParts = readJson(root, SOURCE.examPartsManifest);
  const atlasRows = SOURCE.atlases.flatMap((rel) => readJsonl(root, rel).map((row) => ({ ...row, _atlas: rel })));
  const itemByFile = new Map(examManifest.items.map((item) => [item.file, item]));
  const targetRows = atlasRows.filter((row) => (row.blockers || []).some((blocker) => TARGET_BLOCKERS.includes(blocker.what)));
  const occurrences = targetRows.flatMap((row) => {
    const item = itemByFile.get(row.file);
    return (row.blockers || [])
      .filter((blocker) => TARGET_BLOCKERS.includes(blocker.what))
      .map((blocker) => buildOccurrence(row, item, blocker));
  }).sort((a, b) => a.examId.localeCompare(b.examId, "en") || a.blocker.localeCompare(b.blocker, "en"));
  const candidates = buildCandidates(occurrences);
  const deferredClusters = buildDeferredClusters(occurrences);
  const speechBubbleRows = atlasRows.filter((row) => (row.blockers || []).some((blocker) => blocker.what === "speech_bubble"));
  const speechBubbleEvidence = {
    blockerMentions: speechBubbleRows.reduce((total, row) => total
      + (row.blockers || []).filter((blocker) => blocker.what === "speech_bubble").length, 0),
    uniqueExamRows: speechBubbleRows.length,
    sourceExamIds: speechBubbleRows.map((row) => normalizeExamId(row.file)),
    sourcePanelRefs: speechBubbleRows.flatMap((row) => {
      const panels = Array.isArray(row.panels) ? row.panels : [];
      const matched = panels.map((panel, index) => ({ panel, index }))
        .filter(({ panel }) => /말풍선|speech[_ -]?bubble/i.test(String(panel.note || "")));
      const selected = matched.length ? matched : panels.map((panel, index) => ({ panel, index }));
      return selected.map(({ panel, index }) => makePanelRef(row, panel, index, matched.length > 0).ref);
    }),
    implementationBoundary: "Blank outline geometry only. Runtime requires speechBubbleEvidence:source|request; text and labels remain separate 5E edits.",
  };
  const byBlocker = Object.fromEntries(TARGET_BLOCKERS.map((blocker) => {
    const rows = occurrences.filter((row) => row.blocker === blocker);
    return [blocker, {
      mentions: rows.length,
      uniqueExamRows: new Set(rows.map((row) => row.examId)).size,
      bySubjectFamily: countBy(rows, (row) => row.subjectFamily),
      bySubjectSubtype: countBy(rows.flatMap((row) => row.subjectSubtypes.map((subtype) => ({ subtype }))), (row) => row.subtype),
      subtype: countBy(rows, (row) => row.taxonomy.subtype),
      pose: countBy(rows, (row) => row.taxonomy.pose),
      orientation: countBy(rows, (row) => row.taxonomy.orientation),
      contact: countBy(rows, (row) => row.taxonomy.contact),
      action: countBy(rows, (row) => row.taxonomy.action),
      metadataCoverage: {
        panelAttribution: {
          known: rows.filter((row) => row.panelAttribution === "resolved_from_panel_note").length,
          unknown: rows.filter((row) => row.panelAttribution !== "resolved_from_panel_note").length,
          knownRate: pct(rows.filter((row) => row.panelAttribution === "resolved_from_panel_note").length, rows.length),
        },
        pose: dimensionCoverage(rows, "pose"),
        orientation: dimensionCoverage(rows, "orientation"),
        contact: dimensionCoverage(rows, "contact"),
        action: dimensionCoverage(rows, "action"),
      },
    }];
  }));
  return {
    schemaVersion: "5e-illustration-asset-candidates@1",
    generatedBy: "scripts/engine-v2/audit-illustration-assets.mjs",
    sourceFingerprint: sourceFingerprint(root),
    scope: {
      examLibraryItems: examManifest.items.length,
      declaredExamLibraryItems: examManifest.count,
      atlasRows: atlasRows.length,
      atlasCoverageOfLibrary: pct(atlasRows.length, examManifest.items.length),
      examItemsWithoutVisualAtlas: examManifest.items.length - atlasRows.length,
      targetUniqueExamRows: targetRows.length,
      targetBlockerMentions: occurrences.length,
      reliableInferenceBoundary: "Visual taxonomy is asserted only for hand-authored atlas notes. The remaining exam manifest rows are inventory/context only, not negative evidence.",
    },
    provenancePolicy: {
      candidateMeaning: "Frequency-backed opportunity, not permission to copy exam pixels and not proof that every occurrence shares identical geometry.",
      sourceRequirements: ["examId", "panelRef", "blocker", "taxonomy evidence status"],
      rasterPolicy: "No raster was generated, copied, modified, or embedded by this audit.",
      unknownPolicy: "Unknown pose/orientation/contact/action remains unknown; rules never fill it from aesthetic expectation.",
    },
    totals: {
      person: byBlocker.person.mentions,
      vehicle: byBlocker.vehicle.mentions,
      hand: byBlocker.hand.mentions,
    },
    byBlocker,
    existingAssets: buildExistingAssets(root, examParts, occurrences),
    supplementalEvidence: { speechBubble: speechBubbleEvidence },
    candidates,
    deferredClusters,
    occurrences,
  };
}

function mdTable(rows, columns) {
  if (!rows.length) return "(없음)";
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row)).replace(/\|/g, "\\|")).join(" | ")} |`);
  return [header, rule, ...body].join("\n");
}

function clusterTable(rows) {
  return mdTable(rows, [
    { label: "cluster", value: (row) => `\`${row.key}\`` },
    { label: "mentions", value: (row) => row.count },
  ]);
}

export function renderMarkdown(audit) {
  const lines = [
    "# 반복 삽화 자산 후보 감사",
    "",
    "> 이 문서는 메타데이터 전용 감사 결과다. 기출 PNG를 복사·수정·생성하지 않았다.",
    "",
    "## 결론",
    "",
    `- 전체 기출 라이브러리: **${audit.scope.examLibraryItems.toLocaleString("ko-KR")}문항**`,
    `- 도식 아틀라스 설명이 있는 문항: **${audit.scope.atlasRows.toLocaleString("ko-KR")}문항 (${audit.scope.atlasCoverageOfLibrary}%)**`,
    `- 시각 메타데이터가 없어 유형을 단정하지 않은 문항: **${audit.scope.examItemsWithoutVisualAtlas.toLocaleString("ko-KR")}문항**`,
    `- blocker 출현: 사람 **${audit.totals.person}**, 차량 **${audit.totals.vehicle}**, 손 **${audit.totals.hand}** (중복 문항 포함 ${audit.scope.targetBlockerMentions}건, 고유 문항 ${audit.scope.targetUniqueExamRows}개)`,
    `- 별도 말풍선 blocker: **${audit.supplementalEvidence.speechBubble.blockerMentions}건**. 코드 자산은 빈 외곽만 제공하고 현재 source/request가 말풍선을 명시할 때만 사용한다.`,
    "",
    "따라서 63/28/19는 전체 3,961문항의 실제 삽화 총량이 아니라 **936개 수동 분석 아틀라스에서 확인된 blocker mention**이다. 나머지 3,025문항을 ‘없음’으로 세지 않는다.",
    "",
    "## 재사용 우선 후보",
    "",
    mdTable(audit.candidates, [
      { label: "candidate", value: (row) => `\`${row.id}\`` },
      { label: "status", value: (row) => row.status },
      { label: "evidence", value: (row) => row.evidenceCount },
      { label: "정확한 사용 범위", value: (row) => row.exactUseCase },
    ]),
    "",
    "후보는 원본 픽셀 재사용 허가가 아니다. 신규 후보는 여러 기출에서 반복된 기능만 추출한 **새 원본 선화/파라메트릭 자산**이다. 라벨과 실험 장치는 별도 객체로 남기며, 빈 말풍선 외곽도 명시적으로 요청된 경우에만 별도 그룹으로 생성한다.",
    "",
    "## 보류한 유사군",
    "",
    mdTable(audit.deferredClusters, [
      { label: "cluster", value: (row) => `\`${row.id}\`` },
      { label: "evidence", value: (row) => row.evidenceCount },
      { label: "보류 이유", value: (row) => row.reason },
    ]),
    "",
    "출현 횟수가 있어도 자세·방향·접촉이 섞였으면 자산 후보로 승격하지 않았다.",
    "",
    "## 기존 손 자산",
    "",
    mdTable(audit.existingAssets, [
      { label: "asset", value: (row) => `\`${row.id}\`` },
      { label: "source", value: (row) => `\`${row.source.examId}\`` },
      { label: "files", value: (row) => row.files.join(", ") },
      { label: "eligible occurrences", value: (row) => row.eligibleOccurrenceIds.length },
      { label: "검수", value: (row) => row.filesPresent ? "파일 존재; 범용성 검수 필요" : "파일 누락" },
    ]),
    "",
    "- `hand_grip`: back/front 분할은 합성에 유용하지만 새 자세를 증명하지 않는다. 작은 원문 표식처럼 보이는 픽셀 가능성을 포함해 문자·기호 오염을 수동 검수해야 한다.",
    "- `hand_press`: 점선 ghost 압축 자세의 정확한 원본 장면에만 대응한다. 실선 손이나 일반 누르기로 변환하지 않는다.",
    "",
  ];
  for (const blocker of TARGET_BLOCKERS) {
    const data = audit.byBlocker[blocker];
    lines.push(
      `## ${blocker} (${data.mentions})`,
      "",
      "### 과목 세부 영역",
      "",
      clusterTable(data.bySubjectSubtype),
      "",
      "과목 세부 영역은 다중 라벨이므로 표 합계가 blocker mention보다 클 수 있다.",
      "",
      "### subtype",
      "",
      clusterTable(data.subtype),
      "",
      "### pose",
      "",
      clusterTable(data.pose),
      "",
      "### orientation",
      "",
      clusterTable(data.orientation),
      "",
      "### contact",
      "",
      clusterTable(data.contact),
      "",
      "### action",
      "",
      clusterTable(data.action),
      "",
      `메타데이터 충족률 — panel ${data.metadataCoverage.panelAttribution.knownRate}%, pose ${data.metadataCoverage.pose.knownRate}%, orientation ${data.metadataCoverage.orientation.knownRate}%, contact ${data.metadataCoverage.contact.knownRate}%, action ${data.metadataCoverage.action.knownRate}%.`,
      "",
    );
  }
  lines.push(
    "## 해석 제한과 다음 단계",
    "",
    "1. 사람 방향은 아틀라스 문장에서 거의 서술되지 않는다. 방향을 임의 추정하지 않았고, 자산 제작 시 좌/우 변형을 별도 승인해야 한다.",
    "2. `flat` 투영은 같은 실루엣이라는 뜻이 아니다. 특히 우주선은 쉘 비율·창·탑승자·내부 실험 장치를 분리한다.",
    "3. 손은 접촉 대상과 선 스타일이 일치할 때만 기존 자산을 매칭한다. 장갑·양손·도구 조작은 별도 계열이다.",
    "4. 전체 라이브러리의 나머지 3,025문항까지 확정하려면 별도의 사람 검수 또는 비전 라벨링 패스가 필요하다. 현재 보고서는 그 부분을 추정하지 않는다.",
    "5. 세부 출처·panel ref·`doNotGeneralize`는 JSON 매니페스트가 정본이다.",
    "",
    `정본: \`${OUTPUT.manifest}\``,
    "",
  );
  return lines.join("\n");
}

export function validateIllustrationAudit(audit, root = REPO_ROOT) {
  const errors = [];
  if (audit.scope.examLibraryItems !== audit.scope.declaredExamLibraryItems) errors.push("exam manifest count mismatch");
  if (audit.scope.examLibraryItems !== 3961) errors.push("unexpected exam library size");
  if (audit.scope.atlasRows !== 936) errors.push("unexpected atlas size");
  if (audit.totals.person !== 63 || audit.totals.vehicle !== 28 || audit.totals.hand !== 19) errors.push("target blocker totals changed");
  if (audit.scope.targetBlockerMentions !== 110) errors.push("target blocker mention total changed");
  if (audit.supplementalEvidence?.speechBubble?.blockerMentions !== 31) errors.push("speech-bubble blocker total changed");
  if (audit.supplementalEvidence?.speechBubble?.uniqueExamRows !== 31) errors.push("speech-bubble row total changed");
  if (!audit.supplementalEvidence?.speechBubble?.sourcePanelRefs?.length) errors.push("speech-bubble evidence lacks panel refs");
  const ids = new Set();
  for (const occurrence of audit.occurrences) {
    if (ids.has(occurrence.occurrenceId)) errors.push(`duplicate occurrence ${occurrence.occurrenceId}`);
    ids.add(occurrence.occurrenceId);
    if (!TARGET_BLOCKERS.includes(occurrence.blocker)) errors.push(`unexpected blocker ${occurrence.blocker}`);
    if (!occurrence.examId || !occurrence.file) errors.push(`missing exam provenance ${occurrence.occurrenceId}`);
    if (!occurrence.panelRefs.length) errors.push(`missing panel refs ${occurrence.occurrenceId}`);
    if (!occurrence.doNotGeneralize.length && occurrence.taxonomy.orientation === "unknown") errors.push(`unknown orientation without guard ${occurrence.occurrenceId}`);
  }
  const candidateIds = new Set(audit.candidates.map((candidate) => candidate.id));
  for (const occurrence of audit.occurrences) {
    for (const id of occurrence.reusableCandidateIds) {
      if (!candidateIds.has(id)) errors.push(`unknown candidate reference ${id}`);
    }
  }
  for (const candidate of audit.candidates) {
    if (!candidate.sourceExamIds.length) errors.push(`candidate has no source exams ${candidate.id}`);
    if (!candidate.sourcePanelRefs.length) errors.push(`candidate has no panel refs ${candidate.id}`);
    if (!candidate.doNotGeneralize.length) errors.push(`candidate has no do-not-generalize guards ${candidate.id}`);
    if (candidate.status.startsWith("implemented_") && !candidate.implementation) errors.push(`implemented candidate lacks implementation ${candidate.id}`);
    for (const occurrenceId of candidate.occurrenceIds) {
      if (!ids.has(occurrenceId)) errors.push(`candidate references missing occurrence ${occurrenceId}`);
    }
  }
  for (const cluster of audit.deferredClusters) {
    if (!cluster.evidenceCount) errors.push(`deferred cluster has no evidence ${cluster.id}`);
    if (!cluster.sourceExamIds.length || !cluster.sourcePanelRefs.length) errors.push(`deferred cluster lacks provenance ${cluster.id}`);
    if (!cluster.reason || !cluster.doNotGeneralize.length) errors.push(`deferred cluster lacks guard ${cluster.id}`);
    for (const occurrenceId of cluster.occurrenceIds) {
      if (!ids.has(occurrenceId)) errors.push(`deferred cluster references missing occurrence ${occurrenceId}`);
    }
  }
  for (const asset of audit.existingAssets) {
    if (!asset.filesPresent) errors.push(`existing asset files missing ${asset.id}`);
    if (!asset.source.examId) errors.push(`existing asset source missing ${asset.id}`);
  }
  const examIds = new Set(readJson(root, SOURCE.examManifest).items.map((item) => item.id));
  for (const occurrence of audit.occurrences) {
    if (!examIds.has(occurrence.examId)) errors.push(`occurrence absent from exam manifest ${occurrence.examId}`);
  }
  return [...new Set(errors)];
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeOutputs(root, audit) {
  fs.mkdirSync(path.dirname(abs(root, OUTPUT.manifest)), { recursive: true });
  fs.writeFileSync(abs(root, OUTPUT.manifest), stableJson(audit), "utf8");
  fs.writeFileSync(abs(root, OUTPUT.report), `${renderMarkdown(audit).trimEnd()}\n`, "utf8");
}

function checkOutputs(root, audit) {
  const errors = validateIllustrationAudit(audit, root);
  const expected = {
    [OUTPUT.manifest]: stableJson(audit),
    [OUTPUT.report]: `${renderMarkdown(audit).trimEnd()}\n`,
  };
  for (const [rel, contents] of Object.entries(expected)) {
    if (!fs.existsSync(abs(root, rel))) errors.push(`generated output missing: ${rel}`);
    else if (readUtf8(root, rel) !== contents) errors.push(`generated output stale: ${rel}`);
  }
  return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const audit = buildIllustrationAudit(REPO_ROOT);
  if (process.argv.includes("--write")) {
    const errors = validateIllustrationAudit(audit, REPO_ROOT);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      writeOutputs(REPO_ROOT, audit);
      console.log(`WROTE ${OUTPUT.manifest} and ${OUTPUT.report}`);
    }
  } else if (process.argv.includes("--check")) {
    const errors = checkOutputs(REPO_ROOT, audit);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log(`PASS: ${audit.scope.examLibraryItems} exams, ${audit.scope.atlasRows} atlas rows, person ${audit.totals.person}, vehicle ${audit.totals.vehicle}, hand ${audit.totals.hand}`);
    }
  } else if (process.argv.includes("--json")) {
    process.stdout.write(stableJson(audit));
  } else {
    process.stdout.write(`${renderMarkdown(audit).trimEnd()}\n`);
  }
}
