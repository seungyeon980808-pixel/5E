const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { MAX_IMAGE_BYTES, MAX_PDF_BYTES, hasPdfSignature, isPathInside, readFileBounded, scanPdfFolder } = require("./pdf-library-scanner.cjs");

const INDEX_STATES = Object.freeze(["reading", "unindexed", "indexing", "searchable", "scan-only", "needs-ocr", "cancelled", "failed"]);
const EMPTY_STATE = Object.freeze({
  schemaVersion: 1, connections: [], folders: [], documents: [], images: [], indexes: {}, indexStates: {}, corrections: {},
});

function parseStoredCorrection(input, document) {
  if (!input || input.schemaVersion !== "pdf-item-correction-v1" || input.documentId !== document.documentId
    || input.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid persisted correction.");
  const pageNumber = requirePositiveInteger(input.pageNumber, "correction page number");
  const itemNumber = requirePositiveInteger(input.itemNumber, "correction item number");
  const correctionId = `${document.documentId}:${pageNumber}:${itemNumber}`;
  if (input.correctionId !== correctionId || !Number.isFinite(Date.parse(input.updatedAt))) {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid persisted correction.");
  }
  return {
    schemaVersion: "pdf-item-correction-v1", correctionId, documentId: document.documentId,
    version: document.version, pageNumber, itemNumber,
    label: requireText(input.label, "correction label", 200), rect: requireRect(input.rect), updatedAt: input.updatedAt,
  };
}

function persistLoadedRepair(storagePath, value) {
  const temporaryPath = `${storagePath}.${process.pid}.${crypto.randomUUID()}.repair.tmp`;
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value), { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporaryPath, storagePath);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch {}
    throw error;
  }
}

class PdfLibraryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PdfLibraryError";
    this.code = code;
  }
}

function loadState(storagePath) {
  try {
    const value = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    if (value?.schemaVersion !== 1 || !Array.isArray(value.connections) || !Array.isArray(value.documents) || !value.indexes) {
      return structuredClone(EMPTY_STATE);
    }
    const indexStates = value.indexStates && typeof value.indexStates === "object" && !Array.isArray(value.indexStates)
      ? Object.fromEntries(Object.entries(value.indexStates).filter(([, item]) => item && typeof item === "object" && INDEX_STATES.includes(item.state))) : {};
    const corrections = {};
    const documentsById = new Map(value.documents.map((document) => [document.documentId, document]));
    let correctionsRepaired = false;
    if (value.corrections && typeof value.corrections === "object" && !Array.isArray(value.corrections)) {
      for (const [id, items] of Object.entries(value.corrections)) {
        const document = documentsById.get(id);
        if (!document || !Array.isArray(items)) { correctionsRepaired = true; continue; }
        const valid = new Map();
        for (const item of items.slice(0, 1001)) {
          try {
            const parsed = parseStoredCorrection(item, document);
            if (valid.has(parsed.correctionId)) correctionsRepaired = true;
            valid.set(parsed.correctionId, parsed);
          } catch {
            correctionsRepaired = true;
          }
        }
        if (items.length > 1000) correctionsRepaired = true;
        const records = [...valid.values()].slice(0, 1000);
        if (records.length) corrections[id] = records;
        else if (items.length) correctionsRepaired = true;
      }
    } else if (value.corrections !== undefined) {
      correctionsRepaired = true;
    }
    const loaded = {
      ...value,
      connections: value.connections.map((connection) => ({ selectionRules: { "": true }, ...connection })),
      folders: Array.isArray(value.folders) ? value.folders : [],
      images: Array.isArray(value.images) ? value.images : [],
      indexStates,
      corrections,
    };
    if (correctionsRepaired) persistLoadedRepair(storagePath, loaded);
    return loaded;
  } catch {
    return structuredClone(EMPTY_STATE);
  }
}

