import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../js/ai-workbench.js',import.meta.url),'utf8');
const sizing=code.slice(code.indexOf('  function cardFit('),code.indexOf('  const stageResizeObserver'));
function card(width,height,ratio){const img={naturalWidth:ratio*100,naturalHeight:100};const stage={style:{},querySelector:()=>img};return {clientWidth:width,clientHeight:height,children:[stage],querySelector:()=>stage,stage};}
test('comparison gives different aspect ratios equal heights without stretching',()=>{
 const original=card(200,400,1),result=card(480,400,2);
 const fit=new Function('getComputedStyle','results','activeCandidate','sourceCards','sourceKey','activeSourceKey','panel',sizing+'return fitCardStage;')(
 ()=>({paddingLeft:'0',paddingRight:'0',paddingTop:'0',paddingBottom:'0',rowGap:'0'}),{classList:{contains:()=>true}},()=>result,()=>[original],()=>1,1,{dataset:{aiResultView:'multiple'}});
 fit(result);
 assert.deepEqual(original.stage.style,{width:'200px',height:'200px'});
 assert.deepEqual(result.stage.style,{width:'400px',height:'200px'});
});
