const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const site=path.resolve(process.env.FIVE_E_SITE_ROOT||''),release=JSON.parse(fs.readFileSync(path.join(site,'preview/release.json'),'utf8'));
const evidence=path.resolve(process.env.EVIDENCE_DIR||'_work/preview-identity');fs.mkdirSync(evidence,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.webp':'image/webp'};
const server=http.createServer((req,res)=>{let file=path.resolve(site,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(site+path.sep)){res.writeHead(403).end();return;}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');fs.readFile(file,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(error?'missing':bytes);});});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,results=[];
  try{for(const engine of [chromium,webkit]){
    const browser=await engine.launch({headless:true}),errors=[],resources=[];
    try{
      const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
      await page.addInitScript(()=>localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'));
      page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{resources.push(r.url());if(r.status()>=400&&!new URL(r.url()).pathname.startsWith('/api/'))errors.push(`${r.status()} ${r.url()}`);});
      await page.goto(origin+'/preview/?mode=pro&mobile=0',{waitUntil:'load'});await page.locator('#canvas').waitFor();
      assert.match(await page.title(),/1\.7\.0 Preview/);
      await page.waitForFunction(sha=>document.querySelector('[data-release-version]')?.dataset.sourceCommit===sha,release.sourceCommit);
      assert.equal(await page.locator('[data-change-summary]').getAttribute('data-preview-commit'),release.sourceCommit);
      assert.equal(await page.locator('[data-change-summary]').getAttribute('data-preview-dirty'),'false');
      assert.deepEqual(resources.filter(url=>/^\/(?:js|css)\//.test(new URL(url).pathname)),[],'preview must never load the stable root runtime or styles');
      assert.equal(new Set(resources.filter(url=>new URL(url).pathname.endsWith('/main.js'))).size,1,'one runtime instance');
      await page.screenshot({path:path.join(evidence,`${engine.name()}-1440.png`)});
      await page.setViewportSize({width:1080,height:800});await page.screenshot({path:path.join(evidence,`${engine.name()}-1080.png`)});
      assert.deepEqual(errors,[]);results.push({engine:engine.name(),sourceCommit:release.sourceCommit,previewIdentity:true,resources,errors});
    }finally{await browser.close();fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(results,null,2)+'\n');}
  }}finally{await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
