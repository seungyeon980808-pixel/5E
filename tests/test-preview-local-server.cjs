const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {spawn}=require('node:child_process');

test('malformed request targets cannot terminate the owned preview server', {timeout:15000}, async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'5e-preview-server-'));
  fs.writeFileSync(path.join(directory,'index.html'),'owned-fixture');
  const child=spawn(process.execPath,[path.resolve(__dirname,'../scripts/preview-local-server.cjs')],{
    env:{...process.env,PORT:'0',FIVE_E_SITE_ROOT:directory,LOCAL_CODEX_BINARY:''},stdio:['ignore','pipe','pipe'],
  });
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  t.after(async()=>{
    if(child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{
      child.once('exit',resolve);child.kill('SIGTERM');
    });
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const origin=await new Promise((resolve,reject)=>{
    let output='';const timer=setTimeout(()=>reject(Error('server startup deadline')),5000);
    child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);reject(Error(`server exited ${code}: ${stderr}`));});
    child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  const request=(target,host)=>new Promise((resolve,reject)=>{
    const req=http.get({hostname:'127.0.0.1',port:new URL(origin).port,path:target,headers:host?{Host:host}:{}},response=>{
      let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));
    });
    req.setTimeout(3000,()=>req.destroy(Error('request deadline')));req.on('error',reject);
  });
  for(const target of ['//?mode=pro&mobile=0','http://example.invalid/','/%00','/%ZZ']){
    assert.equal((await request(target)).status,400,`reject malformed target ${target}`);
    assert.deepEqual(await request('/'),{status:200,body:'owned-fixture'},'next valid request still works');
    assert.equal(child.exitCode,null,stderr);
  }
  assert.equal((await request('/','example.invalid')).status,403,'Host protection is retained');
  assert.equal((await request('/api/unknown')).status,404,'unknown API cannot reach any upstream');
});
