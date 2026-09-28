const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
test('diagnostics preserve complete safe messages and redact secrets and image data', async () => {
 const {safeAiErrorText}=await import(pathToFileURL(path.join(__dirname,'../preview/js/ai-error-log.js')));
 const safe='Provider rejected gpt-6-luna: unsupported reasoning effort ultra. '+ 'safe detail '.repeat(500)+' END';
 assert.equal(safeAiErrorText(safe),safe);
 for(const secret of ['Authorization: Bearer private-secret','api_key="private-secret"','{"access_token":"private-secret"}','data:image/png;base64,c2VjcmV0','sk-private-secret', 'A'.repeat(150)]) {
  assert.doesNotMatch(safeAiErrorText(secret), /private-secret|c2VjcmV0|A{150}/);
 }
});
test('provider catalog alone determines model availability without silently changing saved selection', async () => {
 const {readAIModelCatalog,resolveAIModelSelection,defaultAIModelSelection}=await import(pathToFileURL(path.join(__dirname,'../preview/js/ai-model-capabilities.js')));
 const old=[{model:'gpt-6-astra',supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium',serviceTiers:[]}];
 const selected={model:'gpt-6-luna',effort:'high',serviceTier:null};
 assert.deepEqual(readAIModelCatalog(old).map(entry=>entry.model),['gpt-6-astra']);
 assert.throws(()=>defaultAIModelSelection(old,selected),/gpt-6-luna/);
 const refreshed=[...old,{model:'gpt-6-luna',supportedReasoningEfforts:['medium','high'],defaultReasoningEffort:'medium',serviceTiers:[]}];
 assert.deepEqual(defaultAIModelSelection(refreshed,selected),selected);
 assert.throws(()=>resolveAIModelSelection({...selected,effort:'ultra'},refreshed));
 assert.throws(()=>resolveAIModelSelection(selected,[...old,{...refreshed[1],hidden:true}]));
});
test('diagnostics redact complete Cookie and Set-Cookie headers including semicolon fields', async () => {
 const {safeAiErrorText}=await import(pathToFileURL(path.join(__dirname,'../preview/js/ai-error-log.js')));
 for(const header of [
  'Cookie: theme=dark; session=synthetic-session-secret; other=synthetic-other-secret',
  'Set-Cookie: theme=dark; session=synthetic-session-secret; Path=/',
  '{"Cookie":"theme=dark; session=synthetic-session-secret"}',
  "cookie='theme=dark; session=synthetic-session-secret'",
 ]) {
  const result=safeAiErrorText(`${header}\nSafe diagnostic continues`);
  assert.doesNotMatch(result,/synthetic-session-secret|synthetic-other-secret|theme=dark/);
  assert.match(result,/Safe diagnostic continues/);
 }
});
test('precise request errors replace generic summaries without hiding distinct errors, tasks or retries', async () => {
 const {appendAiErrorRecord}=await import(pathToFileURL(path.join(__dirname,'../preview/js/ai-error-log.js')));
 const records=[];
 const context={taskId:'task-1',requestId:1,turnId:'turn-1',model:'gpt-6-sol'};
 const exact='HTTP 422: pinned model rejects gpt-6-sol';
 appendAiErrorRecord(records,context,exact);
 appendAiErrorRecord(records,context,'작업 실패');
 appendAiErrorRecord(records,context,'변환에 실패했습니다. 입력과 코멘트는 보존되었습니다.');
 assert.equal(records.length,1);
 assert.match(records[0].text,/HTTP 422/);assert.match(records[0].text,/task-1/);
 appendAiErrorRecord(records,context,'Network disconnected');
 assert.equal(records.length,2);
 appendAiErrorRecord(records,{...context,requestId:2,turnId:'turn-2'},'요청 실패');
 assert.equal(records.length,3,'a retry with no precise error retains its generic failure');
 appendAiErrorRecord(records,{...context,requestId:2,turnId:'turn-2'},exact);
 assert.equal(records.length,3,'late precise error replaces only its own generic summary');
 assert.match(records[2].text,/요청: 2/);
 appendAiErrorRecord(records,{...context,taskId:'task-2'},'작업 실패');
 appendAiErrorRecord(records,{...context,turnId:'turn-retry'},exact);
 assert.equal(records.length,5,'other tasks and new transport turns are retained');
 appendAiErrorRecord(records,{taskId:'task-1'},'작업 실패');
 appendAiErrorRecord(records,{taskId:'task-1'},'Other connection error');
 assert.equal(records.length,7,'uncorrelated setup failures must not be collapsed');
});
