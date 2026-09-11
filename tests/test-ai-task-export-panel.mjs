import test from 'node:test';
import assert from 'node:assert/strict';

import { initAiPanel, scopedPngData } from '../js/ai-panel.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';
import { encodeTestRgbaPng } from './helpers/scoped-edit-png-fixture.mjs';

function generated(id, data) {
  return {
    id, name:id, data, kind:'generated', postprocessOk:true,
    reviewState:'scoped-applied', reviewReport:{verdict:'',checks:[],issues:[]},
    generationMode:'single', comments:[], nextCommentNumber:1,
  };
}

test('collective panel export applies each task processing choice and writes both results to one picked desktop folder', async () => {
  const pixels = new Uint8Array(3 * 3 * 4).fill(255);
  pixels.set([30, 90, 150, 255], (1 * 3 + 1) * 4);
  const source = scopedPngData(encodeTestRgbaPng({width:3,height:3,data:pixels}));
  const workspace = {key:'workspace',activeTaskTabId:'task-1',taskTabSerial:2,imageSerial:2,tabs:[
    {
      id:'task-1',title:'작업 1',workState:'completed',attachments:[{id:'s1',name:'A.png',data:source,kind:'reference'}],
      generated:[generated('a',source)],selectedCandidateId:'a',conversationMessages:[],uiMessages:[],input:'',conversationId:null,
      mode:'diagram',qualityMode:'simple',outputEngine:'raster',generationMode:'single',
      outputOptions:{backgroundPolicy:'connected',examPalette:false,lineThickness:0},
    },
    {
      id:'task-2',title:'작업 2',workState:'completed',attachments:[{id:'s2',name:'B.png',data:source,kind:'reference'}],
      generated:[generated('b',source)],selectedCandidateId:'b',conversationMessages:[],uiMessages:[],input:'',conversationId:null,
      mode:'diagram',qualityMode:'simple',outputEngine:'raster',generationMode:'single',
      outputOptions:{backgroundPolicy:'preserve',examPalette:false,lineThickness:0},
    },
  ]};
  const browser = installAiPanelBrowserFixture({workspace});
  const writes = [];
  browser.desktop.api.batchOutput = {
    pickFolder: async () => ({folder:'/picked'}),
    save: async payload => { writes.push(payload); return {path:`/picked/${payload.sourceName}.png`}; },
  };
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.open();
    browser.panel.querySelector('[data-ai-task-export]').click();
    await browser.document.waitForState(() => writes.length === 2);

    assert.deepEqual(writes.map(write => write.outputDirectory), ['/picked', '/picked']);
    assert.deepEqual(writes.map(write => write.sourceName), ['작업 1 - A', '작업 2 - B']);
    assert.equal(writes[0].appendConverted, false);
    assert.notEqual(writes[0].dataUrl, source, 'task 1 connected-background choice must use the transformed output');
    assert.equal(writes[1].dataUrl, source, 'task 2 preserve choice must keep its original bytes');
    assert.match(browser.panel.querySelector('[data-ai-status]').textContent, /결과 2개를 선택한 폴더에 저장/);
  } finally {
    manager?.close();
    browser.restore();
  }
});
