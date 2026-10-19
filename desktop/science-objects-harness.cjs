const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = process.env.SCIENCE_SOURCE_ROOT || path.resolve(__dirname, '..');
const base = process.env.SCIENCE_BASE_ROOT || root;
class Element {
  constructor(tagName) { Object.assign(this, {tagName, attrs:{}, children:[], dataset:{}, style:{}, listeners:{}, textContent:'', value:'', checked:false}); }
  setAttribute(k,v) { this.attrs[k]=String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { this.children.push(c); c.parentElement=this; return c; }
  append(...c) { c.forEach(x=>this.appendChild(x)); }
  insertBefore(c,b) { this.children.splice(this.children.indexOf(b),0,c);c.parentElement=this; }
  addEventListener(k,f) { (this.listeners[k] ||= []).push(f); }
  fire(k) { for(const f of this.listeners[k] || [])f({target:this}); }
  closest(sel) { let n=this; while(n){if(sel==='.'+n.className)return n; n=n.parentElement;}return null; }
  querySelectorAll(sel) { const tags=sel.split(',').map(x=>x.trim()),out=[]; const walk=n=>{for(const c of n.children){if(tags.includes(c.tagName))out.push(c);walk(c);}};walk(this);return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0]||null; }
  get outerHTML() { const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');return `<${this.tagName}${Object.entries(this.attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${escape(this.textContent)}${this.children.map(c=>c.outerHTML).join('')}</${this.tagName}>`; }
}
const document={activeElement:null,createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag),getElementById:()=>null};
const strip=s=>s.replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm,'').replace(/^export\s*\{[\s\S]*?\};?\s*/gm,'').replace(/\bexport\s+(?=(?:async\s+)?function|const|let|class)/g,'');
function read(file) { const p=path.join(root,'js',file);return fs.readFileSync(fs.existsSync(p)?p:path.join(base,'js',file),'utf8'); }
// 1.7.0 라벨 지시선 경로·라벨 글꼴은 이 검사 대상(과학 오브젝트)이 쓰지 않으므로 '기능 꺼짐' 값으로 채운다.
const LABEL_OFF={deriveLabelLeaderGeometry:()=>null,pointInLabelerBlock:()=>false,leaderRoutePoints:()=>[],sampleLeaderRoute:()=>[],renderLeaderRoutes:()=>{},hasLabelTypography:()=>false,measureLabelTypography:()=>null,nativeLabelBounds:()=>null,nativeLabelPolygon:()=>null,renderLabelTypography:()=>null,renderNativeLabelTypography:()=>null};
// 앱 코드가 쓰는 공용 도구(되돌리기 기록용 jsonClone)는 import를 지운 대신 여기서 넣어 준다.
let jsonClone;
function load(file,names,deps={}) {const context=vm.createContext({document,console,Blob,URL,window:{},jsonClone,...(['templates.js','pick.js','render/scene.js','svg-export.js','render/annotations.js'].includes(file)?{...LABEL_OFF,...lab}:{}),...deps});vm.runInContext(strip(read(file)).replace(/\bimport\.meta\.url\b/g,JSON.stringify(require('node:url').pathToFileURL(path.join(root,'js',file)).href))+`\nglobalThis.result={${names.join(',')}};`,context,{filename:file,timeout:2000});return context.result;}
jsonClone=load('json-clone.js',['jsonClone']).jsonClone;
const geometry=load('science-geometry.js',['endpointSettings','setEndpointSettings','vesselFill','VOLUME_KINDS','volumeFractionAtHeight','heightAtVolumeFraction','vesselWidthAtHeight','scaleMarks','scaleNumber','thermometerScale']);
const core=load('render/core.js',['SVG_NS','grayHex','applyDash','oLine','oQuad','oDot','quadPt','cText','hatchVLine','oDashV','makeArrowHead'],{fillSvgTextWithRomanRuns:(n,t)=>{n.textContent=t;}});
const styles=load('style-mode.js',['resolveObjectStyle']);
const fills=load('render/fill.js',['resolveFill','makeFillPattern'],{...core,...styles});
const deps={...core,...geometry,...fills,DEFAULT_TEXT_SIZE_MM:3,renderGraphLabel:()=>null,makeUprightLabel:()=>null,makeLabelEl:()=>null,withLineLabel:g=>g};
const illustration=load('render/exam-illustration.js',['EXAM_VESSEL_KINDS','examVesselInterior','drawExamVessel','drawExamThermometer','chromosomeSpread','drawExamChromatids','examNeuronGeometry','drawExamNeuron'],deps);
const labParts=load('render/exam-lab-parts.js',['EXAM_LAB_PART_KINDS','drawExamLabPart'],deps);
const bench=load('optical-bench.js',['OPTICAL_BENCH_DEFAULTS','isOpticalBench','opticalBenchSettings','changeOpticalBench','opticalBenchLayout','opticalBenchWorldPoint','opticalBenchLocalPoint','opticalBenchPositionAtPoint']);
const benchRender=load('render/optical-bench.js',['drawOpticalBench','renderOpticalBenchHandles'],{...core,...bench,SELECTION_COLOR:'#3478f6'});
const pendulumReference=load('pendulum-reference.js',['PENDULUM_REFERENCE']);
const physics=load('physics-tools.js',["PHYSICS_TOOLS", "isPhysicsTool", "physicsSettings", "changePhysicsTool", "projectileState", "thinLens", "HC_EV_NM", "energyData", "spectrumLines", "traceRefraction", "waveRadii", "physicsLayout", "physicsBBox", "physicsHandles", "physicsHandleChange", "physicsKeyboardChange", "physicsAction", "physicsToolHint"]);
const lab=load('lab-apparatus.js',['LAB_APPARATUS','isLabApparatus','labSettings','changeLabApparatus','labWorldPoint','labRingCenter','labLayout','labLocalPoint','labBBox','labHandles','labHandleChange','labResize','physicsKeyboardChange','physicsAction','physicsToolHint'],{...pendulumReference,...physics});
const sourcePendulum=load('render/pendulum-source.js',['drawSourcePendulum'],{...core,...lab,...pendulumReference});
const physicsRender=load('render/physics-tools.js',['drawPhysicsTool','wavelengthColor'],{...core,...physics});
const labRender=load('render/lab-apparatus.js',['drawLabApparatus','renderLabApparatusHandles'],{...core,...lab,...sourcePendulum,...physicsRender,SELECTION_COLOR:'#3478f6'});
Object.assign(deps,illustration,labParts,benchRender,labRender,lab);
const vessel=load('render/vessel.js',['renderVessel','vesselBBox','vesselLayout','VESSEL_KINDS'],deps);
const chromosome=load('render/chromosome.js',['renderChromosome','chromosomeBBox','chromosomeGeometry'],deps);
const spring=load('render/spring.js',['renderSpring','springBBox','springGeometry','SPRING_DEFAULTS'],deps);
const pendulum=load('render/pendulum.js',['renderPendulum','pendulumBBox','pendulumGeometry'],deps);
const apparatus=load('render/optics-apparatus.js',['renderApparatus'],deps);
const bilayer=load('render/bilayer.js',['renderBilayer','bilayerBBox','BILAYER_DEFAULTS'],deps);
const neuron=load('render/neuron.js',['renderNeuron','neuronBBox','neuronGeometry'],deps);
const widgets=load('inspector/widgets.js',['makeSection']);
const controls=load('inspector/science-controls.js',['addEndpointControls'],geometry);
function store(objects) {let data={objects,selectedIds:[objects[0]?.id],undoStack:[],redoStack:[]},listeners=[]; return {get:()=>data,subscribe:f=>listeners.push(f),update:f=>{f(data);listeners.forEach(g=>g());}};}
function field(body,label) {function walk(n){for(const c of n.children){if(c.className==='insp-row' && c.children[0]?.textContent===label)return c.children.find(x=>['input','select','textarea'].includes(x.tagName));const r=walk(c);if(r)return r;}}return walk(body);}
function inspector(kind,state) {
 const content=new Element('div'); document.getElementById=id=>id==='inspector-content'?content:null;
 if(kind==='vessel')load('inspector/section-vessel.js',['initVesselSection'],{...widgets,...geometry,...vessel,...illustration}).initVesselSection(state);
 if(kind==='chromosome')load('inspector/section-chromosome.js',['initChromosomeSection'],{...widgets}).initChromosomeSection(state);
 if(kind==='neuron')load('inspector/section-neuron.js',['initNeuronSection'],{...widgets}).initNeuronSection(state);
 if(kind==='spring')return load('inspector/section-spring.js',['buildSpringSection'],{...widgets,...controls,...spring}).buildSpringSection({state}).secSpring;
 if(kind==='pendulum')return load('inspector/section-pendulum.js',['buildPendulumSection'],{...widgets,...controls}).buildPendulumSection({state}).secPend;
 if(kind==='apparatus'){const r=load('inspector/section-apparatus.js',['buildApparatusSection'],{...widgets,...geometry}).buildApparatusSection({state});state.subscribe(()=>r.syncApparatus(state.get().objects[0]));r.syncApparatus(state.get().objects[0]);return r.secApparatus;}
 if(kind==='lab'){const r=load('inspector/section-lab-apparatus.js',['buildLabApparatusSection'],{...widgets,...lab}).buildLabApparatusSection({state});state.subscribe(()=>r.syncLabApparatus(state.get().objects[0]));r.syncLabApparatus(state.get().objects[0]);return r.secLabApparatus;}
 if(kind==='optical-bench'){const r=load('inspector/section-optical-bench.js',['buildOpticalBenchSection'],{...widgets,...bench}).buildOpticalBenchSection({state});state.subscribe(()=>r.syncOpticalBench(state.get().objects[0]));r.syncOpticalBench(state.get().objects[0]);return r.secOpticalBench;}
 return content;
}
function io() {const context=vm.createContext({window:{},document:{getElementById:()=>null},...bench,...lab,migrateObjectStyleMode:()=>{},DEFAULT_TEXT_FONT:'sans-serif',DEFAULT_TEXT_SIZE_MM:3,normalizeTextRuns:x=>x.textRuns,textRunsToText:r=>r.map(x=>x.text).join('')});for(const file of ['object-types.js','project-io.js'])vm.runInContext(strip(read(file)),context);return context;}
module.exports={LABEL_OFF,Element,document,load,read,core,styles,fills,geometry,illustration,labParts,bench,benchRender,physics,physicsRender,lab,labRender,pendulumReference,sourcePendulum,vessel,chromosome,spring,pendulum,apparatus,bilayer,neuron,store,field,inspector,io};
