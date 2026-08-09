#!/usr/bin/env node

/**
 * 5E Engine V2 exam-library / reusable-motif audit.
 *
 * Read-only by design: this script never generates or changes an image. It reads
 * repository manifests and source files, then prints either a Markdown summary
 * or a JSON document to stdout.
 *
 * Usage:
 *   node scripts/engine-v2/audit-exam-motifs.mjs
 *   node scripts/engine-v2/audit-exam-motifs.mjs --json
 *   node scripts/engine-v2/audit-exam-motifs.mjs --check
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");

const SOURCE = {
  examManifest: "assets/exam-library/manifest.json",
  examImages: "assets/exam-library/images",
  examTagsCsv: "assets/exam-library/tags.csv",
  examTagVocab: "assets/exam-library/tag-vocab.json",
  examSynonyms: "assets/exam-library/synonyms.json",
  partsManifest: "assets/parts-library/manifest.json",
  partsSvg: "assets/parts-library/svg",
  partsApprovedSvg: "assets/parts-library/approved/svg",
  partsHarvest: "assets/parts-library/harvest.json",
  partsKeep: "assets/parts-library/keep.json",
  partsMeta: "assets/parts-library/meta.json",
  examPartsManifest: "assets/exam-parts/manifest.json",
  examPartsDir: "assets/exam-parts",
  templates: "js/templates.js",
  objectTypes: "js/object-types.js",
  mcpServer: "tools/mcp-5e/server.js",
  atlases: [
    "docs/figure-atlas.jsonl",
    "docs/figure-atlas-c.jsonl",
    "docs/figure-atlas-b.jsonl",
    "docs/figure-atlas-e.jsonl",
  ],
  evalLog: "docs/training/EVAL_REPRODUCTION_LOG.md",
  imageReproLog: "docs/training/IMAGE_REPRODUCTION_LOG.md",
  trainingDir: "docs/training",
};

const SUBJECT = {
  p: { id: "physics", label: "물리", codes: ["p1", "p2"] },
  c: { id: "chemistry", label: "화학", codes: ["c1", "c2"] },
  b: { id: "biology", label: "생명과학", codes: ["b1", "b2"] },
  e: { id: "earth", label: "지구과학", codes: ["e1", "e2"] },
};

const ELEMENT_BUCKETS = ["skeleton", "zone", "object", "link", "aux", "annot"];

/**
 * Historical atlas blocker ids that have since gained an explicit implementation.
 * This is intentionally conservative. Every alias has a source file and a literal
 * needle so the audit can fail when the claimed implementation disappears.
 *
 * Exact blocker ids matching a current template/object id do not need an alias.
 */
