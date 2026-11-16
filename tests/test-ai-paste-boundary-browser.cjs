const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, snapshot } = require('./fixtures/ai-image-label-workflow.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/paste-boundary');

// Synthetic ClipboardEvents carry an actual PNG file. Never access the user's
// system clipboard. Only native FileReader completion delivery is held/failed.
async function installGate(page) {
  await page.evaluate(() => {
    const Reader = window.FileReader;
    window.__pasteGate = { mode: 'hold', deliveries: [], completed: 0 };
    window.FileReader = class extends Reader {
      readAsDataURL(file) {
        const gate = __pasteGate;
        if (gate.mode === 'normal') return super.readAsDataURL(file);
        const loaded = this.onload, failed = this.onerror;
        this.onload = event => gate.deliveries.push({ name: file.name,
          success: () => { loaded.call(this, event); gate.completed++; },
          failure: () => {
            Object.defineProperty(this, 'error', { value: new DOMException('합성 붙여넣기 읽기 실패', 'NotReadableError') });
            failed.call(this, new Event('error')); gate.completed++;
          },
        });
        return super.readAsDataURL(file);
      }
    };
  });
}
async function paste(page, name = '합성 붙여넣기.png') {
  await page.evaluate(name => {
    const bytes = Uint8Array.from(atob(__task2.modified.split(',')[1]), c => c.charCodeAt(0));
    const data = new DataTransfer(); data.items.add(new File([bytes], name, { type: 'image/png' }));
    document.querySelector('#ai-image-panel').dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: data,
    }));
  }, name);
}
const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const status = page => page.evaluate(() => ({ owner: __pasteOwner.querySelector('[data-ai-status]').textContent,
  active: document.querySelector('#ai-image-panel [data-ai-status]').textContent }));
async function settled(page) {
  await page.evaluate(() => { window.__pasteOwner = document.querySelector('#ai-image-panel'); return __task2Manager.checkpointForClose(); });
}
async function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('5e.preview:5e-ai-image-tasks', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('tasks'), read = tx.objectStore('tasks').getAll();
      read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); tx.oncomplete = () => db.close();
    };
  }));
}

for (const invalidation of ['dispose', 'close', 'other-task']) for (const outcome of ['success', 'failure']) {
  test(`paste: late ${outcome} after ${invalidation} preserves tasks, durable storage and status`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `${invalidation}-${outcome}`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, invalidation === 'other-task' ? 2 : 1, dir, { selectedPartial: true });
    await settled(page); await installGate(page); await paste(page);
    await page.waitForFunction(() => __pasteGate.deliveries.length === 1);
    if (invalidation === 'dispose') await page.evaluate(() => __task2Manager.dispose());
    else if (invalidation === 'close') {
      await page.locator('#ai-image-panel [data-ai-close]').click(); await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
    } else {
      await page.locator('#ai-image-panel [data-tab-id="task-1"]').click();
      await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'selected-1');
      await page.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').evaluate(img => img.decode());
      await page.evaluate(() => __task2Manager.checkpointForClose());
    }
    const before = await snapshot(page), durable = await stored(page), statuses = await status(page);
    await page.evaluate(outcome => __pasteGate.deliveries[0][outcome](), outcome); await paint(page);
    const after = await snapshot(page), observedStatus = await status(page), saved = await stored(page);
    const receipt = { invalidation, outcome, tasksBefore: before.length, tasksAfter: after.length,
      tasksUnchanged: JSON.stringify(after) === JSON.stringify(before), storageUnchanged: JSON.stringify(saved) === JSON.stringify(durable),
      statusesBefore: statuses, statusesAfter: observedStatus, errors, paidCalls: await page.evaluate(() => __task2.sends.length) };
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(receipt, null, 2));
    assert.equal(receipt.tasksUnchanged, true, 'stale clipboard bytes must not resurrect or change a workspace');
    assert.equal(receipt.storageUnchanged, true); assert.deepEqual(observedStatus, statuses, 'stale completions must not overwrite retained task status');
    assert.deepEqual(errors, []); assert.equal(receipt.paidCalls, 0);
  });
}

