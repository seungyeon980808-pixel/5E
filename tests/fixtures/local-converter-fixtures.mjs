import { createHash } from "node:crypto";

const WHITE = 255;

function image(width, height, alpha = 255) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = WHITE;
    data[index + 1] = WHITE;
    data[index + 2] = WHITE;
    data[index + 3] = alpha;
  }
  return { width, height, data };
}

function setPixel(target, x, y, gray, alpha = 255) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const index = (y * target.width + x) * 4;
  target.data[index] = gray;
  target.data[index + 1] = gray;
  target.data[index + 2] = gray;
  target.data[index + 3] = alpha;
}

function fillRect(target, x0, y0, x1, y1, gray, alpha = 255) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) setPixel(target, x, y, gray, alpha);
  }
}

function stroke(target, x0, y0, x1, y1, thickness, gray) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const radius = (thickness - 1) / 2;
  for (let step = 0; step <= steps; step += 1) {
    const cx = x0 + ((x1 - x0) * step) / steps;
    const cy = y0 + ((y1 - y0) * step) / steps;
    for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy += 1) {
      for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx += 1) {
        if ((dx * dx) + (dy * dy) <= (radius * radius) + 0.25) {
          setPixel(target, Math.round(cx + dx), Math.round(cy + dy), gray);
        }
      }
    }
  }
}

function compositeOverWhite(target) {
  const result = image(target.width, target.height);
  for (let index = 0; index < target.data.length; index += 4) {
    const alpha = target.data[index + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      result.data[index + channel] = Math.round((target.data[index + channel] * alpha) + (255 * (1 - alpha)));
    }
  }
  return result;
}

function thinBlackGray() {
  const target = image(256, 72);
  stroke(target, 16, 20, 238, 20, 1, 0);
  stroke(target, 16, 50, 238, 50, 1, 110);
  return target;
}

function branches() {
  const target = image(192, 160);
  stroke(target, 96, 142, 96, 72, 3, 0);
  stroke(target, 96, 74, 34, 20, 3, 0);
  stroke(target, 96, 74, 158, 20, 3, 0);
  return target;
}

function crossing() {
  const target = image(176, 176);
  stroke(target, 20, 88, 156, 88, 3, 0);
  stroke(target, 88, 20, 88, 156, 3, 0);
  return target;
}

function ringHole() {
  const target = image(180, 180);
  const cx = 90;
  const cy = 90;
  for (let y = 20; y < 160; y += 1) {
    for (let x = 20; x < 160; x += 1) {
      const distanceSquared = ((x - cx) ** 2) + ((y - cy) ** 2);
      if (distanceSquared <= 58 ** 2 && distanceSquared >= 42 ** 2) setPixel(target, x, y, 0);
    }
  }
  return target;
}

function textLike() {
  const target = image(220, 96);
  fillRect(target, 18, 18, 23, 78, 0);
  fillRect(target, 62, 18, 67, 78, 0);
  fillRect(target, 18, 45, 67, 50, 0);
  fillRect(target, 92, 18, 97, 78, 0);
  fillRect(target, 128, 18, 133, 78, 0);
  fillRect(target, 176, 18, 181, 78, 0);
  fillRect(target, 128, 18, 181, 23, 0);
  fillRect(target, 128, 73, 181, 78, 0);
  return target;
}

function transparent() {
  const source = image(144, 112, 0);
  stroke(source, 16, 92, 72, 18, 5, 0);
  stroke(source, 72, 18, 128, 92, 5, 0);
  return compositeOverWhite(source);
}

function sparse2000() {
  const target = image(2000, 2000);
  for (let offset = 0; offset < 8; offset += 1) {
    stroke(target, 120, 180 + (offset * 210), 1880, 180 + (offset * 210), 1, offset % 2 ? 110 : 0);
  }
  return target;
}

function dense2000() {
  const target = image(2000, 2000);
  fillRect(target, 0, 0, 2000, 1200, 0);
  return target;
}

const DEFINITIONS = [
  ["thin-black-gray", thinBlackGray, { minArea: 5, dilateRadius: 1, textSizePx: 12, epsilon: 1.2 }],
  ["branches", branches, { minArea: 5, dilateRadius: 3, textSizePx: 20, epsilon: 1.2 }],
  ["crossing", crossing, { minArea: 5, dilateRadius: 3, textSizePx: 20, epsilon: 1.2 }],
  ["ring-hole", ringHole, { minArea: 25, dilateRadius: 3, textSizePx: 20, epsilon: 1.2 }],
  ["text-like", textLike, { minArea: 5, dilateRadius: 2, textSizePx: 80, epsilon: 1.2 }],
  ["transparent", transparent, { minArea: 5, dilateRadius: 2, textSizePx: 20, epsilon: 1.2 }],
  ["sparse-2000", sparse2000, { minArea: 5, dilateRadius: 1, textSizePx: 20, epsilon: 1.2 }],
  ["dense-2000", dense2000, { minArea: 5, dilateRadius: 1, textSizePx: 20, epsilon: 1.2 }],
];

export function fixtureBytes() {
  return DEFINITIONS.map(([name, create, options]) => {
    const value = create();
    return {
      name,
      width: value.width,
      height: value.height,
      data: value.data,
      options: { preserveGrayLevels: true, advancedShapes: false, removeGrid: false, ...options },
      sha256: createHash("sha256").update(value.data).digest("hex"),
    };
  });
}