async function persistState(storagePath, value, signal) {
  if (signal?.aborted) throw new PdfLibraryError("PDF_LIBRARY_CANCELLED", "PDF folder scan was cancelled.");
  await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
  const temporaryPath = `${storagePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, JSON.stringify(value), { encoding: "utf8", flag: "wx" });
    if (signal?.aborted) throw new PdfLibraryError("PDF_LIBRARY_CANCELLED", "PDF folder scan was cancelled.");
    await fs.promises.rename(temporaryPath, storagePath);
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function requireId(value, kind) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", `Invalid ${kind}.`);
  }
  return value;
}

function requireText(value, kind, maximum = 1000) {
  if (typeof value !== "string" || value.trim() === "" || value.length > maximum) {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", `Invalid ${kind}.`);
  }
  return value;
}

function requirePositiveInteger(value, kind) {
  if (!Number.isInteger(value) || value < 1) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", `Invalid ${kind}.`);
  return value;
}

function requireRect(value) {
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => !Number.isFinite(item))) {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid correction rectangle.");
  }
  const [x, y, width, height] = value;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid correction rectangle.");
  }
  return [...value];
}

function parseIndexState(payload, document) {
  const name = payload?.state;
  if (!INDEX_STATES.includes(name)) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid PDF index state.");
  let diagnostic = null;
  if (payload.diagnostic != null) {
    if (typeof payload.diagnostic !== "object" || Array.isArray(payload.diagnostic)) {
      throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid PDF index diagnostic.");
    }
    diagnostic = {
      code: requireText(payload.diagnostic.code, "diagnostic code", 120),
      message: requireText(payload.diagnostic.message, "diagnostic message", 2000),
    };
    if (payload.diagnostic.stage !== undefined) diagnostic.stage = requireText(payload.diagnostic.stage, "diagnostic stage", 120);
    if (payload.diagnostic.recoverable !== undefined) {
      if (typeof payload.diagnostic.recoverable !== "boolean") throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Invalid diagnostic recovery flag.");
      diagnostic.recoverable = payload.diagnostic.recoverable;
    }
  }
  if (["failed", "scan-only", "needs-ocr", "cancelled"].includes(name) && diagnostic === null) {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", `The ${name} state requires a diagnostic.`);
  }
  return {
    schemaVersion: "pdf-index-state-v1",
    documentId: document.documentId,
    version: document.version,
    state: name,
    diagnostic,
    updatedAt: new Date().toISOString(),
  };
}

function readingIndexState(document) {
  return {
    schemaVersion: "pdf-index-state-v1", documentId: document.documentId, version: document.version,
    state: "unindexed", diagnostic: null, updatedAt: new Date().toISOString(),
  };
}

function correctionRecord(payload, document) {
  const pageNumber = requirePositiveInteger(payload?.pageNumber, "correction page number");
  const itemNumber = requirePositiveInteger(payload?.itemNumber, "correction item number");
  return {
    schemaVersion: "pdf-item-correction-v1",
    correctionId: `${document.documentId}:${pageNumber}:${itemNumber}`,
    documentId: document.documentId,
    version: document.version,
    pageNumber,
    itemNumber,
    label: requireText(payload?.label, "correction label", 200),
    rect: requireRect(payload?.rect),
    updatedAt: new Date().toISOString(),
  };
}

function applyCorrections(index, corrections) {
  if (!index || index.schemaVersion !== "pdf-search-index-v1" || !Array.isArray(index.entries)) return index;
  const projected = structuredClone(index);
  for (const correction of corrections || []) {
    let entry = projected.entries.find((candidate) => candidate.documentId === correction.documentId
      && candidate.pageNumber === correction.pageNumber && candidate.itemNumber === correction.itemNumber);
    if (!entry) {
      const page = projected.entries.find((candidate) => candidate.documentId === correction.documentId
        && candidate.pageNumber === correction.pageNumber);
      if (!page) continue;
      entry = {
        ...page,
        itemId: correction.correctionId,
        itemNumber: correction.itemNumber,
        text: `${correction.label} ${page.text || ""}`.trim(),
        normalized: `${correction.label.toLocaleLowerCase()} ${page.normalized || ""}`.trim(),
      };
      projected.entries.push(entry);
    }
    entry.itemNumber = correction.itemNumber;
    entry.itemLabel = correction.label;
    entry.source = {
      documentId: correction.documentId, pageNumber: correction.pageNumber,
      rect: [...correction.rect], fullPageFallback: false,
    };
    entry.correction = structuredClone(correction);
  }
  return projected;
}

function publicConnection(connection, documents, images = [], unavailable = false) {
  return {
    connectionId: connection.connectionId,
    name: connection.name,
    isDefault: Boolean(connection.isDefault),
    status: unavailable ? "unavailable" : "ready",
    documentCount: unavailable ? 0 : documents.filter((item) => item.connectionId === connection.connectionId && effectiveSelected(connection, parentPath(item.relativePath))).length,
    imageCount: unavailable ? 0 : images.filter((item) => item.connectionId === connection.connectionId && effectiveSelected(connection, parentPath(item.relativePath))).length,
  };
}

function publicDocument(document) {
  const { absolutePath: _absolutePath, ...value } = document;
  return value;
}

function publicImage(image) {
  const { absolutePath: _absolutePath, ...value } = image;
  return value;
}

function documentId(connectionId, relativePath) {
  return crypto.createHash("sha256").update(`${connectionId}\0${relativePath}`).digest("hex").slice(0, 32);
}

function folderId(connectionId, relativePath) {
  return crypto.createHash("sha256").update(`folder\0${connectionId}\0${relativePath}`).digest("hex").slice(0, 32);
}

function imageId(connectionId, relativePath) {
  return crypto.createHash("sha256").update(`image\0${connectionId}\0${relativePath}`).digest("hex").slice(0, 32);
}

function parentPath(relativePath) {
  const parent = path.posix.dirname(relativePath);
  return parent === "." ? "" : parent;
}

function isSameOrDescendant(parent, candidate) {
  return parent === "" || candidate === parent || candidate.startsWith(`${parent}/`);
}

function effectiveSelected(connection, relativePath) {
  let current = relativePath;
  while (true) {
    if (Object.hasOwn(connection.selectionRules || {}, current)) return connection.selectionRules[current];
    if (current === "") return true;
    current = parentPath(current);
  }
}

function createPdfLibraryService(options) {
  if (!options || typeof options.storagePath !== "string") {
    throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "A catalog storage path is required.");
  }
  let state = loadState(options.storagePath);
  const operations = new Map();
  const connectionGenerations = new Map();
  const unavailableConnections = new Set();
  const readFile = options.readFile;
  const scanFolder = options.scanFolder || scanPdfFolder;
  const writeState = options.persistState || persistState;
  let commitTail = Promise.resolve();

  async function readBytes(filePath, maxBytes, signal) {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > maxBytes) throw new PdfLibraryError("PDF_LIBRARY_TOO_LARGE", `Library file exceeds the ${maxBytes}-byte limit.`);
    const bytes = readFile
      ? await readFile(filePath)
      : await readFileBounded(filePath, { maxBytes, signal });
    if (bytes.byteLength > maxBytes) throw new PdfLibraryError("PDF_LIBRARY_TOO_LARGE", `Library file exceeds the ${maxBytes}-byte limit.`);
    return bytes;
  }

  async function commitMutation(build, signal) {
    const previous = commitTail;
    let release;
    commitTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      const mutation = build(state);
      await writeState(options.storagePath, mutation.next, signal);
      state = mutation.next;
      return mutation.result;
    } finally {
      release();
    }
  }

  function connectionFor(connectionId) {
    requireId(connectionId, "connection ID");
    const connection = state.connections.find((item) => item.connectionId === connectionId);
    if (!connection) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF folder is not connected.");
    return connection;
  }

  async function connect(folderPath, connectionOptions = {}) {
    if (typeof folderPath !== "string" || folderPath.length === 0) {
      throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "A PDF folder path is required.");
    }
    const root = await fs.promises.realpath(folderPath);
    const stat = await fs.promises.stat(root);
    if (!stat.isDirectory()) throw new PdfLibraryError("PDF_LIBRARY_FOLDER", "The selected path is not a folder.");
    const connection = {
      connectionId: crypto.randomUUID(),
      root,
      name: path.basename(root) || root,
      isDefault: Boolean(connectionOptions.isDefault),
      selectionRules: { "": true },
    };
    return commitMutation((current) => {
      const existing = current.connections.find((item) => item.root === root);
      if (existing) {
        if (!connectionOptions.isDefault || existing.isDefault) return { next: current, result: publicConnection(existing, current.documents, current.images) };
        const updated = { ...existing, isDefault: true };
        const next = { ...current, connections: current.connections.map((item) => item.connectionId === existing.connectionId ? updated : item) };
        return { next, result: publicConnection(updated, current.documents, current.images) };
      }
      const rootFolder = { folderId: folderId(connection.connectionId, ""), connectionId: connection.connectionId, relativePath: "", name: connection.name, documentCount: 0, imageCount: 0 };
      const next = { ...current, connections: [...current.connections, connection], folders: [...current.folders, rootFolder] };
      return { next, result: publicConnection(connection, next.documents, next.images) };
    });
  }

  async function ensureDefaultFolder() {
    if (typeof options.documentsPath !== "string" || options.documentsPath.length === 0) {
      throw new PdfLibraryError("PDF_LIBRARY_FOLDER", "The Documents folder is unavailable.");
    }
    const root = path.join(options.documentsPath, "5E", "내 자료");
    const required = ["기출문제", "교과서", "기타 자료"];
    const createdFolders = [];
    await fs.promises.mkdir(root, { recursive: true });
    for (const name of required) {
      const target = path.join(root, name);
      try {
        const stat = await fs.promises.stat(target);
        if (!stat.isDirectory()) throw new PdfLibraryError("PDF_LIBRARY_FOLDER", `${name} 경로가 폴더가 아닙니다.`);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        await fs.promises.mkdir(target);
        createdFolders.push(name);
      }
    }
    const connection = await connect(root, { isDefault: true });
    await sync({ connectionId: connection.connectionId, operationId: `default-${crypto.randomUUID()}` });
    return { connection: connections().find((item) => item.connectionId === connection.connectionId), createdFolders, tree: folderTree({ connectionId: connection.connectionId }).tree };
  }

  function connections() {
    return state.connections.map((item) => publicConnection(item, state.documents, state.images, unavailableConnections.has(item.connectionId)));
  }

  async function disconnect(payload) {
    const connection = connectionFor(payload?.connectionId);
    connectionGenerations.set(connection.connectionId, (connectionGenerations.get(connection.connectionId) || 0) + 1);
    for (const operation of operations.values()) {
      if (operation.connectionId === connection.connectionId) operation.controller.abort();
    }
    return commitMutation((current) => {
      const removedIds = new Set(current.documents.filter((item) => item.connectionId === connection.connectionId).map((item) => item.documentId));
      const indexes = Object.fromEntries(Object.entries(current.indexes).filter(([id]) => !removedIds.has(id)));
      const indexStates = Object.fromEntries(Object.entries(current.indexStates).filter(([id]) => !removedIds.has(id)));
      const corrections = Object.fromEntries(Object.entries(current.corrections).filter(([id]) => !removedIds.has(id)));
      const next = {
        ...current,
        connections: current.connections.filter((item) => item.connectionId !== connection.connectionId),
        folders: current.folders.filter((item) => item.connectionId !== connection.connectionId),
        documents: current.documents.filter((item) => item.connectionId !== connection.connectionId),
        images: current.images.filter((item) => item.connectionId !== connection.connectionId),
        indexes, indexStates, corrections,
      };
      return { next, result: { disconnected: true } };
    });
  }

  async function sync(payload) {
    const connection = connectionFor(payload?.connectionId);
    const operationId = requireId(payload?.operationId, "operation ID");
    if (operations.has(operationId)) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "The operation ID is already active.");
    const generation = (connectionGenerations.get(connection.connectionId) || 0) + 1;
    connectionGenerations.set(connection.connectionId, generation);
    for (const operation of operations.values()) {
      if (operation.connectionId === connection.connectionId) operation.controller.abort();
    }
    const controller = new AbortController();
    operations.set(operationId, { connectionId: connection.connectionId, controller, generation });
    try {
      const scanned = await scanFolder({
        root: connection.root,
        signal: controller.signal,
        previousRecords: new Map([
          ...state.documents.filter((item) => item.connectionId === connection.connectionId),
          ...state.images.filter((item) => item.connectionId === connection.connectionId),
        ].map((item) => [item.relativePath, item])),
        shouldInclude: (relativePath) => effectiveSelected(connection, relativePath),
        onWarning(warning) {
          options.onProgress?.({ operationId, connectionId: connection.connectionId, phase: "warning", warning });
        },
        onProgress(progress) {
          options.onProgress?.({ operationId, connectionId: connection.connectionId, phase: "scanning", ...progress });
        },
      });
      if (controller.signal.aborted || connectionGenerations.get(connection.connectionId) !== generation) {
        throw new PdfLibraryError("PDF_LIBRARY_CANCELLED", "PDF folder scan was cancelled.");
      }
      const documents = [...state.documents.filter((item) => item.connectionId === connection.connectionId && !effectiveSelected(connection, parentPath(item.relativePath))), ...scanned.documents.map((item) => ({
        ...item,
        documentId: documentId(connection.connectionId, item.relativePath),
        folderId: folderId(connection.connectionId, parentPath(item.relativePath)),
        connectionId: connection.connectionId,
      }))];
      const images = [...state.images.filter((item) => item.connectionId === connection.connectionId && !effectiveSelected(connection, parentPath(item.relativePath))), ...(scanned.images || []).map((item) => ({ ...item, imageId: imageId(connection.connectionId, item.relativePath), connectionId: connection.connectionId }))];
      const folders = (scanned.folders || [{ relativePath: "", name: connection.name, documentCount: 0, imageCount: 0 }]).map((item) => ({ ...item, folderId: folderId(connection.connectionId, item.relativePath), connectionId: connection.connectionId }));
      const summary = await commitMutation((currentState) => {
        if (connectionGenerations.get(connection.connectionId) !== generation) {
          throw new PdfLibraryError("PDF_LIBRARY_CANCELLED", "A newer PDF folder scan replaced this operation.");
        }
        const previous = currentState.documents.filter((item) => item.connectionId === connection.connectionId);
        const oldById = new Map(previous.map((item) => [item.documentId, item]));
        const currentIds = new Set(documents.map((item) => item.documentId));
        const result = { added: 0, changed: 0, removed: 0, unchanged: 0 };
        for (const item of documents) {
          const old = oldById.get(item.documentId);
          if (!old) result.added += 1;
          else if (old.version === item.version) result.unchanged += 1;
          else result.changed += 1;
        }
        result.removed = previous.filter((item) => !currentIds.has(item.documentId)).length;
        const retainedIndexes = Object.fromEntries(Object.entries(currentState.indexes).filter(([id, saved]) => {
          const current = documents.find((item) => item.documentId === id);
          return current ? current.version === saved.version : !oldById.has(id);
        }));
        const retainedIndexStates = Object.fromEntries(documents.map((item) => {
          const saved = currentState.indexStates[item.documentId];
          return [item.documentId, saved?.version === item.version ? saved : readingIndexState(item)];
        }));
        for (const [id, saved] of Object.entries(currentState.indexStates)) {
          if (!oldById.has(id)) retainedIndexStates[id] = saved;
        }
        const retainedCorrections = Object.fromEntries(Object.entries(currentState.corrections).filter(([id, saved]) => {
          const current = documents.find((item) => item.documentId === id);
          return current ? Array.isArray(saved) && saved.every((item) => item.version === current.version) : !oldById.has(id);
        }));
        const next = {
          ...currentState,
          folders: [...currentState.folders.filter((item) => item.connectionId !== connection.connectionId), ...folders],
          documents: [...currentState.documents.filter((item) => item.connectionId !== connection.connectionId), ...documents],
          images: [...currentState.images.filter((item) => item.connectionId !== connection.connectionId), ...images],
          indexes: retainedIndexes,
          indexStates: retainedIndexStates,
          corrections: retainedCorrections,
        };
        return { next, result };
      }, controller.signal);
      if (controller.signal.aborted || connectionGenerations.get(connection.connectionId) !== generation) {
        throw new PdfLibraryError("PDF_LIBRARY_CANCELLED", "A newer PDF folder scan replaced this operation.");
      }
      unavailableConnections.delete(connection.connectionId);
      options.onProgress?.({ operationId, connectionId: connection.connectionId, phase: "complete", scanned: documents.length, summary });
      const warnings = (scanned.warnings || []).map((warning) => ({ ...warning }));
      return { operationId, summary, tree: folderTree({ connectionId: connection.connectionId }).tree, warningCount: warnings.length, warnings };
    } catch (error) {
      if (controller.signal.aborted && error?.code !== "PDF_LIBRARY_CANCELLED") {
        throw new PdfLibraryError("PDF_LIBRARY_CANCELLED", "PDF folder scan was cancelled.");
      }
      if (error?.code !== "PDF_LIBRARY_CANCELLED") unavailableConnections.add(connection.connectionId);
      throw error;
    } finally {
      operations.delete(operationId);
    }
  }

  function folderFor(folderIdentifier) {
    const id = requireId(folderIdentifier, "folder ID");
    const folder = state.folders.find((item) => item.folderId === id);
    if (!folder) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The library folder is not authorized.");
    return { folder, connection: connectionFor(folder.connectionId) };
  }

  function folderTree(payload) {
    const connection = connectionFor(payload?.connectionId);
    const folders = state.folders.filter((item) => item.connectionId === connection.connectionId);
    const available = !unavailableConnections.has(connection.connectionId);
    const byPath = new Map(folders.map((item) => [item.relativePath, { ...item, children: [] }]));
    if (!byPath.has("")) {
      const rootFolder = { folderId: folderId(connection.connectionId, ""), connectionId: connection.connectionId, relativePath: "", name: connection.name, documentCount: 0, imageCount: 0, children: [] };
      byPath.set("", rootFolder);
    }
    for (const node of byPath.values()) {
      if (node.relativePath === "") continue;
      const parent = byPath.get(parentPath(node.relativePath));
      if (parent) parent.children.push(node);
    }
    const decorate = (node) => {
      node.children.sort((left, right) => left.name.localeCompare(right.name, "ko"));
      const children = node.children.map(decorate);
      const subtree = folders.filter((item) => isSameOrDescendant(node.relativePath, item.relativePath));
      const values = (subtree.length ? subtree : [node]).map((item) => effectiveSelected(connection, item.relativePath));
      const selection = values.every(Boolean) ? "selected" : values.every((value) => !value) ? "excluded" : "partial";
      const excludedDocumentCount = subtree.reduce((sum, item) => sum + (item.excludedDocumentCount || 0), 0);
      const excludedImageCount = subtree.reduce((sum, item) => sum + (item.excludedImageCount || 0), 0);
      const selectedWithin = (item) => item.connectionId === connection.connectionId
        && isSameOrDescendant(node.relativePath, parentPath(item.relativePath))
        && effectiveSelected(connection, parentPath(item.relativePath));
      const documentCount = available ? state.documents.filter(selectedWithin).length + excludedDocumentCount : 0;
      const imageCount = available ? state.images.filter(selectedWithin).length + excludedImageCount : 0;
      return {
        folderId: node.folderId, name: node.name, selection, selected: selection === "selected",
        documentCount, imageCount, excludedCount: excludedDocumentCount + excludedImageCount, children,
      };
    };
    return { connectionId: connection.connectionId, tree: decorate(byPath.get("")) };
  }

  async function setFolderSelection(payload) {
    const { folder, connection } = folderFor(payload?.folderId);
    if (typeof payload?.selected !== "boolean") throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Folder selection must be a boolean.");
    connectionGenerations.set(connection.connectionId, (connectionGenerations.get(connection.connectionId) || 0) + 1);
    for (const operation of operations.values()) {
      if (operation.connectionId === connection.connectionId) operation.controller.abort();
    }
    await commitMutation((current) => {
      const currentConnection = current.connections.find((item) => item.connectionId === connection.connectionId);
      if (!currentConnection) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The library folder is not authorized.");
      const selectionRules = Object.fromEntries(Object.entries(currentConnection.selectionRules || {}).filter(([relativePath]) => !isSameOrDescendant(folder.relativePath, relativePath)));
      selectionRules[folder.relativePath] = payload.selected;
      const updatedConnection = { ...currentConnection, selectionRules };
      const next = {
        ...current,
        connections: current.connections.map((item) => item.connectionId === connection.connectionId ? updatedConnection : item),
      };
      return { next, result: null };
    });
    return { connectionId: connection.connectionId, folderId: folder.folderId, selected: payload.selected, tree: folderTree({ connectionId: connection.connectionId }).tree };
  }

  function cancel(payload) {
    const operationId = requireId(payload?.operationId, "operation ID");
    const operation = operations.get(operationId);
    if (operation) operation.controller.abort();
    return { cancelled: Boolean(operation) };
  }

  function list(payload = {}) {
    const connectionId = payload.connectionId;
    if (connectionId !== undefined) connectionFor(connectionId);
    const connectionsById = new Map(state.connections.map((item) => [item.connectionId, item]));
    const visible = (item) => effectiveSelected(connectionsById.get(item.connectionId), parentPath(item.relativePath));
    const available = (item) => !unavailableConnections.has(item.connectionId);
    const documents = (connectionId === undefined ? state.documents : state.documents.filter((item) => item.connectionId === connectionId)).filter(available).filter(visible);
    const images = (connectionId === undefined ? state.images : state.images.filter((item) => item.connectionId === connectionId)).filter(available).filter(visible);
    return {
      documents: documents.map((document) => ({
        ...publicDocument(document),
        indexState: structuredClone(state.indexStates[document.documentId]?.version === document.version
          ? state.indexStates[document.documentId] : readingIndexState(document)),
      })),
      images: images.map(publicImage),
    };
  }

  async function read(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The PDF folder must synchronize successfully before it can be read.");
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    const candidate = path.resolve(connection.root, document.relativePath);
    const entry = await fs.promises.lstat(candidate);
    if (entry.isSymbolicLink()) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "Symbolic-link PDF reads are not allowed.");
    const realFile = await fs.promises.realpath(candidate);
    if (!isPathInside(connection.root, realFile)) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF path escaped its connected folder.");
    const bytes = await readBytes(realFile, MAX_PDF_BYTES);
    if (!hasPdfSignature(bytes)) {
      throw new PdfLibraryError("PDF_LIBRARY_INVALID_PDF", "The selected file does not have a valid PDF signature.");
    }
    const realFileAfterRead = await fs.promises.realpath(candidate);
    const version = crypto.createHash("sha256").update(bytes).digest("hex");
    const current = state.documents.find((item) => item.documentId === id);
    if (!current || current !== document || !state.connections.includes(connection)) {
      throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF folder disconnected during the read.");
    }
    if (realFileAfterRead !== realFile || version !== document.version) {
      throw new PdfLibraryError("PDF_LIBRARY_STALE", "The PDF changed; synchronize the folder before reading it.");
    }
    return bytes;
  }

  async function resolveAuthorizedPath(connection, relativePath, expectedKind) {
    const candidate = path.resolve(connection.root, relativePath);
    const entry = await fs.promises.lstat(candidate);
    if (entry.isSymbolicLink()) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "Symbolic-link targets are not allowed.");
    if (expectedKind === "folder" && !entry.isDirectory()) throw new PdfLibraryError("PDF_LIBRARY_FOLDER", "The selected target is not a folder.");
    if (expectedKind === "file" && !entry.isFile()) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The selected item is not a file.");
    const realTarget = await fs.promises.realpath(candidate);
    if (!isPathInside(connection.root, realTarget)) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The selected target escaped its connected folder.");
    return realTarget;
  }

  async function readImage(payload) {
    const id = requireId(payload?.imageId, "image ID");
    const image = state.images.find((item) => item.imageId === id);
    if (!image) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The image is not authorized.");
    const connection = connectionFor(image.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The image folder must synchronize successfully before it can be read.");
    if (!effectiveSelected(connection, parentPath(image.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The image is excluded from the library.");
    const target = await resolveAuthorizedPath(connection, image.relativePath, "file");
    const data = await readBytes(target, MAX_IMAGE_BYTES);
    const realFileAfterRead = await fs.promises.realpath(path.resolve(connection.root, image.relativePath));
    const version = crypto.createHash("sha256").update(data).digest("hex");
    const current = state.images.find((item) => item.imageId === id);
    if (!current || current !== image || !state.connections.includes(connection)) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The image folder disconnected during the read.");
    if (realFileAfterRead !== target || version !== image.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The image changed; synchronize the folder before reading it.");
    return { data, mimeType: image.mimeType };
  }

  async function folderPathForOpen(payload) {
    const { folder, connection } = folderFor(payload?.folderId);
    return resolveAuthorizedPath(connection, folder.relativePath, "folder");
  }

  async function itemPathForReveal(payload) {
    const keys = [payload?.documentId !== undefined, payload?.imageId !== undefined].filter(Boolean).length;
    if (keys !== 1) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "Exactly one library item ID is required.");
    const isDocument = payload.documentId !== undefined;
    const id = requireId(isDocument ? payload.documentId : payload.imageId, isDocument ? "document ID" : "image ID");
    const item = (isDocument ? state.documents : state.images).find((candidate) => candidate[isDocument ? "documentId" : "imageId"] === id);
    if (!item) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The library item is not authorized.");
    const connection = connectionFor(item.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The library folder must synchronize successfully before revealing an item.");
    if (!effectiveSelected(connection, parentPath(item.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The library item is excluded.");
    return resolveAuthorizedPath(connection, item.relativePath, "file");
  }

  async function saveIndex(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The PDF folder must synchronize successfully before saving an index.");
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    if (payload?.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The extracted index does not match the current PDF version.");
    if (!payload.index || typeof payload.index !== "object") throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "The extracted index must be an object.");
    let serialized;
    try { serialized = JSON.stringify(payload.index); } catch { throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "The extracted index must be JSON serializable."); }
    if (serialized.length > 20_000_000) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "The extracted index is too large.");
    const inferredState = payload.index.status === "image-only" ? "needs-ocr"
      : payload.index.status === "indexed" || payload.index.schemaVersion === "pdf-search-index-v1" ? "searchable" : "reading";
    const requestedState = payload.state ?? inferredState;
    const diagnostic = payload.diagnostic ?? (requestedState === "needs-ocr" ? {
      code: "PDF_TEXT_LAYER_MISSING", message: "The PDF has no searchable text layer.", stage: "extract", recoverable: true,
    } : null);
    const savedIndexState = parseIndexState({ state: requestedState, diagnostic }, document);
    return commitMutation((current) => {
      const currentDocument = current.documents.find((item) => item.documentId === id);
      if (!currentDocument) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
      if (currentDocument.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The PDF changed before its index was saved.");
      const next = {
        ...current,
        indexes: { ...current.indexes, [id]: { version: document.version, index: JSON.parse(serialized) } },
        indexStates: { ...current.indexStates, [id]: savedIndexState },
      };
      return { next, result: { saved: true, indexState: structuredClone(savedIndexState) } };
    });
  }

  function loadIndex(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (unavailableConnections.has(connection.connectionId)) return null;
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    const saved = state.indexes[id];
    if (saved?.version !== document.version) return null;
    const corrections = (state.corrections[id] || []).filter((item) => item.version === document.version);
    return { version: saved.version, index: applyCorrections(saved.index, corrections) };
  }

  function indexState(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (!effectiveSelected(connection, parentPath(document.relativePath))) {
      return { ...readingIndexState(document), state: "excluded", updatedAt: new Date().toISOString() };
    }
    const saved = state.indexStates[id];
    return structuredClone(saved?.version === document.version ? saved : readingIndexState(document));
  }

  async function saveIndexState(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The PDF folder must synchronize successfully before updating index state.");
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    if (payload?.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The index state does not match the current PDF version.");
    const record = parseIndexState(payload, document);
    return commitMutation((current) => {
      const currentDocument = current.documents.find((item) => item.documentId === id);
      if (!currentDocument || currentDocument.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The PDF changed before its index state was saved.");
      if (record.state === "searchable" && current.indexes[id]?.version !== document.version) {
        throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "A searchable PDF must have a current saved index.");
      }
      const next = { ...current, indexStates: { ...current.indexStates, [id]: record } };
      return { next, result: structuredClone(record) };
    });
  }

  async function retryIndex(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    return saveIndexState({ documentId: id, version: document.version, state: "indexing", diagnostic: null });
  }

  function listCorrections(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    return structuredClone((state.corrections[id] || []).filter((item) => item.version === document.version));
  }

  async function saveCorrection(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The PDF folder must synchronize successfully before saving a correction.");
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    if (payload?.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The correction does not match the current PDF version.");
    const record = correctionRecord(payload, document);
    return commitMutation((current) => {
      const currentDocument = current.documents.find((item) => item.documentId === id);
      if (!currentDocument || currentDocument.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The PDF changed before its correction was saved.");
      const existing = current.corrections[id] || [];
      const records = [...existing.filter((item) => item.correctionId !== record.correctionId), record];
      if (records.length > 1000) throw new PdfLibraryError("PDF_LIBRARY_PAYLOAD", "The PDF has too many saved corrections.");
      const next = { ...current, corrections: { ...current.corrections, [id]: records } };
      return { next, result: structuredClone(record) };
    });
  }

  async function deleteCorrection(payload) {
    const id = requireId(payload?.documentId, "document ID");
    const document = state.documents.find((item) => item.documentId === id);
    if (!document) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is not authorized.");
    const connection = connectionFor(document.connectionId);
    if (unavailableConnections.has(connection.connectionId)) throw new PdfLibraryError("PDF_LIBRARY_UNAVAILABLE", "The PDF folder must synchronize successfully before deleting a correction.");
    if (!effectiveSelected(connection, parentPath(document.relativePath))) throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
    if (payload?.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The correction does not match the current PDF version.");
    const correctionId = requireText(payload?.correctionId, "correction ID", 200);
    return commitMutation((current) => {
      const currentDocument = current.documents.find((item) => item.documentId === id);
      if (!currentDocument || currentDocument.version !== document.version) throw new PdfLibraryError("PDF_LIBRARY_STALE", "The PDF changed before its correction was deleted.");
      const currentConnection = current.connections.find((item) => item.connectionId === currentDocument.connectionId);
      if (!currentConnection || !effectiveSelected(currentConnection, parentPath(currentDocument.relativePath))) {
        throw new PdfLibraryError("PDF_LIBRARY_UNAUTHORIZED", "The PDF document is excluded from search.");
      }
      const records = (current.corrections[id] || []).filter((item) => item.correctionId !== correctionId);
      const corrections = { ...current.corrections };
      if (records.length) corrections[id] = records;
      else delete corrections[id];
      return { next: { ...current, corrections }, result: { deleted: records.length < (current.corrections[id] || []).length } };
    });
  }

  return {
    connect, ensureDefaultFolder, connections, disconnect, sync, cancel, folderTree, setFolderSelection,
    list, read, readImage, folderPathForOpen, itemPathForReveal, saveIndex, loadIndex,
    indexState, saveIndexState, retryIndex, listCorrections, saveCorrection, deleteCorrection,
    capabilities: () => ({
      folders: { managed: true, persistentSelection: true },
      images: { filenameOnly: true, ocr: false },
      ocr: { integrated: false, mode: "renderer-local", status: "available-when-runtime-loaded", diagnosticPersistence: true },
      indexState: { schemaVersion: "pdf-index-state-v1", states: [...INDEX_STATES, "excluded"], persistent: true },
      corrections: { schemaVersion: "pdf-item-correction-v1", versionScoped: true },
    }),
  };
}

module.exports = { PdfLibraryError, createPdfLibraryService };
