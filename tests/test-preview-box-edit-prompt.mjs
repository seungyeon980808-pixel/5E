import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const retainedPng='data:image/png;base64,'+readFileSync(new URL('./fixtures/rights-clear-smoke.png',import.meta.url)).toString('base64');

for (const directory of ['js']) {
  const { collectScopedAreaComments, buildScopedEditPrompt } = await import(`../${directory}/ai-scoped-edit-prompt.js`);
  const comments = [
    {type:'area', imageId:'v1', number:2, x:10,y:10,w:30,h:40,text:'  왼쪽 구슬을 오른쪽으로 이동  '},
    {type:'area', imageId:'v1', number:5, x:60,y:10,w:30,h:40,text:'구슬을 두 개 추가'},
  ];
  test(`${directory}: each instruction retains its own box, number and pixel bounds`, () => {
    const before = structuredClone(comments);
    const rectangles = [{x0:10,y0:10,x1:40,y1:50},{x0:60,y0:10,x1:90,y1:50}];
    const prompt = buildScopedEditPrompt({session:{width:100,height:100,rectangles},comments,candidateId:'v1'});
    const paired = JSON.parse(prompt.split('Each instruction belongs only to its paired box:\n')[1].split('\nDo not restyle')[0]);
    assert.deepEqual(paired, comments.map((c,i)=>({box:i+1,allowed_pixels:rectangles[i],instruction:c.text.trim()})));
    assert.match(prompt,/INCLUDING unrequested content inside the boxes/);
    assert.match(prompt,/Outside the union.*change zero pixels/);
    assert.match(prompt,/EDIT_SCOPE_TOO_SMALL/);
    assert.deepEqual(comments,before);
  });
  test(`${directory}: empty, unrelated and invalid scopes cannot produce a request`, () => {
    for (const invalid of [[], [{type:'point',text:'move'}], [{...comments[0],text:' '}], [{...comments[0],imageId:'v2'}], [{...comments[0],w:0}], [{...comments[0],x:90}], [{...comments[0],x:NaN}]]) {
      assert.throws(()=>collectScopedAreaComments(invalid,'v1'));
    }
    assert.throws(()=>buildScopedEditPrompt({session:{rectangles:[]},comments,candidateId:'v1'}));
  });
}

test('partial edits bypass global processing on display, export and insertion', async () => {
  const {resolveImageOutput} = await import('../js/ai-output-processing.js');
  const data = retainedPng;
  let calls = 0;
  const transform = () => {calls++;return 'processed';};
  const options = {backgroundPolicy:'transparent',examPalette:true,lineThickness:2};
  assert.equal(await resolveImageOutput({data,reviewState:'scoped-applied'},options,transform),data);
  assert.equal(calls,0);
  assert.equal(await resolveImageOutput({data},options,transform),'processed');
  assert.equal(calls,1);
});

test('modern and unknown generated contracts stay RAW through the actual output resolver', async () => {
  const {resolveImageOutput}=await import('../js/ai-output-processing.js');
  const {candidateUsesAutomaticSeparation,candidateUsesSeparatedAssets,separatedCandidateNextAction}=await import('../js/ai-panel.js');
  const {isHistoricalPngLocalResult,requiresRawImageOutput,canChooseLocalOutput}=await import('../js/ai-output-processing.js');
  // Reuse the retained valid PNG bytes; policy units make no quality claim.
  const historical={kind:'generated',data:retainedPng,reviewState:'idle'};
  assert.equal(isHistoricalPngLocalResult(historical),true);
  assert.equal(candidateUsesAutomaticSeparation(historical),true);assert.equal(candidateUsesSeparatedAssets({...historical,generationMode:'separated'}),true);
  const cases=[{imageLabelWorkflow:{explicit:true}},{imageLabelWorkflow:{explicit:false}},
    {imageLabelWorkflow:{}},{imageLabelWorkflow:false},{labelPlan:{frozen:true}},
    {labelPlan:{}},{sourceLabelPlan:{}},{editableDraft:{}},{candidateSha256:'invalid'},
    {sourceFrame:{}},{workflowMetrics:{}},{targetPlacement:{}},{graphResult:{}},{sceneResult:{}},
    {nativeGraph:{}},{reviewState:'scoped-applied'},{scopedEditHistory:[{status:'cancelled'}]},
    {scopedEditHistory:{}},{data:'data:image/svg+xml,scene'},{data:'not-a-PNG'}];
  for(const metadata of cases){
    const candidate={...historical,...metadata};const before=structuredClone(candidate);let calls=0;
    const transform=()=>{calls++;throw new Error('Protected RAW reached postprocessing');};
    assert.equal(isHistoricalPngLocalResult(candidate),false,JSON.stringify(metadata));
    assert.equal(requiresRawImageOutput(candidate),true);
    const cached={...candidate,generationMode:'separated',automaticSeparationState:'ready',automaticSeparationPrepared:{assets:[{id:'old',data:retainedPng}]}};
    assert.equal(candidateUsesAutomaticSeparation(cached),false);assert.equal(candidateUsesSeparatedAssets(cached),false);assert.equal(separatedCandidateNextAction(cached),'ordinary-insert');
    for(const policy of ['connected','all-near-white']){
      assert.equal(await resolveImageOutput(candidate,{backgroundPolicy:policy,examPalette:true,lineThickness:2},transform),candidate.data);
      assert.equal(canChooseLocalOutput(candidate,'background',policy),false);
      assert.equal(canChooseLocalOutput(candidate,'objects','auto'),false);
    }
    assert.equal(calls,0);assert.deepEqual(candidate,before,'Guard leaves the complete candidate/report/metadata untouched');
  }
  let calls=0;const transform=(data,options)=>{calls++;return {data,options};};
  const result=await resolveImageOutput(historical,{backgroundPolicy:'all-near-white'},transform);
  assert.equal(calls,1);assert.equal(result.data,historical.data);assert.equal(result.options.backgroundPolicy,'all-near-white');
});

