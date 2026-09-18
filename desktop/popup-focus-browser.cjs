// Isolated browser regression for the real editor's popup focus behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.env.POPUP_FOCUS_OUT || '.omo/evidence/common-popup-focus');
const results = [];
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const target = file === root ? path.join(file, 'index.html') : file;
    const type = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'}[path.extname(target)];
    res.setHeader('Content-Type', type || 'application/octet-stream'); res.end(await fs.readFile(target));
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await fs.mkdir(out, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.getByRole('button',{name:'건너뛰기',exact:true}).click();
    // Create a real object through the editor tools so object save opens its actual form.
    await page.locator('[data-tool="RECT"]').click();
    const box = await page.locator('#canvas').boundingBox();
    await page.mouse.move(box.x+160,box.y+160); await page.mouse.down();
    await page.mouse.move(box.x+260,box.y+240); await page.mouse.up();
    const cases = [
      {name:'bulk-edit',trigger:'#bulk-edit-open',close:'#bulk-cancel'},
      {name:'object-save',trigger:'#personal-object-save',close:'#po-cancel'},
      {name:'library',trigger:'#exam-library-open',close:'[data-unilib-close]'},
    ];
    for (const c of cases) for (const mode of ['pointer-cancel','pointer-escape','pointer-backdrop','keyboard-escape']) {
      await page.locator('#canvas').click({position:{x:150,y:150}});
      if (mode.startsWith('keyboard')) {
        await page.locator(c.trigger).focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Enter');
      } else await page.locator(c.trigger).click();
      await page.locator(c.close).waitFor({state:'visible'});
      if (mode.endsWith('cancel')) await page.locator(c.close).click();
      else if (mode.endsWith('backdrop')) await page.locator('.modal-overlay:not([hidden])').last().click({position:{x:3,y:3}});
      else await page.keyboard.press('Escape');
      await page.locator(c.close).waitFor({state:'hidden'});
      await page.waitForTimeout(30);
      const observable = await page.locator(c.trigger).evaluate(el=>({active:document.activeElement===el,focusVisible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth,classes:el.className}));
      await page.screenshot({path:path.join(out,`${c.name}-${mode}.png`)});
      results.push({scenario:`${c.name} ${mode}`,observable});
      await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
      if (mode.startsWith('pointer')) assert.ok(observable.outline==='none'||observable.width==='0px',JSON.stringify(results.at(-1)));
      else {assert.equal(observable.active,true); assert.notEqual(observable.outline,'none');}
    }
    const capture = async (scenario, selector, keyboard = false) => {
      const observable = await page.locator(selector).evaluate(el=>({active:document.activeElement===el,outline:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth,pointer:el.hasAttribute('data-pointer-focus')}));
      await page.screenshot({path:path.join(out,scenario+'.png')});
      results.push({scenario,observable});
      await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
      assert.equal(observable.active,true,scenario);
      if(keyboard) assert.notEqual(observable.outline,'none',scenario);
      else assert.ok(observable.outline==='none'||observable.width==='0px',scenario);
    };
    await page.locator('#exam-library-open').click();
    await page.locator('[data-unilib-close]').click();
    await page.keyboard.press(process.platform==='darwin'?'Meta+l':'Control+l');
    await page.locator('[data-unilib-close]').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await capture('library-keyboard-shortcut-return','#exam-library-open',true);
    // Ordinary library actions, including an already-focused button.
    await page.locator('#exam-library-open').click();
    await page.locator('[data-unilib-drive-settings-open]').click();
    await page.locator('[data-unilib-drive-settings-close]').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    await page.locator('[data-unilib-drive-settings-close]').waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-unilib-close]').isVisible(),true,'nested popup closes without parent');
    await capture('nested-library-pointer-escape','[data-unilib-drive-settings-open]');
    for(let i=0;i<3;i++) {
      await page.locator('[data-unilib-type="all"]').click();
      await capture('library-all-pointer-'+i,'[data-unilib-type="all"]');
    }
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await capture('library-all-keyboard','[data-unilib-type="all"]',true);
    await page.locator('[data-unilib-close]').click();
    for(const name of ['file','settings']) for(let i=0;i<3;i++) {
      await page.locator('#'+name+'-menu-btn').click();
      await page.keyboard.press('Escape');
      await capture(name+'-menu-pointer-escape-'+i,'#'+name+'-menu-btn');
    }
    await page.locator('#settings-menu-btn').click();
    await page.locator('#open-screen').click();
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
    await page.locator('#personal-object-save').click();
    const editingFocus = await page.locator('#po-name').evaluate(el=>({active:document.activeElement===el,pointer:el.hasAttribute('data-pointer-focus')}));
    assert.deepEqual(editingFocus,{active:true,pointer:false},'text editing focus remains intact');
    results.push({scenario:'object-save-text-focus',observable:editingFocus});
    await page.locator('#po-name').fill('QA focus rectangle');
    await page.locator('#po-ok').click();
    await page.locator('#po-name').waitFor({state:'hidden'});
    results.push({scenario:'object-save-submit',observable:{closed:true}});
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));
    console.log(`PASS ${results.length} real editor popup focus scenarios`);
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(async error=>{await fs.writeFile(path.join(out,'failure.txt'),error.stack); console.error(error);process.exitCode=1;});
