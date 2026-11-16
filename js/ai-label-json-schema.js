// Native current-turn structured output constrains syntax, never source truth.
// Keep semantic parsing, source ownership and coordinate checks authoritative.
import { normalizeSourceCandidateSets } from './ai-source-candidate-contract.js?v=1.7.0-four-session-integration';
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const str = (maxLength=1000) => ({type:'string',minLength:1,maxLength});
const enumeration = values => ({type:'string',enum:values});
const number = (minimum=0,maximum=1) => ({type:'number',minimum,maximum});
const integer = (minimum,maximum) => ({type:'integer',minimum,maximum});
const array = (items,maxItems=128,minItems=0) => ({type:'array',items,minItems,maxItems});
const ref = name => ({$ref:`#/$defs/${name}`});
const variants = (base,options) => ({anyOf:options.map(extra=>object({...base,...extra}))});
const role = enumeration(['text','name','quantity','chemical','unit','number','symbol']);
const id = (maxLength=80) => ({...str(maxLength),pattern:'^[A-Za-z0-9_.:-]+$'});
const point = object({x:number(),y:number()});
const box = object({x:number(),y:number(),w:{type:'number',exclusiveMinimum:0,maximum:1},h:{type:'number',exclusiveMinimum:0,maximum:1}});
const rgba = array(integer(0,255),4,4);

