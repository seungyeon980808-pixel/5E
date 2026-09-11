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

test('real panel buttons update preview while retaining the generated PNG source', async () => {
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

    browser.panel.querySelector('[data-ai-background-policy="connected"]').click();
    await browser.document.waitForState(()=>image.src !== source);
    let output = decodeTestPng(scopedPngBytes(image.src));
    assert.equal(output.data[3], 0);
    assert.deepEqual(output.data.slice(16, 20), pixels.slice(16, 20));
    assert.equal(browser.storage.getItem('5e.aiOutputBackgroundPolicy'), 'connected');
    assert.equal(image.classList.contains('ai-output-transparent'), true);

    browser.panel.querySelector('[data-ai-background-policy="preserve"]').click();
    await browser.document.waitForState(()=>image.src === source);
    assert.equal(image.classList.contains('ai-output-transparent'), false);

    browser.panel.querySelector('[data-ai-exam-palette="true"]').click();
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

test('line thickness is selectable before an image or generated result exists', async () => {
  const browser = installAiPanelBrowserFixture();
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.ready;
    await manager.open();
    const thicker = browser.panel.querySelector('[data-ai-line-thickness="1"]');
    assert.equal(thicker.disabled, false);
    thicker.click();
    assert.equal(browser.storage.getItem('5e.aiOutputLineThickness'), '1');
    assert.equal(thicker.getAttribute('aria-pressed'), 'true');
  } finally {
    manager?.close();
    browser.restore();
  }
});
