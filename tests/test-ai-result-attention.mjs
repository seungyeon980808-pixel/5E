import test from 'node:test';
import assert from 'node:assert/strict';
import { markResultReady, pendingResult, acknowledgeResult, syncResultEntry } from '../js/ai-result-attention.js';

const result = id => ({ id, kind:'generated', data:'data:image/png;base64,a', reviewState:'needs-attention', comments:[{text:'keep'}] });
const task = () => ({ id:'task', workState:'completed', attachments:[{id:'original'}], generated:[result('old'),result('new')], selectedCandidateId:'old' });

test('viewing an older version never acknowledges the unread conversion or changes acceptance', () => {
  const tab=task(), originals=structuredClone(tab);
  assert.equal(markResultReady(tab,tab.generated[1]),true);
  assert.equal(pendingResult(tab),'new');
  assert.equal(acknowledgeResult(tab,'old'),false);
  assert.equal(pendingResult(tab),'new');
  assert.equal(acknowledgeResult(tab,'new'),true);
  assert.equal(pendingResult(tab),null);
  delete tab.resultAttention;
  assert.deepEqual(tab,originals);
});

test('duplicate terminal events do not relight an acknowledged result, a new result does', () => {
  const tab=task();
  markResultReady(tab,tab.generated[1]); acknowledgeResult(tab,'new');
  assert.equal(markResultReady(tab,tab.generated[1]),false);
  assert.equal(pendingResult(tab),null);
  tab.generated.push(result('next'));
  assert.equal(markResultReady(tab,tab.generated[2]),true);
  assert.equal(acknowledgeResult(tab,'new'),false);
  assert.equal(pendingResult(tab),'next');
});

test('a saved pending result survives recovery, historical tasks are not retroactively unread', () => {
  const tab=task(); assert.equal(pendingResult(tab),null);
  markResultReady(tab,tab.generated[1]);
  const recovered=JSON.parse(JSON.stringify(tab));
  assert.equal(pendingResult(recovered),'new');
  acknowledgeResult(recovered,'new');
  assert.equal(pendingResult(JSON.parse(JSON.stringify(recovered))),null);
});

test('failures without output and reference images cannot create a completion notification', () => {
  const tab=task();
  for (const candidate of [null,{id:'bad',kind:'generated'},{id:'source',kind:'reference',data:'pixels'}]) {
    assert.equal(markResultReady(tab,candidate),false);
    assert.equal(pendingResult(tab),null);
  }
});

test('deleting a pending candidate removes its attention without changing other tasks', () => {
  const first=task(), second=task(); second.id='second';
  markResultReady(first,first.generated[1]);markResultReady(second,second.generated[1]);
  first.generated.pop();
  assert.equal(pendingResult(first),null);assert.equal(pendingResult(second),'new');
});

test('the shared entry aggregates workspace attention and describes it without replacing its icon', () => {
  const attrs={},button={dataset:{},setAttribute:(name,value)=>attrs[name]=value};
  const panels=[{dataset:{aiResultCount:'2'}},{dataset:{aiResultCount:'1'}}];
  const doc={querySelectorAll:()=>panels,getElementById:()=>button};
  syncResultEntry(doc);
  assert.equal(button.dataset.resultAttention,'true');assert.match(attrs['aria-label'],/3개/);
  panels.length=0;syncResultEntry(doc);
  assert.equal(button.dataset.resultAttention,'false');assert.equal(attrs['aria-label'],'AI 이미지 변환');
});
