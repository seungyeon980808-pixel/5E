const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const header = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, checksum]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    rows.push(Buffer.from([0]), rgba.subarray(y * width * 4, (y + 1) * width * 4));
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function parsePath(d) {
  const tokens = String(d || "").match(/[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  const paths = [];
  let index = 0, command = "", current = null, start = null, points = [];
  const number = () => Number(tokens[index++]);
  const pushPath = () => { if (points.length) paths.push(points); points = []; };
  while (index < tokens.length) {
    if (/^[MLCZ]$/i.test(tokens[index])) command = tokens[index++].toUpperCase();
    if (command === "M") {
      pushPath();
      current = { x: number(), y: number() };
      start = current;
      points.push(current);
      command = "L";
    } else if (command === "L") {
      current = { x: number(), y: number() };
      points.push(current);
    } else if (command === "C") {
      const p0 = current;
      const p1 = { x: number(), y: number() }, p2 = { x: number(), y: number() }, p3 = { x: number(), y: number() };
      for (let step = 1; step <= 24; step += 1) {
        const t = step / 24, u = 1 - t;
        points.push({
          x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
          y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
        });
      }
      current = p3;
    } else if (command === "Z") {
      if (start) points.push(start);
      command = "";
    } else throw new Error(`Unsupported SVG path command: ${command || tokens[index]}`);
  }
  pushPath();
  return paths;
}

function color(value, fallback = [0, 0, 0, 255]) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value || ""));
  return match ? [1, 3, 5].map((offset) => Number.parseInt(match[1].slice(offset - 1, offset + 1), 16)).concat(255) : fallback;
}

function rasterize(oracle, primitives) {
  const { width, height, bounds, clips } = oracle;
  const pixels = Buffer.alloc(width * height * 4, 255);
  const toPixel = ({ x, y }) => ({ x: (x - bounds.xMin) * bounds.scale, y: (y - bounds.yMin) * bounds.scale });
  const inClip = (x, y, name) => {
    if (!name) return true;
    const [cx, cy, cw, ch] = clips[name];
    const point = { x: x / bounds.scale + bounds.xMin, y: y / bounds.scale + bounds.yMin };
    return point.x >= cx && point.x <= cx + cw && point.y >= cy && point.y <= cy + ch;
  };
  const setPixel = (x, y, rgba, clip) => {
    const px = Math.round(x), py = Math.round(y);
    if (px < 0 || py < 0 || px >= width || py >= height || !inClip(px, py, clip)) return;
    const offset = (py * width + px) * 4;
    for (let channel = 0; channel < 4; channel += 1) pixels[offset + channel] = rgba[channel];
  };
  const disc = (x, y, radius, rgba, clip) => {
    for (let oy = -radius; oy <= radius; oy += 1) for (let ox = -radius; ox <= radius; ox += 1) {
      if (ox * ox + oy * oy <= radius * radius) setPixel(x + ox, y + oy, rgba, clip);
    }
  };
  const strokePath = (worldPoints, primitive) => {
    const points = worldPoints.map(toPixel), dash = primitive.dash || [];
    const cycle = dash.reduce((sum, item) => sum + item * bounds.scale, 0);
    let travelled = 0;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1], to = points[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(length * 2));
      for (let step = 0; step <= steps; step += 1) {
        const distance = travelled + length * step / steps;
        const dashOn = cycle === 0 || distance % cycle < dash[0] * bounds.scale;
        if (dashOn) disc(from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps,
          Math.max(0, Math.ceil((primitive.strokeWidth || 0.35) * bounds.scale / 2)), color(primitive.stroke), primitive.clip);
      }
      travelled += length;
    }
  };
  const fillPath = (worldPoints, primitive) => {
    if (!primitive.fill || primitive.fill === "none" || primitive.fill === "transparent") return;
    const points = worldPoints.map(toPixel);
    const minY = Math.floor(Math.min(...points.map(({ y }) => y))), maxY = Math.ceil(Math.max(...points.map(({ y }) => y)));
    for (let y = minY; y <= maxY; y += 1) {
      const crossings = [];
      for (let index = 0; index < points.length - 1; index += 1) {
        const left = points[index], right = points[index + 1];
        if ((left.y <= y && right.y > y) || (right.y <= y && left.y > y)) crossings.push(left.x + (y - left.y) * (right.x - left.x) / (right.y - left.y));
      }
      crossings.sort((a, b) => a - b);
      for (let index = 0; index + 1 < crossings.length; index += 2) {
        for (let x = Math.ceil(crossings[index]); x <= Math.floor(crossings[index + 1]); x += 1) setPixel(x, y, color(primitive.fill), primitive.clip);
      }
    }
  };
  const drawText = (primitive) => {
    const origin = toPixel(primitive), cell = Math.max(1, Math.round((primitive.fontSize || 8) / 8));
    [...primitive.text].forEach((character, characterIndex) => {
      const code = character.codePointAt(0);
      for (let row = 0; row < 7; row += 1) for (let column = 0; column < 5; column += 1) {
        if (((code * 2654435761 + row * 97 + column * 31) >>> ((row + column) % 16)) & 1) {
          for (let oy = 0; oy < cell; oy += 1) for (let ox = 0; ox < cell; ox += 1) {
            setPixel(origin.x + (characterIndex * 6 + column) * cell + ox, origin.y - (7 - row) * cell + oy, color(primitive.fill), primitive.clip);
          }
        }
      }
    });
  };
  for (const primitive of primitives.filter(Boolean)) {
    if (primitive.kind === "text") drawText(primitive);
    else for (const points of parsePath(primitive.d)) { fillPath(points, primitive); strokePath(points, primitive); }
  }
  return pixels;
}

