'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, ipcMain } = require('electron');
const output = process.env.AI_WORKBENCH_RECEIPTS;
if (!output) throw new Error('Authenticated receipt path required');
const append = value => fs.appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n');
let requestSerial = 0;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, callback) => originalHandle(channel, async (event, ...args) => {
  if (channel === 'codex:interrupt') {
    append({ kind: 'interrupt-requested' });
    const result = await callback(event, ...args);
    append({ kind: 'interrupt-returned', acknowledged: result != null });
    return result;
  }
  if (channel !== 'codex:send') return callback(event, ...args);
  const payload = args[0] || {};
  const requestId = ++requestSerial;
  append({ kind: 'request', requestId, model: payload.model, effort: payload.effort, serviceTier: payload.serviceTier ?? null, clientScope: payload.clientScope ?? '', attachmentCount: payload.attachments?.length ?? 0 });
  const ceiling = process.env.AI_WORKBENCH_CHECKPOINT_FROM ? 2 : process.env.AI_WORKBENCH_RESUME_FROM ? 6 : 8;
  if ((process.env.AI_WORKBENCH_CHECKPOINT_FROM && (process.env.AI_WORKBENCH_BATCH_RELEASE !== 'accepted' || process.env.AI_WORKBENCH_TASK12_RELEASE !== 'accepted')) || process.env.AI_WORKBENCH_RESUME_PREFLIGHT === '1' || (process.env.AI_WORKBENCH_RESUME_FROM && process.env.AI_WORKBENCH_TASK12_RELEASE !== 'accepted')) {
    append({ kind: 'blocked-send', requestId, reason: 'resume-preflight-or-task12-gate' });
    throw new Error('BLOCKED: no provider send allowed before task12 release or during preflight');
  }
  if (requestId > ceiling) {
    append({ kind: 'blocked-send', requestId, reason: 'bounded-run-ceiling', ceiling });
    throw new Error('BLOCKED: bounded request ceiling reached; no extra provider request allowed');
  }
  if (process.env.AI_WORKBENCH_TASK9_RELEASE !== 'accepted') {
    append({ kind: 'blocked-send', reason: 'task9-not-released' });
    throw new Error('BLOCKED: task9 acceptance must release real generation');
  }
  try {
    const result = await callback(event, ...args);
    append({ kind: 'accepted', requestId, turnId: result?.turnId, threadId: result?.threadId ?? result?.renderThreadId, providerModel: result?.result?.turn?.model, providerTurnId: result?.result?.turn?.id });
    return result;
  } catch (error) {
    append({ kind: 'send-failed', requestId, reason: 'bridge-rejected-request' });
    throw error;
  }
});
app.on('browser-window-created', (_event, window) => {
  const send = window.webContents.send.bind(window.webContents);
  window.webContents.send = (channel, payload, ...rest) => {
    if (channel === 'codex:event') {
      const params = payload?.params || {};
      const item = params.item || {};
      if (['turn/started', 'turn/completed', 'item/completed', '5e/image-finalization', 'error'].includes(payload?.method)) {
        append({ kind: 'runtime-event', clientScope: payload.clientScope || '', method: payload.method, turnId: params.turnId || params.turn?.id, model: params.turn?.model || params.model, status: params.turn?.status || params.state, itemType: item.type, hasImage: item.type === 'imageGeneration' && !!item.imageDataUrl });
      }
    }
    return send(channel, payload, ...rest);
  };
});
require(path.resolve(__dirname, '../desktop/main.cjs'));
