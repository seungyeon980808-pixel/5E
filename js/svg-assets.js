/* Built-in SVG assets used by existing template/tool entries. */

const BUILT_IN_SVG_ASSETS = {
  pulley: {
    templateId: "M001",
    viewBox: "0 0 220 220",
    defaultWidth: 24,
    defaultHeight: 24,
    content: `
      <g fill-rule="evenodd" clip-rule="evenodd" stroke="#111" stroke-linecap="round" stroke-linejoin="round">
        <path d="M107 28c37.8 0 68.5 30.7 68.5 68.5S144.8 165 107 165 38.5 134.3 38.5 96.5 69.2 28 107 28Z" fill="#D8D8D8" stroke-width="7"/>
        <path d="M107 44c29 0 52.5 23.5 52.5 52.5S136 149 107 149s-52.5-23.5-52.5-52.5S78 44 107 44Z" fill="#F7F7F7" stroke-width="5"/>
        <path d="M107 63c18.5 0 33.5 15 33.5 33.5S125.5 130 107 130s-33.5-15-33.5-33.5S88.5 63 107 63Z" fill="#E4E4E4" stroke-width="5"/>
        <circle cx="107" cy="96.5" r="12.5" fill="#BDBDBD" stroke-width="5"/>
        <path d="M127.5 111.5 181 151c6.9 5.1 8.4 14.9 3.4 21.8-5.1 6.9-14.9 8.4-21.8 3.4L116 134.5c-7.1-6.4-7.7-17.4-1.3-24.5 3.4-3.8 8.5-5.4 12.8 1.5Z" fill="#F8F8F8" stroke-width="7"/>
        <circle cx="171.5" cy="163.5" r="22.5" fill="#D4D4D4" stroke-width="7"/>
        <circle cx="171.5" cy="163.5" r="8" fill="#F7F7F7" stroke-width="5"/>
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