export const IMPLEMENTED_ALIASES = {
  dim_group: {
    via: "MCP add_dimension",
    evidence: ["tools/mcp-5e/server.js", "add_dimension"],
  },
  rig_attach: {
    via: "MCP add_stand_rig",
    evidence: ["tools/mcp-5e/server.js", "add_stand_rig"],
  },
  stand_assembly: {
    via: "MCP add_stand_rig",
    evidence: ["tools/mcp-5e/server.js", "add_stand_rig"],
  },
  leader_group: {
    via: "labeler elbow",
    evidence: ["js/render/annotations.js", "obj.elbow"],
  },
  vessel_content: {
    via: "vessel renderer",
    evidence: ["js/render/vessel.js", "vessel_content"],
  },
  syringe_piston: {
    via: "vessel_piston template",
    evidence: ["js/templates.js", "vessel_piston"],
  },
  piston_cylinder: {
    via: "vessel_piston template",
    evidence: ["js/templates.js", "vessel_piston"],
  },
  glassware: {
    via: "vessel template family",
    evidence: ["js/render/vessel.js", "glassware"],
  },
  stopcock: {
    via: "vessel stopcock parameter",
    evidence: ["js/render/vessel.js", "stopcockAt"],
  },
  atom_sphere: {
    via: "chem_atom template",
    evidence: ["js/templates.js", "chem_atom"],
  },
  shell_model: {
    via: "chem_shell template",
    evidence: ["js/templates.js", "chem_shell"],
  },
  crystal_lattice: {
    via: "chem_lattice template",
    evidence: ["js/templates.js", "chem_lattice"],
  },
  molecule_geom: {
    via: "chem_molecule template",
    evidence: ["js/templates.js", "chem_molecule"],
  },
  lewis_dots: {
    via: "chem_lewis template",
    evidence: ["js/templates.js", "chem_lewis"],
  },
  bond_multi: {
    via: "bondgroup template",
    evidence: ["js/templates.js", "bondgroup"],
  },
  bar_chart: {
    via: "chart_bar template",
    evidence: ["js/templates.js", "chart_bar"],
  },
  pie_sector: {
    via: "chart_pie template",
    evidence: ["js/templates.js", "chart_pie"],
  },
  axis_break: {
    via: "axisbreak template",
    evidence: ["js/templates.js", "axisbreak"],
  },
  phospholipid_bilayer: {
    via: "bilayer template",
    evidence: ["js/templates.js", "bilayer"],
  },
  membrane_bilayer: {
    via: "bilayer template",
    evidence: ["js/templates.js", "bilayer"],
  },
  lipid_bilayer: {
    via: "bilayer template",
    evidence: ["js/templates.js", "bilayer"],
  },
  legend_block: {
    via: "legend template",
    evidence: ["js/templates.js", "legend"],
  },
  scale_bar: {
    via: "scalebar template",
    evidence: ["js/templates.js", "scalebar"],
  },
  unconformity_wave: {
    via: "unconformity template",
    evidence: ["js/templates.js", "unconformity"],
  },
  weather_front: {
    via: "front template family",
    evidence: ["js/templates.js", "front_cold"],
  },
  double_slit: {
    via: "slit template with slits=2",
    evidence: ["js/render/optics-apparatus.js", "obj.slits"],
  },
  power_supply: {
    via: "device_box template",
    evidence: ["js/templates.js", "device_box"],
  },
  power_supply_box: {
    via: "device_box template",
    evidence: ["js/templates.js", "device_box"],
  },
  led_lamp: {
    via: "led/lamp templates",
    evidence: ["js/templates.js", "led:"],
  },
  dashdot_line: {
    via: "line dashPattern",
    evidence: ["js/inspector/section-line.js", "dashPattern"],
  },
  line_dashdot: {
    via: "line dashPattern",
    evidence: ["js/inspector/section-line.js", "dashPattern"],
  },
  point_scatter: {
    via: "scatter template",
    evidence: ["js/templates.js", "scatter:"],
  },
  scatter_cloud: {
    via: "scatter template",
    evidence: ["js/templates.js", "scatter:"],
  },
  gas_particles: {
    via: "particlebox template",
    evidence: ["js/templates.js", "particlebox"],
  },
  panel_flow: {
    via: "audited code-native panel_flow motif",
    evidence: ["js/ai-motif-catalog.js", "panel_flow"],
  },
  dual_axis: {
    via: "audited code-native dual_axis_plot motif",
    evidence: ["js/ai-motif-catalog.js", "dual_axis_plot"],
  },
  dual_y_axis: {
    via: "audited code-native dual_axis_plot motif",
    evidence: ["js/ai-motif-catalog.js", "dual_axis_plot"],
  },
  diagonal_wiring: {
    via: "audited code-native diagonal_wiring motif",
    evidence: ["js/ai-motif-catalog.js", "diagonal_wiring"],
  },
  contour_set: {
    via: "audited code-native contour_bundle motif",
    evidence: ["js/ai-motif-catalog.js", "contour_bundle"],
  },
  speech_bubble: {
    via: "evidence-gated blank speech-bubble vector asset",
    evidence: ["js/ai-illustration-assets.js", "blankSpeechBubbleAuditEvidence"],
  },
  map_outline: {
    via: "verified Natural Earth physical coastline asset",
    evidence: ["js/ai-map-assets.js", "VERIFIED_MAP_VARIANT_IDS"],
  },
  coastline_map: {
    via: "verified Natural Earth physical coastline asset",
    evidence: ["js/ai-map-assets.js", "VERIFIED_MAP_VARIANT_IDS"],
  },
  base_map: {
    via: "verified Natural Earth physical coastline asset",
    evidence: ["js/ai-map-assets.js", "VERIFIED_MAP_VARIANT_IDS"],
  },
};

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const [rawHeader = [], ...body] = rows;
  const header = rawHeader.map((key, index) => index === 0 ? key.replace(/^\uFEFF/, "") : key);
  return body
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] || ""])));
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function countBy(items, keyFn = (value) => value) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