function createVisualArtifacts(oracle, expected, actual, artifactDir) {
  const expectedPixels = rasterize(oracle, expected), actualPixels = rasterize(oracle, actual);
  const overlay = Buffer.alloc(expectedPixels.length, 255), difference = Buffer.alloc(expectedPixels.length, 255);
  let diffPixels = 0;
  for (let offset = 0; offset < expectedPixels.length; offset += 4) {
    const expectedInk = expectedPixels[offset] < 250 || expectedPixels[offset + 1] < 250 || expectedPixels[offset + 2] < 250;
    const actualInk = actualPixels[offset] < 250 || actualPixels[offset + 1] < 250 || actualPixels[offset + 2] < 250;
    const differs = !expectedPixels.subarray(offset, offset + 4).equals(actualPixels.subarray(offset, offset + 4));
    const overlayColor = expectedInk && actualInk ? [0, 160, 0] : expectedInk ? [220, 0, 0] : actualInk ? [0, 130, 220] : [255, 255, 255];
    const differenceColor = differs ? [220, 0, 180] : [255, 255, 255];
    for (let channel = 0; channel < 3; channel += 1) { overlay[offset + channel] = overlayColor[channel]; difference[offset + channel] = differenceColor[channel]; }
    overlay[offset + 3] = 255; difference[offset + 3] = 255;
    if (differs) diffPixels += 1;
  }
  const images = {
    oracle: encodePng(oracle.width, oracle.height, expectedPixels), actual: encodePng(oracle.width, oracle.height, actualPixels),
    overlay: encodePng(oracle.width, oracle.height, overlay), difference: encodePng(oracle.width, oracle.height, difference),
  };
  const hashes = Object.fromEntries(Object.entries(images).map(([name, bytes]) => [name, crypto.createHash("sha256").update(bytes).digest("hex")]));
  const artifacts = {};
  if (artifactDir) {
    fs.mkdirSync(artifactDir, { recursive: true });
    for (const [name, bytes] of Object.entries(images)) { artifacts[name] = path.join(artifactDir, `${name}.png`); fs.writeFileSync(artifacts[name], bytes); }
  }
  return { diffPixels, hashes, artifacts };
}

module.exports = { createVisualArtifacts, parsePath };
