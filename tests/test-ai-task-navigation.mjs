import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createTaskWorkspaces} from '../js/ai-task-workspaces.js';

class Element {
  constructor(kind='panel', text='') { this.kind=kind;this.textContent=text;this.dataset={};this.children=[];this.attrs={};this.classList={toggle(){}}; }
  cloneNode() { const e=new Element(this.kind,this.textContent);e.attrs={...this.attrs};e.dataset={...this.dataset};e.title=this.title;e.children=this.children.map(c=>c.cloneNode());e.parentElement=this.parentElement;return e; }
  querySelector(s) { if(this.kind==='panel')return this.children[0];return this.children.find(e=>e.kind===s); }
  querySelectorAll(){return [];}
  replaceChildren(){this.children=[];}
  append(...items){for(const item of items)item.parentElement=this;this.children.push(...items);}
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
  closest(selector){for(let current=this;current;current=current.parentElement)if(selector==='.ai-task-tab'&&current.kind==='button')return current;return null;}
  focus(){globalThis.document.activeElement=this;}
}
const scope='11111111-1111-1111-1111-111111111111';
function fixture({saved,delay=false,failStorage=false}={}) {
  const panel=new Element();panel.append(new Element('list'));panel.parentElement=new Element();
  const storage=new Map([['5e.aiParallelWorkspaces.v1',JSON.stringify([scope])],['5e.aiActiveTask.v1',JSON.stringify(saved||null)]]);
  const alerts=[];const controllers=[];const release=[];const openings=[];const deleted=[];
  globalThis.document={getElementById:()=>panel,createElement:kind=>new Element(kind),activeElement:null};
  globalThis.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>{if(failStorage)throw Error('quota');storage.set(k,v);}};
  globalThis.window={alert:s=>alerts.push(s)};
  const manager=createTaskWorkspaces({get:()=>({objects:[],selectedIds:[]})},(_,options)=>{
    let selected=options.clientScope+'a';
    const ids=[options.clientScope+'a',options.clientScope+'b'];
    function render(){const tabs=ids.map(id=>{const tab=new Element('button',id);tab.title=`${id} · 앱 삭제: Cmd/Ctrl+W · 웹 삭제: Alt+W`;tab.append(new Element('span',id));const close=new Element('.ai-task-delete','×');close.onclick=event=>{event.stopPropagation();deleted.push(id);};tab.append(close);tab.setAttribute('aria-selected',String(id===selected));tab.onclick=()=>{selected=id;render();};return tab;});options.navigationChanged(tabs);}
    const c={ready:delay?new Promise(r=>release.push(r)):Promise.resolve(),ownsTask:id=>ids.includes(id),activeTask:()=>selected,selectTask:id=>{selected=id;render();},open:(openOptions={})=>openings.push({scope:c.options.clientScope,options:openOptions}),close:()=>{},options};
    controllers.push(c);render();return c;
  },()=>{});
  return {manager,panel,controllers,storage,release,alerts,openings,deleted};
}
test('all workspaces expose the same task list and persist selection while another is busy',async()=>{
 const f=fixture();await f.manager.open();
 assert.equal(f.panel.children[0].children.length,4);
 f.panel.dataset.aiBusy='true';
 f.panel.children[0].children[2].onclick();
 const active=f.controllers[1].options.panel;
 assert.equal(active.hidden,false);assert.equal(f.panel.dataset.aiBusy,'true');
 assert.equal(active.children[0].children.filter(e=>e.getAttribute('aria-selected')==='true').length,1);
 assert.deepEqual(JSON.parse(f.storage.get('5e.aiActiveTask.v1')),{scope,taskId:scope+'a'});
});
test('opening waits for storage and restores scope plus task without overwriting saved selection',async()=>{
 const f=fixture({saved:{scope,taskId:scope+'b'},delay:true});
 let opened=false;const opening=f.manager.open().then(()=>opened=true);
 await Promise.resolve();assert.equal(opened,false);
 assert.equal(f.panel.children[0].children.every(e=>e.disabled),true);
 f.release.forEach(r=>r());await opening;
 assert.equal(f.controllers[1].activeTask(),scope+'b');
 assert.equal(f.controllers[1].options.panel.hidden,false);
});
test('missing saved task falls back safely and storage failure reports without losing navigation',async()=>{
 const f=fixture({saved:{scope:'missing',taskId:'missing'},failStorage:true});await f.manager.open();
 assert.equal(f.panel.hidden,false);assert.ok(f.alerts.length);
 assert.equal(f.panel.children[0].children.length,4);
});

