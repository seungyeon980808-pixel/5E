import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dialogFocusTarget,isCloseActiveTaskShortcut,taskDeleteShortcutHint} from '../js/ai-panel.js';
import {getShortcutPlatform,setShortcutPlatform} from '../js/platform.js?v=1.4.0';
const source=readFileSync(new URL('../js/ai-panel.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('      closeTab.onclick ='),source.indexOf('      selectTab.append(copy);'));
function fixture(confirmed=true) {
  const tab={id:'target',title:'빈 작업'};const taskTabs=new Map([[tab.id,tab]]);
  const calls=[];const closeTab={};const state={busy:false};
  const context={closeTab,tab,taskTabs,event:{stopPropagation(){}},scopedDialog:async()=>confirmed,
    captureActiveTaskTab:()=>calls.push('capture'),persistTasks:()=>calls.push('persist'),renderTaskTabs:()=>calls.push('render'),
    workspaceEmpty:()=>calls.push('empty'),restoreTaskTab:id=>calls.push(id),setStatus:()=>calls.push('busy')};
  const names=Object.keys(context);
  new Function(...names,'state',`let activeTaskTabId='target'; ${handler.replaceAll('if (busy','if (state.busy')}`)(...Object.values(context),state);
  return {context,calls,state,taskTabs,run:()=>closeTab.onclick(context.event)};
}
test('deleting the final task leaves its workspace empty without recreating a tab or offering undo',async()=>{
 const f=fixture();await f.run();assert.equal(f.taskTabs.size,0);
 assert.ok(f.calls.includes('empty'));assert.doesNotMatch(handler,/되돌리기|restoreDeleted/);
});
test('cancelled deletion preserves the task',async()=>{
 const f=fixture(false);await f.run();assert.equal(f.taskTabs.size,1);assert.deepEqual(f.calls,[]);
});
test('running task cannot be deleted',async()=>{
 const f=fixture();f.state.busy=true;await f.run();assert.equal(f.taskTabs.size,1);assert.deepEqual(f.calls,['busy']);
});
test('close-task shortcut supports native Cmd/Ctrl+W and browser-safe Alt+W',()=>{
 const mac=e=>Boolean(e.metaKey);const windows=e=>Boolean(e.ctrlKey);
 assert.equal(isCloseActiveTaskShortcut({key:'w',metaKey:true},mac),true);
 assert.equal(isCloseActiveTaskShortcut({key:'w',ctrlKey:true},mac),false);
 assert.equal(isCloseActiveTaskShortcut({key:'W',ctrlKey:true},windows),true);
 assert.equal(isCloseActiveTaskShortcut({key:'W',metaKey:true},windows),false);
 assert.equal(isCloseActiveTaskShortcut({key:'w',ctrlKey:true,shiftKey:true},windows),false);
 assert.equal(isCloseActiveTaskShortcut({key:'w',altKey:true}),true);
 assert.equal(isCloseActiveTaskShortcut({key:'w',altKey:true,ctrlKey:true}),false);
 assert.equal(isCloseActiveTaskShortcut({key:'w',metaKey:true,isComposing:true},mac),false);
 assert.equal(isCloseActiveTaskShortcut({key:'w',metaKey:true,repeat:true},mac),false);
 assert.equal(isCloseActiveTaskShortcut({key:'w'}),false);
});
test('focused active task exposes a Delete-key confirmation path',()=>{
 assert.match(source,/event\.key === 'Delete'.*\.ai-task-tab\.is-on/s);
 assert.match(source,/taskDeleteShortcutHint\(\)/);
});
test('task delete hint follows the selected shortcut platform',()=>{
 const previous=getShortcutPlatform();
 const previousDocument=globalThis.document;
 const previousWindow=globalThis.window;
 const previousCustomEvent=globalThis.CustomEvent;
 globalThis.document={documentElement:{setAttribute(){}}};
 globalThis.window={dispatchEvent(){}};
 globalThis.CustomEvent=class { constructor(type,init){this.type=type;this.detail=init?.detail;} };
 try {
  setShortcutPlatform('mac');
  assert.equal(taskDeleteShortcutHint(),'앱 삭제: ⌘W · 웹 삭제: ⌥W');
  setShortcutPlatform('windows');
  assert.equal(taskDeleteShortcutHint(),'앱 삭제: Ctrl+W · 웹 삭제: Alt+W');
 } finally {
  setShortcutPlatform(previous);
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  if(previousCustomEvent===undefined)delete globalThis.CustomEvent;else globalThis.CustomEvent=previousCustomEvent;
 }
});
test('visible and cloned task rails relabel in place when the shortcut platform changes',()=>{
 assert.match(source,/syncTaskDeleteShortcutHints/);
 assert.match(source,/addEventListener\(['"]5e:shortcut-platform-change['"],\s*syncTaskDeleteShortcutHints\)/);
});
test('task deletion focuses its accept action for Enter and leaves Escape on the native cancel path',()=>{
 const dialogSource=source.slice(source.indexOf('  function scopedDialog'),source.indexOf('  async function startScopedEdit'));
 assert.match(handler,/defaultAccept: true/);
 assert.match(dialogSource,/defaultAccept \? ok : cancel/);
 assert.match(dialogSource,/addEventListener\('cancel'.*finish\(false\)/s);
});
test('confirmation dialog wraps Tab and Shift+Tab between delete and cancel',()=>{
 const cancel={id:'cancel'};const accept={id:'accept'};const controls=[cancel,accept];
 assert.equal(dialogFocusTarget(accept,controls,false),cancel);
 assert.equal(dialogFocusTarget(cancel,controls,true),accept);
 assert.equal(dialogFocusTarget(cancel,controls,false),accept);
 assert.equal(dialogFocusTarget({},controls,false),cancel);
});
test('closing the AI panel restores canvas focus when no other modal is open',()=>{
 assert.match(source,/panel\.hidden = true;[\s\S]*modal-overlay:not\(\[hidden\]\)[\s\S]*getElementById\('canvas'\)\?\.focus\(\)/);
});
