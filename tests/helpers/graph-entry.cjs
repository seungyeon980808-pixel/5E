'use strict';
// 11-07(시안 graph-hub-1107): AI 창은 여는 길이 모양을 정한다.
// 「AI 이미지」 → 이미지 탭 둘(이미지 변환·이미지 생성), 아래 「그래프」 세 갈래 → 그래프 탭 둘(사진에서 복원·AI와 대화로 만들기).
// 이미지 쪽에서 그래프 쪽으로(또는 그 반대로) 갈 때는 사용자처럼 창을 닫고 그 입구로 다시 연다.
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
  const current = await panelState(page);
  if (current.shown && current.workflow === kind) return;
  if (current.shown && isGraph(current.workflow) === isGraph(kind)) {
    await page.locator(`${PANEL} .ai-workflow-switch [data-ai-workflow="${kind}"]`).click();
  } else {
    await closeAiPanel(page);
    if (isGraph(kind)) {
      await page.locator('#graph-tool-open').click();
      await page.locator(`[data-graph-entry="${kind}"]`).click();
    } else {
      await page.locator('#ai-image-install-open').click();
      await page.waitForFunction(selector => { const p = document.querySelector(selector); return !!p && !p.hidden && !p.inert; }, PANEL);
      if ((await panelState(page)).workflow !== kind) await page.locator(`${PANEL} .ai-workflow-switch [data-ai-workflow="${kind}"]`).click();
    }
  }
  await page.waitForFunction(([selector, kind]) => { const p = document.querySelector(selector); return !!p && !p.hidden && p.dataset.aiWorkflow === kind; }, [PANEL, kind]);
}

module.exports = { openAiWorkflow, closeAiPanel };
