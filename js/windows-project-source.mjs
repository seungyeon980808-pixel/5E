export async function extractWindowsProjectSource(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const invalid = () => new Error('5E 프로젝트 원본이 없거나 실행 파일이 손상되었습니다.');
  if (bytes.length < 256 || bytes.length > 64 * 1024 * 1024 || decoder.decode(bytes.subarray(0, 2)) !== 'MZ') throw invalid();
  const pe = view.getUint32(60, true);
  if (pe + 176 > bytes.length || view.getUint32(pe, true) !== 0x4550 || view.getUint16(pe + 4, true) !== 0x8664 || view.getUint16(pe + 24, true) !== 0x20b) throw invalid();
  const certificate = view.getUint32(pe + 168, true), certificateSize = view.getUint32(pe + 172, true);
  const end = certificate || bytes.length;
  if (end > bytes.length || certificate && certificate + certificateSize > bytes.length) throw invalid();
  let footer;
  for (let padding = 0; padding < 8; padding++) {
    const at = end - padding - 56;
    if (at >= 0 && bytes.subarray(at, at + 16).every((value, i) => value === '5EPRJWIN00000001'.charCodeAt(i))) { footer = at; break; }
    if (end - padding - 1 < 0 || bytes[end - padding - 1] !== 0) break;
  }
  if (footer === undefined) throw invalid();
  const sourceSize = view.getUint32(footer + 16, true), configSize = view.getUint32(footer + 20, true);
  if (!sourceSize || sourceSize > 32 * 1024 * 1024 || !configSize || configSize > 65536 || sourceSize + configSize > footer) throw invalid();
  const body = bytes.subarray(footer - sourceSize - configSize, footer);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  if (!digest.every((value, i) => value === bytes[footer + 24 + i])) throw invalid();
  return decoder.decode(body.subarray(0, sourceSize));
}
