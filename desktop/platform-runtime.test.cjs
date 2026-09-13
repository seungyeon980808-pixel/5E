const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');

test('platform helpers import without browser navigator in CLI and CI', () => {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    delete globalThis.navigator;
    const { IS_MAC, MOD_LABEL, modKey } = await import('./js/platform.js');
    if (IS_MAC || MOD_LABEL !== 'Ctrl' || !modKey({ctrlKey:true,metaKey:false})) process.exit(2);
  `], {cwd:path.resolve(__dirname, '..'), encoding:'utf8'});
  assert.equal(run.status, 0, run.stderr);
});

test('fullscreen coordinator follows native events and settles repeated requests', () => {
  const modulePath = path.resolve(__dirname, 'fullscreen-state.cjs');
  const createFullscreenCoordinator = fs.existsSync(modulePath)
    ? require(modulePath).createFullscreenCoordinator : null;
  assert.equal(typeof createFullscreenCoordinator, 'function',
    'fullscreen state must be coordinated through native window events');

  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.fullscreen = false;
      this.bounds = { x: 20, y: 30, width: 1280, height: 800 };
      this.requests = [];
      this.restores = [];
    }
    isFullScreen() { return this.fullscreen; }
    getBounds() { return { ...this.bounds }; }
    getNormalBounds() { return { x: 20, y: 30, width: 1280, height: 800 }; }
    setBounds(bounds) { this.bounds = { ...bounds }; this.restores.push({ ...bounds }); }
    setFullScreen(active) { this.requests.push(active); }
    settle(active) {
      this.fullscreen = active;
      this.emit(active ? 'enter-full-screen' : 'leave-full-screen');
    }
  }

  const target = new FakeWindow();
  const published = [];
  const coordinator = createFullscreenCoordinator(target, active => published.push(active));

  assert.equal(coordinator.toggle(), true);
  assert.deepEqual(target.requests, [true]);
  assert.equal(coordinator.toggle(), false);
  assert.deepEqual(target.requests, [true], 'repeat request waits for the in-flight native event');

  target.bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  target.settle(true);
  assert.deepEqual(target.requests, [true, false], 'cancelled entry is reversed after native enter');
  target.bounds = { x: 40, y: 50, width: 900, height: 600 };
  target.settle(false);

  assert.deepEqual(published, [true, false]);
  assert.deepEqual(target.restores.at(-1), { x: 20, y: 30, width: 1280, height: 800 });
  coordinator.dispose();
});

test('fullscreen coordinator adopts an operating-system fullscreen change', () => {
  class FakeWindow extends EventEmitter {
    constructor() { super(); this.fullscreen = false; this.requests = []; }
    isFullScreen() { return this.fullscreen; }
    getBounds() { return { x: 0, y: 0, width: 1280, height: 800 }; }
    getNormalBounds() { return this.getBounds(); }
    setBounds() {}
    setFullScreen(active) { this.requests.push(active); }
    settle(active) { this.fullscreen = active; this.emit(active ? 'enter-full-screen' : 'leave-full-screen'); }
  }
  const modulePath = path.resolve(__dirname, 'fullscreen-state.cjs');
  const createFullscreenCoordinator = fs.existsSync(modulePath)
    ? require(modulePath).createFullscreenCoordinator : null;
  assert.equal(typeof createFullscreenCoordinator, 'function');
  const target = new FakeWindow();
  const published = [];
  const coordinator = createFullscreenCoordinator(target, active => published.push(active));

  target.settle(true);
  target.settle(false);

  assert.deepEqual(target.requests, []);
  assert.deepEqual(published, [true, false]);
  coordinator.dispose();
});
