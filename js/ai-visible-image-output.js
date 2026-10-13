import { labelEditFrame, labelEditObjects } from './ai-label-edit-model.js?v=1.7.0-four-session-integration';
import { prepareEditableLabelFonts } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { renderObject } from './render/scene.js?v=1.7.0-four-session-integration';
import { ensureEmbeddedFonts } from './svg-export.js?v=1.7.0-four-session-integration';

const NS = 'http://www.w3.org/2000/svg';
function imageFrom(src) {
  return new Promise((resolve,reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('출력할 이미지를 읽지 못했습니다.'));
    image.src = src;
  });
}

// Use the same native objects and image frame as the editor and canvas output.
// Preserve alpha and the unflattened candidate; this raster is an export only.
export async function visibleImagePng({ data, plan, artboard, isCurrent = () => true }) {
  const raster = await imageFrom(data), width = raster.naturalWidth, height = raster.naturalHeight;
  if (!width || !height || width*height > 16_777_216) throw new Error('이미지 출력 크기를 확인하세요.');
  if (!isCurrent()) throw new Error('출력 중 선택한 결과가 바뀌었습니다.');
  if (!plan?.labels?.length && /^data:image\/png;/.test(data)) return data;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext('2d'); context.drawImage(raster,0,0);
    if (plan?.labels?.length) {
      await prepareEditableLabelFonts(plan.labels);
      const css = await ensureEmbeddedFonts();
      const frame = labelEditFrame(width,height,artboard);
      const svg = document.createElementNS(NS,'svg');
      svg.setAttribute('xmlns',NS); svg.setAttribute('width',width); svg.setAttribute('height',height);
      svg.setAttribute('viewBox',`0 0 ${frame.w} ${frame.h}`);
      const style = document.createElementNS(NS,'style'); style.textContent = css; svg.append(style);
      labelEditObjects(plan,frame).forEach(object => svg.append(renderObject(object)));
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
      let overlay; try { overlay = await imageFrom(url); } finally { URL.revokeObjectURL(url); }
      context.drawImage(overlay,0,0,width,height);
    }
    if (!isCurrent()) throw new Error('출력 중 선택한 결과가 바뀌었습니다.');
    return canvas.toDataURL('image/png');
  } finally { canvas.width = canvas.height = 0; }
}
