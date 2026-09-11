import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import comments from './editor-comments-source.cjs';
const original = readFileSync(new URL('../../js/ai-image-comments.js', import.meta.url), 'utf8');
const transformed = comments.editorCommentsSource(original);
const { createImageCommentController } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
class Node {
  constructor(tag, doc) { this.tagName=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.attrs={};this.handlers={};this.value='';this.disabled=false;this.isConnected=true;this.scrollLeft=0;this.scrollTop=0;this.clientLeft=0;this.clientTop=0;this.offsetWidth=200;this.offsetHeight=100;this.rect={left:0,top:0,width:200,height:100};this.classes=new Set();this.classList={toggle:(name,on)=>{if(on)this.classes.add(name);else this.classes.delete(name)}}; }
  setAttribute(k,v){this.attrs[k]=v;}
  matches(selector){if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));if(selector[0]==='.')return this.className?.split(' ').includes(selector.slice(1));if(selector[0]==='['){const attr=selector.slice(1,-1);return attr.startsWith('data-') ? Object.hasOwn(this.dataset,attr.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())) : Object.hasOwn(this.attrs,attr);}return this.tagName===selector;}
  querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  after(node){const parent=this.parentElement;node.parentElement=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}
  addEventListener(type,fn){(this.handlers[type]||=[]).push(fn);}
  removeEventListener(type,fn){this.handlers[type]=(this.handlers[type]||[]).filter(f=>f!==fn);}
  emit(type,more={}){const e={target:this,button:0,pointerId:1,clientX:50,clientY:50,preventDefault(){},stopPropagation(){},...more};for(const fn of this.handlers[type]||[])fn(e);return e;}
  getBoundingClientRect(){return this.rect;}
  focus(){this.ownerDocument.activeElement=this;}
}
function fixture(){
  const doc={activeElement:null,defaultView:{addEventListener(){},removeEventListener(){}}};doc.createElement=tag=>new Node(tag,doc);
  const panel=doc.createElement('section');const refs={};
  for(const [key,tag] of Object.entries({comments:'div',commentEditor:'textarea',commentSave:'button',commentDelete:'button',commentsApply:'button',commentsCount:'span',commentStatus:'span',commentsPanel:'section',chatPanel:'section'})){const n=doc.createElement(tag);n.dataset['ai'+key[0].toUpperCase()+key.slice(1)]='';panel.append(n);refs[key]=n;}
  const tools=['pan','point','area'].map(tool=>{const b=doc.createElement('button');b.dataset.aiCommentTool=tool;panel.append(b);return b});
  const tabs=['comments','chat'].map(tab=>{const b=doc.createElement('button');b.dataset.aiSideTab=tab;panel.append(b);return b});
  let busy=false,images=[],changes=0;const controller=createImageCommentController({panel,getImages:()=>images,getSelectedId:()=>images.at(-1)?.id,isBusy:()=>busy,changed:()=>changes++});
  return {doc,panel,refs,tools,tabs,controller,get changes(){return changes},set busy(v){busy=v},set images(v){images=v}};
}

function bound(type = 'area') {
 const f=fixture(); const comment={number:1,type,x:20,y:20,w:type==='area'?30:0,h:type==='area'?40:0,text:'keep'};
 const item={id:'x',kind:'generated',name:'v1',comments:[comment]}; f.images=[item];
 const stage=f.doc.createElement('div'),img=f.doc.createElement('img'); stage.append(img);f.panel.append(stage);f.controller.bind(item,stage,img);
 return {f,item,comment,stage,img};
}
for (const type of ['point','area']) test(`${type} drag preserves dimensions and text and persists once without creating comments`,()=>{
 const {f,item,comment,stage}=bound(type);
 const pin=stage.querySelectorAll('[data-ai-comment-marker]').find(n=>n.tagName==='button');
 stage.emit('pointerdown',{target:pin,clientX:40,clientY:20});
 stage.emit('pointermove',{clientX:60,clientY:30});
 assert.equal(comment.x,20);assert.equal(f.changes,0);
 stage.emit('pointerup',{clientX:60,clientY:30});
 assert.deepEqual(comment,{number:1,type,x:30,y:30,w:type==='area'?30:0,h:type==='area'?40:0,text:'keep'});
 assert.equal(item.comments.length,1);assert.equal(f.changes,1);f.controller.destroy();
});
test('area body drag clamps full box to image boundaries under zoom',()=>{
 const {f,comment,stage,img}=bound();img.rect={left:100,top:40,width:400,height:200};
 const outline=stage.querySelectorAll('[data-ai-comment-marker]').find(n=>n.tagName==='div');
 assert.equal(outline.style.pointerEvents,'auto');
 stage.emit('pointerdown',{target:outline,clientX:200,clientY:100});
 stage.emit('pointermove',{clientX:2000,clientY:-200});stage.emit('pointerup');
 assert.deepEqual([comment.x,comment.y,comment.w,comment.h],[70,0,30,40]);assert.equal(f.changes,1);f.controller.destroy();
});
for (const end of ['pointercancel','lostpointercapture','busy']) test(`${end} discards uncommitted comment drag`,()=>{
 const {f,comment,stage}=bound();const pin=stage.querySelectorAll('[data-ai-comment-marker]').find(n=>n.tagName==='button');
 stage.emit('pointerdown',{target:pin,clientX:40,clientY:20});stage.emit('pointermove',{clientX:60,clientY:30});
 if(end==='busy'){f.busy=true;stage.emit('pointerup');}else stage.emit(end);
 assert.deepEqual([comment.x,comment.y],[20,20]);assert.equal(f.changes,0);f.controller.destroy();
});
test('busy pointerdown and other pointers cannot alter comments',()=>{
 const {f,comment,stage}=bound();const pin=stage.querySelectorAll('[data-ai-comment-marker]').find(n=>n.tagName==='button');
 f.busy=true;stage.emit('pointerdown',{target:pin});stage.emit('pointermove',{clientX:100});stage.emit('pointerup');
 f.busy=false;stage.emit('pointerdown',{target:pin});stage.emit('pointermove',{pointerId:2,clientX:100});stage.emit('pointerup');
 assert.deepEqual([comment.x,comment.y],[20,20]);assert.equal(f.changes,0);f.controller.destroy();
});
test('source integration fails closed if original changes',()=>{
 assert.throws(()=>comments.editorCommentsSource(''),/source changed/);
 assert.throws(()=>comments.editorCommentsSource(transformed),/source changed/);
});
