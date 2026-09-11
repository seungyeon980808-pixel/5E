import { loadRemotePack } from "./remote-pack.js";

const BUNDLED_BASE_URL = "https://bundled-pdf-pack.5e.invalid/recent-three/";

function byteView(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value?.data instanceof Uint8Array) return value.data;
  if (Array.isArray(value?.data)) return Uint8Array.from(value.data);
  throw new TypeError("The desktop bridge returned invalid bundled PDF bytes.");
}

export async function loadBundledDesktopPack(bridge = globalThis.fiveEDesktop?.pdfLibrary) {
  if (!bridge?.bundledPack || !bridge?.readBundledPack) return null;
  const description = await bridge.bundledPack();
  if (!description?.available) return null;
  const base = new URL(BUNDLED_BASE_URL);
  return loadRemotePack({
    baseUrl: base.href,
    fetcher: async (requestUrl) => {
      const url = new URL(requestUrl);
      if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) {
        return new Response(null, { status: 404 });
      }
      const bytes = byteView(await bridge.readBundledPack(url.pathname.slice(base.pathname.length)));
      return new Response(bytes, { status: 200, headers: { "content-length": String(bytes.byteLength) } });
    },
  });
}
