// 지난 Pages 게시본 되살리기(사이트별 게시 작업 공용). 1.7.1: preview-publication.cjs에서 떼어 옴 — preview/를 지워도 남아야 함.
// Pages 묶음은 7일 뒤 지워지므로 영수증(receipt)의 해시와 같은 Git 조각(blob)으로 되살리고,
// 기록에 없는 생성 파일만 살아 있는 사이트에서 받아 해시로 확인한다.
// 1.7.1부터 하위 프로그램 입구는 저장소 apps/<이름>/에 있고 사이트에는 <이름>/로 올라가므로 두 경로를 모두 찾는다(내용은 해시로 확인).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { inventory } = require('./web-release.cjs');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// 1.7.0 Preview 게시본의 preview/ 파일이 들어 있는 커밋(지금 올라가 있는 게시본을 되살릴 때 필요).
const retainedSha = '751b1ed4622058497a6f3ba43f92333eb15268eb';
// 어느 판이든 반드시 있는 본체 파일만 확인한다(memo·hub·ourdocs는 psy로 옮겨질 예정이라 넣지 않음).
const requiredBase = ['index.html','404.html','js/release-receipt.js'];
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
      for(const blob of new Set(trees.flatMap(t=>[t.get(file),t.get('apps/'+file)]).filter(Boolean))) {
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

module.exports={recoverBase,safeFile};
