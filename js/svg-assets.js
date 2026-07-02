/* Built-in SVG assets used by existing template/tool entries. */

const BUILT_IN_SVG_ASSETS = {
  pulley: {
    templateId: "M001",
    viewBox: "0 0 172 152",
    defaultWidth: 24,
    defaultHeight: 24 * 152 / 172,
    content: `
      <g fill-rule="evenodd" clip-rule="evenodd">
        <path d="M57.5 7.5c31.2 0 56.5 25.3 56.5 56.5s-25.3 56.5-56.5 56.5S1 95.2 1 64 26.3 7.5 57.5 7.5Z" fill="#D8D8D8" stroke="#111" stroke-width="5"/>
        <path d="M57.5 19.5c24.6 0 44.5 19.9 44.5 44.5s-19.9 44.5-44.5 44.5S13 88.6 13 64 32.9 19.5 57.5 19.5Z" fill="#F4F4F4" stroke="#111" stroke-width="4"/>
        <path d="M57.5 34.5c16.3 0 29.5 13.2 29.5 29.5s-13.2 29.5-29.5 29.5S28 80.3 28 64s13.2-29.5 29.5-29.5Z" fill="#E7E7E7" stroke="#111" stroke-width="4"/>
        <path d="M58 52c6.6 0 12 5.4 12 12s-5.4 12-12 12-12-5.4-12-12 5.4-12 12-12Z" fill="#BDBDBD" stroke="#111" stroke-width="4"/>
        <path d="M71 57 153 118c8 6 9.5 18 2.5 23.5-7 5.5-18.5 1.2-26-6.5L62 73c-5.1-5-1.2-20.3 9-16Z" fill="#F9F9F9" stroke="#111" stroke-width="5" stroke-linejoin="round"/>
        <path d="M141.5 118.5c8.8 0 16 7.2 16 16s-7.2 16-16 16-16-7.2-16-16 7.2-16 16-16Z" fill="#D4D4D4" stroke="#111" stroke-width="5"/>
      </g>
    `,
  },
  clamp: {
    templateId: "M004",
    viewBox: "0 0 850 1440",
    defaultWidth: 40 * 850 / 1440,
    defaultHeight: 40,
    content: `
      <g fill-rule="evenodd" clip-rule="evenodd" stroke="#111" stroke-linejoin="round">
        <path d="M509 118h31v1120h-31z" fill="#D7D7D7" stroke-width="6"/>
        <path d="M495 215h59v72h-59z" fill="#CFCFCF" stroke-width="6"/>
        <path d="M90 229h405v24H90z" fill="#D7D7D7" stroke-width="6"/>
        <path d="M554 229h180v24H554z" fill="#D7D7D7" stroke-width="6"/>
        <path d="M480 205h88v92h-88z" fill="#C8C8C8" stroke-width="6"/>
        <circle cx="524" cy="251" r="24" fill="#F3F3F3" stroke-width="6"/>
        <circle cx="524" cy="251" r="9" fill="#111" stroke="none"/>
        <path d="M485 1190h82v45h-82z" fill="#CFCFCF" stroke-width="6"/>
        <path d="M383 1232h286v84h-125l-18-42h-92l-18 42H383z" fill="#EFEFEF" stroke-width="6"/>
      </g>
    `,
  },
};

export function builtInSvgAsset(kind) {
  return BUILT_IN_SVG_ASSETS[kind] || null;
}

export function makeBuiltInSvgAssetObject(kind, box = {}) {
  const asset = builtInSvgAsset(kind);
  if (!asset) return null;

  const requestedW = Math.max(Number(box.w) || 0, 0);
  const requestedH = Math.max(Number(box.h) || 0, 0);
  const scale = Math.max(requestedW / asset.defaultWidth, requestedH / asset.defaultHeight, 1);
  const w = asset.defaultWidth * scale;
  const h = asset.defaultHeight * scale;
  const x = Number.isFinite(box.x) ? box.x : 0;
  const y = Number.isFinite(box.y) ? box.y : 0;

  return {
    id: null,
    type: "svgAsset",
    templateId: asset.templateId,
    assetKind: kind,
    x,
    y,
    w,
    h,
    rotation: 0,
    lockedAspectRatio: true,
    lockAspect: true,
    svgViewBox: asset.viewBox,
    svgContent: asset.content.trim(),
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,
  };
}
