/** Opt-in source-only iterative reconstruction. Never reads manual/golden plans. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import * as contract from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';
const root=path.resolve(import.meta.dirname,'..');
const moduleBase = process.env.APP_MODULE_BASE || '/js/';
const moduleQuery = process.env.APP_MODULE_QUERY ?? '?v=1.7.0-four-session-integration';
const MAX_ATTEMPTS=3,MAX_CALLS=24,CONCURRENCY=2,TIMEOUT_MS=240000;
const fail=message=>{throw Error('Iterative configuration: '+message);};
const validateOnly=process.argv.includes('--validate-only')||process.env.GRAPH_RECONSTRUCTION_VALIDATE_ONLY==='1';
if(process.argv.slice(2).some(a=>a!=='--validate-only'))fail('Only --validate-only is supported.');
if(process.env.GRAPH_RECONSTRUCTION_REAL!=='1'){console.error('GRAPH_RECONSTRUCTION_REAL=1 required; provider calls 0.');process.exit(2);}
if(!process.env.EVIDENCE_DIR)fail('Fresh EVIDENCE_DIR required.');
const evidence=path.resolve(process.env.EVIDENCE_DIR);
if(fs.existsSync(evidence)&&(!fs.statSync(evidence).isDirectory()||fs.readdirSync(evidence).length))fail('EVIDENCE_DIR must be new or empty; resuming/reusing any prior ledger is forbidden.');
if(process.env.GRAPH_RECONSTRUCTION_CONCURRENCY&&process.env.GRAPH_RECONSTRUCTION_CONCURRENCY!=='2')fail('Concurrency is fixed at 2.');
if(process.env.GRAPH_RECONSTRUCTION_MAX_ATTEMPTS&&process.env.GRAPH_RECONSTRUCTION_MAX_ATTEMPTS!=='3')fail('Attempt ceiling is fixed at 3.');
const manifestPath=path.resolve(process.env.GRAPH_RECONSTRUCTION_MANIFEST||path.join(root,'tests/fixtures/graph-engine-coverage/manifest.json'));
// Read only the source registry fields. Other manifest entries (planFile,
// requiredFeatures, baselineResponse, titles, manual provenance) are discarded.
const raw=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!Array.isArray(raw.cases)||raw.cases.length!==8)fail('Exactly eight source cases required.');
const ids=new Set();
const cases=raw.cases.map((entry,index)=>{
 const{id,sourceFile,sourceHash}=entry||{};
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id||'')||ids.has(id))fail(`Invalid/duplicate source ID at ${index}.`);ids.add(id);
 if(typeof sourceFile!=='string'||!sourceFile)fail(`sourceFile required for ${id}.`);
 if(!/^sha256:[0-9a-f]{64}$/.test(sourceHash||''))fail(`sourceHash required for ${id}.`);
 const file=path.resolve(root,sourceFile),extension=path.extname(file).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[extension];
 if(!mime||!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size>8*1024*1024)fail(`Readable image <=8MB required for ${id}.`);
 const bytes=fs.readFileSync(file),hash='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==sourceHash)fail(`Source hash mismatch: ${id}.`);
 return{id,sourceFile:file,sourceHash,extension,mime,bytes,dataUrl:`data:${mime};base64,${bytes.toString('base64')}`};
});
const require=createRequire(import.meta.url);
let chromium;const pw=process.env.PLAYWRIGHT_MODULE||'playwright';
if(pw.endsWith('.mjs'))({chromium}=await import(pw));else({chromium}=require(pw));
const browser=await chromium.launch({headless:true});
const results=[],ledger=[],active=new Set();let halted=false,cursor=0,inFlight=0,maxInFlight=0,server;
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'});
const summary=()=>{if(fs.existsSync(evidence))fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({schema:'5e.graph-iterative-source/v1',sourceOnly:true,manualPlanCorrections:0,requestCount:ledger.length,maxCalls:MAX_CALLS,maxAttemptsPerCase:MAX_ATTEMPTS,concurrency:CONCURRENCY,maxInFlight,halted,modelOverride:null,reasoningOverride:null,visualAcceptance:false,results},null,2));};
const genericIssues=[
 'Compare only the original image with the previous native rendering; verify that the graph itself is preserved and surrounding question text or panel captions are excluded.',
 'Check source-visible frame/axis scale, ticks and labels, curve topology and smoothness, marked points, line/dash weights and spacing, arrowheads, legends, and shaded areas. Do not invent absent features.',
 'Correct only discrepancies supported by the original image. Preserve already matching elements and editable data relationships. Return a complete plan, not a patch.'
];
const restriction='Do not execute commands, call tools, browse, or generate/edit raster images. Inspect attached images only. Return only the requested complete graph observation JSON.\n';
function stop(child){try{child.kill('SIGTERM');}catch{}const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}},5000);timer.unref();}
function invoke(item,attempt,dir,prompt,images){
 if(halted)throw Error('Provider loop halted after forbidden tool/image event.');
 if(ledger.length>=MAX_CALLS||ledger.filter(e=>e.id===item.id).length>=MAX_ATTEMPTS)throw Error('Provider call ceiling reached.');
 const binary=process.env.CODEX_BINARY||'codex';
 const args=['exec','--ephemeral','--sandbox','read-only','--ignore-user-config','--json',...images.flatMap(image=>['--image',image]),'-o',path.join(dir,'response.txt'),'-'];
 write(path.join(dir,'invocation.json'),{binary,args,cwd:root,promptFile:'prompt.txt',modelOverride:null,reasoningOverride:null,timeoutMs:TIMEOUT_MS});
 const entry={ordinal:ledger.length+1,id:item.id,attempt,startedAt:new Date().toISOString(),attemptDir:dir,images,promptSHA256:crypto.createHash('sha256').update(prompt).digest('hex')};
 // The durable, append-only ledger is committed BEFORE spawning, including
 // spawn failures and timeouts. No rollback or retry outside the budget.
 const fd=fs.openSync(path.join(evidence,'requests.jsonl'),'a');try{fs.writeSync(fd,JSON.stringify(entry)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}ledger.push(entry);summary();
 return new Promise(resolve=>{const started=performance.now();inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);const child=spawn(binary,args,{cwd:root,stdio:['pipe','pipe','pipe']});active.add(child);
 const events=fs.createWriteStream(path.join(dir,'events.jsonl'),{flags:'wx'}),stderr=fs.createWriteStream(path.join(dir,'stderr.log'),{flags:'wx'});let buffer='',timedOut=false,spawnError=null,imageEvents=0,toolEvents=0;const usages=[],models=new Set();
 const parse=line=>{try{const e=JSON.parse(line),type=String(e.item?.type||e.type||'').replace(/[^a-z0-9]/gi,'').toLowerCase();if(typeof e.model==='string')models.add(e.model);if(e.type==='turn.completed')usages.push(e.usage||null);if(/imagegeneration|imagegen/.test(type)){imageEvents++;halted=true;}if(/commandexecution|mcptoolcall|websearch|toolcall|toolstarted|toolcompleted|functioncall|filechange/.test(type)){toolEvents++;halted=true;}if(halted)for(const running of active)stop(running);}catch{}};
 const timer=setTimeout(()=>{timedOut=true;stop(child);},TIMEOUT_MS);
 child.stdout.on('data',chunk=>{events.write(chunk);buffer+=chunk.toString();let n;while((n=buffer.indexOf('\n'))>=0){parse(buffer.slice(0,n));buffer=buffer.slice(n+1);}});child.stderr.on('data',b=>stderr.write(b));child.on('error',e=>spawnError=e.message);child.stdin.on('error',()=>{});
 child.on('close',async(exitCode,signal)=>{clearTimeout(timer);if(buffer.trim())parse(buffer);active.delete(child);inFlight--;await Promise.all([new Promise(r=>events.end(r)),new Promise(r=>stderr.end(r))]);const file=path.join(dir,'response.txt');resolve({ordinal:entry.ordinal,exitCode,signal,spawnError,timedOut,imageEvents,toolEvents,wallMs:Math.round(performance.now()-started),usage:usages,exposedModels:[...models],response:fs.existsSync(file)?fs.readFileSync(file,'utf8'):''});});child.stdin.end(prompt);
 });
}
async function renderNative(native,plan,dir,origin){const page=await browser.newPage({viewport:{width:1600,height:1200}});try{await page.goto(origin);const rendered=await page.evaluate(async({objects,source,moduleBase,moduleQuery})=>{
 await Promise.all([document.fonts.load('400 12px "Latin Modern Roman"'),document.fonts.load('italic 400 12px "Latin Modern Roman"')]);await document.fonts.ready;
 const{renderCoordplane,renderFuncgraph}=await import(moduleBase + 'render/coordplane.js' + moduleQuery);const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),g=document.createElementNS(ns,'g'),plane=objects.find(o=>o.type==='coordplane'),pb=source.plotBox;
 g.setAttribute('transform',`translate(${pb.x} ${pb.y}) scale(${pb.w/plane.w} ${pb.h/plane.h}) translate(${-plane.x} ${-plane.y})`);
 const regions=objects.filter(o=>o.sourceKind==='region'),curves=objects.filter(o=>o.type!=='coordplane'&&o.sourceKind!=='region');for(const o of [...regions,...curves,plane])g.append(o.type==='coordplane'?renderCoordplane(o):renderFuncgraph(o));svg.append(g);svg.id='native';svg.setAttribute('xmlns',ns);document.body.replaceChildren(svg);document.body.style.cssText='margin:0;background:white';await document.fonts.ready;const b=svg.getBBox(),minX=b.x-8,minY=b.y-8,maxX=b.x+b.width+8,maxY=b.y+b.height+8;svg.setAttribute('viewBox',`${minX} ${minY} ${maxX-minX} ${maxY-minY}`);svg.setAttribute('width','700');svg.setAttribute('height','550');svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.style.cssText='display:block;width:700px;height:550px;background:white' ;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{svg:svg.outerHTML,bounds:{minX,minY,maxX,maxY}};
 },{objects:native.objects,source:plan.source,moduleBase,moduleQuery});
 const font='data:font/woff2;base64,'+fs.readFileSync(path.join(root,'fonts/lmroman10-regular.woff2')).toString('base64');fs.writeFileSync(path.join(dir,'native-render.svg'),rendered.svg.replace(/(<svg\b[^>]*>)/,'$1<style>@font-face{font-family:"Latin Modern Roman";src:url("'+font+'") format("woff2");font-style:normal;font-weight:normal}</style>'),{flag:'wx'});await page.locator('#native').screenshot({path:path.join(dir,'native-render.png'),animations:'disabled'});write(path.join(dir,'render.json'),{status:'captured-not-visually-accepted',bounds:rendered.bounds});return path.join(dir,'native-render.png');}finally{await page.close();}}
try{
 // Full decode and binding verification precede validation-only success AND
 // every possible provider spawn. Registry image contents are the only inputs.
 const decoder=await browser.newPage();try{for(const c of cases){const dims=await decoder.evaluate(async data=>{const i=new Image();i.src=data;await i.decode();return{width:i.naturalWidth,height:i.naturalHeight};},c.dataUrl);if(!dims.width||!dims.height||dims.width>100000||dims.height>100000)fail(`Invalid dimensions: ${c.id}`);c.source={id:c.id,hash:c.sourceHash,...dims};}}finally{await decoder.close();}
 fs.mkdirSync(evidence,{recursive:true});write(path.join(evidence,'source-only-manifest.json'),{schema:'5e.graph-source-only/v1',sourceManifest:manifestPath,cases:cases.map(c=>({id:c.id,sourceFile:c.sourceFile,sourceHash:c.sourceHash,...c.source})),maxCalls:MAX_CALLS,maxAttempts:MAX_ATTEMPTS,concurrency:CONCURRENCY,manualInputsRead:false});
 if(validateOnly){write(path.join(evidence,'validation.json'),{valid:true,sourceCount:cases.length,allImagesDecoded:true,allHashesMatched:true,providerCalls:0});console.log(JSON.stringify({valid:true,sourceCount:cases.length,providerCalls:0,evidence}));}
 else{
 if(typeof contract.buildGraphCorrectionPrompt!=='function')fail('buildGraphCorrectionPrompt export required before paid work.');
 fs.writeFileSync(path.join(evidence,'requests.jsonl'),'',{flag:'wx'});
 server=http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/style.css"><body></body>');return;}const f=path.resolve(root,'.'+pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 async function worker(){while(cursor<cases.length&&!halted){const c=cases[cursor++],caseDir=path.join(evidence,c.id);fs.mkdirSync(caseDir);const original=path.join(caseDir,'source'+c.extension);fs.writeFileSync(original,c.bytes,{flag:'wx'});write(path.join(caseDir,'source.json'),c.source);const result={id:c.id,source:c.source,attempts:[],first:null,final:null,visualAcceptance:false};results.push(result);let previousPlan=null,previousImage=null,validationErrors=[];
 for(let attempt=1;attempt<=MAX_ATTEMPTS&&!halted;attempt++){const dir=path.join(caseDir,`attempt-${attempt}`);fs.mkdirSync(dir);write(path.join(dir,'source.json'),c.source);const seed={...c.source,plotBox:{x:0,y:0,w:c.source.width,h:c.source.height}};
 const prompt=restriction+(attempt===1?contract.buildGraphExtractionPrompt(seed):contract.buildGraphCorrectionPrompt(seed,{previousPlan,issues:genericIssues,attempt,maxAttempts:MAX_ATTEMPTS,validationErrors,hasPreviousRender:!!previousImage}));fs.writeFileSync(path.join(dir,'prompt.txt'),prompt,{flag:'wx'});write(path.join(dir,'feedback.json'),{previousAttempt:attempt>1?attempt-1:null,previousRender:previousImage,issues:attempt>1?genericIssues:[],validationErrors,sourceGrounding:'generic original-versus-render checklist; no case-specific reference values'});
 let record;try{const call=await invoke(c,attempt,dir,prompt,previousImage?[original,previousImage]:[original]);const{response,...metrics}=call;const providerPass=call.exitCode===0&&!call.spawnError&&!call.timedOut&&!call.toolEvents&&!call.imageEvents;const checked=contract.parseGraphPlanResponse(response,{source:c.source});write(path.join(dir,'validation.json'),checked);if(checked.plan)write(path.join(dir,'plan.json'),checked.plan);const pb=checked.plan?.source?.plotBox;const native=providerPass&&checked.ok&&!checked.blocked?buildNativeGraph(checked.plan,{source:c.source,box:{x:0,y:0,w:70,h:70*pb.h/pb.w}}):{ok:false,objects:[],error:!providerPass?'Provider call failed':'Contract invalid or blocked'};write(path.join(dir,'native-objects.json'),native);
 let image=null,renderError=null;if(native.ok)try{image=await renderNative(native,checked.plan,dir,origin);}catch(e){renderError=e.message;}
 record={attempt,dir,providerPass,...metrics,structurallyValid:checked.ok,blocked:checked.blocked,nativeEditable:!!native.ok,rendered:!!image,renderError,visualAcceptance:false};write(path.join(dir,'metrics.json'),record);
 previousPlan=checked.plan?.source&&['id','hash','width','height'].every(k=>checked.plan.source[k]===c.source[k])?checked.plan:null;previousImage=previousPlan?image:null;validationErrors=[...(checked.errors||[]),...(checked.blocked?[{message:'Prior candidate is blocked and requires source-grounded correction.'}]:[]),...(!native.ok?[{message:native.error}]:[]),...(renderError?[{message:renderError}]:[]),...(!providerPass?[{message:'Previous provider call failed/timed out; no completed valid render is available.'}]:[])];
 }catch(e){record={attempt,dir,internalError:e.stack,visualAcceptance:false};write(path.join(dir,'internal-error.json'),record);previousPlan=null;previousImage=null;validationErrors=[{message:e.message}];}
 result.attempts.push(record);if(attempt===1)result.first=dir;result.final=dir;summary();console.log(`${c.id} attempt ${attempt}: ${record.rendered?'native-render-candidate':record.internalError?'internal-error':'no-render'}`);
 }write(path.join(caseDir,'attempt-index.json'),{first:result.first,final:result.final,attempts:result.attempts.map(a=>a.dir),visualAcceptance:false});}}
 await Promise.all(Array.from({length:CONCURRENCY},()=>worker()));summary();if(halted||results.length!==8||results.some(r=>r.attempts.some(a=>!a.providerPass||!a.rendered)))process.exitCode=1;
 }
}finally{for(const child of active)stop(child);await browser.close();if(server)await new Promise(r=>server.close(r));}