function pct(value, total, digits = 1) {
  return total ? Number(((value * 100) / total).toFixed(digits)) : 0;
}

function broadSubject(code) {
  return SUBJECT[String(code || "")[0]] || { id: "unknown", label: "미상", codes: [] };
}

function inspectPng(file, withHash) {
  const data = fs.readFileSync(file);
  const signature = data.length >= 24 && data.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const width = signature ? data.readUInt32BE(16) : 0;
  const height = signature ? data.readUInt32BE(20) : 0;
  return {
    bytes: data.length,
    valid: signature && width > 0 && height > 0,
    width,
    height,
    hash: withHash ? crypto.createHash("sha256").update(data).digest("hex") : null,
  };
}

function parseTemplateRegistry(source) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes("export const TEMPLATES = {"));
  if (start < 0) throw new Error("TEMPLATES registry not found");
  let end = -1;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index] === "};") {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error("TEMPLATES registry closing brace not found");

  const starts = [];
  for (let index = start + 1; index < end; index += 1) {
    const match = /^  ([A-Za-z_][A-Za-z0-9_]*):/.exec(lines[index]);
    if (match) starts.push({ id: match[1], index });
  }
  return starts.map((entry, position) => {
    const next = starts[position + 1]?.index ?? end;
    const block = lines.slice(entry.index, next).join("\n");
    return {
      id: entry.id,
      category: /category:\s*"([^"]+)"/.exec(block)?.[1] || "미분류",
      label: /label:\s*"([^"]+)"/.exec(block)?.[1] || entry.id,
      hidden: /hidden:\s*true/.test(block),
    };
  });
}

