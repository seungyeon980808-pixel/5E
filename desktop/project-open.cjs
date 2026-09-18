const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { parseProject, MAX_PROJECT_BYTES } = require('./project-package.cjs');

async function cleanNativeHandoff(file, json) {
  const root = path.dirname(file);
  if (path.basename(file) !== 'document.5e' || !path.basename(root).startsWith('5e-project-open-')) return;
  const parent = await fs.realpath(path.dirname(root));
  if (parent !== await fs.realpath(os.tmpdir())) return;
  const marker = path.join(root, '.5e-handoff');
  const [directory, document, receipt] = await Promise.all([fs.lstat(root), fs.lstat(file), fs.lstat(marker)]);
  if (!directory.isDirectory() || !document.isFile() || !receipt.isFile() || document.nlink !== 1 || receipt.nlink !== 1 || receipt.size > 256) return;
  const expected = '5E project handoff v1\n' + createHash('sha256').update(json).digest('hex');
  if (await fs.readFile(marker, 'utf8') !== expected) return;
  await fs.unlink(file);
  await fs.unlink(marker);
  await fs.rmdir(root);
}

function createProjectOpen({ app, ipcMain, getWindow }) {
  const pending = [];
  let ready = false;
  const filesFrom = args => args.flatMap(value => {
    const file = value.startsWith('--project-file=') ? value.slice('--project-file='.length) : value;
    return /\.(?:5e|json)$/i.test(file) && path.isAbsolute(file) ? [file] : [];
  });
  function deliver() {
    const win = getWindow();
    if (!ready || !win || win.isDestroyed()) return;
    for (const payload of pending.splice(0)) win.webContents.send('project:open', payload);
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
  }
  async function receive(file) {
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > MAX_PROJECT_BYTES) throw new Error('프로젝트 파일은 32MB 이하여야 합니다.');
      const json = await fs.readFile(file, 'utf8');
      parseProject(json);
      pending.push({ json });
      try { await cleanNativeHandoff(file, json); }
      catch (error) { if (error.code !== 'ENOENT') console.warn('project-handoff-cleanup-failed', error.code || 'unknown'); }
    } catch (error) { pending.push({ error: error.code ? '프로젝트 파일을 읽지 못했습니다.' : error.message }); }
    deliver();
  }
  app.on('open-file', (event, file) => { event.preventDefault(); receive(file); });
  app.on('second-instance', (_, argv) => { for (const file of filesFrom(argv)) receive(file); });
  ipcMain.on('project:ready', event => {
    const win = getWindow();
    if (!win || event.sender !== win.webContents) return;
    ready = true; deliver();
  });
  for (const file of filesFrom(process.argv.slice(1))) receive(file);
  return { receive };
}
module.exports = { createProjectOpen };
