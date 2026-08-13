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
