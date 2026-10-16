import test from 'node:test';
import assert from 'node:assert/strict';
import {questionPageProfile,fitQuestionPage,questionPageMetrics,validateQuestionPage} from '../assets/exampool/sheet/question-page.js';
import {pageProfile} from '../assets/exampool/sheet/typeset-model.js';

test('a question uses the chosen exam column width with its own physical margins and one column',()=>{
  for(const paper of ['A4','B4','A3'])for(const columns of [1,2]){
    const exam=pageProfile({paper,columns}),q=questionPageProfile({paper,columns});
    assert.equal(q.page.width-q.page.marginLeft-q.page.marginRight,Math.floor((exam.page.width-exam.page.marginLeft-exam.page.marginRight-exam.spacing*(columns-1))/columns));
    assert.equal(q.width,exam.width);assert.equal(q.targetHeight,exam.page.height-exam.page.marginTop-exam.page.marginBottom);
  }
  assert.ok(Math.abs(questionPageProfile().page.width*25.4/7200-92)<.01);
});

test('height follows native text, controls and insertion line, with a soft exam-height warning',()=>{
  let page=questionPageProfile().page,bottom=1300;
  const d={getPageDef:()=>page,pageCount:()=>1,getPageTextLayout:()=>({runs:[{y:20,h:14}]}),getPageControlLayout:()=>({controls:[{y:30,h:bottom}]}),getParagraphCount:()=>2,getParagraphLength:()=>0,getCursorRect:()=>({pageIndex:0,y:bottom+32,height:16}),setPageDef:(_,json)=>{page=JSON.parse(json);return {ok:true};}};
  const before=questionPageMetrics(d,{paper:'A4',columns:2});assert.equal(before.exceeded,true);
  const fit=fitQuestionPage(d,{paper:'A4',columns:2});assert.equal(fit.exceeded,true);assert.equal(fit.pages,1);assert.ok(page.height/75>bottom+48);
  assert.equal(fitQuestionPage(d,{paper:'A4',columns:2}).changed,false);
  bottom=60;fitQuestionPage(d,{paper:'A4',columns:2});assert.ok(page.height<30000);assert.equal(questionPageMetrics(d,{paper:'A4',columns:2}).exceeded,false);
});

test('physical question geometry rejects arbitrary page setup while accepting dynamic height',()=>{
  let page=questionPageProfile().page;
  const d={getPageDef:()=>page,getColumnDef:()=>({columnCount:1,sameWidth:true,spacing:0})};
  validateQuestionPage(d,{paper:'A4',columns:2});page={...page,height:60000};validateQuestionPage(d,{paper:'A4',columns:2});
  page={...page,width:59528};assert.throws(()=>validateQuestionPage(d,{paper:'A4',columns:2}),/문항 전용 용지/);
});
