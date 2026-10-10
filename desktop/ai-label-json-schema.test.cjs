const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const api=import('../js/ai-label-json-schema.js');
// Independent evaluator for the exact JSON Schema subset used here. It verifies
// fixture membership; backend acceptance remains a separate native probe.
function accepts(schema,value,root=schema){
 if(schema.$ref)return accepts(root.$defs[schema.$ref.split('/').at(-1)],value,root);
 if(schema.anyOf)return schema.anyOf.some(s=>accepts(s,value,root));
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(schema.type==='object')return value!==null&&typeof value==='object'&&!Array.isArray(value)&&schema.required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>Object.hasOwn(schema.properties,k)&&accepts(schema.properties[k],value[k],root));
 if(schema.type==='array')return Array.isArray(value)&&value.length>=(schema.minItems??0)&&value.length<=(schema.maxItems??Infinity)&&value.every(v=>accepts(schema.items,v,root));
 if(schema.type==='string')return typeof value==='string'&&value.length>=(schema.minLength??0)&&value.length<=(schema.maxLength??Infinity)&&(!schema.pattern||new RegExp(schema.pattern).test(value));
 if(schema.type==='boolean')return typeof value==='boolean';
 if(schema.type==='number'||schema.type==='integer')return typeof value==='number'&&Number.isFinite(value)&&(schema.type!=='integer'||Number.isInteger(value))&&value>=(schema.minimum??-Infinity)&&value<=(schema.maximum??Infinity)&&(schema.exclusiveMinimum===undefined||value>schema.exclusiveMinimum);
 throw Error('Unknown schema branch');
}
const fixture=()=>({version:4,observationVersion:1,leaderObservationVersion:1,observationContractRevision:'1.4.0',removalOnlyItems:[],labels:[{id:'caption',text:'H_{2}O',sourceRef:1,scope:'general',disposition:'restore',semanticRole:'scientific-label',reason:'Observed substance label',mode:'text',leaderPresence:'absent',position:{x:.2,y:.2},contentMode:'formula',typography:{role:'chemical',size:{w:.2,h:.2},scriptStyles:[{start:3,end:4,kind:'sub',role:'number'}]},targetBinding:{status:'confirmed',objectId:'vessel',reason:'Visible vessel caption'}}],preservedMarks:[],uncertainties:[],geometryLock:{version:1,objects:[{id:'vessel',sourceRef:1,role:'scientific-object',description:'one vessel',bounds:{x:.5,y:.1,w:.3,h:.7},relations:[]}]},removalRegions:[],protectedRegions:[],inkSearchRegions:[]});
function strictNodes(node){if(!node||typeof node!=='object')return;if(node.type==='object'){assert.equal(node.additionalProperties,false);assert.deepEqual([...node.required].sort(),Object.keys(node.properties).sort());}for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(strictNodes);else strictNodes(value);}}
const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
const helper=main.slice(main.indexOf('function validatedSceneOutputSchema'),main.indexOf('async function sendWorkspaceTurn'));
const validate=new Function('Buffer',helper+'\nreturn validatedSceneOutputSchema;')(Buffer);
test('all schema objects are strict and source schema is bounded with explicit variants',async()=>{
 const m=await api;
 for(const schema of [m.buildSourceObservationOutputSchema(),m.buildImageReviewOutputSchema(),m.buildJointLabelReviewOutputSchema()]){strictNodes(schema);assert.equal(schema.type,'object');assert.ok(Buffer.byteLength(JSON.stringify(schema))<200000);assert.deepEqual(validate(schema,'scene'),schema);}
 assert.throws(()=>m.buildSourceObservationOutputSchema(0));
});
test('realistic compact formula, phrase and leader schema values pass unchanged semantic parsing',async()=>{
 const {buildSourceObservationOutputSchema}=await api,{parseSourceLabelAnalysis}=await import('../js/ai-source-label-plan.js'),schema=buildSourceObservationOutputSchema(),a=fixture();
 assert.ok(accepts(schema,a));assert.equal(parseSourceLabelAnalysis(JSON.stringify(a),1).labels[0].text,'H_{2}O');
 const b=structuredClone(a.labels[0]);b.id='other';b.text='물';b.contentMode='plain';b.typography={role:'text',size:{w:.2,h:.1},runs:[{text:'물',role:'text',contentMode:'plain'}]};a.labels[0].relationGroup={id:'phrase',kind:'phrase',order:0};b.relationGroup={id:'phrase',kind:'phrase',order:1};a.labels.push(b);
 assert.ok(accepts(schema,a));assert.equal(parseSourceLabelAnalysis(JSON.stringify(a),1).relationGroups[0].labelIds.length,2);
 const c=fixture();c.labels[0].mode='leader';c.labels[0].leaderPresence='present';c.labels[0].leaderDash='solid';c.labels[0].leaderRoutes=[{kind:'straight',attachment:'label',start:{x:.3,y:.2},target:{x:.5,y:.2},controls:[],end:'circle',endRadius:.01}];assert.ok(accepts(schema,c));assert.deepEqual(parseSourceLabelAnalysis(JSON.stringify(c),1).labels[0].anchor,{x:.5,y:.2});
 c.labels[0].anchor={x:.9,y:.9};assert.equal(accepts(schema,c),false);
});
test('scientific arrows, actual uncertainty and mask ownership remain expressible; schema never repairs semantics',async()=>{
 const {buildSourceObservationOutputSchema}=await api,{parseSourceLabelAnalysis}=await import('../js/ai-source-label-plan.js'),schema=buildSourceObservationOutputSchema(),v=fixture();
 v.labels[0].targetBinding={status:'uncertain',reason:'Target obscured'};v.uncertainties=[{sourceRef:1,labelId:'caption',component:'text',domain:'removal',reason:'caption text overlaps structure; scientific arrow ownership unclear',bounds:{x:.2,y:.2,w:.1,h:.1}}];
 v.removalRegions=[{id:'arrow',sourceRef:1,ownership:'confirmed',method:'flat-background',owner:'scientific-arrow',component:'mark',kind:'path',points:[{x:.2,y:.3},{x:.4,y:.3}],width:.01}];assert.ok(accepts(schema,v));assert.equal(parseSourceLabelAnalysis(JSON.stringify(v),1).sourceAssociations[0].status,'uncertain');
 v.labels[0].position={x:.95,y:.2};v.labels[0].typography.size={w:.2,h:.1};assert.ok(accepts(schema,v));const held=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.equal(held.labels.length,0);assert.match(held.quarantinedItems[0].reason,/캔버스/);assert.equal(held.quarantinedItems[0].deletionAuthority,false);
});
test('current source schema requires leader observation and rejects contradictory text/route presence',async()=>{
 const {buildSourceObservationOutputSchema}=await api,schema=buildSourceObservationOutputSchema(),v=fixture();
 assert.ok(accepts(schema,v));
 delete v.leaderObservationVersion;assert.equal(accepts(schema,v),false);v.leaderObservationVersion=1;
 delete v.labels[0].leaderPresence;assert.equal(accepts(schema,v),false);
 v.labels[0].leaderPresence='present';assert.equal(accepts(schema,v),false);
 v.labels[0].mode='leader';v.labels[0].leaderDash='dotted';v.labels[0].leaderRoutes=[{kind:'straight',attachment:'label',start:{x:.2,y:.3},target:{x:.5,y:.3},controls:[],end:'circle',endRadius:.003}];
 assert.ok(accepts(schema,v));v.labels[0].leaderPresence='absent';assert.equal(accepts(schema,v),false);
 v.labels[0].leaderPresence='present';delete v.labels[0].leaderRoutes[0].end;assert.equal(accepts(schema,v),false);
 const uncertain=fixture();uncertain.labels[0].leaderPresence='uncertain';assert.ok(accepts(schema,uncertain));
 // Source truth and required uncertainty evidence are semantic parser checks,
 // independently tested there; schema validity alone is not quality approval.
});
test('exam schema requires an explicit text search decision per label; general schema does not',async()=>{
 const {buildSourceObservationOutputSchema}=await api,{parseSourceLabelAnalysis}=await import('../js/ai-source-label-plan.js');
 const exam=buildSourceObservationOutputSchema(1,[],{imageKind:'exam'}),general=buildSourceObservationOutputSchema(),v=fixture();strictNodes(exam);
 assert.equal(accepts(exam,v),false);assert.ok(accepts(general,v));
 v.labels[0].textInkSearch={status:'confirmed-flat',bounds:{x:.08,y:.08,w:.24,h:.24},background:[207,207,207,255]};
 assert.ok(accepts(exam,v));assert.equal(accepts(general,v),false);
 const plan=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.equal(plan.inkSearchRegions.length,1);assert.equal(plan.inkSearchRegions[0].backgroundMode,'sample-flat');assert.deepEqual(plan.inkSearchRegions[0].bounds,v.labels[0].textInkSearch.bounds);
 v.labels[0].textInkSearch={status:'needs-review',reason:'scientific stroke touches text'};assert.ok(accepts(exam,v));assert.ok(parseSourceLabelAnalysis(JSON.stringify(v),1).uncertainties.some(u=>u.reason==='scientific stroke touches text'));
 v.labels[0].textInkSearch={status:'not-applicable'};assert.ok(accepts(exam,v));const held=parseSourceLabelAnalysis(JSON.stringify(v),1);assert.equal(held.labels.length,0);assert.match(held.quarantinedItems[0].reason,/일반 라벨/);assert.deepEqual(held.inkSearchRegions,[]);
});
test('joint schema accepts only candidate selection and existing review shapes; no fabricated coordinates',async()=>{
 const {buildJointLabelReviewOutputSchema}=await api,schema=buildJointLabelReviewOutputSchema(),v={placement:{version:1,groups:[{id:'g',status:'uncertain',reason:'No readable target'}]},review:{verdict:'uncertain',checks:[{id:'connections',label:'연결',status:'uncertain',detail:'Source obscured'}],issues:[{checkId:'connections',message:'unclear',severity:'major'}]}};
 assert.ok(accepts(schema,v));v.placement.groups=[{id:'label:'+ 'x'.repeat(80),status:'matched',candidateId:'group:label:'+ 'x'.repeat(80)+':candidate:0',identities:[{id:'x'.repeat(80),sourceObjectId:'vessel'}],reason:'Visible same target'}];assert.ok(accepts(schema,v));v.placement.groups[0].identities=[{id:'caption',bindingKind:'figure',sourceRef:1}];assert.ok(accepts(schema,v));v.placement.groups[0].position={x:.5,y:.5};assert.equal(accepts(schema,v),false);
});
test('bridge accepts bounded plain scene JSON only and rejects before dispatch',()=>{
 assert.equal(validate(undefined,'image'),undefined);const a={type:'object',properties:{}};const b=validate(a,'scene');assert.deepEqual(b,a);assert.notEqual(b,a);
 for(const value of [null,[],false,'{}',{bad:Infinity},{bad:undefined},{bad:new Date()},{bad:()=>{}}])assert.throws(()=>validate(value,'scene'));
 const circular={};circular.circular=circular;assert.throws(()=>validate(circular,'scene'));assert.throws(()=>validate({description:'한'.repeat(70000)},'scene'),/200KB/);assert.throws(()=>validate(a,'image'));assert.throws(()=>validate(a,'chat'));
});
test('actual production sendWorkspaceTurn forwards schema only on current turn, preserving model/profile',async()=>{
 const {buildSourceObservationOutputSchema}=await api,schema=buildSourceObservationOutputSchema(),calls=[];
 const source=main.slice(main.indexOf('async function sendWorkspaceTurn'),main.indexOf('\nfunction createWindow()'));
 const auditSource=main.slice(main.indexOf('function reportAttachmentSnapshot'),main.indexOf('\nfunction cleanupAttachments'));
 const diagnostics=[];
 const factory=new Function('validatedSceneOutputSchema','rpc','snapshotAttachments','send',`const workspaceConversations=new Map(),workspaceRequests=new Map(),turnOwners=new Map(),turnAttachmentPaths=new Map();let earlyTurnEvents=[];const app={getPath:()=>'/unchanged'},resolveTurnPlan=p=>({purpose:p.purpose,ephemeralRender:true}),startServer=()=>{},ensureInitialized=async()=>{},buildEphemeralThreadStartParams=p=>p,turnPerformance={register:p=>p};${auditSource};${source};return sendWorkspaceTurn;`);
 const send=factory(validate,async(method,params)=>{calls.push({method,params});return method==='thread/start'?{thread:{id:'t'}}:{turn:{id:'u'}};},require('./codex-attachment-audit.cjs').snapshotAttachments,(channel,message,scope)=>diagnostics.push({channel,message,scope}));
 await send({purpose:'scene',text:'source',model:'gpt-6-luna',effort:'medium',outputSchema:schema},{scope:'s',done:false,cancelled:false});
 assert.equal(calls.length,2);assert.equal(calls[0].method,'thread/start');assert.equal(Object.hasOwn(calls[0].params,'outputSchema'),false);assert.equal(calls[1].method,'turn/start');assert.deepEqual(calls[1].params.outputSchema,schema);assert.equal(calls[1].params.model,'gpt-6-luna');assert.equal(calls[1].params.effort,'medium');
 if(process.env.LABEL_SCHEMA_EVIDENCE){fs.mkdirSync(process.env.LABEL_SCHEMA_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.LABEL_SCHEMA_EVIDENCE,'bridge-captured-rpc.json'),JSON.stringify({transport:'stubbed native RPC; no live model calls',calls},null,2));}
 calls.length=0;await assert.rejects(send({purpose:'image',text:'x',outputSchema:schema},{scope:'x'}));assert.equal(calls.length,0);
 calls.length=0;await send({purpose:'image',text:'x'},{scope:'new'});assert.equal(Object.hasOwn(calls[1].params,'outputSchema'),false);
 assert.equal(diagnostics.length,0);
 calls.length=0;await send({purpose:'image',text:'x',attachmentDiagnostics:true},{scope:'diagnostic'});
 assert.equal(diagnostics.length,1);assert.equal(diagnostics[0].scope,'diagnostic');
 assert.equal(diagnostics[0].message.params.stage,'before-turn-start');
 assert.deepEqual(diagnostics[0].message.params.attachments,[]);
});
