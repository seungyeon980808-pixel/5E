import { pixelAt } from "../fixtures/image-background-fixtures.mjs";

export function cloneImage(image) {
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data), points: image.points };
}

export function alphaAt(image, point) {
  return pixelAt(image, point)[3];
}

export function maskAt(mask, width, point) {
  return mask[point[1] * width + point[0]];
}

export function maskFromPoints(width, height, points) {
  const mask = new Uint8Array(width * height);
  for (const point of points) mask[point[1] * width + point[0]] = 1;
  return mask;
}

export function alphaByteAt(data, width, point) {
  return data[(point[1] * width + point[0]) * 4 + 3];
}

export function paletteScopeFixture() {
  return {
    data: Uint8ClampedArray.from([
      255, 0, 0, 255,
      20, 190, 80, 255,
      250, 250, 250, 255,
      40, 80, 120, 83,
      100, 100, 100, 255,
      100, 100, 100, 255,
    ]),
    preserveMask: Uint8Array.of(0, 0, 0, 0, 1, 0),
    changeMask: Uint8Array.of(1, 1, 1, 1, 1, 0),
  };
}

export function installGeneratedImageBrowserFixture(fixture) {
  const previousImage = globalThis.Image;
  const previousDocument = globalThis.document;
  let written = null;

  class FixtureImage {
    naturalWidth = fixture.width;
    naturalHeight = fixture.height;
    set src(_value) { queueMicrotask(() => this.onload()); }
  }

  const context = {
    drawImage() {},
    getImageData: () => ({ data: new Uint8ClampedArray(fixture.data) }),
    clearRect() {},
    putImageData: image => { written = image.data; },
  };
  globalThis.Image = FixtureImage;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => "data:image/png;base64,fixture",
    }),
  };

  return {
    get written() { return written; },
    restore() {
      globalThis.Image = previousImage;
      globalThis.document = previousDocument;
    },
  };
}
