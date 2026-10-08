const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {assets,publicConfig,appendRoute,verifyRoute}=require('../scripts/memo-publication.cjs');
const {inventory}=require('../scripts/web-release.cjs');
test('refuses secret keys and unconfigured deployments',()=>{
  const anon='e30.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';
  assert.equal(publicConfig('https://demo.supabase.co',anon).publishableKey,anon);
  for(const key of ['','sb_secret_123','e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.signature'])assert.throws(()=>publicConfig('https://demo.supabase.co',key));
  assert.throws(()=>publicConfig('',anon));
});
test('route append preserves all existing bytes and rejects uncommitted source and extra files',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'memo-publication-'));const source=path.join(temp,'source'),site=path.join(temp,'site');
  fs.mkdirSync(source);fs.mkdirSync(site);
  try{
    execFileSync('git',['init','-q'],{cwd:source});
    for(const asset of assets){fs.mkdirSync(path.dirname(path.join(source,asset)),{recursive:true});fs.writeFileSync(path.join(source,asset),asset.endsWith('.woff2')?Buffer.alloc(2*1024*1024,65):'test asset '+asset);}
    execFileSync('git',['add','.'],{cwd:source});execFileSync('git',['-c','user.name=Test','-c','user.email=test@example.com','commit','-qm','fixture'],{cwd:source});
    for(const file of ['index.html','404.html','js/release-receipt.js','examlibrary/index.html','ourdocs/index.html','preview/index.html','mobile/index.html']){fs.mkdirSync(path.dirname(path.join(site,file)),{recursive:true});fs.writeFileSync(path.join(site,file),'unchanged '+file);}
    const base={sourceCommit:'a'.repeat(40),files:inventory(site)};const config={url:'https://demo.supabase.co',publishableKey:'sb_publishable_test'};
    const receipt=appendRoute(site,base,source,config);assert.equal(verifyRoute(site,receipt),16);
    for(const [file,hash] of Object.entries(base.files))assert.equal(inventory(site)[file],hash);
    fs.writeFileSync(path.join(site,'private.txt'),'must not publish');assert.throws(()=>verifyRoute(site,receipt),/inventory changed/);fs.unlinkSync(path.join(site,'private.txt'));
    fs.writeFileSync(path.join(site,'index.html'),'changed');assert.throws(()=>verifyRoute(site,receipt),/Publication changed/);
    fs.writeFileSync(path.join(source,assets[0]),'dirty');assert.throws(()=>appendRoute(site,{...base,files:inventory(site)},source,config),/Uncommitted route input/);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
