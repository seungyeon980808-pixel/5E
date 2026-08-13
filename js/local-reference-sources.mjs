const IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;
const PDF_PATTERN = /\.pdf$/i;

function fileId(file, relativePath) {
  return `web:${relativePath}:${file.size}:${file.lastModified}`;
}

export function sourcesFromWebFiles(files) {
  const images = [];
  const pdfs = [];
  for (const file of Array.from(files || [])) {
    const rawFile = file.file || file;
    const relativePath = file.webkitRelativePath || file.relativePath || file.name;
    if (IMAGE_PATTERN.test(file.name)) {
      images.push({
        id: fileId(file, relativePath), name: file.name, relativePath,
        size: file.size, modifiedAt: file.lastModified, file: rawFile, kind: "image",
      });
    } else if (PDF_PATTERN.test(file.name)) {
      pdfs.push({
        id: fileId(file, relativePath), name: file.name, relativePath,
        size: file.size, modifiedAt: file.lastModified, file: rawFile, kind: "pdf",
        read: () => rawFile.arrayBuffer(),
      });
    }
  }
  return { images, pdfs };
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
  async function connect() {
    if (typeof browser?.showDirectoryPicker !== "function") return { status: "unsupported" };
    try {
      handle = await browser.showDirectoryPicker({ id: "5e-local-reference", mode: "read" });
      return await readBrowserFolder(handle);
    } catch (error) {
      if (error?.name === "AbortError") return { status: "cancelled" };
      throw error;
    }
  }
  return { connect, reconnect: () => handle ? readBrowserFolder(handle) : connect() };
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

export function sourcesFromDesktopResult(result, desktop) {
  const pdfs = (result.pdfs || []).map((item) => ({
    ...item,
    id: `desktop:${item.path}`,
    read: () => desktop.readLocalPdf(item.path),
  }));
  return { images: result.items || [], pdfs };
}

export function readWebImage(item) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("이미지 파일을 읽지 못했습니다."));
    reader.readAsDataURL(item.file);
  });
}
