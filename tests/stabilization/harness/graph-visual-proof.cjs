const { createVisualArtifacts, parsePath } = require("./pixel-raster.cjs");

function descendants(root, tag) {
  const found = [];
  const visit = (node) => {
    if (node !== root && node.tagName === tag) found.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return found;
}

function translation(node, root) {
  let x = Number(node.getAttribute("x") || 0), y = Number(node.getAttribute("y") || 0), current = node;
  while (current && current !== root) {
    const transform = current.getAttribute?.("transform") || "";
    const match = /translate\(\s*([-+\de.]+)(?:[ ,]+([-+\de.]+))?\s*\)/i.exec(transform);
    if (match) { x += Number(match[1]); y += Number(match[2] || 0); }
    current = current.parentNode;
  }
  return { x, y };
}

function extractPrimitive(roots, expected) {
  const selector = expected.selector;
  const root = roots.find((node) => String(node.dataset?.id || "").endsWith(selector.objectSuffix));
  if (!root) return null;
  let nodes = descendants(root, selector.tag);
  if (selector.text != null) nodes = nodes.filter((node) => node._text === selector.text);
  const node = nodes[selector.index || 0];
  if (!node) return null;
  if (expected.kind === "text") {
    const point = translation(node, root);
    return {
      kind: "text", text: node._text, x: point.x, y: point.y,
      fill: node.getAttribute("fill"), fontSize: Number(node.getAttribute("font-size")), clip: expected.clip,
    };
  }
  const dash = String(node.getAttribute("stroke-dasharray") || "").trim();
  return {
    kind: "path", d: node.getAttribute("d"), fill: node.getAttribute("fill"), stroke: node.getAttribute("stroke"),
    strokeWidth: Number(node.getAttribute("stroke-width")), dash: dash ? dash.split(/[ ,]+/).map(Number) : [], clip: expected.clip,
  };
}

function expectedPrimitives(oracle) {
  return oracle.primitives.map(({ selector: _selector, ...primitive }) => structuredClone(primitive));
}

function pathShape(d) { return String(d || "").match(/[MLCZ]/gi)?.map((item) => item.toUpperCase()).join("") || ""; }
function pathCoordinates(d) { return (String(d || "").match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || []).map(Number); }
function numericEqual(left, right, tolerance = 1e-8) {
  return left.length === right.length && left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
}
function arrayEqual(left, right, tolerance = 1e-8) { return numericEqual(left || [], right || [], tolerance); }

function primitivePoints(primitive) {
  if (!primitive) return [];
  if (primitive.kind === "text") return [{ x: primitive.x, y: primitive.y }];
  return parsePath(primitive.d).flat();
}

function insideClip(primitive, oracle) {
  if (!primitive) return false;
  const clip = oracle.clips[primitive.clip];
  if (!clip) return false;
  const [x, y, width, height] = clip;
  return primitivePoints(primitive).every((point) => point.x >= x - 1e-6 && point.x <= x + width + 1e-6
    && point.y >= y - 1e-6 && point.y <= y + height + 1e-6);
}

function applyVisualDamage(roots, oracle, mode) {
  if (!mode) return;
  const primitive = oracle.primitives.find((item) => mode === "text" ? item.kind === "text"
    : mode === "coordinate" ? item.selector.objectSuffix.includes("_003_") : item.selector.objectSuffix.includes("_002_"));
  const root = roots.find((node) => String(node.dataset?.id || "").endsWith(primitive.selector.objectSuffix));
  const nodes = descendants(root, primitive.selector.tag);
  const node = primitive.selector.text == null ? nodes[primitive.selector.index || 0] : nodes.find((item) => item._text === primitive.selector.text);
  if (mode === "path") {
    const d = node.getAttribute("d"), cut = d.lastIndexOf(" C ");
    node.setAttribute("d", d.slice(0, cut));
  } else if (mode === "coordinate") node.setAttribute("d", node.getAttribute("d").replace("-10 0", "-30 0"));
  else node.textContent = "한";
}

function createGraphVisualProof({ roots, repeatedRoots, oracle, damage, artifactDir }) {
  if (!oracle || oracle.schema !== "5e-independent-graph-visual-oracle@1") throw new Error("Independent graph visual oracle is required");
  applyVisualDamage(roots, oracle, damage);
  const expected = expectedPrimitives(oracle);
  const actual = oracle.primitives.map((primitive) => extractPrimitive(roots, primitive));
  const repeated = oracle.primitives.map((primitive) => extractPrimitive(repeatedRoots, primitive));
  const pairs = expected.map((item, index) => [item, actual[index]]);
  const pathPairs = pairs.filter(([item]) => item.kind === "path"), textPairs = pairs.filter(([item]) => item.kind === "text");
  const contract = {
    independentOracle: typeof oracle.provenance === "string" && oracle.provenance.includes("Independently authored"),
    pathStructure: pathPairs.every(([left, right]) => right && pathShape(left.d) === pathShape(right.d)),
    coordinates: pathPairs.every(([left, right]) => right && numericEqual(pathCoordinates(left.d), pathCoordinates(right.d)))
      && textPairs.every(([left, right]) => right && numericEqual([left.x, left.y], [right.x, right.y])),
    text: textPairs.every(([left, right]) => right && left.text === right.text),
    strokeWidth: pathPairs.every(([left, right]) => right && numericEqual([left.strokeWidth], [right.strokeWidth])),
    dashPeriod: pathPairs.every(([left, right]) => right && arrayEqual(left.dash, right.dash)),
    clipped: actual.every((primitive) => insideClip(primitive, oracle)),
  };
  const artifacts = createVisualArtifacts(oracle, expected, actual, artifactDir);
  const deterministic = JSON.stringify(actual) === JSON.stringify(repeated);
  return {
    deterministic, contract, oracleMatched: Object.values(contract).every(Boolean) && artifacts.diffPixels === 0,
    diffPixels: artifacts.diffPixels, hashes: artifacts.hashes, artifacts: artifacts.artifacts,
  };
}

module.exports = { createGraphVisualProof };
