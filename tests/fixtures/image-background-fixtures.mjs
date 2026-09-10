const WHITE = Object.freeze([255, 255, 255, 255]);
const BLACK = Object.freeze([0, 0, 0, 255]);

function createImage(width, height, fill = WHITE) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) data.set(fill, pixel * 4);
  return { width, height, data };
}

function setPixel(image, x, y, rgba) {
  image.data.set(rgba, (y * image.width + x) * 4);
}

function horizontal(image, x0, x1, y, rgba) {
  for (let x = x0; x <= x1; x += 1) setPixel(image, x, y, rgba);
}

function vertical(image, x, y0, y1, rgba) {
  for (let y = y0; y <= y1; y += 1) setPixel(image, x, y, rgba);
}

function fillRect(image, x0, y0, x1, y1, rgba) {
  for (let y = y0; y <= y1; y += 1) horizontal(image, x0, x1, y, rgba);
}

function closedBeaker() {
  const image = createImage(13, 13);
  horizontal(image, 3, 9, 2, BLACK);
  horizontal(image, 3, 9, 10, BLACK);
  vertical(image, 3, 2, 10, BLACK);
  vertical(image, 9, 2, 10, BLACK);
  fillRect(image, 4, 7, 8, 9, [224, 224, 224, 255]);
  return {
    ...image,
    points: {
      exterior: [0, 0],
      enclosedWhite: [6, 4],
      paleLiquid: [6, 8],
      outline: [3, 5],
    },
  };
}

function openBeaker() {
  const image = createImage(15, 15);
  vertical(image, 4, 3, 12, BLACK);
  vertical(image, 10, 3, 12, BLACK);
  horizontal(image, 4, 10, 12, BLACK);
  fillRect(image, 5, 8, 9, 11, [226, 226, 226, 255]);
  return {
    ...image,
    points: {
      exterior: [0, 0],
      openInteriorWhite: [7, 5],
      paleLiquid: [7, 9],
      outline: [4, 6],
    },
  };
}

function brightObjectAndThinEdges() {
  const image = createImage(17, 13);
  horizontal(image, 5, 11, 2, BLACK);
  horizontal(image, 5, 11, 9, BLACK);
  vertical(image, 5, 2, 9, BLACK);
  vertical(image, 11, 2, 9, BLACK);
  fillRect(image, 6, 3, 10, 8, [247, 247, 247, 255]);
  horizontal(image, 1, 15, 11, BLACK);
  setPixel(image, 8, 10, [246, 246, 246, 255]);
  setPixel(image, 12, 6, [72, 72, 72, 96]);
  setPixel(image, 13, 6, [252, 248, 240, 255]);
  return {
    ...image,
    points: {
      exterior: [0, 0],
      brightFill: [8, 5],
      thinLine: [8, 11],
      antialiasedEdge: [8, 10],
      translucentEdge: [12, 6],
      brightChromaticObject: [13, 6],
    },
  };
}

function realAlpha() {
  const image = createImage(9, 9, [23, 31, 47, 0]);
  horizontal(image, 2, 6, 2, BLACK);
  horizontal(image, 2, 6, 6, BLACK);
  vertical(image, 2, 2, 6, BLACK);
  vertical(image, 6, 2, 6, BLACK);
  setPixel(image, 4, 4, WHITE);
  setPixel(image, 1, 4, [72, 91, 110, 83]);
  return {
    ...image,
    points: {
      transparentFrame: [0, 0],
      internalWhite: [4, 4],
      translucentEdge: [1, 4],
    },
  };
}

function drawnCheckerboard() {
  const image = createImage(12, 12);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const gray = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 224 : 248;
      setPixel(image, x, y, [gray, gray, gray, 255]);
    }
  }
  return { ...image, points: { firstTile: [0, 0], secondTile: [2, 0] } };
}

function uncertainTwoToneBackground() {
  const image = createImage(12, 12);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const gray = x < image.width / 2 ? 224 : 248;
      setPixel(image, x, y, [gray, gray, gray, 255]);
    }
  }
  return { ...image, points: { firstBand: [2, 6], secondBand: [9, 6] } };
}

function ambiguousExterior() {
  const image = createImage(7, 7);
  setPixel(image, 0, 3, [242, 242, 242, 255]);
  return { ...image, points: { definiteExterior: [0, 0], ambiguousExterior: [0, 3] } };
}

function nearWhiteSamples() {
  const image = createImage(6, 1);
  setPixel(image, 1, 0, [248, 248, 248, 255]);
  setPixel(image, 2, 0, [210, 210, 210, 255]);
  setPixel(image, 3, 0, BLACK);
  setPixel(image, 4, 0, [250, 245, 230, 255]);
  setPixel(image, 5, 0, [250, 250, 250, 128]);
  return {
    ...image,
    points: {
      white: [0, 0],
      antialiasedWhite: [1, 0],
      gray: [2, 0],
      black: [3, 0],
      chromaticLight: [4, 0],
      translucentWhite: [5, 0],
    },
  };
}

export function imageBackgroundFixtures() {
  return {
    closedBeaker: closedBeaker(),
    openBeaker: openBeaker(),
    brightObjectAndThinEdges: brightObjectAndThinEdges(),
    realAlpha: realAlpha(),
    drawnCheckerboard: drawnCheckerboard(),
    uncertainTwoToneBackground: uncertainTwoToneBackground(),
    ambiguousExterior: ambiguousExterior(),
    nearWhiteSamples: nearWhiteSamples(),
  };
}

export function pixelAt(image, point) {
  const [x, y] = point;
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.slice(offset, offset + 4));
}
