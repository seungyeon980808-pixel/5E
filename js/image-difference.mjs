export function absoluteDifferencePixels(left, right) {
  if (!left || !right || left.length !== right.length || left.length % 4 !== 0) {
    throw new TypeError("Image pixel buffers must have the same length in RGBA order.");
  }
  const output = new Uint8ClampedArray(left.length);
  for (let index = 0; index < left.length; index += 4) {
    const delta = Math.max(
      Math.abs(left[index] - right[index]),
      Math.abs(left[index + 1] - right[index + 1]),
      Math.abs(left[index + 2] - right[index + 2]),
    );
    const shade = 255 - delta;
    output[index] = shade;
    output[index + 1] = shade;
    output[index + 2] = shade;
    output[index + 3] = 255;
  }
  return output;
}

export function boundedComparisonSize(sizes, { maxEdge = 1600, maxPixels = 2_000_000 } = {}) {
  const width = Math.max(1, ...sizes.map((size) => Number(size?.width) || 0));
  const height = Math.max(1, ...sizes.map((size) => Number(size?.height) || 0));
  const scale = Math.min(1, maxEdge / width, maxEdge / height, Math.sqrt(maxPixels / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
