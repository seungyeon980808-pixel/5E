import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/ai-panel.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('      closeTab.onclick ='),source.indexOf('      button.append(copy, closeTab);'));
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
