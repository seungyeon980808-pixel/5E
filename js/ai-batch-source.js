const MAX_SOURCE_BYTES = 1_048_576;
const MAX_SOURCE_RECORD_BYTES = 1_500_000;
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

export function parseBatchSource(source, options) {
  if (!isRecord(source) || !isRecord(options)) throw new TypeError('Batch source and options must be records.');
  const match = typeof source.dataUrl === 'string'
    ? source.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i)
    : null;
  if (!match || match[2].length % 4 !== 0) throw new TypeError('Batch source requires a valid image data URL.');
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  const decodedLength = (match[2].length / 4) * 3 - padding;
  if (decodedLength < 1 || decodedLength > MAX_SOURCE_BYTES) throw new RangeError('Batch source exceeds the size limit.');
  let bytes;
  try { bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0)); }
  catch { throw new TypeError('Batch source requires a valid image data URL.'); }
  const mime = match[1].toLowerCase();
  const png = mime === 'image/png' && bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = mime === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const webp = mime === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!png && !jpeg && !webp) throw new TypeError('Batch source requires a valid image data URL signature.');
  const snapshot = structuredClone(source);
  const parsedOptions = structuredClone(options);
  const serializedSize = new TextEncoder().encode(JSON.stringify({ sourceSnapshot: snapshot, options: parsedOptions })).byteLength;
  if (serializedSize > MAX_SOURCE_RECORD_BYTES) throw new RangeError('Batch source record exceeds the size limit.');
  return { snapshot, options: parsedOptions };
}

export function isBatchRecord(value) {
  return isRecord(value);
}
