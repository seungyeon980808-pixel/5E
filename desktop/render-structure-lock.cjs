const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const [, , sourceArg, destinationArg] = process.argv;
if (!sourceArg || !destinationArg) {
  console.error("Usage: electron desktop/render-structure-lock.cjs <source> <destination>");
  process.exit(2);
}
const source = path.resolve(sourceArg);
const destination = path.resolve(destinationArg);
app.setPath("userData", path.join(os.tmpdir(), `5e-structure-lock-${process.pid}`));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } });
  await win.loadFile(path.join(__dirname, "..", "index.html"));
  const mime = source.toLowerCase().endsWith(".jpg") || source.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
  const dataUrl = `data:${mime};base64,${fs.readFileSync(source).toString("base64")}`;
  const result = await win.webContents.executeJavaScript(`
    import("./js/ai-structure-lock.js?cli=${Date.now()}")
      .then((module) => module.createStructureLockedLineart(${JSON.stringify(dataUrl)}))
  `);
  const base64 = String(result).replace(/^data:image\/png;base64,/, "");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, Buffer.from(base64, "base64"));
  console.log(JSON.stringify({ source, destination, bytes: fs.statSync(destination).size }));
  app.exit(0);
}).catch((error) => {
  console.error(error?.stack || String(error));
  app.exit(1);
});
