'use strict';
// 11-07(시안 graph-hub-1107): AI 창은 여는 길이 모양을 정한다.
// 「AI 이미지」 → 이미지 탭 둘(이미지 변환·이미지 생성), 아래 「그래프」 세 갈래 → 그래프 탭 둘(사진에서 복원·AI와 대화로 만들기).
// 이미지 쪽에서 그래프 쪽으로(또는 그 반대로) 갈 때는 사용자처럼 창을 닫고 그 입구로 다시 연다.
// 11-14(a45c7c9c, js/graph-entry-menu.js ONE_ENTRY): 「그래프」 세 갈래 메뉴가 없어지고 단추가 AI 창을 「복원」으로 바로 연다.
// 대화로 만들기는 AI 창 그래프 전환 줄, 「직접」은 그 줄의 [data-ai-graph-direct]로 간다.
const PANEL = '#ai-image-panel';
const isGraph = kind => kind === 'graph' || kind === 'graph-create';

async function panelState(page) {
  return page.evaluate(selector => {
    const panel = document.querySelector(selector);
    // 여는 중(애니메이션 동안 inert)이어도 열린 것으로 본다 — 그 위로 다른 단추를 누르면 창이 가로챈다.
    return { shown: !!panel && !panel.hidden && panel.getClientRects().length > 0, workflow: panel?.dataset.aiWorkflow || '' };
  }, PANEL);
}

async function closeAiPanel(page) {
  if (!(await panelState(page)).shown) return;
  await page.waitForFunction(selector => !document.querySelector(selector)?.inert, PANEL);
  await page.locator(`${PANEL} [data-ai-close]`).click();
  await page.waitForFunction(selector => { const p = document.querySelector(selector); return !p || p.hidden || p.inert; }, PANEL);
}

// kind: 'graph' | 'graph-create' | 'image' | 'image-create'
async function openAiWorkflow(page, kind) {
  // 창이 열리거나 닫히는 중(inert)이면 끝날 때까지 기다린다 — 그래프 편집기를 닫은 직후 AI 창이 움직이는 동안
  // 「열려 있음」으로 보고 바로 단추를 누르다 사라지는 단추를 붙잡던 흔들림(11-17 graph-workbench 194줄).
  await page.waitForFunction(selector => { const p = document.querySelector(selector); return !p || p.hidden || !p.inert; }, PANEL);
  const current = await panelState(page);
  if (current.shown && current.workflow === kind) return;
  if (current.shown && isGraph(current.workflow) === isGraph(kind)) {
    await page.locator(`${PANEL} .ai-workflow-switch [data-ai-workflow="${kind}"]`).click();
  } else {
    await closeAiPanel(page);
    if (isGraph(kind)) {
      await page.locator('#graph-tool-open').click();
      await page.waitForFunction(selector => { const p = document.querySelector(selector); return !!p && !p.hidden && !p.inert; }, PANEL);
      if ((await panelState(page)).workflow !== kind) await page.locator(`${PANEL} .ai-workflow-switch [data-ai-workflow="${kind}"]`).click();
    } else {
      await page.locator('#ai-image-install-open').click();
      await page.waitForFunction(selector => { const p = document.querySelector(selector); return !!p && !p.hidden && !p.inert; }, PANEL);
      if ((await panelState(page)).workflow !== kind) await page.locator(`${PANEL} .ai-workflow-switch [data-ai-workflow="${kind}"]`).click();
    }
  }
  await page.waitForFunction(([selector, kind]) => { const p = document.querySelector(selector); return !!p && !p.hidden && p.dataset.aiWorkflow === kind; }, [PANEL, kind]);
}

// 빈 그래프 편집기(「직접」): AI 그래프 창을 연 뒤 전환 줄의 「직접」을 누른다.
async function openGraphDirect(page) {
  await openAiWorkflow(page, 'graph');
  await page.locator(`${PANEL} [data-ai-graph-direct]`).click();
  // 편집기는 AI 창 위에 뜬다. 예전 「직접」 길처럼 편집기만 남기려고 뒤의 AI 창을 닫는다(편집기를 덮고 있어 단추를 직접 누른다).
  await page.locator('#graph-modal-overlay:not([hidden])').waitFor();
  await page.evaluate(selector => document.querySelector(`${selector} [data-ai-close]`)?.click(), PANEL);
  await page.waitForFunction(selector => { const p = document.querySelector(selector); return !p || p.hidden || p.inert; }, PANEL);
}

module.exports = { openAiWorkflow, closeAiPanel, openGraphDirect };
