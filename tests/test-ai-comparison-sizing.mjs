import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../js/ai-workbench.js',import.meta.url),'utf8');
const sizing=code.slice(code.indexOf('  function cardFit('),code.indexOf('  const stageResizeObserver'));
function card(width,height,ratio,generated=false){const img={naturalWidth:ratio*100,naturalHeight:100};const stage={style:{},dataset:{},querySelector:()=>img};return {clientWidth:width,clientHeight:height,children:[stage],querySelector:()=>stage,classList:{contains:value=>generated&&value==='ai-generated-card'},stage};}
test('comparison fits each natural aspect ratio to its pane width without stretching',()=>{
 const pending = {};
 const original=card(200,400,1),result=card(480,400,2,true);
 const fit=new Function('getComputedStyle','results','activeCandidate','sourceCards','sourceKey','activeSourceKey','panel',sizing+'return fitCardStage;')(
 ()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0',rowGap:'0'}),{classList:{contains:()=>true}},()=>result,()=>[original],()=>1,1,{dataset:{},style:{setProperty:(key,value)=>{pending[key]=value;}}});
 fit(result);
 assert.equal(original.stage.style.width,'200px');
 assert.equal(original.stage.style.height,'200px');
 assert.equal(result.stage.style.width,'480px');
 assert.equal(result.stage.style.height,'240px');
 assert.equal(original.stage.dataset.aiFitWidth,'200');
 assert.equal(result.stage.dataset.aiFitWidth,'480');
 assert.equal(pending['--ai-pending-width'],'200px');
 assert.equal(pending['--ai-pending-height'],'200px');
});
