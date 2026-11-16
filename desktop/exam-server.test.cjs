const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {startExamServer} = require('./exam-server.cjs');
test('desktop exam serves product assets, bounds source access and rejects external paths',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'5e-exam-'));
  const root=path.join(directory,'app'); await fs.mkdir(path.join(root,'vendor'),{recursive:true});
  await fs.writeFile(path.join(root,'index.html'),'exam'); await fs.writeFile(path.join(root,'vendor','engine.wasm'),Buffer.from([0,97,115,109]));
  await fs.writeFile(path.join(directory,'private.json'),'private'); await fs.symlink(path.join(directory,'private.json'),path.join(root,'vendor','escape.json'));
  const host=await startExamServer({root,port:0});
  try {
    assert.equal(await(await fetch(host.origin)).text(),'exam');
    const wasm=await fetch(host.origin+'/vendor/engine.wasm'); assert.equal(wasm.headers.get('content-type'),'application/wasm');
    for(const target of ['/desktop/main.cjs','/_work/secret.json','/.git/config','/vendor/escape.json','/%2e%2e/private.json']) assert.ok((await fetch(host.origin+target)).status>=400,target);
    assert.equal((await fetch(host.origin,{headers:{Origin:'https://example.org'}})).status,403);
    const source={version:'0.17',pages:[{id:'a',objects:[]}],activePageId:'a'},key=host.seed(source);
    const url=host.origin+'/exam-seed/'+key;
    assert.equal((await fetch(url,{method:'HEAD'})).status,200,'HEAD cannot consume source');
    assert.deepEqual(await(await fetch(url)).json(),source);
    assert.equal((await fetch(url)).status,410,'source is delivered once');
    assert.throws(()=>host.seed({pages:[]}),/원본/);
  } finally { await host.close(); await fs.rm(directory,{recursive:true,force:true}); }
});