test('legacy delegate policy retains Lite binary actions, locks separation, and rejects hidden advanced choices', async()=>{
  const {canChooseLocalOutput}=await import('../js/ai-output-processing.js');
  const {transitionSeparationMode}=await import('../js/ai-separation-mode.js');
  const item={kind:'generated',data:retainedPng};
  for(const mode of ['lite','pro']){
    for(const value of ['preserve','connected'])assert.equal(canChooseLocalOutput(item,'background',value,{mode}),true);
    for(const value of ['off','auto'])assert.equal(canChooseLocalOutput(item,'objects',value,{mode}),true);
    for(const restrictions of [{busy:true},{readOnly:true}]){
      assert.equal(canChooseLocalOutput(item,'background','connected',{mode,...restrictions}),false);
      assert.equal(canChooseLocalOutput(item,'objects','auto',{mode,...restrictions}),false);
    }
    assert.equal(canChooseLocalOutput(item,'background','preserve',{mode,separationMode:'auto'}),false);
    assert.equal(canChooseLocalOutput(item,'background','all-near-white',{mode}),mode==='pro');
    for(const value of ['grid','manual'])assert.equal(canChooseLocalOutput(item,'objects',value,{mode}),mode==='pro');
  }
  for(const mode of ['lite','pro']){
    assert.equal(canChooseLocalOutput(null,'background','connected',{mode}),true);
    assert.equal(canChooseLocalOutput(null,'background','all-near-white',{mode}),false,'Empty source is never relabeled historical');
    assert.equal(canChooseLocalOutput(null,'objects','grid',{mode}),false);
  }
  const original={separationMode:'off',outputOptions:{backgroundPolicy:'all-near-white',examPalette:false,lineThickness:0}};
  const separated=transitionSeparationMode(original,'auto');
  assert.equal(separated.outputOptions.backgroundPolicy,'connected');
  assert.equal(separated.singleBackgroundPolicy,'all-near-white');
  assert.deepEqual(transitionSeparationMode(separated,'off').outputOptions,original.outputOptions);
  assert.deepEqual(original,{separationMode:'off',outputOptions:{backgroundPolicy:'all-near-white',examPalette:false,lineThickness:0}});
});

test('actual settings delegate refuses a modern or locked choice before dispatch and retries only qualified legacy controls',async()=>{
  const fs=await import('node:fs/promises');const vm=await import('node:vm');
  const {canChooseLocalOutput}=await import('../js/ai-output-processing.js');
  const source=await fs.readFile(new URL('../js/ai-settings-panel.js',import.meta.url),'utf8');
  const complete=source.replace(/^import .*registerEscapeLayer.*\n/m,'').replace('export function initAISettingsPanel','function initAISettingsPanel').replace('export function sourceImageKind','function sourceImageKind');
  const build=(item,mode='pro',readOnly=false)=>{
    const events=[],listeners={};
    const control={value:'preserve',disabled:false,options:[{value:'preserve'},{value:'connected'},{value:'all-near-white'}],dispatchEvent:event=>events.push(event.type)};
    const group={dataset:{aiSettingKey:'background'},querySelectorAll:()=>[button]};
    const button={dataset:{aiSettingValue:'all-near-white'},disabled:false,hidden:false,classList:{toggle(){}},setAttribute(){},hasAttribute:()=>false,closest:selector=>selector==='[data-ai-setting-key]'?group:button};
    const settingsRoot={hasAttribute:key=>key==='data-ai-legacy-result-settings',querySelector:()=>null,querySelectorAll:()=>[group],addEventListener:(name,fn)=>{listeners[name]=fn;}};
    const compact={hasAttribute:key=>key==='data-ai-compact-settings',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
    const panel={hidden:false,dataset:{aiSharingMode:readOnly?'view':'edit'},querySelectorAll:()=>[compact,settingsRoot],querySelector:()=>control,addEventListener(){}};
    const context={registerEscapeLayer:()=>()=>{},MutationObserver:class{observe(){}disconnect(){}},Event:class{constructor(type){this.type=type;}},
      document:{documentElement:{dataset:{mode}},addEventListener(){}},window:{addEventListener(){}}};
    vm.runInNewContext(complete+'\nthis.mount=initAISettingsPanel;',context);
    const controller=context.mount(panel,{canChoose:(key,value)=>canChooseLocalOutput(item,key,value,{mode,readOnly})});
    return {events,control,button,click:()=>listeners.click({target:button}),dispose:()=>controller.dispose()};
  };
  for(const item of [{kind:'generated',data:retainedPng,imageLabelWorkflow:{explicit:true}},
    {kind:'generated',data:retainedPng,labelPlan:{frozen:true}},null]){
    const current=build(item);current.button.disabled=false;current.click();
    assert.deepEqual(current.events,[]);assert.equal(current.control.value,'preserve');current.dispose();
  }
  const legacy={kind:'generated',data:retainedPng};
  for(const [mode,readOnly] of [['lite',false],['pro',true]]){
    const current=build(legacy,mode,readOnly);current.button.disabled=false;current.click();
    assert.deepEqual(current.events,[]);assert.equal(current.control.value,'preserve');current.dispose();
  }
  const current=build(legacy);current.click();assert.deepEqual(current.events,['change']);assert.equal(current.control.value,'all-near-white');
  current.click();assert.deepEqual(current.events,['change','change'],'The actual legacy delegate retries a failed selected policy instead of silently no-op');current.dispose();
});
