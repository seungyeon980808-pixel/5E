// 지난 Pages 게시본 되살리기(scripts/publication-recover.cjs) — preview/ 없이도 돌고, apps/ 아래 원본도 찾는지 본다.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {inventory}=require('../scripts/web-release.cjs');
const {recoverBase,safeFile}=require('../scripts/publication-recover.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'5e-publication-recover-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source');fs.mkdirSync(source);
  const write=(dir,file,value)=>{fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),value);};
  const git=args=>execFileSync('git',args,{cwd:source,encoding:'utf8'}).trim();
  return {root,source,write,git};
}
test('expired artifacts are recovered from Git blobs, including apps/ sources published at their route path',async t=>{
  const f=fixture(t);
  f.write(f.source,'index.html','<title>5E 1.7.1</title>');f.write(f.source,'404.html','route recovery');
  f.write(f.source,'js/release-receipt.js',"const release={version: '1.7.1',sourceCommit: null};");
  f.write(f.source,'js/web-ai-bridge.js','bridge');
  f.write(f.source,'apps/print/index.html','print survey');f.write(f.source,'apps/examlibrary/index.html','exam library');
  f.git(['init','-q']);f.git(['add','.']);f.git(['-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','기반']);
  const sha=f.git(['rev-parse','HEAD']),expected=path.join(f.root,'expected');fs.mkdirSync(expected);
  for(const file of ['index.html','404.html','js/web-ai-bridge.js'])f.write(expected,file,fs.readFileSync(path.join(f.source,file)));
  f.write(expected,'print/index.html','print survey');f.write(expected,'examlibrary/index.html','exam library');
  f.write(expected,'js/release-receipt.js',`const release={version: '1.7.1',sourceCommit: '${sha}'};`);f.write(expected,'.nojekyll','');
  const receipt={sourceCommit:sha,baseSourceCommit:sha,files:inventory(expected)},recovered=path.join(f.root,'recovered');
  const result=await recoverBase({site:recovered,receipt,repository:f.source,cache:path.join(f.root,'blobs'),preservedSha:sha,origin:'http://127.0.0.1:1/'});
  assert.deepEqual(inventory(recovered),receipt.files);assert.deepEqual(result.generated,[]);
  await assert.rejects(()=>recoverBase({site:recovered,receipt,repository:f.source,cache:path.join(f.root,'blobs'),preservedSha:sha}),/fresh base directory/);
});
test('a receipt without the root entry is refused',async t=>{
  const f=fixture(t);
  await assert.rejects(()=>recoverBase({site:path.join(f.root,'x'),receipt:{files:{'404.html':'0'.repeat(64)}},repository:f.source,cache:path.join(f.root,'b')}),/Incomplete published base: index.html/);
});
test('publication paths cannot escape the site',()=>{
  for(const bad of ['../x','/etc/passwd','a/../../b','a\\b','.'])assert.throws(()=>safeFile(bad),/Unsafe file/);
  assert.equal(safeFile('print/index.html'),'print/index.html');
});
