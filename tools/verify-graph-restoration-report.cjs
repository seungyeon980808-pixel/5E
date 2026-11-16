const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {webkit}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [reportFile,output]=process.argv.slice(2);
assert(reportFile && output,'Usage: node tools/verify-graph-restoration-report.cjs index.html output-directory');
const html=fs.readFileSync(reportFile,'utf8');
const evidence={browser:'WebKit',nativeSafari:false,nativeCapture:'macOS capture/accessibility denied',cases:[]};
(async()=>{
  const browser=await webkit.launch({headless:true});
  try {
    fs.mkdirSync(output,{recursive:true});
    for(const width of [1440,390])for(const colorScheme of ['light','dark']){
      const context=await browser.newContext({viewport:{width,height:1000},colorScheme,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[],network=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route(/^https?:\/\//,r=>{network.push(r.request().url());return r.abort();});
      await page.setContent(html,{waitUntil:'load'});
      await page.evaluate(async()=>{await Promise.all(Array.from(document.images,img=>{img.loading='eager';return img.decode();}));});
      const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cards:document.querySelectorAll('.case').length,broken:Array.from(document.images).filter(i=>!i.complete || !i.naturalWidth).length}));
      assert.equal(dimensions.cards,25);assert.equal(dimensions.broken,0);assert(dimensions.scrollWidth<=dimensions.width,'Report must not horizontally overflow');
      await page.locator('#group').selectOption('replay');assert.equal(await page.locator('.case:not([hidden])').count(),5);
      await page.locator('#group').selectOption('live');assert.equal(await page.locator('.case:not([hidden])').count(),20);
      await page.locator('#group').selectOption('all');
      await page.locator('#replay-p1_2024_06_17').screenshot({path:path.join(output,`straight-${width}-${colorScheme}.png`)});
      await page.locator('#replay-p2_2027_06_16').screenshot({path:path.join(output,`trajectory-${width}-${colorScheme}.png`)});
      assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
      evidence.cases.push({width,colorScheme,pass:true,...dimensions,networkRequests:network.length,errors});
      await context.close();
    }
  } finally {await browser.close();}
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
})().catch(e=>{console.error(e);process.exitCode=1;});
