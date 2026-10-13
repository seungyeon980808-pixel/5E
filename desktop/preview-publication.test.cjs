const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {inventory}=require('../scripts/web-release.cjs');
const {appendPreview,verifyPreview,recoverBase,safeFile}=require('../scripts/preview-publication.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'5e-preview-publication-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),site=path.join(root,'site');fs.mkdirSync(source);fs.mkdirSync(site);
  const write=(dir,file,value)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),value);};
  for(const file of ['index.html','404.html','js/release-receipt.js','examlibrary/index.html','ourdocs/index.html','hub/index.html','memo/config.js','preview/old.js','mobile/index.html','1.6.0/index.html'])write(site,file,`stable:${file}`);
  write(source,'index.html','<title>5E 1.6.3</title><strong data-release-version>v1.6.3</strong><span data-change-summary title="change">change</span><script src="/js/main.js?v=source"></script><link href="/css/style.css">');
  write(source,'js/main.js','export const source="new";');write(source,'js/release-receipt.js',"const release={version: '1.6.3',sourceCommit: null};");
  write(source,'assets/raw.png',Buffer.from([137,80,78,71,0,255]));write(source,'.gitignore','ignored.js\n');write(source,'ignored.js','must not publish');
  const git=args=>execFileSync('git',args,{cwd:source,encoding:'utf8'}).trim();git(['init','-q']);git(['add','.']);
  git(['-c','user.name=Preview QA','-c','user.email=qa@example.invalid','commit','-qm','검증 소스']);
  const sha=git(['rev-parse','HEAD']),base={sourceCommit:sha,files:inventory(site)};
  return {root,source,site,sha,base,write,git};
}
test('preview replaces only its own route and stamps the immutable source',t=>{
  const f=fixture(t),receipt=appendPreview({site:f.site,base:f.base,sourceRoot:f.source,publicationCommit:f.sha});
  assert.equal(verifyPreview(f.site,receipt),Object.keys(receipt.files).length);
  for(const [file,hash]of Object.entries(f.base.files))if(!file.startsWith('preview/'))assert.equal(receipt.files[file],hash);
  assert.equal(fs.existsSync(path.join(f.site,'preview/old.js')),false);assert.equal(fs.existsSync(path.join(f.site,'preview/ignored.js')),false);
  assert.deepEqual(fs.readFileSync(path.join(f.site,'preview/assets/raw.png')),fs.readFileSync(path.join(f.source,'assets/raw.png')));
  assert.match(fs.readFileSync(path.join(f.site,'preview/index.html'),'utf8'),new RegExp(`1.7.0 Preview[\\s\\S]*${f.sha}`));
  assert.match(fs.readFileSync(path.join(f.site,'preview/index.html'),'utf8'),/src="\/preview\/js\/main.js/);
  assert.match(fs.readFileSync(path.join(f.site,'preview/index.html'),'utf8'),/href="\/preview\/css\/style.css/);
  f.write(f.site,'hub/index.html','unexpected modification');receipt.files=inventory(f.site);
  assert.throws(()=>verifyPreview(f.site,receipt),/Non-preview route changed/);
});
test('dirty sources and a modified published base are rejected before replacement',t=>{
  const f=fixture(t);f.write(f.source,'js/main.js','uncommitted');
  assert.throws(()=>appendPreview({site:f.site,base:f.base,sourceRoot:f.source,publicationCommit:f.sha}),/committed and clean/);
  assert.equal(fs.readFileSync(path.join(f.site,'preview/old.js'),'utf8'),'stable:preview/old.js');
  f.git(['checkout','--','js/main.js']);f.write(f.site,'index.html','changed stable');
  assert.throws(()=>appendPreview({site:f.site,base:f.base,sourceRoot:f.source,publicationCommit:f.sha}),/Publication bytes changed/);
});
test('expired publication artifacts are recovered from exact blobs with generated identity preserved',async t=>{
  const f=fixture(t);
  for(const file of ['404.html','examlibrary/index.html','ourdocs/index.html','hub/index.html','memo/config.js'])f.write(f.source,file,`recover:${file}`);
  f.git(['add','.']);f.git(['-c','user.name=Preview QA','-c','user.email=qa@example.invalid','commit','-qm','검증 기반']);
  const sha=f.git(['rev-parse','HEAD']),expected=path.join(f.root,'expected');fs.mkdirSync(expected);
  for(const file of ['index.html','js/main.js','js/release-receipt.js','404.html','examlibrary/index.html','ourdocs/index.html','hub/index.html','memo/config.js'])f.write(expected,file,fs.readFileSync(path.join(f.source,file)));
  f.write(expected,'js/release-receipt.js',fs.readFileSync(path.join(f.source,'js/release-receipt.js'),'utf8').replace('sourceCommit: null',`sourceCommit: '${sha}'`));f.write(expected,'.nojekyll','');
  const receipt={sourceCommit:sha,baseSourceCommit:sha,files:inventory(expected)},recovered=path.join(f.root,'recovered');
  const result=await recoverBase({site:recovered,receipt,repository:f.source,cache:path.join(f.root,'blobs'),preservedSha:sha,origin:'http://127.0.0.1:1/'});
  assert.deepEqual(inventory(recovered),receipt.files);assert.deepEqual(result.generated,[]);
  await assert.rejects(()=>recoverBase({site:recovered,receipt,repository:f.source,cache:path.join(f.root,'blobs'),preservedSha:sha}),/fresh base directory/);
});
test('publication paths cannot escape the site',()=>{
  for(const file of ['../secret','/secret','a/../secret','a\\secret','.', 'a\0secret'])assert.throws(()=>safeFile(file),/Unsafe file/);
  assert.equal(safeFile('preview/js/main.js'),'preview/js/main.js');
});
