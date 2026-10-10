// Location hypotheses only: neither text recognition nor a box grants ink ownership.
const activeWorkers = new WeakSet();
const boundPdfReceipts = new WeakSet();
const SHA = /^[a-f0-9]{64}$/;
const abortError = () => new DOMException('원본 위치 후보 수집이 취소되었습니다.', 'AbortError');
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
const validBounds = b => b && ['x','y','w','h'].every(k => Number.isFinite(b[k])) && b.x >= 0 && b.y >= 0 && b.w > 0 && b.h > 0 && b.x+b.w <= 1 && b.y+b.h <= 1;
const rectBounds = r => Array.isArray(r) && r.length === 4 ? {x:r[0],y:r[1],w:r[2],h:r[3]} : null;

/** Page-normalized PDF boxes -> crop-normalized candidates. Reject crossing/clipped boxes. */
export function sourceBoundsFromPdfRect(rect, cropRect) {
  const box=rectBounds(rect),crop=rectBounds(cropRect);
  if (!validBounds(box) || !validBounds(crop) || box.x<crop.x || box.y<crop.y || box.x+box.w>crop.x+crop.w || box.y+box.h>crop.y+crop.h) return null;
  const result={x:(box.x-crop.x)/crop.w,y:(box.y-crop.y)/crop.h,w:box.w/crop.w,h:box.h/crop.h};
  return validBounds(result)?result:null;
}

/** Internal PDF UI bridge: binds actual rendered bytes and the opened page's words.
 * The in-memory receipt is intentionally not trusted after JSON round-trip/reload. */
export async function createPdfSourceTextCandidates({document,page,render,data}={}) {
  const source=render?.source;
  if(!document||!page||!source||document.id!==source.documentId||page.documentId!==document.id||page.pageNumber!==source.pageNumber||!document.pages?.includes(page)||!validBounds(rectBounds(source.rect))||!(render.bytes instanceof Uint8Array)||!Number.isInteger(render.width)||!Number.isInteger(render.height)||render.width<=0||render.height<=0||typeof data!=='string'||!data.startsWith('data:image/png;base64,'))return null;
  const transmitted=Uint8Array.from(atob(data.slice(data.indexOf(',')+1)),c=>c.charCodeAt(0));
  const sourceBytesSha256=await digest(render.bytes);
  if(await digest(transmitted)!==sourceBytesSha256)throw new Error('PDF render PNG bytes do not match reference');
  const diagnostics=[],words=[];
  for(const [index,word] of (page.words||[]).entries()) {
    const bounds=sourceBoundsFromPdfRect(word.rect,source.rect);
    if(!bounds||typeof word.text!=='string'||!word.text.trim()){diagnostics.push({code:'pdf-word-outside-crop-or-invalid',index});continue;}
    words.push({text:word.text,rect:[bounds.x,bounds.y,bounds.w,bounds.h]});
  }
  const receipt={binding:{sourceSha256:await digest(new TextEncoder().encode(data)),sourceBytesSha256,width:render.width,height:render.height,documentId:document.id,pageNumber:page.pageNumber,cropRect:[...source.rect]},coordinateSpace:'source-normalized',precision:'approximate-word',words,diagnostics};
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  freeze(receipt);boundPdfReceipts.add(receipt);return receipt;
}

async function bundledWorker() {
  const moduleURL=new URL('../vendor/ocr/tesseract.esm.min.js',import.meta.url);
  const module=await import(moduleURL.href),tesseract=module.default??module;
  return tesseract.createWorker(['kor','eng'],1,{
    workerPath:new URL('../vendor/ocr/worker.min.js',import.meta.url).href,
    corePath:new URL('../vendor/ocr/tesseract-core-simd-lstm.wasm.js',import.meta.url).href,
    langPath:new URL('../vendor/ocr/lang/',import.meta.url).href,
    gzip:true,cacheMethod:'none',workerBlobURL:false,
  });
}
function abortable(promise,signal) {
  if(!signal)return promise;
  return new Promise((resolve,reject)=>{
    const stop=()=>reject(abortError());signal.addEventListener('abort',stop,{once:true});
    if(signal.aborted)stop();
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));
  });
}

/** data is the original image data URL; sourceSha256 hashes that exact URL string.
 * PDF trust comes only from an application verifier backed by an exact render receipt,
 * never a caller-provided verified flag. No verifier means local OCR fallback.
 */
