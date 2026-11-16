const test=require('node:test');
const assert=require('node:assert/strict');
test('restored review notices require a result from the failed attempt, not an older successful image',async()=>{
 const {taskHasReviewNotice}=await import('../js/ai-task-workspaces.js');
 const image={id:'new',data:'data:image/png;base64,AA==',imageLabelWorkflow:{explicit:true},reviewState:'needs-attention'};
 const task={workState:'failed',generated:[image],retryRequest:{snapshot:{runInput:{generated:[{id:'old'}]}}}};
 assert.equal(taskHasReviewNotice(task),true);
 assert.equal(taskHasReviewNotice({...task,retryRequest:{snapshot:{runInput:{generated:[image]}}}}),false);
 assert.equal(taskHasReviewNotice({...task,retryRequest:null}),false,'ambiguous old snapshots remain failures');
 assert.equal(taskHasReviewNotice({...task,workState:'busy'}),false);
 assert.equal(taskHasReviewNotice({workState:'completed',generationNotice:'review'}),true);
});
