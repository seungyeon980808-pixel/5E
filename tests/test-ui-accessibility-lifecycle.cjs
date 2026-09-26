const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const characterizeOnly = process.env.TASK10_CHARACTERIZE === '1';

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
}

function renderTwoModeDialogs() {
  const source = read('preview/js/ui-dialogs.js')
    .replace(/^import[^\n]*\n/, '')
    .replace(/export function /g, 'function ')
    .concat('\n;globalThis.__task10Api = { showModeSwitch };');
  const overlays = [];
  const document = {
    activeElement: { focus() {} },
    createElement() {
      const buttons = [0, 1, 2].map(index => ({
        dataset: { i: String(index) },
        addEventListener() {},
      }));
      const dialog = { focus() {} };
      return {
        className: '',
        innerHTML: '',
        addEventListener() {},
        remove() {},
        querySelector(selector) {
          if (selector === '[role="dialog"], [role="alertdialog"]') return dialog;
          return null;
        },
        querySelectorAll(selector) {
          return selector === '.modal-btn' ? buttons : [];
        },
      };
    },
    body: { appendChild(overlay) { overlays.push(overlay); } },
  };
  const context = { crypto: globalThis.crypto, document, registerEscapeLayer() {}, console };
  vm.runInNewContext(source, context, { filename: 'preview/js/ui-dialogs.js' });
  void context.__task10Api.showModeSwitch('Lite');
  void context.__task10Api.showModeSwitch('Pro');
  return overlays.map(overlay => overlay.innerHTML);
}

function referencedId(markup, attribute) {
  return markup.match(new RegExp(`${attribute}="([^"]+)"`))?.[1] || null;
}

test('characterization: mode switch keeps the approved three choices and quiet initial focus', () => {
  const source = read('preview/js/ui-dialogs.js');
  assert.match(source, /wide:\s*true/);
  assert.match(source, /\{ label: '취소', value: 'cancel' \}/);
  assert.match(source, /\{ label: '새 작업으로 전환', value: 'new' \}/);
  assert.match(source, /\{ label: '유지하고 전환', value: 'keep', primary: true \}/);
  assert.match(source, /if \(wide\) dialog\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /if \(!wide && e\.key === "Enter"/);
});

test('characterization: pointer focus remains deliberately quiet', () => {
  const css = read('preview/css/style.css');
  assert.match(cssRule(css, '#canvas.pointer-focused'), /outline:\s*none/);
  const main = read('preview/js/main.js');
  assert.match(main, /svg\.classList\.add\("pointer-focused"\)/);
  assert.match(main, /window\.addEventListener\("keydown", \(\) => svg\.classList\.remove\("pointer-focused"\)/);
});

if (!characterizeOnly) {
  test('UI-F03: keyboard-only canvas focus has a visible indicator', () => {
    const rule = cssRule(read('preview/css/style.css'), '#canvas:focus-visible');
    assert.doesNotMatch(rule, /outline:\s*none/);
    assert.match(rule, /outline:\s*[2-9]px\s+solid/);
  });

  test('UI-F04: each common mode dialog has unique title and description references', () => {
    const dialogs = renderTwoModeDialogs();
    assert.equal(dialogs.length, 2);
    const identities = dialogs.map(markup => {
      const titleId = referencedId(markup, 'aria-labelledby');
      const descriptionId = referencedId(markup, 'aria-describedby');
      assert.ok(titleId, 'dialog must reference its visible title');
      assert.ok(descriptionId, 'dialog must reference its visible description');
      assert.match(markup, new RegExp(`id="${titleId}"`));
      assert.match(markup, new RegExp(`<p[^>]*id="${descriptionId}"`));
      return `${titleId}|${descriptionId}`;
    });
    assert.notEqual(identities[0], identities[1], 'simultaneous dialogs must not reuse IDs');
  });

  test('CAN-DATA-01: recovery selector exposes durable checkpoint metadata and identity', () => {
    const source = read('preview/js/ui-dialogs.js');
    assert.match(source, /export function showRecoveryCheckpointDialog\(/);
    assert.match(source, /data-recovery-checkpoint/);
    assert.match(source, /checkpoint\.label/);
    assert.match(source, /checkpoint\.pageCount/);
    assert.match(source, /source:\s*selected\.source/);
    assert.match(source, /id:\s*Number\(selected\.id\)/);
    assert.match(read('preview/js/main.js'), /selectRecoveryCheckpoint:\s*showRecoveryCheckpointDialog/);
  });

  test('ARCH-160-02: hidden zoom readout is idle and refreshes on reveal and visibility', async () => {
    const modulePath = path.join(root, 'preview/js/zoom-readout-lifecycle.js');
    assert.ok(fs.existsSync(modulePath), 'zoom lifecycle module must replace the permanent frame loop');
    const source = fs.readFileSync(modulePath, 'utf8');
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    assert.equal(typeof module.initZoomReadoutLifecycle, 'function');

    let width = 0;
    let refreshCount = 0;
    const listeners = new Map();
    const documentRef = {
      visibilityState: 'visible',
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type, listener) {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    };
    let observer;
    class FakeResizeObserver {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      disconnect() { this.disconnected = true; }
      emit() { this.callback(); }
    }
    const target = { getBoundingClientRect: () => ({ width }) };
    const dispose = module.initZoomReadoutLifecycle({
      target,
      refresh: () => { refreshCount += 1; },
      documentRef,
      ResizeObserverCtor: FakeResizeObserver,
    });

    assert.equal(refreshCount, 0, 'zero-width hidden canvas must stay idle');
    observer.emit();
    assert.equal(refreshCount, 0, 'repeated zero-width resize notifications must stay idle');
    width = 300;
    observer.emit();
    assert.equal(refreshCount, 1, 'reveal must refresh exactly once');
    documentRef.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    assert.equal(refreshCount, 1, 'hidden document must not refresh');
    documentRef.visibilityState = 'visible';
    listeners.get('visibilitychange')();
    assert.equal(refreshCount, 2, 'visible document must refresh once');
    dispose();
    assert.equal(observer.disconnected, true);
    assert.equal(listeners.has('visibilitychange'), false);
  });
}