export async function collectSourceLabelCandidates(input={},options={}) {
  const {data,sourceRef=1,sourceSha256,pdfTextCandidates}=input;
  let {width,height}=input;
  const deriveFrame=width===undefined&&height===undefined;
  const {signal,workerFactory=bundledWorker,verifyPdfBinding}=options;
  const begin=performance.now(),diagnostics=[],timings={workerInitMs:0,recognitionMs:0,totalMs:0};
  checkAbort(signal);
  if(!Number.isInteger(sourceRef)||sourceRef<1||!SHA.test(sourceSha256)||(!deriveFrame&&(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>40000000)))throw new TypeError('잘못된 원본 후보 바인딩');
  if(typeof data!=='string'||data.length>70000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(data))throw new TypeError('원본 이미지 data URL이 필요합니다.');
  const actualTransport=await digest(new TextEncoder().encode(data));
  if(actualTransport!==sourceSha256)throw new Error('원본 transport SHA 불일치');
  const binary=atob(data.slice(data.indexOf(',')+1)),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const sourceBytesSha256=await digest(bytes);checkAbort(signal);
  const bitmap=await createImageBitmap(new Blob([bytes],{type:data.slice(5,data.indexOf(';'))}));
  try {
    if(!Number.isInteger(bitmap.width)||!Number.isInteger(bitmap.height)||bitmap.width<=0||bitmap.height<=0||bitmap.width*bitmap.height>40000000)throw new Error('잘못된 원본 픽셀 프레임');
    if(deriveFrame){width=bitmap.width;height=bitmap.height;}
    else if(bitmap.width!==width||bitmap.height!==height)throw new Error('원본 픽셀 프레임 불일치');
  }finally{bitmap.close();}
  checkAbort(signal);
  const candidates=[];let candidateTextChars=0;
  const append=(text,bounds,origin,confidence,index)=>{
    if(typeof text!=='string'||!text.trim()||text.length>500||!validBounds(bounds)||confidence!==undefined&&(!Number.isFinite(confidence)||confidence<0||confidence>100)) {diagnostics.push({code:'candidate-rejected',origin,index,reason:'invalid-text-bounds-or-confidence'});return;}
    if(candidates.length>=256||candidateTextChars+text.length>5000){diagnostics.push({code:'candidate-budget-exceeded',origin,index});return;}
    candidateTextChars+=text.length;
    candidates.push({id:`s${sourceRef}-${origin==='ocr'?'ocr':'pdf'}-${index+1}`,text,bounds,origin,...(confidence===undefined?{}:{confidence})});
  };
  let artifacts={};
  if(pdfTextCandidates){
    const b=pdfTextCandidates.binding,frame={sourceSha256,sourceBytesSha256,width,height};
    const structural=b&&b.sourceSha256===sourceSha256&&b.sourceBytesSha256===sourceBytesSha256&&b.width===width&&b.height===height&&typeof b.documentId==='string'&&b.documentId.length>0&&Number.isInteger(b.pageNumber)&&b.pageNumber>0&&validBounds(rectBounds(b.cropRect))&&['page-normalized','source-normalized'].includes(pdfTextCandidates.coordinateSpace)&&Array.isArray(pdfTextCandidates.words)&&pdfTextCandidates.words.length<=5000;
    const receipt=structural&&(boundPdfReceipts.has(pdfTextCandidates)||(typeof verifyPdfBinding==='function'&&await abortable(Promise.resolve(verifyPdfBinding(b,frame)),signal)));
    checkAbort(signal);
    if(receipt===true){
      pdfTextCandidates.words.forEach((word,i)=>append(word.text,(pdfTextCandidates.coordinateSpace==='source-normalized'?rectBounds(word.rect):sourceBoundsFromPdfRect(word.rect,b.cropRect)),'pdf-text',word.confidence,i));
      diagnostics.push(...(pdfTextCandidates.diagnostics||[]));
      artifacts.pdf={binding:structuredClone(b),boxAccuracy:'source-bound candidate; not glyph contour'};
    }else diagnostics.push({code:'pdf-binding-unverified',reason:'Exact crop/render receipt not verified; falling back to local OCR.'});
  }
  if(!candidates.length){
    let worker,owned=false,termination;
    const terminate=()=>{if(owned&&!termination)termination=Promise.resolve().then(()=>worker.terminate()).finally(()=>activeWorkers.delete(worker));return termination;};
    const onAbort=()=>{void terminate()?.catch(()=>{});};
    try {
      const start=performance.now();
      const creating=Promise.resolve().then(()=>workerFactory({language:'kor+eng',signal}));
      // A cancelled initialization can finish later; release only this invocation's worker.
      creating.then(w=>{if(signal?.aborted&&!activeWorkers.has(w))void Promise.resolve(w.terminate()).catch(()=>{});},()=>{});
      worker=await abortable(creating,signal);timings.workerInitMs=performance.now()-start;
      checkAbort(signal);
      if(!worker||typeof worker.recognize!=='function'||typeof worker.terminate!=='function')throw new TypeError('OCR worker unavailable');
      if(activeWorkers.has(worker))throw new Error('OCR worker is already owned by another collector');
      activeWorkers.add(worker);owned=true;signal?.addEventListener('abort',onAbort,{once:true});checkAbort(signal);
      const recognizeStart=performance.now();
      const response=await abortable(Promise.resolve(worker.recognize(bytes,{}, {blocks:true,text:true})),signal);
      timings.recognitionMs=performance.now()-recognizeStart;checkAbort(signal);
      const raw=structuredClone(response.data),rawJSON=JSON.stringify(raw);
      if(rawJSON.length>10000000)throw new RangeError('OCR artifact exceeds budget');
      artifacts.ocr={raw,sha256:await digest(new TextEncoder().encode(rawJSON)),serialization:'JSON.stringify(raw), UTF-8'};
      const words=Array.isArray(raw.words)?raw.words:(raw.blocks||[]).flatMap(b=>b.paragraphs||[]).flatMap(p=>p.lines||[]).flatMap(l=>l.words||[]);
      if(words.length>5000)throw new RangeError('OCR candidate count exceeds budget');
      words.forEach((word,i)=>{const b=word.bbox;append(word.text,b?{x:b.x0/width,y:b.y0/height,w:(b.x1-b.x0)/width,h:(b.y1-b.y0)/height}:null,'ocr',word.confidence,i);});
    } finally {signal?.removeEventListener('abort',onAbort);await terminate();}
  }
  checkAbort(signal);timings.totalMs=performance.now()-begin;
  return {version:1,sourceRef,sourceSha256,sourceBytesSha256,width,height,candidates,diagnostics,timings,artifacts};
}
