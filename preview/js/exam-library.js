import { insertImageFromSrc } from "./image-paste.js?v=1.6.0-workbench-polish-0928-final";
import { openObjectifyWithFile } from "./image-objectify.js?v=1.6.0-preview-lite-hybrid-0922";

import { createPdfLibraryUi } from "./pdf-library/pdf-library-ui.js?v=1.6.0-preview-crop-quality-0920-1806";
import { defaultRecentThreePack } from "./pdf-library/default-pack-config.js?v=1.6.0-preview-labeler-0917-1111";
import { loadBundledDesktopPack } from "./pdf-library/desktop-pack.js?v=1.6.0-preview-labeler-0917-1111";
import { registerPdfReferencePicker } from "./pdf-library/reference-picker.js?v=1.6.0-preview-labeler-0917-1111";
import { mergePreferredCatalogs } from "./pdf-library/catalog-merge.js?v=1.6.0-preview-labeler-0917-1111";
import { createUnifiedLibraryProvider } from "./library/provider.js?v=1.6.0-workbench-polish-0928-final";
import { createUnifiedLibraryUi, unifiedLibrarySourceMetadata, unifiedLibraryTransfer } from "./unified-library-ui.js?v=1.6.0-ai-latest-fixes-0928";
import { insertPartsAsset, loadPartsManifest, materializePartsAsset } from "./parts-library.js?v=1.6.0-preview-labeler-0917-1111";
const MAX_RENDER = 60; // 그리드에 한 번에 그리는 카드 수 (초과분은 안내문으로 표시)

export function unifiedImageInsertionOptions(result, asset) {
  return {
    preserveBytes: true,
    centerArtboard: true,
    sourceMetadata: unifiedLibrarySourceMetadata(result, asset),
  };
}

