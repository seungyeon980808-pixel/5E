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
test('older provider catalog gains verified Sol/Luna without overriding or unhiding server entries', async () => {
 const {supplementVerifiedCodexModels,resolveAIModelSelection}=await import(pathToFileURL(path.join(__dirname,'../preview/js/ai-model-capabilities.js')));
 const old=[{model:'gpt-6-astra',supportedReasoningEfforts:['medium'],defaultReasoningEffort:'medium',serviceTiers:[]}];
 const merged=supplementVerifiedCodexModels(old);
 assert.equal(old.length,1); assert.equal(merged.length,3);
 for(const model of ['gpt-6-sol','gpt-6-luna']) assert.deepEqual(resolveAIModelSelection({model,effort:'medium',serviceTier:null},merged),{model,effort:'medium',serviceTier:null});
 const explicit={model:'gpt-6-luna',hidden:true};
 assert.deepEqual(supplementVerifiedCodexModels([...old,explicit]).find(m=>m.model==='gpt-6-luna'),explicit);
 assert.throws(()=>resolveAIModelSelection({model:'gpt-6-luna',effort:'ultra'},merged));
 assert.throws(()=>supplementVerifiedCodexModels([]));
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
