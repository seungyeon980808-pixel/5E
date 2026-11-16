const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, snapshot } = require('./fixtures/ai-image-label-workflow.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/file-read-boundary');

// Only FileReader delivery is held or failed. Successful reads still decode the
// actual supplied PNG with the native reader; all product handlers run intact.
async function installReaderGate(page) {
  await page.evaluate(() => {
    const Reader = window.FileReader;
    window.__readGate = { mode: 'hold', deliveries: [], faults: [], completed: 0 };
    window.FileReader = class extends Reader {
      readAsDataURL(file) {
        const gate = __readGate, mode = gate.mode;
        if (mode === 'fail') {
          Object.defineProperty(this, 'error', { value: new DOMException('합성 파일 읽기 실패', 'NotReadableError') });
          queueMicrotask(() => { gate.faults.push(file.name); this.onerror?.(new Event('error')); gate.completed++; });
          return;
        }
        if (mode === 'hold') {
          const loaded = this.onload;
          this.onload = event => gate.deliveries.push({ name: file.name, release: () => { loaded.call(this, event); gate.completed++; } });
        }
        return super.readAsDataURL(file);
      }
    };
  });
}

async function payload(page, name = '합성 원본.png') {
  const data = await page.evaluate(() => __task2.modified);
  return { name, mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64') };
}

async function enter(page, route, file) {
  if (route !== 'drop') {
    await page.locator(`#ai-image-panel [data-ai-${route === 'replace' ? 'replace-source-input' : 'source-file'}]`).setInputFiles(file);
    return;
  }
  await page.evaluate(({ name, bytes }) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
    document.querySelector('#ai-image-panel').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { name: file.name, bytes: [...file.buffer] });
}

const paint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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

for (const route of ['file', 'drop', 'replace']) {
  test(`${route}: failed image reads preserve the workspace, report the error and allow retry`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `${route}-failure`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 1, dir, { selectedPartial: true });
    await page.evaluate(() => __task2Manager.checkpointForClose());
    const before = await snapshot(page), durable = await stored(page), panel = page.locator('#ai-image-panel');
    await installReaderGate(page); await page.evaluate(() => { __readGate.mode = 'fail'; });
    const file = await payload(page);
    await enter(page, route, file);
    await page.waitForFunction(() => __readGate.completed === 1); await paint(page);
    const observed = { status: await panel.locator('[data-ai-status]').innerText(), kind: await panel.locator('[data-ai-status]').getAttribute('data-kind'),
      tasks: await snapshot(page), stored: await stored(page), errors: [...errors], paidCalls: await page.evaluate(() => __task2.sends.length) };
    fs.writeFileSync(path.join(dir, 'failed-read.json'), JSON.stringify(observed, null, 2));
    assert.deepEqual(observed.tasks, before); assert.deepEqual(observed.stored, durable);
    assert.equal(observed.kind, 'error', 'the reader failure must be visible and integrated with the error report');
    assert.match(observed.status, /이미지.*읽.*못/); assert.deepEqual(errors, []);
    if (route !== 'drop') assert.equal(await panel.locator(`[data-ai-${route === 'replace' ? 'replace-source-input' : 'source-file'}]`).inputValue(), '');
    await page.evaluate(() => { __readGate.mode = 'normal'; });
    await enter(page, route, file);
    await page.waitForFunction(name => document.querySelector('#ai-image-panel [data-ai-status]').dataset.kind === 'ok'
      && [...document.querySelectorAll('#ai-image-panel .ai-reference-card img')].some(img => img.naturalWidth === 512 && img.closest('.ai-image-card').textContent.includes(name)), file.name);
    const after = await snapshot(page);
    if (route === 'replace') {
      assert.equal(after.length, before.length); assert.equal(after[0].attachments[0].name, file.name);
      assert.equal(after[0].attachments[0].data, await page.evaluate(() => __task2.modified));
      assert.deepEqual(after[0].generated, before[0].generated);
    } else {
      assert.equal(after.length, before.length + 1); assert.deepEqual(after[0].generated, before[0].generated);
      assert.equal(after.find(task => task.attachments.some(a => a.name === file.name)).attachments[0].data, await page.evaluate(() => __task2.modified));
    }
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => __task2.sends.length), 0);
    fs.writeFileSync(path.join(dir, 'retry.json'), JSON.stringify({ route, successfulNativeRead: true, paidCalls: 0, errors }, null, 2));
  });

  test(`${route}: a native file read delivered after disposal cannot resurrect a task or source`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `${route}-disposed`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 1, dir, { selectedPartial: true });
    await page.evaluate(() => __task2Manager.checkpointForClose());
    const before = await snapshot(page), durable = await stored(page), panel = page.locator('#ai-image-panel');
    await installReaderGate(page); await enter(page, route, await payload(page));
    await page.waitForFunction(() => __readGate.deliveries.length === 1);
    await page.evaluate(() => __task2Manager.dispose());
    const status = await panel.locator('[data-ai-status]').innerText();
    await page.evaluate(() => __readGate.deliveries[0].release()); await paint(page);
    const observed = { tasks: await snapshot(page), stored: await stored(page), status: await panel.locator('[data-ai-status]').innerText(),
      hidden: await panel.evaluate(p => p.hidden), errors: [...errors], paidCalls: await page.evaluate(() => __task2.sends.length) };
    fs.writeFileSync(path.join(dir, 'late-read.json'), JSON.stringify(observed, null, 2));
    assert.deepEqual(observed.tasks, before, 'late file data cannot mutate disposed workspace content');
    assert.deepEqual(observed.stored, durable); assert.equal(observed.status, status);
    assert.equal(observed.hidden, true); assert.deepEqual(errors, []); assert.equal(observed.paidCalls, 0);
  });

  test(`${route}: closing the workbench abandons a delayed read without changing the retained task`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `${route}-closed`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 1, dir, { selectedPartial: true });
    const panel = page.locator('#ai-image-panel');
    await installReaderGate(page); await enter(page, route, await payload(page));
    await page.waitForFunction(() => __readGate.deliveries.length === 1);
    await panel.locator('[data-ai-close]').click(); await panel.waitFor({ state: 'hidden' });
    const before = await snapshot(page), status = await panel.locator('[data-ai-status]').innerText();
    await page.evaluate(() => __readGate.deliveries[0].release()); await paint(page);
    const after = await snapshot(page);
    assert.deepEqual(after, before); assert.equal(await panel.locator('[data-ai-status]').innerText(), status);
    assert.equal(await panel.evaluate(p => p.hidden), true); assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => __task2.sends.length), 0);
    fs.writeFileSync(path.join(dir, 'closed-read.json'), JSON.stringify({ route, taskUnchanged: true, hidden: true, paidCalls: 0, errors }, null, 2));
  });

  test(`${route}: the newest file selection wins and an older completion cannot add or replace a source`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `${route}-newer`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 1, dir, { selectedPartial: true });
    const panel = page.locator('#ai-image-panel');
    await installReaderGate(page); await enter(page, route, await payload(page, '오래된 선택.png'));
    await page.waitForFunction(() => __readGate.deliveries.length === 1);
    await page.evaluate(() => { __readGate.mode = 'normal'; });
    await enter(page, route, await payload(page, '최신 선택.png'));
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-status]').dataset.kind === 'ok'
      && [...document.querySelectorAll('#ai-image-panel .ai-reference-card img')].some(img => img.naturalWidth === 512 && img.closest('.ai-image-card').textContent.includes('최신 선택.png')));
    const before = await snapshot(page), status = await panel.locator('[data-ai-status]').innerText();
    await page.evaluate(() => __readGate.deliveries[0].release()); await paint(page);
    assert.deepEqual(await snapshot(page), before); assert.equal(await panel.locator('[data-ai-status]').innerText(), status);
    assert.ok(before.some(task => task.attachments.some(source => source.name === '최신 선택.png')));
    assert.ok(before.every(task => task.attachments.every(source => source.name !== '오래된 선택.png')));
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => __task2.sends.length), 0);
    fs.writeFileSync(path.join(dir, 'newer-read.json'), JSON.stringify({ route, nativeReads: 2, newestSourceOnly: true, paidCalls: 0, errors }, null, 2));
  });

  test(`${route}: switching to another real task preserves both tasks when an old read finishes`, { timeout: 90000 }, async t => {
    const dir = path.join(evidence, `${route}-other-task`); fs.mkdirSync(dir, { recursive: true });
    const { page, errors } = await fixture(t, 2, dir, { selectedPartial: true });
    await page.evaluate(() => { window.__fileReadOwnerPanel = document.querySelector('#ai-image-panel'); });
    await installReaderGate(page); await enter(page, route, await payload(page));
    await page.waitForFunction(() => __readGate.deliveries.length === 1);
    await page.locator('#ai-image-panel [data-tab-id="task-1"]').click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'selected-1');
    await page.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').evaluate(img => img.decode());
    const before = await snapshot(page), statuses = await page.evaluate(() => ({
      owner: __fileReadOwnerPanel.querySelector('[data-ai-status]').textContent,
      active: document.querySelector('#ai-image-panel [data-ai-status]').textContent,
    }));
    await page.evaluate(() => __readGate.deliveries[0].release()); await paint(page);
    assert.deepEqual(await snapshot(page), before, 'no source or task may be attached to either retained owner after switching');
    assert.deepEqual(await page.evaluate(() => ({ owner: __fileReadOwnerPanel.querySelector('[data-ai-status]').textContent,
      active: document.querySelector('#ai-image-panel [data-ai-status]').textContent })), statuses);
    assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-selected-candidate-id'), 'selected-1');
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => __task2.sends.length), 0);
    fs.writeFileSync(path.join(dir, 'other-task.json'), JSON.stringify({ route, bothTasksUnchanged: true, selectedCandidate: 'selected-1', paidCalls: 0, errors }, null, 2));
  });
}
