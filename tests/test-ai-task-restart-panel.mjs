import test from 'node:test';
import assert from 'node:assert/strict';

import { initAiPanel } from '../js/ai-panel.js';
import { installAiPanelBrowserFixture } from './helpers/ai-panel-browser-fixture.mjs';

test('restored provider work stays interrupted until the explicit retry control is clicked', async () => {
  const workspace = {
    key:'workspace', activeTaskTabId:'task-1', taskTabSerial:1, imageSerial:0,
    tabs:[{
      id:'task-1', title:'중단 작업', workState:'busy', attachments:[], generated:[], selectedCandidateId:null,
      conversationMessages:[], uiMessages:[], input:'계속 설명', conversationId:null,
      mode:'diagram', qualityMode:'simple', outputEngine:'raster', generationMode:'single',
      outputOptions:{backgroundPolicy:'preserve',examPalette:false,lineThickness:0},
      inFlightRequest:{
        type:'chat',
        snapshot:{
          entered:'계속 설명', request:'계속 설명', discussionContext:'',
          runInput:{attachments:[],generated:[],mode:'diagram',outputEngine:'raster',qualityMode:'simple',complexPass:1,selectedCandidateId:null,generationMode:'single'},
        },
      },
    }],
  };
  const browser = installAiPanelBrowserFixture({workspace});
  const state = {objects:[],selectedIds:[],activePageId:'page-1',activeLayerId:'layer-1',artboard:{width:100,height:100}};
  let manager;
  try {
    manager = initAiPanel({get:()=>state});
    await manager.open();
    const retry = browser.panel.querySelector('[data-ai-retry-interrupted]');
    assert.equal(browser.desktop.sends.length, 0, 'restart must not resend an unknown provider job');
    assert.equal(browser.panel.querySelector('[data-ai-tab-list] .ai-task-tab').dataset.workState, 'interrupted');
    assert.equal(retry.parentElement.className, 'ai-task-export-controls', 'retry must stay in the visible task rail');
    assert.equal(retry.hidden, false);
    assert.equal(retry.disabled, false);
    assert.match(browser.panel.querySelector('[data-ai-status]').textContent, /자동 재전송하지 않았습니다/);

    retry.click();
    const sent = await browser.desktop.waitForSend(0);
    assert.equal(browser.desktop.sends.length, 1);
    assert.equal(sent.payload.purpose, 'chat');
    assert.match(sent.payload.text, /계속 설명/);
    browser.desktop.emit({method:'turn/completed',params:{turn:{id:sent.turnId,status:'completed'}}});
    await Promise.resolve();
  } finally {
    manager?.close();
    browser.restore();
  }
});