function parseObjectTypeIds(source) {
  const match = /export const OBJECT_TYPE_IDS\s*=\s*\[([\s\S]*?)\];/.exec(source);
  if (!match) throw new Error("OBJECT_TYPE_IDS registry not found");
  return [...match[1].matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((item) => item[1]);
}

function parseMcpToolNames(source) {
  return [...source.matchAll(/\bname:\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)]
    .map((match) => match[1])
    .filter((name, index, all) => all.indexOf(name) === index);
}

function trainingInventory(root) {
  const all = listFilesRecursive(abs(root, SOURCE.trainingDir));
  const byExtension = countBy(all, (file) => path.extname(file).toLowerCase() || "(none)");
  const byArea = countBy(all, (file) => {
    const rel = path.relative(abs(root, SOURCE.trainingDir), file).replaceAll("\\", "/");
    if (rel.startsWith("image-reproduction/reference-prep/")) return "image-reproduction/reference-prep";
    if (rel.startsWith("image-reproduction/candidates/")) return "image-reproduction/candidates";
    if (rel.startsWith("image-reproduction/")) return "image-reproduction";
    return "eval-reproduction";
  });

  const parseRows = (rel) => {
    const rows = [];
    for (const line of readUtf8(root, rel).split(/\r?\n/)) {
      if (!/^\|\s*\d{3}\s*\|/.test(line)) continue;
      const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
      const scoreCell = cells.find((cell) => /^\d+%$/.test(cell));
      const verdict = cells.find((cell) => cell === "통과" || cell === "실패");
      if (!scoreCell || !verdict) continue;
      rows.push({ id: cells[0], score: Number(scoreCell.slice(0, -1)), verdict });
    }
    return rows;
  };

  const evalRows = parseRows(SOURCE.evalLog);
  const evalLog = readUtf8(root, SOURCE.evalLog);
  const firstEvalScore = Number(/구조 일치율:\s*(\d+)%/.exec(evalLog)?.[1] || 0);
  const evalAll = firstEvalScore
    ? [{ id: "001", score: firstEvalScore, verdict: "통과" }, ...evalRows]
    : evalRows;
  const directRows = parseRows(SOURCE.imageReproLog);

  const scoreSummary = (rows) => ({
    cases: rows.length,
    pass: rows.filter((row) => row.verdict === "통과").length,
    fail: rows.filter((row) => row.verdict === "실패").length,
    passRate: pct(rows.filter((row) => row.verdict === "통과").length, rows.length),
    meanScore: rows.length
      ? Number((rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(2))
      : 0,
  });

  return {
    totalFiles: all.length,
    byExtension,
    byArea,
    evalReproduction: scoreSummary(evalAll),
    imageReproduction: scoreSummary(directRows),
  };
}

function panelSignature(panel) {
  const components = ELEMENT_BUCKETS.flatMap((bucket) =>
    (panel.elements?.[bucket] || [])
      .filter((value) => !String(value).startsWith("label_"))
      .map((value) => `${bucket}:${value}`),
  ).sort();
  return `${panel.kind}|${components.join(",")}`;
}

function partsCandidateMatches(parts, blockerId) {
  const wanted = blockerId.toLowerCase().split("_").filter(Boolean);
  if (!wanted.length) return [];
  return parts.filter((item) => {
    const hay = [item.id, item.name, item.file, ...(item.keywords || [])]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter(Boolean);
    const tokens = new Set(hay);
    return wanted.every((token) => tokens.has(token));
  });
}

export function auditRepository(root = REPO_ROOT, options = {}) {
  const withHashes = options.hashImages !== false;
  const examManifest = readJson(root, SOURCE.examManifest);
  const examTagsCsv = parseCsv(readUtf8(root, SOURCE.examTagsCsv));
  const examTagVocab = readJson(root, SOURCE.examTagVocab);
  const examSynonyms = readJson(root, SOURCE.examSynonyms);
  const partsManifest = readJson(root, SOURCE.partsManifest);
  const partsHarvest = readJson(root, SOURCE.partsHarvest);
  const partsKeep = readJson(root, SOURCE.partsKeep);
  const partsMeta = readJson(root, SOURCE.partsMeta);
  const examPartsManifest = readJson(root, SOURCE.examPartsManifest);
  const templates = parseTemplateRegistry(readUtf8(root, SOURCE.templates));
  const objectTypeIds = parseObjectTypeIds(readUtf8(root, SOURCE.objectTypes));
  const mcpToolNames = parseMcpToolNames(readUtf8(root, SOURCE.mcpServer));
  const atlasRows = SOURCE.atlases.flatMap((rel) =>
    readJsonl(root, rel).map((row) => ({ ...row, _atlas: rel })),
  );

  const imageDir = abs(root, SOURCE.examImages);
  const diskPngs = listFilesRecursive(imageDir).filter((file) => path.extname(file).toLowerCase() === ".png");
  const diskByName = new Map(diskPngs.map((file) => [path.basename(file), file]));
  const manifestNames = new Set(examManifest.items.map((item) => item.file));
  const integrity = [];
  for (const item of examManifest.items) {
    const file = diskByName.get(item.file);
    integrity.push(file
      ? { file: item.file, missing: false, ...inspectPng(file, withHashes) }
      : { file: item.file, missing: true, bytes: 0, valid: false, width: 0, height: 0, hash: null });
  }
  const duplicateGroups = withHashes
    ? countBy(integrity.filter((item) => item.hash), (item) => item.hash).filter((item) => item.count > 1)
    : [];

  const subjectCounts = countBy(examManifest.items, (item) => item.subject);
  const broadSubjectCounts = countBy(examManifest.items, (item) => broadSubject(item.subject).label);
  const tags = examManifest.items.flatMap((item) => item.tags || []);
  const parts = examManifest.items.flatMap((item) => item.parts || []);
  const taggedItems = examManifest.items.filter((item) => item.tags?.length).length;
  const manifestIds = examManifest.items.map((item) => item.id);
  const manifestFiles = examManifest.items.map((item) => item.file);
  const duplicateManifestIds = countBy(manifestIds).filter((item) => item.count > 1);
  const duplicateManifestFiles = countBy(manifestFiles).filter((item) => item.count > 1);
  const csvIds = new Set(examTagsCsv.map((item) => item.id));
  const vocabTags = new Set((examTagVocab.categories || []).flatMap((category) => category.tags || []));
  const vocabParts = new Set(examTagVocab.parts || []);
  const unknownTags = [...new Set(tags)].filter((tag) => !vocabTags.has(tag)).sort();
  const unknownParts = [...new Set(parts)].filter((part) => !vocabParts.has(part)).sort();
  const synonymKeys = new Set(Object.keys(examSynonyms.map || {}));
  const topTagsBySubject = {};
  for (const subject of Object.values(SUBJECT)) {
    const rows = examManifest.items.filter((item) => subject.codes.includes(item.subject));
    topTagsBySubject[subject.label] = countBy(rows.flatMap((item) => item.tags || [])).slice(0, 15);
  }

  const atlasManifestNames = new Set(atlasRows.map((row) => row.file));
  const blockers = atlasRows.flatMap((row) =>
    (row.blockers || []).map((blocker) => ({
      ...blocker,
      file: row.file,
      subject: broadSubject(row.subject).label,
    })),
  );
  const templateIds = new Set(templates.map((item) => item.id));
  const objectIds = new Set(objectTypeIds);
  const exactCapabilities = new Set([...templateIds, ...objectIds]);
  const aliasEvidenceMissing = [];
  for (const [blocker, alias] of Object.entries(IMPLEMENTED_ALIASES)) {
    const [rel, needle] = alias.evidence;
    const full = abs(root, rel);
    if (!fs.existsSync(full) || !fs.readFileSync(full, "utf8").includes(needle)) {
      aliasEvidenceMissing.push({ blocker, rel, needle });
    }
  }
  const isCovered = (blocker) => exactCapabilities.has(blocker.what)
    || Object.hasOwn(IMPLEMENTED_ALIASES, blocker.what);
  const coveredBlockers = blockers.filter(isCovered);
  const unresolvedBlockers = blockers.filter((blocker) => !isCovered(blocker));
  const potentiallyUnblockedRows = atlasRows.filter((row) =>
    (row.blockers || []).every((blocker) => isCovered(blocker)),
  );

  const atlasBySubject = {};
  for (const subject of Object.values(SUBJECT)) {
    const rows = atlasRows.filter((row) => subject.codes.includes(row.subject));
    const candidates = rows.filter((row) =>
      (row.blockers || []).every((blocker) => isCovered(blocker)),
    );
    atlasBySubject[subject.label] = {
      rows: rows.length,
      baselineRepro: countBy(rows, (row) => row.repro),
      potentiallyUnblocked: candidates.length,
      potentiallyUnblockedRate: pct(candidates.length, rows.length),
      newlyPotentiallyUnblocked: candidates.filter((row) => row.repro !== "full").length,
    };
  }

  const panelRows = atlasRows.flatMap((row) =>
    (row.panels || []).map((panel) => ({ ...panel, file: row.file, subject: row.subject })),
  );
  const elementCounts = Object.fromEntries(ELEMENT_BUCKETS.map((bucket) => [
    bucket,
    countBy(panelRows.flatMap((panel) => panel.elements?.[bucket] || [])).slice(0, 30),
  ]));
  const repeatedPanelSignatures = countBy(panelRows, panelSignature)
    .filter((entry) => entry.count >= 3)
    .slice(0, 30);

  const unresolvedKinds = countBy(unresolvedBlockers, (blocker) => blocker.what).map((entry) => {
    const rows = unresolvedBlockers.filter((blocker) => blocker.what === entry.key);
    const candidates = partsCandidateMatches(partsManifest.items, entry.key);
    return {
      id: entry.key,
      count: entry.count,
      types: countBy(rows, (row) => row.type),
      subjects: countBy(rows, (row) => row.subject),
      samples: [...new Set(rows.map((row) => row.file))].slice(0, 5),
      partsLibraryExactTokenCandidates: candidates.slice(0, 5).map((item) => item.id),
      partsLibraryExactTokenCandidateCount: candidates.length,
    };
  });

  const partsSvg = listFilesRecursive(abs(root, SOURCE.partsSvg)).filter((file) => path.extname(file) === ".svg");
  const partsApprovedSvg = listFilesRecursive(abs(root, SOURCE.partsApprovedSvg)).filter((file) => path.extname(file) === ".svg");
  const partsManifestMissing = partsManifest.items.filter((item) =>
    !fs.existsSync(path.join(abs(root, SOURCE.partsSvg), item.file)),
  );
  const examPartsMissing = [];
  for (const item of examPartsManifest) {
    for (const file of Object.values(item.files || {})) {
      if (!fs.existsSync(path.join(abs(root, SOURCE.examPartsDir), file))) {
        examPartsMissing.push({ id: item.id, file });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    root,
    sources: SOURCE,
    examLibrary: {
      manifestVersion: examManifest.version,
      declaredCount: examManifest.count,
      manifestItems: examManifest.items.length,
      diskPngs: diskPngs.length,
      missingManifestImages: integrity.filter((item) => item.missing).length,
      invalidPngs: integrity.filter((item) => !item.missing && !item.valid).length,
      orphanPngs: diskPngs.filter((file) => !manifestNames.has(path.basename(file))).length,
      duplicateBinaryGroups: duplicateGroups.length,
      duplicateBinaryFiles: duplicateGroups.reduce((sum, group) => sum + group.count, 0),
      duplicateManifestIds: duplicateManifestIds.length,
      duplicateManifestFiles: duplicateManifestFiles.length,
      totalBytes: integrity.reduce((sum, item) => sum + item.bytes, 0),
      subjectCounts,
      broadSubjectCounts,
      taggedItems,
      taggedRate: pct(taggedItems, examManifest.items.length),
      untaggedItems: examManifest.items.length - taggedItems,
      uniqueTags: new Set(tags).size,
      tagMentions: tags.length,
      topTags: countBy(tags).slice(0, 30),
      topTagsBySubject,
      uniqueParts: new Set(parts).size,
      partMentions: parts.length,
      topParts: countBy(parts),
      tagsCsvRows: examTagsCsv.length,
      tagsCsvIdsMissingFromManifest: examTagsCsv.filter((item) => !manifestIds.includes(item.id)).length,
      manifestIdsMissingFromTagsCsv: manifestIds.filter((id) => !csvIds.has(id)).length,
      vocabTagCount: vocabTags.size,
      vocabPartCount: vocabParts.size,
      unknownTags,
      unknownParts,
      tagsWithoutSynonyms: [...new Set(tags)].filter((tag) => !synonymKeys.has(tag)).sort(),
      partsWithoutSynonyms: [...new Set(parts)].filter((part) => !synonymKeys.has(part)).sort(),
    },
    atlas: {
      rows: atlasRows.length,
      uniqueFiles: atlasManifestNames.size,
      missingFromExamManifest: atlasRows.filter((row) => !manifestNames.has(row.file)).length,
      analyzedRateOfLibrary: pct(atlasRows.length, examManifest.items.length),
      panelCount: panelRows.length,
      panelKinds: countBy(panelRows, (panel) => panel.kind),
      baselineRepro: countBy(atlasRows, (row) => row.repro),
      blockers: blockers.length,
      blockerTypes: countBy(blockers, (blocker) => blocker.type),
      topBlockers: countBy(blockers, (blocker) => blocker.what).slice(0, 50),
      elementCounts,
      repeatedPanelSignatures,
      bySubject: atlasBySubject,
    },
    currentCoverage: {
      templates: templates.length,
      templateCategories: countBy(templates, (template) => template.category),
      hiddenTemplates: templates.filter((template) => template.hidden).length,
      objectTypes: objectTypeIds.length,
      mcpTools: mcpToolNames.length,
      implementedAliasCount: Object.keys(IMPLEMENTED_ALIASES).length,
      aliasEvidenceMissing,
      blockerMentionsCovered: coveredBlockers.length,
      blockerMentionCoverageRate: pct(coveredBlockers.length, blockers.length),
      blockerMentionsUnresolved: unresolvedBlockers.length,
      potentiallyUnblockedRows: potentiallyUnblockedRows.length,
      potentiallyUnblockedRate: pct(potentiallyUnblockedRows.length, atlasRows.length),
      newlyPotentiallyUnblockedRows: potentiallyUnblockedRows.filter((row) => row.repro !== "full").length,
      unresolvedKinds,
    },
    reusableAssets: {
      partsManifestItems: partsManifest.items.length,
      partsManifestSubjects: countBy(partsManifest.items, (item) => item.subject),
      partsManifestParts: countBy(partsManifest.items, (item) => item.part),
      partsManifestMissingFiles: partsManifestMissing.length,
      rawSvgFiles: partsSvg.length,
      approvedSvgFiles: partsApprovedSvg.length,
      harvestRecords: partsHarvest.length,
      keepRecords: partsKeep.length,
      metadataOverrides: partsMeta.length,
      examPartEntries: examPartsManifest.length,
      examPartFiles: examPartsManifest.reduce((sum, item) => sum + Object.keys(item.files || {}).length, 0),
      examPartMissingFiles: examPartsMissing.length,
    },
    training: trainingInventory(root),
  };
}

function mdCountRows(rows, limit = rows.length) {
  return rows.slice(0, limit).map((row) => `| ${row.key} | ${row.count.toLocaleString("ko-KR")} |`).join("\n");
}

export function renderMarkdown(audit) {
  const exam = audit.examLibrary;
  const atlas = audit.atlas;
  const coverage = audit.currentCoverage;
  const lines = [
    "# Engine V2 기출 도식 모티프 자동 집계",
    "",
    `생성 시각: ${audit.generatedAt}`,
    "",
    "## 핵심 수치",
    "",
    "| 항목 | 수치 |",
    "|---|---:|",
    `| 기출 매니페스트 | ${exam.manifestItems.toLocaleString("ko-KR")} |`,
    `| 실제 PNG | ${exam.diskPngs.toLocaleString("ko-KR")} |`,
    `| 태그 분석 가능 | ${exam.taggedItems.toLocaleString("ko-KR")} (${exam.taggedRate}%) |`,
    `| 부품 아틀라스 분석 가능 | ${atlas.rows.toLocaleString("ko-KR")} (${atlas.analyzedRateOfLibrary}%) |`,
    `| 현재 템플릿 / 객체 타입 | ${coverage.templates} / ${coverage.objectTypes} |`,
    `| 과거 blocker 중 현재 구현으로 커버 | ${coverage.blockerMentionsCovered.toLocaleString("ko-KR")} / ${atlas.blockers.toLocaleString("ko-KR")} (${coverage.blockerMentionCoverageRate}%) |`,
    `| 현재 구현만으로 blocker가 모두 사라질 후보 | ${coverage.potentiallyUnblockedRows.toLocaleString("ko-KR")} / ${atlas.rows.toLocaleString("ko-KR")} (${coverage.potentiallyUnblockedRate}%) |`,
    "",
    "## 과목별 기출 수",
    "",
    "| 과목 | 수 |",
    "|---|---:|",
    mdCountRows(exam.broadSubjectCounts),
    "",
    "## 상위 개념 태그",
    "",
    "| 태그 | 출현 |",
    "|---|---:|",
    mdCountRows(exam.topTags, 20),
    "",
    "## 상위 반복 패널 모티프",
    "",
    "| 패널 서명 | 출현 |",
    "|---|---:|",
    mdCountRows(atlas.repeatedPanelSignatures, 15),
    "",
    "## 현재 미해결 blocker",
    "",
    "| blocker | 출현 | 과목 | 기존 SVG 후보 |",
    "|---|---:|---|---:|",
    ...coverage.unresolvedKinds.slice(0, 30).map((row) =>
      `| ${row.id} | ${row.count} | ${row.subjects.map((item) => `${item.key} ${item.count}`).join(", ")} | ${row.partsLibraryExactTokenCandidateCount} |`,
    ),
    "",
    "## 무결성",
    "",
    `- 누락 기출 PNG: ${exam.missingManifestImages}`,
    `- 잘못된 PNG 헤더/크기: ${exam.invalidPngs}`,
    `- 매니페스트 밖 PNG: ${exam.orphanPngs}`,
    `- 중복 기출 id / 파일명: ${exam.duplicateManifestIds} / ${exam.duplicateManifestFiles}`,
    `- 태그 CSV 누락/초과 id: ${exam.manifestIdsMissingFromTagsCsv} / ${exam.tagsCsvIdsMissingFromManifest}`,
    `- 통제 어휘 밖 태그/단원: ${exam.unknownTags.length} / ${exam.unknownParts.length}`,
    `- 부품 매니페스트 누락 SVG: ${audit.reusableAssets.partsManifestMissingFiles}`,
    `- 기출 크롭 부품 누락 파일: ${audit.reusableAssets.examPartMissingFiles}`,
    `- 구현 별칭 증거 누락: ${coverage.aliasEvidenceMissing.length}`,
  ];
  return lines.join("\n");
}

export function checkAudit(audit) {
  const errors = [];
  const exam = audit.examLibrary;
  if (exam.declaredCount !== exam.manifestItems) errors.push("exam manifest count does not match items.length");
  if (exam.manifestItems !== exam.diskPngs) errors.push("exam manifest item count does not match PNG count");
  if (exam.missingManifestImages) errors.push(`${exam.missingManifestImages} exam images are missing`);
  if (exam.invalidPngs) errors.push(`${exam.invalidPngs} exam images have invalid PNG headers/dimensions`);
  if (exam.orphanPngs) errors.push(`${exam.orphanPngs} exam PNG files are absent from the manifest`);
  if (exam.duplicateManifestIds) errors.push("exam manifest contains duplicate ids");
  if (exam.duplicateManifestFiles) errors.push("exam manifest contains duplicate filenames");
  if (exam.tagsCsvRows !== exam.manifestItems) errors.push("tags.csv row count does not match exam manifest");
  if (exam.tagsCsvIdsMissingFromManifest || exam.manifestIdsMissingFromTagsCsv) errors.push("tags.csv ids do not match exam manifest ids");
  if (exam.unknownTags.length || exam.unknownParts.length) errors.push("manifest uses tags/parts outside tag-vocab.json");
  if (audit.atlas.rows !== audit.atlas.uniqueFiles) errors.push("atlas file ids are not unique");
  if (audit.atlas.missingFromExamManifest) errors.push(`${audit.atlas.missingFromExamManifest} atlas rows are absent from the exam manifest`);
  if (audit.reusableAssets.partsManifestMissingFiles) errors.push("parts manifest references missing SVG files");
  if (audit.reusableAssets.examPartMissingFiles) errors.push("exam-parts manifest references missing files");
  if (audit.currentCoverage.aliasEvidenceMissing.length) errors.push("implemented blocker alias lost its code evidence");
  if (audit.currentCoverage.templates < 100) errors.push("template registry unexpectedly fell below 100 entries");
  if (audit.currentCoverage.objectTypes < 40) errors.push("object type registry unexpectedly fell below 40 entries");
  return errors;
}

function usage() {
  return [
    "Usage: node scripts/engine-v2/audit-exam-motifs.mjs [--json] [--check] [--no-hash]",
    "  --json     print the complete machine-readable audit",
    "  --check    validate repository invariants and exit non-zero on failure",
    "  --no-hash  skip SHA-256 duplicate detection for a quicker local run",
  ].join("\n");
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const audit = auditRepository(REPO_ROOT, { hashImages: !argv.includes("--no-hash") });
  if (argv.includes("--check")) {
    const errors = checkAudit(audit);
    if (errors.length) {
      process.stderr.write(`${errors.map((error) => `FAIL: ${error}`).join("\n")}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `PASS: ${audit.examLibrary.manifestItems} exam PNGs, ${audit.atlas.rows} atlas rows, `
      + `${audit.currentCoverage.templates} templates, ${audit.currentCoverage.objectTypes} object types\n`,
    );
    return;
  }
  process.stdout.write(argv.includes("--json")
    ? `${JSON.stringify(audit, null, 2)}\n`
    : `${renderMarkdown(audit)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
