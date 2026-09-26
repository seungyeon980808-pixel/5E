import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "preview/js");
const evidenceDir = process.env.GRAPH_EVIDENCE_DIR || null;

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName;
    this.attrs = {};
    this.children = [];
    this.dataset = {};
    this.textContent = "";
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(tagName) {
    return this.children.find((child) => child.tagName === tagName)
      || this.children.map((child) => child.querySelector?.(tagName)).find(Boolean)
      || null;
  }
  get outerHTML() {
    const attrs = Object.entries(this.attrs).map(([name, value]) => ` ${name}="${value}"`).join("");
    return `<${this.tagName}${attrs}>${this.textContent}${this.children.map((child) => child.outerHTML || "").join("")}</${this.tagName}>`;
  }
}

const document = { createElementNS: (_, tagName) => new ElementStub(tagName) };
const readSource = (file) => fs.readFileSync(path.join(sourceRoot, file), "utf8");

function loadModule(file, names, dependencies = {}) {
  const source = readSource(file)
    .replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm, "")
    .replace(/^export\s*\{[\s\S]*?\};?\s*/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function|const|let)/g, "");
  const context = vm.createContext({ document, console, ...dependencies });
  vm.runInContext(`${source}\nglobalThis.__exports = { ${names.join(",")} };`, context, {
    filename: path.join(sourceRoot, file),
    timeout: 2_000,
  });
  return { ...context.__exports, context };
}

const parser = loadModule("function-graph/parser.js", ["compile"]);
const coords = loadModule("function-graph/coords.js", ["worldXFromMathX", "worldYFromMathY", "mathFromWorld"]);
const geometry = loadModule("geometry.js", ["simplifyRDP"]);
const sampler = loadModule("function-graph/sampler.js", ["sampleFunctionPoints"], { ...parser, ...coords, ...geometry });
const core = loadModule("render/core.js", ["SVG_NS", "grayHex", "applyDash", "catmullRomPath", "catmullRomClosedPath", "roundedPolylinePath"], {
  fillSvgTextWithRomanRuns: () => {},
});
const render = loadModule("render/coordplane.js", ["renderFuncgraph"], {
  ...core,
  ...coords,
  resolveFill: () => "none",
  makeFillPattern: () => null,
  renderGraphLabel: () => null,
});

