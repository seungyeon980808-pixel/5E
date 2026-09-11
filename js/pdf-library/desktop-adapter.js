import { createPdfRuntime } from "./pdf-runtime.js";

function pdfOpenDiagnostic(error) {
  const message = error instanceof Error && error.message ? error.message : "PDF 문서를 열 수 없습니다.";
  return { code: "PDF_OPEN_FAILED", message: message.slice(0, 2000), stage: "open", recoverable: true };
}

function desktopBridge() {
  const bridge = globalThis.fiveEDesktop?.pdfLibrary;
  if (!bridge) throw new Error("The desktop PDF library bridge is unavailable.");
  return bridge;
}

function byteView(result) {
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (result?.data instanceof Uint8Array) return result.data;
  if (Array.isArray(result?.data)) return Uint8Array.from(result.data);
  throw new TypeError("The desktop bridge returned invalid PDF bytes.");
}

export function createDesktopPdfLibraryAdapter(options = {}) {
  const bridge = options.bridge || desktopBridge();
  const runtime = options.runtime || createPdfRuntime(options.runtimeOptions);

  async function openDocument(document) {
    await bridge.saveIndexState?.({ documentId: document.documentId, version: document.version, state: "reading" });
    try {
      const result = await bridge.read({ documentId: document.documentId });
      const record = await runtime.openDocument({
        id: document.documentId,
        title: document.name,
        source: {
          kind: "file",
          locator: document.documentId,
          displayName: document.name,
          sha256: document.version,
          connectionId: document.connectionId,
          relativePath: document.relativePath,
        },
        data: byteView(result),
      });
      await bridge.saveIndex({ documentId: document.documentId, version: document.version, index: record });
      if (record.status === "image-only") {
        await bridge.saveIndexState?.({
          documentId: document.documentId, version: document.version, state: "needs-ocr", diagnostic: {
          code: "PDF_TEXT_LAYER_MISSING", message: "텍스트 층이 없어 문자 인식이 필요합니다.", stage: "extract", recoverable: true,
          },
        });
      }
      return record;
    } catch (error) {
      await bridge.saveIndexState?.({
        documentId: document.documentId, version: document.version, state: "failed", diagnostic: pdfOpenDiagnostic(error),
      }).catch(() => {});
      throw error;
    }
  }

  return Object.freeze({
    available: true,
    runtime,
    pickFolder: () => bridge.pickFolder(),
    ensureDefaultFolder: () => bridge.ensureDefaultFolder(),
    connections: () => bridge.connections(),
    folderTree: (connectionId) => bridge.folderTree({ connectionId }),
    setFolderSelection: (folderId, selected) => bridge.setFolderSelection({ folderId, selected }),
    disconnect: (connectionId) => bridge.disconnect({ connectionId }),
    sync: (connectionId, operationId = crypto.randomUUID()) => bridge.sync({ connectionId, operationId }),
    cancel: (operationId) => bridge.cancel({ operationId }),
    list: (connectionId) => bridge.list(connectionId ? { connectionId } : {}),
    readImage: (imageId) => bridge.readImage({ imageId }),
    openFolder: (folderId) => bridge.openFolder({ folderId }),
    revealItem: (item) => bridge.revealItem(item),
    readIndex: (documentId) => bridge.loadIndex({ documentId }),
    readIndexState: (documentId) => bridge.indexState?.({ documentId }),
    saveIndexState: (documentId, version, state, diagnostic = null) => bridge.saveIndexState?.({ documentId, version, state, diagnostic }),
    listCorrections: (documentId) => bridge.listCorrections?.({ documentId }),
    saveCorrection: (correction) => bridge.saveCorrection?.(correction),
    deleteCorrection: (documentId, version, correctionId) => bridge.deleteCorrection?.({ documentId, version, correctionId }),
    saveDocumentIndex: (documentId, version, index) => bridge.saveIndex({ documentId, version, index }),
    openDocument,
    capabilities: () => bridge.capabilities(),
    onProgress: (callback) => bridge.onProgress(callback),
  });
}

export function hasDesktopPdfLibrary() {
  return Boolean(globalThis.fiveEDesktop?.pdfLibrary);
}
