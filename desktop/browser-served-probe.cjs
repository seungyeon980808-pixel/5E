const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const url = process.env.FIVE_E_BROWSER_HARNESS_URL;
const reportPath = process.env.FIVE_E_BROWSER_HARNESS_REPORT;
const captureDirectory = process.env.FIVE_E_BROWSER_HARNESS_CAPTURE_DIR;
const consoleErrors = [];
const unhandledExceptions = [];
let electronPayloads = [];
let finished = false;

function messageOf(value) {
  return value instanceof Error ? value.stack || value.message : String(value);
}

function finish(report, exitCode = 0) {
  if (finished) return;
  finished = true;
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, consoleErrors, unhandledExceptions }), "utf8");
  app.exit(exitCode);
}

function summary(payloads, markers) {
  const serialized = JSON.stringify(payloads);
  const names = payloads.flatMap((payload) => (payload.attachments || []).map((item) => item.name));
  const flag = (name, comment) => ({
    name: serialized.includes(name),
    bytes: serialized.includes(markers[name]),
    comment: serialized.includes(comment),
  });
  return {
    calls: payloads.length,
    attachmentNames: names,
    blocked: flag("blocked-local-name.png", "blocked-local-comment"),
    confirmed: flag("confirmed-crop-name.png", "confirmed-crop-comment"),
    automatic: flag("automatic-picker-name.png", "automatic-picker-comment"),
  };
}

function createWindow(electron) {
  const window = new BrowserWindow({ show: false, webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    ...(electron ? { preload: path.join(__dirname, "browser-served-preload.cjs") } : {}),
  } });
  window.webContents.on("console-message", (_event, details, message) => {
    const level = typeof details === "object" ? details.level : details;
    const text = typeof details === "object" ? details.message : message;
    if (level === "error" || level === 3) consoleErrors.push(String(text));
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    unhandledExceptions.push(`render-process-gone: ${details.reason}`);
  });
  window.webContents.on("did-fail-load", (_event, code, description) => {
    unhandledExceptions.push(`did-fail-load ${code}: ${description}`);
  });
  return window;
}

async function runFlows(adapterKind) {
  const electron = adapterKind === "electron";
  const window = createWindow(electron);
  try { await window.loadURL(url); }
  catch (error) { throw new Error(`${adapterKind} load failed: ${messageOf(error)}`); }
  await window.webContents.executeJavaScript(`window.__phase0Unhandled = [];
    window.addEventListener("error", (event) => window.__phase0Unhandled.push(String(event.error || event.message)));
    window.addEventListener("unhandledrejection", (event) => window.__phase0Unhandled.push(String(event.reason)));`);
  const outcomes = {};
  for (const mode of ["single", "batch"]) {
    electronPayloads = [];
    const result = await window.webContents.executeJavaScript(`import("./desktop/browser-served-panel-flow.mjs")
      .then((module) => module.runPanelTransportFlow(${JSON.stringify(mode)}, ${JSON.stringify(adapterKind)}))`);
    outcomes[mode] = summary(electron ? electronPayloads : result.captured, result.markers);
  }
  if (!electron && captureDirectory) {
    await window.webContents.executeJavaScript(`import("./desktop/browser-served-panel-flow.mjs")
      .then((module) => module.prepareTextlessCapture())`);
    for (const width of [375, 768, 1280]) {
      window.setContentSize(width, 900);
      await window.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const image = await window.webContents.capturePage();
      fs.writeFileSync(`${captureDirectory}/pdf-textless-${width}.png`, image.toPNG());
    }
  }
  unhandledExceptions.push(...await window.webContents.executeJavaScript("window.__phase0Unhandled"));
  return outcomes;
}

process.on("uncaughtException", (error) => { unhandledExceptions.push(messageOf(error)); finish({}, 1); });
process.on("unhandledRejection", (error) => { unhandledExceptions.push(messageOf(error)); finish({}, 1); });
ipcMain.handle("phase0:capture-send", (event, payload) => {
  electronPayloads.push(payload);
  event.sender.send("phase0:send-captured", electronPayloads.length);
  return { turnId: `ipc-turn-${electronPayloads.length}`, threadId: `ipc-thread-${electronPayloads.length}` };
});

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.whenReady().then(async () => {
  try {
    const browser = await runFlows("browser");
    const desktop = await runFlows("electron");
    finish({ appReady: true, browser, desktop });
  } catch (error) {
    unhandledExceptions.push(messageOf(error));
    finish({ appReady: false }, 1);
  }
});