const plane = { x: 0, y: 0, w: 100, h: 100, xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
const checks = [];
const check = (id, pass, details) => checks.push({ id, pass, details });

const expPlane = { ...plane, xMin: 0, xMax: 5, yMin: 0, yMax: 150 };
const expSample = sampler.sampleFunctionPoints("exp(x)", 0, 5, expPlane);
const expNode = render.renderFuncgraph({
  type: "funcgraph",
  points: expSample.points,
  breaks: expSample.breaks,
  domainMin: 0,
  domainMax: 5,
  strokeLevel: 0,
  strokeWidth: 0.4,
  area: { from: 0, to: 1, baseY: 100 },
});
const expEdges = expNode.children.filter((child) => child.tagName === "line");
const expRight = Number(expEdges.at(-1)?.getAttribute("x1"));
check("GEO160-003-exp-boundary", Math.abs(expRight - 20) <= 0.02, { expectedWorldX: 20, actualWorldX: expRight });

const offsetNode = render.renderFuncgraph({
  type: "funcgraph",
  points: expSample.points.map((point) => ({ x: point.x + 10, y: point.y })),
  breaks: expSample.breaks,
  domainMin: 0,
  domainMax: 5,
  strokeLevel: 0,
  strokeWidth: 0.4,
  area: { from: 0, to: 1, worldFrom: 10, worldTo: 30, baseY: 100 },
});
const offsetEdges = offsetNode.children.filter((child) => child.tagName === "line").map((child) => Number(child.getAttribute("x1")));
check("GEO160-003-offset-boundary", Math.abs(offsetEdges[0] - 10) <= 0.02 && Math.abs(offsetEdges[1] - 30) <= 0.02, {
  expectedWorldX: [10, 30],
  actualWorldX: offsetEdges,
});

const reciprocal = sampler.sampleFunctionPoints("1/x", -5, 5, plane);
const reciprocalNode = render.renderFuncgraph({
  type: "funcgraph",
  points: reciprocal.points,
  breaks: reciprocal.breaks,
  strokeLevel: 0,
  strokeWidth: 0.4,
  area: { baseY: 50 },
});
const reciprocalPaths = reciprocalNode.children.filter((child) => child.tagName === "path");
const fillMoves = (reciprocalPaths[0]?.getAttribute("d").match(/M /g) || []).length;
check("GEO160-003-reciprocal-fill-runs", fillMoves >= 2, { breaks: reciprocal.breaks, fillMoves });

for (const expr of ["sign(x)", "floor(x)", "ceil(x)", "round(x)"]) {
  const sampled = sampler.sampleFunctionPoints(expr, -5, 5, plane);
  check(`GEO160-005-${expr}`, sampled.breaks.length > 0, {
    points: sampled.points.length,
    breaks: sampled.breaks.length,
    error: sampled.error,
  });
}

const steepPlane = { ...plane, xMin: -0.5, xMax: 0.5, yMin: -50, yMax: 50 };
const steep = sampler.sampleFunctionPoints("100*x", -0.5, 0.5, steepPlane);
check("GEO160-005-steep-continuous", steep.error === null && steep.breaks.length === 0, {
  points: steep.points.length,
  breaks: steep.breaks.length,
  error: steep.error,
});

const aliasPlane = { ...plane, xMin: -1, xMax: 1, yMin: -2, yMax: 2 };
const alias = sampler.sampleFunctionPoints("sin(1600*pi*x)", -1, 1, aliasPlane);
const aliasMathY = alias.points.map((point) => coords.mathFromWorld(aliasPlane, point.x, point.y).y);
const aliasRange = aliasMathY.length ? Math.max(...aliasMathY) - Math.min(...aliasMathY) : 0;
check("GEO160-006-no-false-flat", Boolean(alias.error) || aliasRange > 0.5, {
  points: alias.points.length,
  error: alias.error,
  mathYRange: aliasRange,
});

for (const expr of ["sin(1599*pi*x)", "sin(1601*pi*x)"]) {
  const sampled = sampler.sampleFunctionPoints(expr, -1, 1, aliasPlane);
  const ys = sampled.points.map((point) => coords.mathFromWorld(aliasPlane, point.x, point.y).y);
  const range = ys.length ? Math.max(...ys) - Math.min(...ys) : 0;
  check(`GEO160-006-${expr}`, Boolean(sampled.error) || range > 0.5, {
    points: sampled.points.length,
    error: sampled.error,
    mathYRange: range,
  });
}

for (const expr of ["sin(x)", "cos(x)", "sin(10*x)"]) {
  const sampled = sampler.sampleFunctionPoints(expr, -5, 5, plane);
  check(`sampling-control-${expr}`, sampled.error === null && sampled.points.length >= 2 && sampled.points.length <= 4000, {
    points: sampled.points.length,
    breaks: sampled.breaks.length,
    error: sampled.error,
  });
}

const graphSource = readSource("graph/graph-modal.js");
const generatorSource = graphSource.slice(graphSource.indexOf("const MAX_TICK_LABELS"), graphSource.indexOf("\nfunction applyCfg("));
const graphContext = vm.createContext({});
vm.runInContext(`${generatorSource}\nglobalThis.result = genMultiples("t", 1000000);`, graphContext, { timeout: 1_000 });
check("GEO160-007-label-budget", graphContext.result.length <= 320, { generated: graphContext.result.length });

const finiteSvg = expNode.children.every((child) => Object.values(child.attrs).every((value) => !/NaN|Infinity/.test(value)));
check("finite-svg", finiteSvg, { childCount: expNode.children.length });

const report = {
  baseline: process.env.GRAPH_BASELINE_SHA || null,
  runtime: process.version,
  pass: checks.every((entry) => entry.pass),
  checks,
};
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "task-9-5e-160-release-remediation.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, "task-9-graph-fixtures.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 110"><g>${expNode.outerHTML}</g><g transform="translate(110 0)">${reciprocalNode.outerHTML}</g></svg>\n`);
}
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