test('empty workspace disappears from navigation and selection moves to remaining work',async()=>{
 const f=fixture();await f.manager.open();
 f.controllers[0].options.navigationChanged([]);
 f.controllers[0].options.workspaceEmpty(()=>{});
 await Promise.resolve();
 assert.equal(f.controllers[1].options.panel.hidden,false);
 assert.equal(f.controllers[1].options.panel.children[0].children.length,2);
});

test('cloned navigation keeps task selection and delete as independently wired controls',async()=>{
 const f=fixture();await f.manager.open();
 const clone=f.panel.children[0].children[0];
 assert.match(clone.title,/앱 삭제: Cmd\/Ctrl\+W · 웹 삭제: Alt\+W/);
 clone.querySelector('.ai-task-delete').onclick({stopPropagation(){}});
 assert.deepEqual(f.deleted,['a']);
 assert.equal(f.controllers[0].options.panel.hidden,false);
});

test('cloned task tabs support roving arrows and keyboard activation across workspaces',async()=>{
 const f=fixture();await f.manager.open();
 const list=f.panel.children[0];
 const first=list.children[0];
 first.focus();
 let prevented=0;
 first.onkeydown({key:'ArrowRight',target:first,preventDefault(){prevented++;}});
 const second=list.children[1];
 assert.equal(globalThis.document.activeElement,second);
 assert.equal(second.getAttribute('tabindex'),'0');
 second.onkeydown({key:'Enter',target:second,preventDefault(){prevented++;}});
 assert.equal(f.controllers[0].activeTask(),'b');
 assert.equal(prevented,2);
});

test('Given ten materialized PDF crops, when one deliberate batch start is requested, then ten independent workspaces submit one crop each',async()=>{
 const f=fixture();
 const references=Array.from({length:10},(_,index)=>({
   dataUrl:`data:image/png;base64,${String(index).padStart(4,'0')}`,
   name:`crop-${index + 1}.png`,
   source:{documentId:'physics-2026',page:index + 1,crop:{x:1,y:2,width:30,height:40}},
 }));
 const result=await f.manager.openIndependentReferences({references,prompt:'convert each',startGeneration:true});
 assert.equal(result.length,10);
 assert.equal(new Set(result.map(item=>item.scope)).size,10);
 assert.equal(f.openings.length,10);
 assert.equal(f.openings.every(item=>item.options.references.length===1&&item.options.startGeneration===true),true);
 assert.deepEqual(f.openings.map(item=>item.options.references[0].name),references.map(item=>item.name));
 references[0].source.page=99;
 assert.equal(f.openings[0].options.references[0].source.page,1);
 if(process.env.T4_WORKSPACE_TRACE)writeFileSync(process.env.T4_WORKSPACE_TRACE,JSON.stringify({
   workspaceCount:result.length,
   uniqueScopeCount:new Set(result.map(item=>item.scope)).size,
   submissions:f.openings.map(item=>({scope:item.scope,referenceCount:item.options.references.length,startGeneration:item.options.startGeneration,name:item.options.references[0].name,source:item.options.references[0].source})),
 },null,2));
});

test('Given an oversized PDF crop handoff, when workspaces are prepared, then it rejects before opening a partial batch',async()=>{
 const f=fixture();
 const references=Array.from({length:11},(_,index)=>({dataUrl:'data:image/png;base64,AAAA',name:`crop-${index}`}));
 await assert.rejects(f.manager.openIndependentReferences({references}),/최대 10개/);
 assert.equal(f.openings.length,0);
});
