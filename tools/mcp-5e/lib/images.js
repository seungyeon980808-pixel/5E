/* ===== image 전처리 =====
 * 앱은 image.src 에 data URI 를 담는다(Ctrl+V 붙여넣기 경로와 동일 — js/project-io.js).
 * MCP 호출자가 base64를 손으로 만들지 않아도 되게, srcPath(로컬 파일)를 받아 여기서 바꾼다.
 *
 * 왜 경로를 안 남기고 내장하나: 프로젝트 .json 이 다른 기기로 옮겨져도 그림이 살아 있어야 한다.
 * 외부 경로를 그대로 두면 그 기기에서만 보이는 도면이 된다.
 */
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve as resolvePath } from "node:path";

const IMAGE_MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
};

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_WIDTH_MM = 60;

/** PNG/JPEG 헤더에서 픽셀 크기를 읽는다. 못 읽으면 null (외부 의존성 없이 처리). */
export function pixelSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };       // PNG IHDR
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {          // JPEG SOFn
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  return null;
}

/**
 * objects 배열의 image.srcPath 를 src(data URI) 로 바꾼다.
 * 원본 배열·객체는 건드리지 않는다. 파일이 없거나 형식이 틀리면 throw —
 * add_objects 는 "하나라도 틀리면 전부 안 넣는다"가 규칙이므로 여기서 멈추는 게 맞다.
 */
export function inlineImages(objects) {
  return objects.map((o) => {
    if (!o || o.type !== "image" || typeof o.srcPath !== "string") return o;

    const abs = resolvePath(o.srcPath);
    if (!existsSync(abs)) throw new Error(`image: 파일이 없습니다 — ${abs}`);

    const ext = extname(abs).toLowerCase();
    const mime = IMAGE_MIME[ext];
    if (!mime) throw new Error(`image: 지원하지 않는 확장자 "${ext}" (png/jpg/gif/webp/svg)`);

    const buf = readFileSync(abs);
    if (buf.length > MAX_IMAGE_BYTES) {
      const mb = (buf.length / 1024 / 1024).toFixed(1);
      throw new Error(`image: ${mb}MB로 너무 큽니다(최대 8MB). 미리 줄여서 주세요`);
    }

    const { srcPath, ...rest } = o;
    const out = { ...rest, src: `data:${mime};base64,${buf.toString("base64")}` };

    /* w/h 를 생략했으면 원본 비율로 채운다. 하나만 주면 나머지를 비율로 계산한다.
     * 비율을 안 맞추면 그림이 눌려서 들어가고, 그걸 눈으로 알아채기 어렵다. */
    const px = pixelSize(buf);
    if (px && px.w > 0 && px.h > 0) {
      const ratio = px.h / px.w;
      const hasW = Number.isFinite(out.w);
      const hasH = Number.isFinite(out.h);
      if (!hasW && !hasH) {
        out.w = DEFAULT_WIDTH_MM;
        out.h = +(DEFAULT_WIDTH_MM * ratio).toFixed(2);
      } else if (!hasH) {
        out.h = +(out.w * ratio).toFixed(2);
      } else if (!hasW) {
        out.w = +(out.h / ratio).toFixed(2);
      }
    }
    return out;
  });
}
