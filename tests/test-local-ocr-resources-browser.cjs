const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

test('canonical root performs local OCR with bundled worker, WASM and language bytes',{timeout:60000},async t=>{
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage(),resources=[],errors=[];
  page.on('response',response=>{if(response.url().includes('/vendor/ocr/'))resources.push({url:response.url(),status:response.status()});});
  page.on('pageerror',error=>errors.push(error.message));
  const origin=process.env.RELEASE_URL || process.env.PREVIEW_URL;
  assert.ok(origin,'Owned candidate server URL is required');
  await page.goto(new URL('/',origin).href,{waitUntil:'domcontentloaded'});
  const receipt=await page.evaluate(async()=>{
    const {collectSourceLabelCandidates}=await import('/js/ai-source-label-candidates.js?v=1.7.0-four-session-integration');
    const canvas=document.createElement('canvas');canvas.width=500;canvas.height=150;
    const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,500,150);
    context.fillStyle='black';context.font='40px Arial';context.fillText('Sensor',40,80);
    const data=canvas.toDataURL('image/png');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    return collectSourceLabelCandidates({data,sourceSha256:hash,width:500,height:150});
  });
  assert.ok(receipt.candidates.some(candidate=>/Sensor/i.test(candidate.text)));
  assert.ok(receipt.candidates.every(candidate=>candidate.origin==='ocr'));
  assert.equal(receipt.width,500);assert.equal(receipt.height,150);
  assert.match(receipt.sourceBytesSha256,/^[a-f0-9]{64}$/);
  assert.ok(resources.some(resource=>resource.url.includes('worker.min.js')));
  assert.ok(resources.every(resource=>resource.status===200));
  assert.deepEqual(errors,[]);
  const out=process.env.EVIDENCE_DIR || path.resolve(__dirname,'../.omo/evidence/local-ocr-resources');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({receipt,resources,errors,paidCalls:0},null,2));
});
