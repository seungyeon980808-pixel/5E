const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { inventory } = require('./web-release.cjs');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const retainedSha = '751b1ed4622058497a6f3ba43f92333eb15268eb';
const surface = ['index.html','404.html','manifest.json','LICENSE','docs/credits.html',
  'experiments/web-codex-auth/editor-bridge.js','js','css','assets','fonts','vendor'];
const requiredBase = ['index.html','404.html','js/release-receipt.js','examlibrary/index.html','ourdocs/index.html','hub/index.html','memo/config.js'];
const git = (root,args) => execFileSync('git',args,{cwd:root,maxBuffer:64*1024*1024});
function safeFile(file) {
  if (!file || file==='.' || file.includes('\\') || file.includes('\0') || path.posix.normalize(file)!==file || file.startsWith('/') || file==='..' || file.startsWith('../')) throw Error(`Unsafe file: ${file}`);
  return file;
}
function tree(root,sha,paths=[]) {
  if (!/^[a-f0-9]{40}$/.test(sha || '')) throw Error('Full source SHA required');
  return new Map(git(root,['ls-tree','-r','-z',sha,'--',...paths]).toString().split('\0').filter(Boolean).map(line=>{
    const [meta,file]=line.split('\t'),[mode,type,blob]=meta.split(' ');
    if (type!=='blob' || !['100644','100755'].includes(mode)) throw Error(`Unsupported publication input: ${file}`);
    return [safeFile(file),blob];
  }));
}
function exact(site,files) {
  const actual=inventory(site);
  if (JSON.stringify(Object.keys(actual).sort())!==JSON.stringify(Object.keys(files).sort())) throw Error('Publication file list changed');
  for (const [file,hash] of Object.entries(files)) if(actual[file]!==hash) throw Error(`Publication bytes changed: ${file}`);
  return actual;
}
function write(site,file,bytes) {
  const destination=path.join(site,safeFile(file)); fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,bytes);
}

