const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../js/ai-panel.js'),'utf8');
const start = source.indexOf("  copySelected.addEventListener('click', () => {");
const end = source.indexOf('\n  const exportCount =',start);
assert.ok(start > 0 && end > start);
const listener = source.slice(start,end);
const deferred = () => {
  let resolve,reject;
  const promise = new Promise((yes,no) => { resolve=yes;reject=no; });
  return {promise,resolve,reject};
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const png = deferred(),write = deferred(),statuses=[];
  let handler,writes=0,syncs=0,current=true,copiedBlob;
  const button={dataset:{},disabled:false,addEventListener(type,callback){assert.equal(type,'click');handler=callback;}};
  const context={busy:false,disposed:false,copySelected:button,selectedOutputItem:()=>({id:'owner'}),
    prepareVisibleOutput:()=>({png:png.promise,isCurrent:()=>current&&!context.disposed}),
    fetch:async()=>({blob:async()=>({type:'image/png'})}),
    ClipboardItem:class { constructor(data){copiedBlob=data['image/png'];} },
    navigator:{clipboard:{write(){writes++;return write.promise;}}},
    setStatus:(...args)=>statuses.push(args),
    syncSelectedOutputActions:()=>{syncs++;button.disabled=button.dataset.copyPending==='true';},
  };
  vm.runInNewContext(listener,context,{filename:'ai-panel.js#clipboard-listener'});
  return {context,button,png,write,statuses,click:()=>handler(),invalidate:()=>{current=false;},
    get writes(){return writes;},get syncs(){return syncs;},get blob(){return copiedBlob;}};
}
test('clipboard promise is handed to the browser synchronously and duplicate clicks stay locked',async()=>{
  const f=fixture();f.click();
  assert.equal(f.writes,1,'Safari user gesture reaches clipboard.write before any await');
  assert.equal(f.button.disabled,true);assert.equal(f.button.dataset.copyPending,'true');
  f.click();assert.equal(f.writes,1);
  f.png.resolve('data:image/png;base64,fixture');await f.blob;
  f.write.resolve();await flush();
  assert.equal(f.statuses.length,1);assert.equal(f.statuses[0][1],'ok');
  assert.equal(f.button.dataset.copyPending,undefined);assert.equal(f.button.disabled,false);
});
for(const settlement of ['resolve','reject']) {
  for(const invalidation of ['task-or-revision','dispose']) {
    test(`late clipboard ${settlement} after ${invalidation} does not change the new task status`,async()=>{
      const f=fixture();f.click();f.png.resolve('data:image/png;base64,fixture');await f.blob;
      if(invalidation==='dispose')f.context.disposed=true;else f.invalidate();
      if(settlement==='resolve')f.write.resolve();else f.write.reject(new Error('late permission failure'));
      await flush();
      assert.deepEqual(f.statuses,[]);assert.equal(f.button.dataset.copyPending,undefined);
      assert.equal(f.syncs,invalidation==='dispose'?0:1);
    });
  }
}
test('a stale PNG is rejected before the browser can copy its blob',async()=>{
  const f=fixture();f.click();f.invalidate();f.png.resolve('data:image/png;base64,fixture');
  await assert.rejects(f.blob,/복사 중 작업/);
  f.write.reject(new Error('PNG aborted'));await flush();
  assert.deepEqual(f.statuses,[]);assert.equal(f.button.disabled,false);
});
test('synchronous clipboard errors unlock the action without an unhandled rejection',async()=>{
  const f=fixture();f.context.navigator.clipboard.write=()=>{throw new Error('permission denied');};
  f.click();f.png.resolve('data:image/png;base64,fixture');await flush();
  assert.equal(f.statuses.length,1);assert.equal(f.statuses[0][1],'error');
  assert.equal(f.button.dataset.copyPending,undefined);assert.equal(f.button.disabled,false);
});
