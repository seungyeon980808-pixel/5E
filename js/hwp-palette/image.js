// Image handling ported from HwpPalette's engine_library / exam_image.
import { insertPngPhys } from "../svg-export.js?v=1.7.0-four-session-integration";
const STYLES = {
  contour: [5, 50, 150, 2, 1, 0, 1, 0],
  "contour-thin": [5, 60, 180, 2, 1, 0, 0, 0],
  "contour-bold": [7, 30, 120, 3, 2, 0, 2, 0],
  sketch: [3, 80, 200, 2, 0, 0, 0, 0],
  threshold: [3, 50, 150, 2, 1, 0, 1, 0],
  adaptive: [5, 50, 150, 2, 1, 0, 1, 0],
  "exam-clean": [5, 40, 160, 2, 2, 0, 1, 1],
  "exam-diagram": [3, 60, 200, 2, 2, 1, 1, 1],
};
export const IMAGE_STYLES = {
  "": "원본 유지",
  contour: "윤곽선",
  "contour-thin": "얇은 윤곽선",
  "contour-bold": "굵은 윤곽선",
  sketch: "필기",
  threshold: "이진화",
  adaptive: "스캔본",
  "exam-clean": "시험지 삽화",
  "exam-diagram": "시험지 도표",
};
export function physicalImageSize(bytes, width, height) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let dpiX = 96,
    dpiY = 96;
  if (bytes[0] === 137 && bytes[1] === 80 && bytes.length >= 33) {
    for (let at = 8; at + 12 <= bytes.length; ) {
      const size = view.getUint32(at),
        kind = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
      if (at + size + 12 > bytes.length) break;
      if (kind === "pHYs" && size === 9 && bytes[at + 16] === 1) {
        const x = view.getUint32(at + 8),
          y = view.getUint32(at + 12);
        if (x && y)
          return { widthMm: (width / x) * 1000, heightMm: (height / y) * 1000 };
      }
      at += size + 12;
    }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    for (let at = 2; at + 4 < bytes.length; ) {
      if (bytes[at] !== 255) break;
      const marker = bytes[at + 1],
        size = view.getUint16(at + 2),
        start = at + 4,
        end = at + 2 + size;
      if (size < 2 || end > bytes.length || marker === 218) break;
      if (
        marker === 224 &&
        size >= 16 &&
        String.fromCharCode(...bytes.subarray(start, start + 5)) === "JFIF\0"
      ) {
        const unit = bytes[start + 7],
          x = view.getUint16(start + 8),
          y = view.getUint16(start + 10);
        if (unit && x && y) {
          dpiX = x * (unit === 2 ? 2.54 : 1);
          dpiY = y * (unit === 2 ? 2.54 : 1);
        }
      }
      if (
        marker === 225 &&
        String.fromCharCode(...bytes.subarray(start, start + 6)) === "Exif\0\0"
      ) {
        const tiff = start + 6,
          little = bytes[tiff] === 73;
        try {
          const offset = tiff + view.getUint32(tiff + 4, little),
            count = view.getUint16(offset, little);
          let x,
            y,
            unit = 2;
          for (let i = 0; i < count; i++) {
            const entry = offset + 2 + i * 12;
            if (entry + 12 > end) break;
            const tag = view.getUint16(entry, little);
            if (tag === 0x0128) unit = view.getUint16(entry + 8, little);
            if (tag === 0x011a || tag === 0x011b) {
              const value = tiff + view.getUint32(entry + 8, little);
              if (value + 8 <= end) {
                const denom = view.getUint32(value + 4, little),
                  n = view.getUint32(value, little) / denom;
                if (tag === 0x011a) x = n;
                else y = n;
              }
            }
          }
          if (x > 0 && y > 0) {
            dpiX = x * (unit === 3 ? 2.54 : 1);
            dpiY = y * (unit === 3 ? 2.54 : 1);
          }
        } catch {
          /* Keep JFIF / 96 dpi for incomplete EXIF. */
        }
      }
      at = end;
    }
  }
  return { widthMm: (width / dpiX) * 25.4, heightMm: (height / dpiY) * 25.4 };
}
let cvPromise;
export function loadOpenCv() {
  if (!cvPromise)
    cvPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(
        "../../vendor/opencv/opencv.js",
        import.meta.url,
      ).href;
      script.onload = () => {
        // Older Emscripten builds resolve .then() with the module itself.
        // A native Promise would assimilate that thenable forever.
        const ready = (module) => {
          if (typeof module.then === "function") delete module.then;
          resolve(module);
        };
        if (typeof window.cv?.then === "function")
          window.cv.then(ready, reject);
        else if (window.cv?.Mat) ready(window.cv);
        else reject(new Error("그림 스타일 변환기가 준비되지 않았습니다."));
      };
      script.onerror = () =>
        reject(new Error("그림 스타일 변환기를 열지 못했습니다."));
      document.head.append(script);
    }).catch((error) => {
      cvPromise = null;
      throw error;
    });
  return cvPromise;
}
export async function convertExamImage(bytes, style) {
  if (!style) return { bytes };
  const config = STYLES[style];
  if (!config) throw new Error("알 수 없는 그림 스타일입니다.");
  const cv = await loadOpenCv(),
    bitmap = await createImageBitmap(new Blob([bytes])),
    canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  bitmap.close();
  const matrices = [];
  const own = (mat) => {
    matrices.push(mat);
    return mat;
  };
  try {
    const source = own(cv.imread(canvas)),
      gray = own(new cv.Mat()),
      blur = own(new cv.Mat()),
      binary = own(new cv.Mat()),
      padded = own(new cv.Mat()),
      [kernelSize, low, high, morph, close, open, dilate, erode] = config;
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(
      gray,
      blur,
      new cv.Size(kernelSize, kernelSize),
      0,
      0,
      cv.BORDER_DEFAULT,
    );
    cv.Canny(blur, binary, low, high);
    const kernel = own(
      cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(morph, morph)),
    );
    for (let i = 0; i < open; i++)
      cv.morphologyEx(binary, binary, cv.MORPH_OPEN, kernel);
    for (let i = 0; i < close; i++)
      cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);
    for (let i = 0; i < dilate; i++) cv.dilate(binary, binary, kernel);
    for (let i = 0; i < erode; i++) cv.erode(binary, binary, kernel);
    cv.copyMakeBorder(
      binary,
      padded,
      20,
      20,
      20,
      20,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255),
    );
    cv.imshow(canvas, padded);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("변환한 그림을 저장하지 못했습니다.");
    return {
      bytes: new Uint8Array(insertPngPhys(await blob.arrayBuffer(), 300)),
      width: canvas.width,
      height: canvas.height,
      extension: "png",
    };
  } finally {
    for (const matrix of matrices.reverse()) matrix.delete();
  }
}