export function buildSourceObservationOutputSchema(sourceCount=1, candidateSets=[], workflow={}) {
  if(!Number.isInteger(sourceCount)||sourceCount<1||sourceCount>128)throw new TypeError('Invalid source count');
  const sourceRef=integer(1,sourceCount),defs={point,box};
  defs.binding={anyOf:[object({status:enumeration(['confirmed']),objectId:id(),reason:str()}),object({status:enumeration(['confirmed']),bindingKind:enumeration(['object']),objectId:id(),reason:str()}),object({status:enumeration(['confirmed']),bindingKind:enumeration(['figure']),sourceRef,reason:str()}),object({status:enumeration(['uncertain']),reason:str()})]};
  defs.group=object({id:id(),kind:enumeration(['reaction','sequence','phrase']),order:integer(0,127)});
  const typographyOptions=[];
  for(const runs of [false,true])for(const scripts of [false,true])for(const orientation of [false,true])for(const rotation of [false,true]) typographyOptions.push({
    ...(runs?{runs:array(object({text:str(80),role,contentMode:enumeration(['plain','formula'])}),32,1)}:{}),
    ...(scripts?{scriptStyles:array(object({start:integer(0,79),end:integer(1,80),kind:enumeration(['sub','sup']),role}),32)}:{}),
    ...(orientation?{orientation:enumeration(['horizontal','vertical'])}:{}),...(rotation?{rotation:number(-180,180)}:{})});
  defs.typography=variants({role,size:object({w:{type:'number',exclusiveMinimum:0,maximum:1},h:{type:'number',exclusiveMinimum:0,maximum:1}})},typographyOptions);
  const candidateIds=normalizeSourceCandidateSets(candidateSets,sourceCount).flatMap(set=>set.candidates.map(candidate=>candidate.id));
  if(candidateIds.length){defs.candidateTypography=variants({role},typographyOptions);defs.textCandidateId=enumeration(candidateIds);}
  const routes=[];
  for(const kind of ['straight','polyline','quadratic','cubic']) {
    const n={straight:0,quadratic:1,cubic:2}[kind];
    const base={kind:enumeration([kind]),attachment:enumeration(['label','frame']),start:ref('point'),target:ref('point'),controls:array(ref('point'),n??12,n??1)};
    routes.push(object({...base,end:enumeration(['none','open-arrow','filled-arrow','circle'])}));
    routes.push(object({...base,end:enumeration(['circle']),endRadius:{type:'number',exclusiveMinimum:0,maximum:.05}}));
  }
  defs.route={anyOf:routes};
  if(workflow.imageKind==='exam') defs.textInkSearch={anyOf:[object({status:enumeration(['confirmed-flat']),bounds:ref('box'),background:rgba}),...(candidateIds.length?[object({status:enumeration(['confirmed-candidates']),textCandidateIds:array(ref('textCandidateId'),64,1),background:rgba})]:[]),object({status:enumeration(['needs-review']),reason:str()}),object({status:enumeration(['not-applicable'])})]};
  const baseLabel={id:id(),text:str(80),sourceRef,scope:enumeration(['general','graph','non_graph_vertical_deferred']),
    disposition:enumeration(['restore','remove-only','graph-owned']),semanticRole:enumeration(['scientific-label','panel-marker','textbook-prose','caption','speech','graph-label']),reason:str(),
    position:ref('point'),contentMode:enumeration(['plain','formula']),typography:ref('typography'),targetBinding:ref('binding'),...(workflow.imageKind==='exam'?{textInkSearch:ref('textInkSearch')}:{})};
  const labels=[];
  for(const group of [false,true])for(const mode of ['text','leader'])for(const ownershipReview of [false,true]) {
    const extra={mode:enumeration([mode]),leaderPresence:enumeration(mode==='leader'?['present']:['absent','uncertain']),...(group?{relationGroup:ref('group')}:{}),...(ownershipReview?{reviewRequired:{type:'boolean',enum:[true]}}:{})};
    labels.push(object({...baseLabel,...extra,...(mode==='leader'?{leaderRoutes:array(ref('route'),13,1),leaderDash:enumeration(['solid','dashed','dotted'])}:{})}));
    if(candidateIds.length){
      const {position,typography,...candidateBase}=baseLabel;
      // Native response schemas do not support uniqueItems; semantic parsing
      // rejects duplicates and reuse across labels before a plan can be frozen.
      labels.push(object({...candidateBase,typography:ref('candidateTypography'),textCandidateIds:array(ref('textCandidateId'),64,1),...extra,...(mode==='leader'?{leaderRoutes:array(ref('route'),13,1),leaderDash:enumeration(['solid','dashed','dotted'])}:{})}));
    }
  }
  defs.label={anyOf:labels};
  const uncertainVariants=[];
  for(const domain of [false,true])for(const bounds of [false,true])for(const ownership of [{},{labelId:id()},{labelId:id(),component:enumeration(['text','leader','endpoint'])}]) uncertainVariants.push(object({sourceRef,reason:str(),...ownership,...(domain?{domain:enumeration(['text','ownership','geometry','removal'])}:{}),...(bounds?{bounds:ref('box')}:{})}));
  defs.uncertainty={anyOf:[str(),...uncertainVariants]};
  defs.mark=object({text:str(80),sourceRef,bounds:ref('box'),reason:str(300)});
  defs.geometryObject=object({id:id(),sourceRef,role:enumeration(['scientific-object','scientific-inset']),description:str(),bounds:ref('box'),relations:array(object({target:id(),kind:enumeration(['contact','connect','inside','crossing','separate']),description:str(500)}),32)});
  defs.removalOnlyItem=variants({id:id(),sourceRef,kind:enumeration(['textbook-prose','caption','speech','decoration']),reason:str(),bounds:ref('box')},[{}, {text:str()}]);
  defs.protected=object({sourceRef,bounds:ref('box'),reason:str()});
  const regionShapes=[{kind:enumeration(['polygon']),points:array(ref('point'),256,3)},{kind:enumeration(['path']),points:array(ref('point'),256,2),width:{type:'number',exclusiveMinimum:0,maximum:.1}},{kind:enumeration(['ellipse']),bounds:ref('box')}];
  const removal=[];
  for(const shape of regionShapes)for(const background of [false,true])for(const owner of ['label','other'])removal.push(object({id:id(),sourceRef,ownership:enumeration(['confirmed']),method:enumeration(['flat-background','local-restore']),...(owner==='label'?{owner:enumeration(['label']),labelId:id(),component:enumeration(['text','leader','endpoint'])}:{owner:enumeration(['auxiliary','scientific-arrow']),component:enumeration(['text','leader','endpoint','mark'])}),...shape,...(background?{background:rgba}:{})}));
  defs.removal={anyOf:removal};
  const searchBase={id:id(),labelId:id(),sourceRef,ownership:enumeration(['confirmed']),bounds:ref('box'),background:rgba};
  defs.inkSearch={anyOf:[object({...searchBase,component:enumeration(['text'])}),object({...searchBase,component:enumeration(['text']),backgroundMode:enumeration(['sample-flat'])}),object({...searchBase,component:enumeration(['leader']),kind:enumeration(['path']),points:array(ref('point'),256,2),width:{type:'number',exclusiveMinimum:0,maximum:.1}}),object({...searchBase,component:enumeration(['endpoint']),kind:enumeration(['ellipse'])})]};
  return {...object({version:{type:'integer',enum:[4]},observationVersion:{type:'integer',enum:[1]},leaderObservationVersion:{type:'integer',enum:[1]},observationContractRevision:enumeration(['1.4.0']),labels:array(ref('label')),removalOnlyItems:array(ref('removalOnlyItem')),preservedMarks:array(ref('mark')),uncertainties:array(ref('uncertainty')),geometryLock:object({version:{type:'integer',enum:[1]},objects:array(ref('geometryObject'),64,1)}),removalRegions:array(ref('removal'),1024),protectedRegions:array(ref('protected'),256),inkSearchRegions:array(ref('inkSearch'),1024)}),$defs:defs};
}

export function buildImageReviewOutputSchema() {
  const verdict=enumeration(['pass','fail','uncertain']);
  const issueBase={checkId:str(100),message:str(2000),severity:enumeration(['critical','major','minor'])};
  const bbox=object({x:number(),y:number(),width:{type:'number',exclusiveMinimum:0,maximum:1},height:{type:'number',exclusiveMinimum:0,maximum:1}});
  return object({verdict,checks:array(object({id:str(100),label:str(200),status:verdict,detail:str(2000)}),64,1),issues:array(variants(issueBase,[{},{bbox}]),128)});
}
export function buildJointLabelReviewOutputSchema() {
  const group={anyOf:[object({id:id(100),status:enumeration(['matched']),candidateId:id(140),identities:array({anyOf:[object({id:id(),sourceObjectId:id()}),object({id:id(),bindingKind:enumeration(['figure']),sourceRef:integer(1,128)})]},128,1),reason:str()}),object({id:id(100),status:enumeration(['uncertain']),reason:str()})]};
  return object({placement:object({version:{type:'integer',enum:[1]},groups:array(group)}),review:buildImageReviewOutputSchema()});
}
