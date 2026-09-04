const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
const PDF_PATTERN = /\.pdf$/i;

function fileId(file, relativePath) {
  return `web:${relativePath}:${file.size}:${file.lastModified}`;
}

function sourceLabel(item) {
  return String(item.relativePath || item.name || "").replaceAll("\\", "/");
}

function compareSources(left, right) {
  const leftLabel = sourceLabel(left).toLowerCase();
  const rightLabel = sourceLabel(right).toLowerCase();
  if (leftLabel < rightLabel) return -1;
  if (leftLabel > rightLabel) return 1;
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function withSourceLabel(item) {
  return { ...item, sourceLabel: sourceLabel(item) };
}

function folderInventory(images, pdfs) {
  return [...images, ...pdfs].sort(compareSources);
}

export function sourcesFromWebFiles(files) {
  const images = [];
  const pdfs = [];
  for (const file of Array.from(files || [])) {
    const rawFile = file.file || file;
    const relativePath = file.webkitRelativePath || file.relativePath || file.name;
    if (IMAGE_PATTERN.test(file.name)) {
      images.push(withSourceLabel({
        id: fileId(file, relativePath), name: file.name, relativePath,
        size: file.size, modifiedAt: file.lastModified, file: rawFile, kind: "image",
      }));
    } else if (PDF_PATTERN.test(file.name)) {
      pdfs.push(withSourceLabel({
        id: fileId(file, relativePath), name: file.name, relativePath,
        size: file.size, modifiedAt: file.lastModified, file: rawFile, kind: "pdf",
        read: () => rawFile.arrayBuffer(),
      }));
    }
  }
  images.sort(compareSources);
  pdfs.sort(compareSources);
  return { images, pdfs, files: folderInventory(images, pdfs) };
}

async function collectWebFiles(handle, prefix = handle.name) {
  const files = [];
  for await (const entry of handle.values()) {
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.kind === "directory") {
      files.push(...await collectWebFiles(entry, relativePath));
    } else {
      const file = await entry.getFile();
      files.push({ file, name: file.name, relativePath, size: file.size, lastModified: file.lastModified });
    }
  }
  return files;
}

async function readBrowserFolder(handle) {
  const options = { mode: "read" };
  const permission = await handle.queryPermission(options);
  const granted = permission === "granted"
    || (permission === "prompt" && await handle.requestPermission(options) === "granted");
  if (!granted) return { status: "denied" };
  return {
    status: "connected",
    folderLabel: handle.name,
    assets: sourcesFromWebFiles(await collectWebFiles(handle)),
  };
}

export function createBrowserFolderConnector(browser) {
  let handle;
  let epoch = 0;
  async function readSelected(selected, current) {
    const result = await readBrowserFolder(selected);
    if (current !== epoch) return { status: "superseded" };
    handle = result.status === "connected" ? selected : undefined;
    return result;
  }
  async function connect() {
    if (typeof browser?.showDirectoryPicker !== "function") return { status: "unsupported" };
    const current = ++epoch;
    try {
      const selected = await browser.showDirectoryPicker({ id: "5e-local-reference", mode: "read" });
      return await readSelected(selected, current);
    } catch (error) {
      if (current !== epoch) return { status: "superseded" };
      if (error?.name === "AbortError") return { status: "cancelled" };
      throw error;
    }
  }
  async function reconnect() {
    if (!handle) return connect();
    const current = ++epoch;
    return readSelected(handle, current);
  }
  return { connect, reconnect };
}

export function createDesktopFolderConnector(desktop) {
  async function connect() {
    const picked = await desktop.pickLocalImageFolder();
    if (!picked?.folder) return { status: "cancelled" };
    const result = await desktop.listLocalImages(picked.folder);
    return {
      status: "connected",
      folderLabel: result.folder,
      assets: sourcesFromDesktopResult(result, desktop),
    };
  }
  return { connect, reconnect: connect };
}

export function createFolderConnectionSession(connector, accept) {
  let epoch = 0;
  async function reconnect() {
    const current = ++epoch;
    const result = await connector.reconnect();
    if (current !== epoch) return { status: "superseded" };
    if (result.status === "connected") await accept(result.assets, result.folderLabel);
    return current === epoch ? result : { status: "superseded" };
  }
  return { reconnect };
}

export function sourcesFromDesktopResult(result, desktop) {
  const images = (result.items || []).map((item) => withSourceLabel({
    ...item,
    kind: "image",
  })).sort(compareSources);
  const pdfs = (result.pdfs || []).map((item) => withSourceLabel({
    ...item,
    id: `desktop:${item.path}`,
    kind: "pdf",
    read: () => desktop.readLocalPdf(item.path),
  })).sort(compareSources);
  return { images, pdfs, files: folderInventory(images, pdfs) };
}

export function readWebImage(item) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(item.file);
  });
}