export function createUnifiedLibraryConsumerRegistry(beginSelection) {
  let consumer = null;
  return Object.freeze({
    register(nextConsumer) {
      if (!nextConsumer || typeof nextConsumer.onAdd !== "function") throw new TypeError("A unified library onAdd consumer is required.");
      if (consumer) throw new Error("A unified library consumer is already registered.");
      consumer = nextConsumer;
      return () => { if (consumer === nextConsumer) consumer = null; };
    },
    begin(trigger) {
      if (!consumer) throw new Error("No unified library consumer is registered.");
      return beginSelection(consumer, trigger);
    },
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return blobToDataUrl(await response.blob());
}


export function initExamLibrary(state, { openAi, openIndependentReferences } = {}) {
  const openButton = document.getElementById("exam-library-open");
  if (!openButton) return;

  const pdfPanel = document.createElement("section");
  let pdfSearchWorker = null;
  let pdfSearchRequestId = 0;
  let pdfSearchWorkerKey = "";
  const pdfSearchRequests = new Map();
  let pdfSearchKey = "";
  const workerSearch = (message) => new Promise((resolve, reject) => {
    const requestId = ++pdfSearchRequestId;
    pdfSearchRequests.set(requestId, { resolve, reject });
    pdfSearchWorker.postMessage({ id: requestId, ...message });
  });
  const ensurePdfSearchWorker = () => {
    if (pdfSearchWorker) return pdfSearchWorker;
    pdfSearchWorker = new Worker(new URL("./pdf-library/search-worker.js?v=1.6.0-preview-common-year-login-0918-1302", import.meta.url), { type: "module" });
    pdfSearchWorker.addEventListener("message", (event) => {
      const request = pdfSearchRequests.get(event.data?.id);
      if (!request) return;
      pdfSearchRequests.delete(event.data.id);
      if (event.data.ok) request.resolve(event.data.result);
      else request.reject(new Error(event.data.error?.message || "PDF 검색 작업이 실패했습니다."));
    });
    pdfSearchWorker.addEventListener("error", (event) => {
      for (const request of pdfSearchRequests.values()) request.reject(event.error || new Error("PDF 검색 작업이 중단되었습니다."));
      pdfSearchRequests.clear();
    });
    return pdfSearchWorker;
  };
  let unifiedUi = null;
  const pdfUi = createPdfLibraryUi({
    state,
    host: pdfPanel,
    loadRuntime: async () => {
      const { createPdfRuntime } = await import("./pdf-library/pdf-runtime.js?v=1.6.0-preview-crop-quality-0920-1806");
      return createPdfRuntime();
    },
    searchDocuments: async (documents, query, { filters = {}, prebuiltIndexes = [], limit = MAX_RENDER } = {}) => {
      const prebuiltDocumentIds = new Set(prebuiltIndexes.flatMap((source) => source.documents.map((document) => document.id)));
      const dynamicDocuments = documents.filter((document) => !prebuiltDocumentIds.has(document.id));
      const key = [
        ...dynamicDocuments.map((document) => `${document.id}:${document.status}:${document.pageCount}`),
        ...prebuiltIndexes.map((source) => `prebuilt:${source.documents.map((document) => `${document.id}:${document.pageCount}`).join(",")}:${source.index.entries.length}`),
      ].join("|");
      if (key !== pdfSearchKey) {
        pdfSearchKey = key;
        const worker = ensurePdfSearchWorker();
        if (pdfSearchWorkerKey !== key) {
          await workerSearch({ type: "replace", documents: dynamicDocuments, prebuilt: prebuiltIndexes });
          pdfSearchWorkerKey = key;
        }
      }
      return workerSearch({ type: "search", options: { query, filters, limit } });
    },
    invalidateSearch: () => {
      pdfSearchKey = "";
      pdfSearchWorkerKey = "";
    },
    insertImage: insertImageFromSrc,
    openIndependentReferences,
    loadDesktopAdapter: async (runtime) => {
      const { createDesktopPdfLibraryAdapter, hasDesktopPdfLibrary } = await import("./pdf-library/desktop-adapter.js?v=1.6.0-preview-crop-quality-0920-1806");
      return hasDesktopPdfLibrary() ? createDesktopPdfLibraryAdapter({ runtime }) : null;
    },
    onCatalogChange: () => void unifiedUi?.refresh(),
  });
  const isDesktopLibrary = Boolean(globalThis.fiveEDesktop?.pdfLibrary);
  let packManagement = null;
  let installedPackDocuments = [];
  let installedPackSearchIndex = { schemaVersion: "pdf-search-index-v1", entries: [] };
  let defaultPack = null;
  let drivePack = null;
  let drivePackDocumentIds = new Set();
  const mountPackManagement = async () => {
    if (packManagement) return packManagement;
    const [
      { createIndexedDbPackAdapter, createPackStore },
      { mountPackManagement: mount },
      { loadRemotePack },
      { configuredGoogleDriveGatewayUrl, createGoogleDriveConnection, PROVIDED_DRIVE_FOLDER_URL, driveFolderPack, parseGoogleDriveFolderUrl },
    ] = await Promise.all([
      import("./pdf-library/pack-store.js?v=1.6.0-preview-labeler-0917-1111"),
      import("./pdf-library/pack-management.js?v=1.6.0-preview-library-popup-0919-1630"),
      import("./pdf-library/remote-pack.js?v=1.6.0-preview-labeler-0917-1111"),
      import("./pdf-library/google-drive.js?v=1.6.0-preview-labeler-0917-1111"),
    ]);
    const store = createPackStore({ adapter: createIndexedDbPackAdapter() });
    const configured = defaultRecentThreePack();
    const gatewayBaseUrl = await configuredGoogleDriveGatewayUrl();
    const driveConnection = createGoogleDriveConnection({ gatewayBaseUrl });
    const providedConnection = createGoogleDriveConnection({ gatewayBaseUrl, storage: null });
    const isProvidedFolder = (url) => Boolean(url) && parseGoogleDriveFolderUrl(url).folderId === parseGoogleDriveFolderUrl(PROVIDED_DRIVE_FOLDER_URL).folderId;
    const syncPackCatalog = () => {
      const preferredRemote = mergePreferredCatalogs(defaultPack, drivePack);
      const merged = mergePreferredCatalogs(
        preferredRemote,
        isDesktopLibrary ? { documents: installedPackDocuments, searchIndex: installedPackSearchIndex } : null,
      );
      return pdfUi.syncPackCatalog({
        documents: merged.documents,
        searchIndex: merged.searchIndex,
        openDocument: (runtime, document) => merged.installedDocumentIds.has(document.id)
          ? store.openDocument(runtime, document)
          : drivePackDocumentIds.has(document.id)
            ? drivePack.openDocument(runtime, document)
            : defaultPack.openDocument(runtime, document),
        downloadDocument: (document) => drivePackDocumentIds.has(document.id)
          ? drivePack.downloadDocument(document)
          : defaultPack?.downloadDocument?.(document),
        canDownloadDocument: (document) => !merged.installedDocumentIds.has(document.id)
          && (drivePackDocumentIds.has(document.id) || typeof defaultPack?.downloadDocument === "function"),
      });
    };
    packManagement = mount({
      host: pdfUi.getPackHost(),
      driveHost: pdfUi.getDriveHost(),
      onProvidedStatus: (message, error) => unifiedUi?.setProvidedStatus(message, error),
      store,
      googleDrive: {
        provided: !isDesktopLibrary,
        gatewayConfigured: driveConnection.gatewayConfigured,
        savedFolderUrl: () => {
          const saved = driveConnection.savedFolderUrl();
          return !isDesktopLibrary && isProvidedFolder(saved) ? "" : saved;
        },
        async connect(folderUrl) {
          if (!isDesktopLibrary && isProvidedFolder(folderUrl)) throw new Error("이 폴더는 기본 제공 자료로 이미 연결되어 있습니다.");
          const connection = await driveConnection.connect(folderUrl);
          drivePack = driveFolderPack(connection.pack, folderUrl);
          drivePackDocumentIds = new Set(drivePack.documents.map((document) => document.id));
          await syncPackCatalog();
          pdfUi.setSourceStatus(`${drivePack.title}에서 ${drivePack.documentCount}개 PDF와 사전 색인을 읽었습니다.`);
          return connection;
        },
        async disconnect() {
          driveConnection.disconnect();
          drivePack = null;
          drivePackDocumentIds = new Set();
          await syncPackCatalog();
          pdfUi.setSourceStatus("Google Drive 폴더 연결을 해제했습니다.");
        },
      },
      onUpdateCandidate: isDesktopLibrary && configured.baseUrl ? async () => {
        const latest = await loadRemotePack({ baseUrl: defaultRecentThreePack().baseUrl });
        defaultPack = latest;
        packManagement.setCandidate(latest);
        await syncPackCatalog();
      } : null,
      onChange: (snapshot) => {
        if (snapshot.status !== "ready") return;
        void store.enabledCatalog().then((catalog) => {
          installedPackDocuments = [...catalog.documents];
          installedPackSearchIndex = catalog.searchIndex;
          return syncPackCatalog();
        });
      },
    });
    const connectProvided = async () => {
      packManagement.setProvidedStatus("제공 자료를 연결하는 중…");
      try {
        const connection = await providedConnection.connect(PROVIDED_DRIVE_FOLDER_URL);
        defaultPack = driveFolderPack(connection.pack, PROVIDED_DRIVE_FOLDER_URL);
        await syncPackCatalog();
        packManagement.setProvidedStatus(`${defaultPack.title} · ${defaultPack.documentCount}개 PDF 연결됨`);
        pdfUi.setSourceStatus(`제공 자료 ${defaultPack.documentCount}개 PDF 연결됨`);
      } catch (error) {
        const message = `제공 자료 연결 실패: ${error instanceof Error ? error.message : error}`;
        packManagement.setProvidedStatus(message, true);
        pdfUi.setSourceStatus(message, true);
      }
    };
    packManagement.setProvidedRetry(connectProvided);
    unifiedUi?.setProvidedRetry(connectProvided);
    if (isDesktopLibrary) {
      const bundled = await loadBundledDesktopPack();
      if (bundled) {
        defaultPack = bundled;
        packManagement.setCandidate(bundled);
        await syncPackCatalog();
      }
      if (!bundled && configured.baseUrl) {
        void loadRemotePack({ baseUrl: configured.baseUrl }).then((pack) => {
          defaultPack = pack;
          packManagement.setCandidate(pack);
          return syncPackCatalog();
        }).catch((error) => {
          pdfUi.setSourceStatus(`기본 PDF 자료팩을 불러오지 못했습니다. 자료팩 폴더를 설치하거나 PDF를 직접 가져오세요. (${error instanceof Error ? error.message : error})`, true);
        });
      } else if (!bundled) {
        pdfUi.setSourceStatus(configured.message, true);
      }
    } else {
      void connectProvided();
    }
    return packManagement;
  };

  let partsManifest = null;
  let importedImages = [];
  let unifiedProviderCache = null;
  let unifiedProviderCacheKey = "";
  async function ensureUnifiedManifests() {
    if (!partsManifest) partsManifest = await loadPartsManifest();
  }

  async function materializeImportedImage({ result, item }) {
    if (item?.bytes instanceof Uint8Array) {
      const type = item.mimeType || "image/png";
      return { bytes: item.bytes.slice(), dataUrl: await blobToDataUrl(new Blob([item.bytes], { type })), result };
    }
    if (item?.imageId && globalThis.fiveEDesktop?.pdfLibrary?.readImage) {
      const opened = await globalThis.fiveEDesktop.pdfLibrary.readImage(item.imageId);
      const bytes = opened.data instanceof Uint8Array ? opened.data : Uint8Array.from(opened.data || []);
      return { bytes, dataUrl: await blobToDataUrl(new Blob([bytes], { type: opened.mimeType || item.mimeType || "image/png" })), result };
    }
    return { dataUrl: await urlToDataUrl(result.preview.url), result };
  }

  async function getUnifiedProvider() {
    await ensureUnifiedManifests();
    const catalog = pdfUi.getCatalog();
    const resolvedPdfResults = pdfUi.getResolvedResults();
    const cacheKey = JSON.stringify([
      catalog.revision,
      importedImages.map((item) => [item.id, item.version ?? item.bytes?.byteLength ?? null]),
      resolvedPdfResults.map((item) => item.id),
    ]);
    if (unifiedProviderCache && unifiedProviderCacheKey === cacheKey) return unifiedProviderCache;
    unifiedProviderCacheKey = cacheKey;
    unifiedProviderCache = createUnifiedLibraryProvider({
      partsManifest: isDesktopLibrary ? partsManifest : null,
      pdfDocuments: catalog.documents,
      pdfSearchIndex: catalog.searchIndex,
      revision: catalog.revision,
      resolvedPdfResults,
      importedImages,
      searchPdf: (options) => pdfUi.searchPdf(options),
      cropForResult: (result) => pdfUi.cropForResult(result),
      materializers: {
        pdf: (input) => pdfUi.materializePdf(input),
        part: ({ item, options }) => materializePartsAsset(item, options),
        importedImage: materializeImportedImage,
      },
    });
    return unifiedProviderCache;
  }

  async function insertUnifiedResult(result, asset, options, context = {}) {
    if (result.provenance.provider === "parts") {
      insertPartsAsset(state, {
        item: { id: result.provenance.itemId, defaultLevel: result.metadata?.defaultLevel },
        asset,
        widthMm: options.targetMm,
        lineLevel: options.mode === "original" ? "RAW" : options.level,
        lineFill: options.fill,
      });
      return;
    }
    const dataUrl = asset.dataUrl || asset.dataUri || asset.url;
    if (!dataUrl) throw new Error("삽입할 이미지 데이터를 만들지 못했습니다.");
    await insertImageFromSrc(state, dataUrl, { ...unifiedImageInsertionOptions(result, asset), isCurrent: context.isCurrent });
  }

  unifiedUi = createUnifiedLibraryUi({
    getProvider: getUnifiedProvider,
    insertMaterialized: insertUnifiedResult,
    openObjectify: async (result, asset, context = {}) => {
      const transfer = unifiedLibraryTransfer(result, asset);
      const dataUrl = transfer.dataUrl;
      if (!dataUrl) throw new Error("객체화할 이미지 데이터를 만들지 못했습니다.");
      const response = await fetch(dataUrl);
      if (context.isCurrent && !context.isCurrent()) return;
      const blob = await response.blob();
      if (context.isCurrent && !context.isCurrent()) return;
      const safeName = `${String(result.title || "library-image").replace(/[\\/:*?"<>|]+/gu, "-")}.png`;
      if (!openObjectifyWithFile(new File([blob], safeName, { type: blob.type || "image/png" }), { sourceMetadata: transfer.source })) throw new Error("이미지 객체화 모듈이 준비되지 않았습니다.");
    },
    openAi,
    openIndependentReferences,
    pdfUi,
    onImportedImages: async (files) => {
      const records = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        records.push({ id: `browser-image:${crypto.randomUUID()}`, fileName: file.name, name: file.name, mimeType: file.type, bytes, sourceId: "browser-imports", sourceLabel: "가져온 이미지" });
      }
      importedImages = [...importedImages, ...records];
    },
    onDesktopSnapshot: (snapshot) => {
      const browserImports = importedImages.filter((item) => !item.imageId);
      const desktopImages = (snapshot?.images || []).map((item) => ({
        ...item,
        id: item.imageId,
        fileName: item.name,
        sourceId: item.connectionId || "desktop",
        sourceLabel: "연결한 폴더",
      }));
      importedImages = [...browserImports, ...desktopImages];
    },
  });
  const unifiedConsumerRegistry = createUnifiedLibraryConsumerRegistry((consumer, trigger) =>
    unifiedUi.beginReferenceSelection({ ...consumer, onComplete: consumer.onComplete ?? unifiedUi.close }, trigger || openButton));

  /* ----- open/close ----- */
  const openLibrary = async (trigger) => {
    const opening = unifiedUi.open(trigger || openButton);
    void mountPackManagement().catch((error) => pdfUi.setSourceStatus(`자료팩 관리 열기 실패: ${error instanceof Error ? error.message : error}`, true));
    await opening;
  };
  openButton.addEventListener("click", () => void openLibrary(openButton));
  registerPdfReferencePicker(async ({ onAdd, onAddMany, onStatus, trigger } = {}) => {
    void mountPackManagement().catch((error) => onStatus?.(error instanceof Error ? error.message : String(error), "error"));
    await unifiedUi.beginReferenceSelection({ onAdd, onAddMany, onStatus, onComplete: unifiedUi.close }, trigger || openButton);
  });
  return Object.freeze({
    openLibrary,
    registerUnifiedLibraryConsumer: (consumer) => unifiedConsumerRegistry.register(consumer),
    beginUnifiedLibrarySelection: (trigger) => unifiedConsumerRegistry.begin(trigger),
  });
}
