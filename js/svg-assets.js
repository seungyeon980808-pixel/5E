/* Built-in SVG assets used by existing template/tool entries. */

const BUILT_IN_SVG_ASSETS = {
  pulley: {
    templateId: "M001",
    viewBox: "0 0 172 152",
    defaultWidth: 6 * 172 / 152,
    defaultHeight: 6,
    snapAnchors: [
      { key: "wheel-center", x: 71, y: 53 },
      { key: "axle-center", x: 71, y: 53 },
      { key: "handle-end-hole-center", x: 113.5, y: 132 },
      { key: "wheel-contact-top", x: 71, y: 15 },
      { key: "wheel-contact-left", x: 33, y: 53 },
      { key: "wheel-contact-right", x: 109, y: 53 },
      { key: "wheel-contact-bottom", x: 71, y: 91 },
    ],
    content: `
      <g><path d="M69.25,15.52 C105.66,14.23 125.37,52.36 103.50,81.55 C111.68,97.34 120.89,113.12 128.62,129.63 C129.89,142.25 121.13,149.21 107.00,146.36 C95.48,131.75 87.63,111.25 77.54,94.81 C23.08,96.52 18.09,23.68 69.25,15.52 Z" fill="#020101" fill-rule="nonzero"/><g><path d="M82.93,48.25 C84.27,50.18 125.40,127.78 125.40,127.78 C130.19,142.13 113.46,150.09 104.92,140.25 L60.79,57.83 C57.44,45.43 73.68,34.95 82.93,48.25 Z" fill="#FEFEFE" fill-rule="nonzero"/><g><path d="M115.93,123.50 C125.44,124.89 125.30,141.91 113.05,140.62 C102.16,139.47 104.04,121.76 115.93,123.50 Z" fill="#020101" fill-rule="nonzero"/><path d="M120.60,132.43 C120.18,140.63 107.27,139.18 107.92,131.66 C108.58,123.99 121.01,124.38 120.60,132.43 Z" fill="#D3D3D3" fill-rule="nonzero"/></g><g><path d="M81.20,52.25 C85.00,65.24 62.07,67.83 64.50,52.97 C65.87,44.59 78.78,44.00 81.20,52.25 Z" fill="#020101" fill-rule="nonzero"/><path d="M76.35,59.97 C69.08,64.64 62.97,53.83 69.67,49.41 C76.09,45.17 82.97,55.73 76.35,59.97 Z" fill="#D3D3D3" fill-rule="nonzero"/></g></g><path d="M100.55,65.49 C100.11,66.64 98.76,70.92 97.25,69.99 C96.72,69.66 85.75,47.14 83.46,44.56 C73.45,33.21 53.77,43.10 59.06,59.75 C59.83,62.15 71.47,82.31 71.50,83.09 C71.50,83.09 71.50,84.48 71.50,84.48 C41.87,82.53 33.38,44.71 57.57,29.48 C80.79,14.87 110.59,39.18 100.55,65.49 Z" fill="#FEFEFE" fill-rule="nonzero"/><path d="M102.41,77.00 C96.40,75.53 101.65,69.71 102.63,66.75 C114.80,29.98 70.48,8.45 48.62,33.98 C33.15,52.04 42.94,78.89 61.77,84.96 C66.47,87.34 75.46,84.30 75.50,91.50 C33.73,92.45 22.89,42.06 54.25,22.97 C89.36,3.48 125.41,44.05 102.41,77.00 Z" fill="#D3D3D3" fill-rule="nonzero"/></g>
    `,
  },
  clamp: {
    templateId: "M004",
    viewBox: "0 0 850 1440",
    defaultWidth: 40 * 850 / 1440,
    defaultHeight: 40,
    snapAnchors: [
      { key: "base-center", x: 526, y: 1274 },
      { key: "vertical-rod-top", x: 524.5, y: 118 },
      { key: "clamp-jaw-tip", x: 90, y: 241 },
      { key: "clamp-jaw-center", x: 412, y: 251 },
    ],
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
    snapAnchors: Array.isArray(asset.snapAnchors) ? asset.snapAnchors.map((anchor) => ({ ...anchor })) : [],
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,
  };
}
