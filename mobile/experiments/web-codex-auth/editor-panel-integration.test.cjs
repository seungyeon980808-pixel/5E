const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { createGateway } = require('./editor-gateway.cjs');

const moduleDataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function loadGatewayPanelModule(source) {
  const jsRoot = join(__dirname, '../../js');
  source = source.replace(/from (["'])\.\/([^"']+)\1/g, (_match, _quote, specifier) => {
    const [path, query] = specifier.split('?');
    const url = pathToFileURL(join(jsRoot, path)).href + (query ? `?${query}` : '');
    return `from ${JSON.stringify(url)}`;
  });
  const webModule = name => pathToFileURL(join(__dirname, name)).href;
  source = source.replace('"/editor-review.js"', JSON.stringify(webModule('editor-review.js')));
  source = source.replace('"/editor-feedback.js"', JSON.stringify(webModule('editor-feedback.js')));
  const legacySource = readFileSync(join(__dirname, 'editor-background.js'), 'utf8')
    .replace("'/outer-background.mjs'", JSON.stringify(webModule('outer-background.mjs')));
  source = source.replace('"/editor-background.js"', JSON.stringify(moduleDataUrl(legacySource)));
  return import(moduleDataUrl(source));
}

function workspaceWithResult(data) {
  return {key:'workspace',activeTaskTabId:'task-1',taskTabSerial:1,imageSerial:1,tabs:[{
    id:'task-1',title:'task',workState:'idle',attachments:[],conversationMessages:[],uiMessages:[],input:'',
    conversationId:null,mode:'diagram',qualityMode:'simple',outputEngine:'raster',generationMode:'single',
    selectedCandidateId:'generated-1',generated:[{
      id:'generated-1',name:'source',data,kind:'generated',postprocessOk:true,
      reviewState:'scoped-applied',reviewReport:{verdict:'',checks:[],issues:[]},generationMode:'single',comments:[],nextCommentNumber:1,
    }],
  }]};
}

test('gateway serves a valid separated-image panel with all web adapters applied', async t => {
  // Given the real gateway and current editor sources, without an AI request.
  const gateway = createGateway();
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
  });

  // When the browser requests the complete transformed panel module.
  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/editor/js/ai-panel.js`);
  const source = await response.text();

  // Then it loads as JavaScript and retains both separated-image and web controls.
  assert.equal(response.status, 200, source);
  assert.match(response.headers.get('content-type'), /^text\/javascript/);
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const marker of [
    'data-ai-generation-mode',
    'error?.code === "AI_TASK_CHECKPOINT_FAILED" ? "임시저장 실패 · AI 요청을 보내지 않았습니다" : error.status === 429 ? error.message',
    'candidateUsesSeparatedAssets(item)',
    'openGroupsForItem(item, true)',
    'separatedRecovery.dataset.aiSeparatedRecovery',
    "separatedCandidateNextAction(item) !== 'manual-regions'",
    'void renderOutputVariant(item, img)',
    'void resolveOutputVariant(item)\n          .then(data => insertImageFromSrc',
    'preserveBytes:true,at:{x:0,y:0},aiTaskId',
    'taskFeedback(text, kind)',
    'content: simplifyComparison(comparison)',
    'const selectedCanvasImage =',
    'selectedCandidateId = tab.selectedCandidateId || generatedImages.at(-1)?.id || null;',
  ]) assert.ok(source.includes(marker), `Missing runtime integration: ${marker}`);
  assert.doesNotMatch(source, /savePng\.dataset\.aiSaveCandidate/);
  assert.doesNotMatch(source, /createBackgroundOptions|background\.register|background\.output/);
});

test('gateway panel keeps preserve pixels and one policy owns transformed preview and insert', async t => {
  const gateway = createGateway();
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
  });

  const response = await fetch(`http://127.0.0.1:${gateway.address().port}/editor/js/ai-panel.js`);
  assert.equal(response.status, 200);
  const panelModule = await loadGatewayPanelModule(await response.text());
  const [{ installAiPanelBrowserFixture }, { encodeTestRgbaPng, decodeTestPng }] = await Promise.all([
    import('../../tests/helpers/ai-panel-browser-fixture.mjs'),
    import('../../tests/helpers/scoped-edit-png-fixture.mjs'),
  ]);
  const pixels = new Uint8Array(5 * 5 * 4).fill(255);
  pixels.set([20, 20, 20, 255], (2 * 5 + 2) * 4);
  pixels.set([10, 80, 150, 255], (1 * 5 + 1) * 4);
  const source = `data:image/png;base64,${Buffer.from(encodeTestRgbaPng({width:5,height:5,data:pixels})).toString('base64')}`;
  const browser = installAiPanelBrowserFixture({workspace:workspaceWithResult(source)});
  const conversation = browser.document.createElement('section');
  conversation.className = 'ai-conversation';
  const sideTabs = browser.document.createElement('nav');
  sideTabs.className = 'ai-side-tabs';
  conversation.append(sideTabs);
  browser.panel.append(conversation);
  for (const className of ['ai-conversation-actions', 'ai-output-actions']) {
    const anchor = browser.document.createElement('div');
    anchor.className = className;
    browser.panel.append(anchor);
  }
  browser.storage.setItem('5e.aiOutputBackgroundPolicy', 'preserve');
  const value = {
    objects:[], selectedIds:[], pages:[], activePageId:'page-1', activeLayerId:'layer-1', activeTool:'V',
    artboard:{w:100,h:100,width:100,height:100}, viewBox:{x:0,y:0,w:100,h:100}, undoStack:[], redoStack:[],
  };
  const state = {get:()=>value,update:mutate=>mutate(value),subscribe:()=>()=>{}};
  let manager;
  try {
    manager = panelModule.initAiPanel(state);
    await manager.ready;
    await manager.open();
    const image = browser.panel.querySelector('.ai-generated-card img');
    await new Promise(setImmediate);
    assert.deepEqual(decodeTestPng(Buffer.from(image.src.slice(image.src.indexOf(',') + 1), 'base64')).data, pixels,
      'preserve policy changed the gateway preview pixels');
    const outputProcessing = browser.panel.querySelector('[data-ai-output-processing]');
    assert.equal(outputProcessing.parentElement?.className, 'ai-conversation',
      'the gateway left output processing inside the result-hidden preparation section');

    browser.panel.querySelector('[data-ai-background-policy="connected"]').click();
    await browser.document.waitForState(() => image.src !== source);
    await new Promise(setImmediate);
    const backgroundOnlySource = image.src;
    browser.panel.querySelector('[data-ai-line-thickness="1"]').click();
    await browser.document.waitForState(() => image.src !== backgroundOnlySource);
    const previewSource = image.src;
    const previewPixels = decodeTestPng(Buffer.from(previewSource.slice(previewSource.indexOf(',') + 1), 'base64')).data;
    assert.equal(Array.from({length:25}, (_, pixel) => previewPixels[pixel * 4] === 20).filter(Boolean).length, 5,
      'the gateway preview did not apply the shared line-thickness processor');
    browser.panel.querySelector('.ai-canvas-output').click();
    await browser.document.waitForState(() => value.objects.length === 1);
    assert.equal(value.objects[0].src, previewSource, 'inserted output differed from the selected preview variant');
    assert.equal(browser.panel.querySelectorAll('[data-ai-output-processing], .ai-background-option').length, 1,
      'the gateway rendered more than one output-processing control group');
  } finally {
    manager?.close();
    browser.restore();
  }
});
