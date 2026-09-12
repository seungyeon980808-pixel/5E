import test from 'node:test';
import assert from 'node:assert/strict';

import { initAiPanel, scopedPngBytes, scopedPngData } from '../js/ai-panel.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';
import { decodeTestPng, encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

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

test('real panel selects update preview while retaining the generated PNG source', async () => {
  const pixels = new Uint8Array(3 * 3 * 4).fill(255);
  pixels.set([10, 80, 150, 255], (1 * 3 + 1) * 4);
  const source = scopedPngData(encodeTestRgbaPng({width:3,height:3,data:pixels}));
  const browser = installAiPanelBrowserFixture({workspace:workspaceWithResult(source)});
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.ready;
    await manager.open();
    const image = browser.panel.querySelector('.ai-generated-card img');
    assert.equal(image.src, source);

    const background = browser.panel.querySelector('[data-ai-background-policy]');
    const palette = browser.panel.querySelector('[data-ai-exam-palette]');
    assert.deepEqual(background.options.map(option => option.value), ['preserve', 'connected', 'all-near-white']);
    background.value = 'connected';
    background.dispatchEvent({type:'change'});
    await browser.document.waitForState(()=>image.src !== source);
    let output = decodeTestPng(scopedPngBytes(image.src));
    assert.equal(output.data[3], 0);
    assert.deepEqual(output.data.slice(16, 20), pixels.slice(16, 20));
    assert.equal(browser.storage.getItem('5e.aiOutputBackgroundPolicy'), 'connected');
    assert.equal(image.classList.contains('ai-output-transparent'), true);

    background.value = 'preserve';
    background.dispatchEvent({type:'change'});
    await browser.document.waitForState(()=>image.src === source);
    assert.equal(image.classList.contains('ai-output-transparent'), false);

    palette.value = 'true';
    palette.dispatchEvent({type:'change'});
    await browser.document.waitForState(()=>image.src !== source);
    output = decodeTestPng(scopedPngBytes(image.src));
    assert.equal(output.data[16], output.data[17]);
    assert.equal(output.data[17], output.data[18]);
    assert.equal(browser.storage.getItem('5e.aiOutputExamPalette'), 'true');
    assert.deepEqual(decodeTestPng(scopedPngBytes(source)).data, pixels);
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('line thickness select is enabled before an image or generated result exists', async () => {
  const browser = installAiPanelBrowserFixture();
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.ready;
    await manager.open();
    const thickness = browser.panel.querySelector('[data-ai-line-thickness]');
    assert.equal(thickness.disabled, false);
    thickness.value = '1';
    thickness.dispatchEvent({type:'change'});
    assert.equal(browser.storage.getItem('5e.aiOutputLineThickness'), '1');
    assert.equal(thickness.value, '1');
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('legacy checkerboard policy remains active without becoming a new selectable choice', async () => {
  const pixels = new Uint8Array(3 * 3 * 4).fill(255);
  const source = scopedPngData(encodeTestRgbaPng({width:3,height:3,data:pixels}));
  const workspace = workspaceWithResult(source);
  workspace.tabs[0].outputOptions = {backgroundPolicy:'checkerboard',examPalette:false,lineThickness:0};
  const browser = installAiPanelBrowserFixture({workspace});
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.ready;
    await manager.open();
    const background = browser.panel.querySelector('[data-ai-background-policy]');
    assert.equal(background.value, 'checkerboard');
    assert.equal(background.options.find(option => option.value === 'checkerboard')?.disabled, true);
    assert.match(browser.panel.querySelector('[data-ai-output-processing-status]').textContent, /체크무늬/);
  } finally {
    manager?.close();
    browser.restore();
  }
});

test('a slow prior conversion cannot overwrite a newer preserve selection', async () => {
  const pixels = new Uint8Array(40 * 40 * 4).fill(255);
  pixels.set([10, 80, 150, 255], (20 * 40 + 20) * 4);
  const source = scopedPngData(encodeTestRgbaPng({width:40,height:40,data:pixels}));
  const browser = installAiPanelBrowserFixture({workspace:workspaceWithResult(source)});
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.ready;
    await manager.open();
    const image = browser.panel.querySelector('.ai-generated-card img');
    const background = browser.panel.querySelector('[data-ai-background-policy]');
    background.value = 'connected';
    background.dispatchEvent({type:'change'});
    background.value = 'preserve';
    background.dispatchEvent({type:'change'});
    await browser.document.waitForState(()=>image.src === source);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(image.src, source);
    assert.equal(browser.storage.getItem('5e.aiOutputBackgroundPolicy'), 'preserve');
  } finally {
    manager?.close();
    browser.restore();
  }
});