for (const invalidation of ['dispose', 'close', 'other-task']) for (const outcome of ['empty', 'permission-error']) {
  test(`paste: pending clipboard API ${outcome} after ${invalidation} cannot overwrite status`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `clipboard-${invalidation}-${outcome}`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, invalidation === 'other-task' ? 2 : 1, dir, { selectedPartial: true });
    await settled(page);
    await page.evaluate(() => {
      window.__syntheticClipboard = { reads: 0 };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: () => {
        __syntheticClipboard.reads++;
        return new Promise((resolve, reject) => { __syntheticClipboard.resolve = resolve; __syntheticClipboard.reject = reject; });
      } } });
      const data = new DataTransfer(); data.setData('image/png', 'synthetic-image-type-without-file');
      document.querySelector('#ai-image-panel').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    });
    await page.waitForFunction(() => __syntheticClipboard.reads === 1);
    if (invalidation === 'dispose') await page.evaluate(() => __task2Manager.dispose());
    else if (invalidation === 'close') {
      await page.locator('#ai-image-panel [data-ai-close]').click(); await page.locator('#ai-image-panel').waitFor({ state: 'hidden' });
    } else {
      await page.locator('#ai-image-panel [data-tab-id="task-1"]').click();
      await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'selected-1');
      await page.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').evaluate(img => img.decode());
      await page.evaluate(() => __task2Manager.checkpointForClose());
    }
    const before = await snapshot(page), durable = await stored(page), statuses = await status(page);
    await page.evaluate(outcome => {
      if (outcome === 'empty') __syntheticClipboard.resolve([]);
      else __syntheticClipboard.reject(new DOMException('합성 클립보드 권한 오류', 'NotAllowedError'));
    }, outcome); await paint(page);
    assert.deepEqual(await snapshot(page), before); assert.deepEqual(await stored(page), durable); assert.deepEqual(await status(page), statuses);
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => __task2.sends.length), 0);
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ invalidation, outcome, unchanged: true, systemClipboardAccess: false, errors, paidCalls: 0 }, null, 2));
  });
}

test('paste: current read failure is reported, preserves content and allows successful native PNG retry', { timeout: 90000 }, async t => {
  const dir = path.join(evidence, 'failure-retry'); fs.mkdirSync(dir, { recursive: true });
  const { page, errors } = await fixture(t, 1, dir, { selectedPartial: true });
  await settled(page); const before = await snapshot(page), durable = await stored(page);
  await installGate(page); await paste(page); await page.waitForFunction(() => __pasteGate.deliveries.length === 1);
  await page.evaluate(() => __pasteGate.deliveries[0].failure()); await paint(page);
  assert.equal(await page.locator('#ai-image-panel [data-ai-status]').getAttribute('data-kind'), 'error');
  assert.match(await page.locator('#ai-image-panel [data-ai-status]').innerText(), /합성 붙여넣기 읽기 실패/);
  assert.deepEqual(await snapshot(page), before); assert.deepEqual(await stored(page), durable);
  await page.evaluate(() => { __pasteGate.mode = 'normal'; }); await paste(page, '정상 재시도.png');
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-reference-card img')]
    .some(img => img.naturalWidth === 512 && img.closest('.ai-image-card').textContent.includes('정상 재시도.png')));
  const after = await snapshot(page), task = after.find(tab => tab.attachments.some(a => a.name === '정상 재시도.png'));
  assert.equal(after.length, before.length + 1); assert.equal(task.attachments[0].data, await page.evaluate(() => __task2.modified));
  assert.equal(task.attachments[0].sourceKind, 'clipboard'); assert.deepEqual(after[0].generated, before[0].generated);
  assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => __task2.sends.length), 0);
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ nativeRetry: true, exactPng: true, errors, paidCalls: 0 }, null, 2));
});

for (const newer of ['paste', 'file']) {
  test(`paste: a newer ${newer} attempt supersedes an older pending paste even when the new read fails`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `newer-${newer}`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 1, dir, { selectedPartial: true });
    await settled(page); await installGate(page); await paste(page, '오래된 붙여넣기.png');
    await page.waitForFunction(() => __pasteGate.deliveries.length === 1);
    if (newer === 'paste') await paste(page, '최신 붙여넣기.png');
    else {
      const data = await page.evaluate(() => __task2.modified);
      await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles({ name: '최신 파일.png', mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64') });
    }
    await page.waitForFunction(() => __pasteGate.deliveries.length === 2);
    await page.evaluate(() => __pasteGate.deliveries[1].failure()); await paint(page);
    const before = await snapshot(page), durable = await stored(page), statuses = await status(page);
    assert.equal(await page.locator('#ai-image-panel [data-ai-status]').getAttribute('data-kind'), 'error');
    await page.evaluate(() => __pasteGate.deliveries[0].success()); await paint(page);
    const after = await snapshot(page), observedStatus = await status(page);
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ newer, tasksBefore: before.length, tasksAfter: after.length,
      unchanged: JSON.stringify(after) === JSON.stringify(before), statusesBefore: statuses, statusesAfter: observedStatus,
      errors, paidCalls: await page.evaluate(() => __task2.sends.length) }, null, 2));
    assert.deepEqual(after, before); assert.deepEqual(await stored(page), durable); assert.deepEqual(observedStatus, statuses);
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => __task2.sends.length), 0);
  });
}