// Recover an expired Pages artifact from immutable Git blobs. Only generated
// files absent from those commits are read from the live site, hash-checked.
async function recoverBase({site,receipt,repository,cache,origin='https://www.5e.ai.kr/',preservedSha=retainedSha}) {
  for(const file of requiredBase) if(!receipt.files?.[file]) throw Error(`Incomplete published base: ${file}`);
  if(fs.existsSync(site)) throw Error('Use a fresh base directory');
  const refs=[receipt.sourceCommit,receipt.baseSourceCommit,receipt.baseRouteCommit,preservedSha].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const trees=refs.map(sha=>tree(repository,sha));
  const child=spawn('git',['cat-file','--batch'],{cwd:repository,stdio:['pipe','pipe','inherit']});
  const iterator=child.stdout[Symbol.asyncIterator]();let buffer=Buffer.alloc(0);
  async function read(size) {
    while(buffer.length<size) {const next=await iterator.next();if(next.done)throw Error('Git blob stream ended');buffer=Buffer.concat([buffer,next.value]);}
    const value=buffer.subarray(0,size);buffer=buffer.subarray(size);return value;
  }
  async function line() {
    while(!buffer.includes(10)) {const next=await iterator.next();if(next.done)throw Error('Git header missing');buffer=Buffer.concat([buffer,next.value]);}
    const size=buffer.indexOf(10);return (await read(size+1)).subarray(0,size).toString();
  }
  fs.mkdirSync(cache,{recursive:true});const blobs=new Map(),generated=[];
  async function blobFile(blob) {
    if(blobs.has(blob))return blobs.get(blob);
    child.stdin.write(blob+'\n');const header=(await line()).split(' ');
    if(header[0]!==blob || header[1]!=='blob' || !/^\d+$/.test(header[2]))throw Error('Invalid Git blob response');
    const bytes=await read(Number(header[2]));if((await read(1))[0]!==10)throw Error('Invalid Git blob terminator');
    const file=path.join(cache,blob);fs.writeFileSync(file,bytes);const result={file,hash:sha256(bytes)};blobs.set(blob,result);return result;
  }
  try {
    fs.mkdirSync(site,{recursive:true});
    for(const [file,hash] of Object.entries(receipt.files)) {
      safeFile(file);if(!/^[a-f0-9]{64}$/.test(hash))throw Error(`Invalid base digest: ${file}`);
      let matched=false;
      for(const blob of new Set(trees.map(t=>t.get(file)).filter(Boolean))) {
        const candidate=await blobFile(blob);
        if(candidate.hash===hash){const dest=path.join(site,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(candidate.file,dest);matched=true;break;}
        if(file==='js/release-receipt.js') {
          const bytes=Buffer.from(fs.readFileSync(candidate.file,'utf8').replace('sourceCommit: null',`sourceCommit: '${receipt.baseSourceCommit || receipt.sourceCommit}'`));
          if(sha256(bytes)===hash){write(site,file,bytes);matched=true;break;}
        }
      }
      if(matched)continue;
      if(file==='.nojekyll'&&sha256(Buffer.alloc(0))===hash){write(site,file,Buffer.alloc(0));continue;}
      const response=await fetch(new URL(file,origin),{signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error(`Published base unavailable: ${file}`);
      const bytes=Buffer.from(await response.arrayBuffer());if(sha256(bytes)!==hash)throw Error(`Published base changed: ${file}`);
      write(site,file,bytes);generated.push(file);
    }
    exact(site,receipt.files);return {files:Object.keys(receipt.files).length,generated};
  } finally {child.stdin.end();child.kill();}
}

function stamp(file,bytes,sha,branch) {
  if(!['index.html','js/release-receipt.js'].includes(file))return bytes;
  let value=bytes.toString('utf8');
  if(file==='index.html') {
    if(!/<title>5E 1\.6\.3/.test(value) || !/data-release-version>v1\.6\.3/.test(value))throw Error('Unexpected preview entry version');
    value=value.replace('<title>5E 1.6.3','<title>5E 1.7.0 Preview').replace(/data-release-version>v1\.6\.3[^<]*/,'data-release-version>v1.7.0 Preview');
    // The integration entry runs at / locally. Its root-relative scripts and
    // styles must resolve inside /preview, never to the stable site's runtime.
    value=value.replace(/\b(src|href)="\/(js|css|assets|fonts|vendor|experiments)\//g,'$1="/preview/$2/');
    value=value.replace(/<span\b([^>]*\bdata-change-summary\b[^>]*)>([^<]*)<\/span>/,(match,attrs,label)=>
      `<span${attrs.replace(/\b(title|aria-label)="([^"]*)"/g,(_,name,text)=>`${name}="${text} · 브랜치: ${branch} · 소스 커밋: ${sha}"`)} data-preview-commit="${sha}" data-preview-dirty="false">${label} · ${sha.slice(0,8)}</span>`);
  } else if(file==='js/release-receipt.js') {
    if((value.match(/sourceCommit: null/g)||[]).length!==1)throw Error('Preview source placeholder missing');
    value=value.replace("version: '1.6.3'","version: '1.7.0 Preview'").replace('sourceCommit: null',`sourceCommit: '${sha}'`);
  } else return bytes;
  return Buffer.from(value);
}
function appendPreview({site,base,sourceRoot,publicationCommit}) {
  if(!/^[a-f0-9]{40}$/.test(publicationCommit||''))throw Error('Full publication SHA required');
  exact(site,base.files);
  for(const file of requiredBase)if(!base.files[file])throw Error(`Incomplete published base: ${file}`);
  const sourceCommit=git(sourceRoot,['rev-parse','HEAD']).toString().trim();
  if(git(sourceRoot,['status','--porcelain']).toString().trim())throw Error('Preview source must be committed and clean');
  const branch='feature/1.7.0/four-session-integration';
  const sources=[];
  for(const [file,blob] of tree(sourceRoot,sourceCommit,surface)) {
    const source=path.join(sourceRoot,file);if(!fs.lstatSync(source).isFile())throw Error(`Ordinary file required: ${file}`);
    const bytes=fs.readFileSync(source),actual=crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if(actual!==blob)throw Error(`Source differs from its commit: ${file}`);
    sources.push([file,bytes]);
  }
  if(!sources.some(([f])=>f==='js/main.js') || !sources.some(([f])=>f==='index.html'))throw Error('Preview source entry missing');
  fs.rmSync(path.join(site,'preview'),{recursive:true,force:true});
  for(const [file,bytes] of sources)write(site,`preview/${file}`,stamp(file,bytes,sourceCommit,branch));
  write(site,'preview/release.json',Buffer.from(JSON.stringify({version:'1.7.0',channel:'preview',sourceCommit,sourceBranch:branch})+'\n'));
  const receipt={schemaVersion:1,sourceCommit:publicationCommit,previewSourceCommit:sourceCommit,
    baseSourceCommit:base.baseSourceCommit||base.sourceCommit,baseRouteCommit:base.sourceCommit,
    baseFiles:base.files,files:inventory(site)};
  verifyPreview(site,receipt);return receipt;
}
function verifyPreview(site,receipt) {
  const actual=exact(site,receipt.files);
  if(!/^[a-f0-9]{40}$/.test(receipt.previewSourceCommit||''))throw Error('Preview source receipt missing');
  for(const [file,hash] of Object.entries(receipt.baseFiles))if(!file.startsWith('preview/')&&actual[file]!==hash)throw Error(`Non-preview route changed: ${file}`);
  for(const file of Object.keys(actual))if(!file.startsWith('preview/')&&!Object.hasOwn(receipt.baseFiles,file))throw Error(`Unexpected non-preview addition: ${file}`);
  const release=JSON.parse(fs.readFileSync(path.join(site,'preview/release.json'),'utf8'));
  if(release.version!=='1.7.0'||release.sourceCommit!==receipt.previewSourceCommit)throw Error('Preview displayed revision mismatch');
  const html=fs.readFileSync(path.join(site,'preview/index.html'),'utf8');
  if(!html.includes('1.7.0 Preview')||!html.includes(`data-preview-commit="${release.sourceCommit}"`))throw Error('Preview identity missing');
  if(!fs.readFileSync(path.join(site,'preview/js/release-receipt.js'),'utf8').includes(`sourceCommit: '${release.sourceCommit}'`))throw Error('Preview runtime identity mismatch');
  return Object.keys(actual).length;
}
if(require.main===module)(async()=>{
  const args=process.argv.slice(2),opt=name=>{const i=args.indexOf(name);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error(`${name} required`);return path.resolve(args[i+1]);};
  const site=opt('--site'),receiptFile=opt('--receipt');
  if(args.includes('--verify'))console.log(`Verified preview and ${verifyPreview(site,JSON.parse(fs.readFileSync(receiptFile,'utf8')))} publication files`);
  else if(args.includes('--recover'))console.log(JSON.stringify(await recoverBase({site,receipt:JSON.parse(fs.readFileSync(receiptFile,'utf8')),repository:path.resolve(__dirname,'..'),cache:opt('--cache')})));
  else {const receipt=appendPreview({site,base:JSON.parse(fs.readFileSync(opt('--base-receipt'),'utf8')),sourceRoot:opt('--source'),publicationCommit:git(path.resolve(__dirname,'..'),['rev-parse','HEAD']).toString().trim()});fs.mkdirSync(path.dirname(receiptFile),{recursive:true});fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');console.log(`Preview ${receipt.previewSourceCommit}; all other routes preserved`);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={recoverBase,appendPreview,verifyPreview,stamp,safeFile};
