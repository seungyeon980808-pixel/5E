import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');

test('source entry points live in one accessible menu while the selected original stays directly replaceable', () => {
  assert.match(html, /data-ai-source-menu-trigger[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
  assert.match(html, /role="menu"[^>]*data-ai-source-menu/);
  for (const action of ['file', 'clipboard', 'library', 'capture']) {
    assert.match(html, new RegExp(`data-ai-source-action="${action}"`));
  }
  assert.match(html, /data-ai-replace-source[^>]*>원본 교체</);
  assert.match(html, /data-ai-source-file/);
  assert.doesNotMatch(panel, /querySelector\(["']#ai-image-file-input["']\)/);
  assert.match(panel, /sourceMenuTrigger\.setAttribute\("aria-controls", sourceMenu\.id\)/);
  assert.match(panel, /sourceMenuTrigger\?\.addEventListener\('keydown'/);
  assert.match(panel, /event\.key === 'Escape'/);
});

test('conversation application is an explicit step before image generation', () => {
  assert.match(html, /data-ai-chat-apply[^>]*>수정 요청으로 가져오기</);
  assert.match(html, /대화 답변은 그림을 만들지 않습니다/);
  const discussionBlock = panel.slice(panel.indexOf('    const discussionContext = '), panel.indexOf('    let runInput = '));
  assert.match(discussionBlock, /discussionContextOverride[\s\S]*:\s*""\)/);
  assert.doesNotMatch(discussionBlock, /compactConversation/);
  assert.match(panel, /chatApplyButton\?\.addEventListener\('click'/);
  assert.match(panel, /sendButton\.focus\(\)/);
});
