import { validatePictureLayout } from './rhwp-exam-region.js?v=1.7.0-four-session-integration';
// A standard PNG iTXt chunk keeps editable 5E data with the exported pixels.
// See https://www.w3.org/TR/png-3/#11iTXt . Never execute embedded data.
import { validateExamLink, validateExamContext } from './rhwp-exam-links.js?v=1.7.0-four-session-integration';
const SIGNATURE = [137,80,78,71,13,10,26,10];
const KEYWORD = '5E-Editable-Source';
export const EDITABLE_PNG_MAX_BYTES = 64 * 1024 * 1024;
const SOURCE_MAX_BYTES = 32 * 1024 * 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
const table = Array.from({length:256}, (_, index) => {
  let crc = index; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(data) { let crc = 0xffffffff; for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunks(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > EDITABLE_PNG_MAX_BYTES) throw new Error('원본 포함 PNG는 최대 64 MB까지 열 수 있습니다.');
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = [];
  let offset = 8, end = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), next = offset + length + 12;
    if (next > bytes.length) throw new Error('PNG 파일이 손상되었습니다.');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, next - 4);
    if (crc32(bytes.subarray(offset + 4, next - 4)) !== view.getUint32(next - 4)) throw new Error('PNG CRC가 일치하지 않습니다.');
    result.push({type, data, bytes:bytes.subarray(offset, next)}); offset = next;
    if (type === 'IEND') { end = true; break; }
  }
  if (!end || offset !== bytes.length || result[0]?.type !== 'IHDR') throw new Error('PNG 파일 구조가 올바르지 않습니다.');
  return result;
}
function sourceChunk(chunk) {
  if (chunk.type !== 'iTXt') return false;
  const zero = chunk.data.indexOf(0);
  return zero === KEYWORD.length && [...KEYWORD].every((char, index) => chunk.data[index] === char.charCodeAt(0));
}
export function validateFigureRender(render) {
  if(render?.layoutDraft!==undefined && typeof render.layoutDraft!=='boolean')throw new Error('그림 배치 초안이 올바르지 않습니다.');
  if(render?.layout!==undefined)validatePictureLayout(render.layout);
  if (render === undefined) return;
  const bounds = render?.bounds, options = render?.options;
  if (!render || typeof render !== 'object' ||
      (bounds !== null && (!bounds || !['x','y','w','h'].every(key => Number.isFinite(bounds[key])) || bounds.w <= 0 || bounds.h <= 0)) ||
      !options || typeof options.includeReferenceImages !== 'boolean' || typeof options.excludeAllImages !== 'boolean') {
    throw new Error('그림의 내보내기 영역 정보가 올바르지 않습니다.');
  }
}
function validate(value, validateSource) {
  const figure = value?.figure;
  if (value?.format !== '5e-editable-png' || value.version !== 1 || !figure ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(figure.id) || typeof figure.name !== 'string' || figure.name.length > 200 ||
      !Number.isSafeInteger(figure.version) || figure.version < 1 || !figure.source || typeof figure.source !== 'object') {
    throw new Error('PNG에 포함된 5E 원본 정보가 올바르지 않습니다.');
  }
  validateFigureRender(figure.render);
  validateExamLink(figure.link); validateExamContext(figure.context);
  validateSource?.(figure.source); return figure;
}
export function embedEditablePng(input, figure, validateSource) {
  const parts = chunks(input); if (!parts) throw new Error('PNG 파일이 아닙니다.');
  const value = {format:'5e-editable-png', version:1, figure}; validate(value, validateSource);
  const text = encoder.encode(JSON.stringify(value));
  if (text.length > SOURCE_MAX_BYTES) throw new Error('그림 원본 한 개는 최대 32 MB까지 저장할 수 있습니다.');
  const key = encoder.encode(KEYWORD), data = new Uint8Array(key.length + 5 + text.length);
  data.set(key); data.set(text, key.length + 5); // NUL, flag, method, language NUL, translated-keyword NUL
  const chunk = new Uint8Array(data.length + 12), view = new DataView(chunk.buffer);
  view.setUint32(0, data.length); chunk.set(encoder.encode('iTXt'), 4); chunk.set(data, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  const retained = parts.filter(part => !sourceChunk(part)), size = retained.reduce((sum, part) => sum + part.bytes.length, 8) + chunk.length;
  if (size > EDITABLE_PNG_MAX_BYTES) throw new Error('원본 포함 PNG가 64 MB를 초과합니다.');
  const output = new Uint8Array(size); output.set(SIGNATURE); let offset = 8;
  for (const part of retained) {
    if (part.type === 'IEND') { output.set(chunk, offset); offset += chunk.length; }
    output.set(part.bytes, offset); offset += part.bytes.length;
  }
  return output;
}
export function readEditablePng(input, validateSource) {
  const parts = chunks(input); if (!parts) return null;
  const sources = parts.filter(sourceChunk); if (!sources.length) return null;
  if (sources.length !== 1) throw new Error('PNG의 그림 원본이 중복되었습니다.');
  const data = sources[0].data, start = data.indexOf(0);
  if (data[start + 1] !== 0 || data[start + 2] !== 0) throw new Error('지원하지 않는 그림 원본 압축 형식입니다.');
  let textStart = start + 3;
  for (let field = 0; field < 2; field++) {
    const zero = data.indexOf(0, textStart); if (zero < 0) throw new Error('PNG 원본 정보가 손상되었습니다.'); textStart = zero + 1;
  }
  if (data.length - textStart > SOURCE_MAX_BYTES) throw new Error('PNG 그림 원본이 너무 큽니다.');
  return validate(JSON.parse(decoder.decode(data.subarray(textStart))), validateSource);
}
export function currentPageSource(serialized) {
  const copy = JSON.parse(JSON.stringify(serialized));
  copy.pages = copy.pages.filter(page => page.id === copy.activePageId); return copy;
}
