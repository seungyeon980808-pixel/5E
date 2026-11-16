import { buildLabelPlacementCandidates, parseCompactLabelPlacementResponse } from './ai-label-placement-harness.js?v=1.7.0-four-session-integration';
import { bindLabelTargetPlacement, labelBindingHash } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { createEditableLabelComposite } from './ai-label-composite.js?v=1.7.0-four-session-integration';

const overlap = (a, b) => Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x) && Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y);
const association = (plan,id) => plan.sourceAssociations?.find(a=>a.labelId===id);
export function selectJointLabelProposal(plan, proposals) {
  const selected=[];
  const groups=proposals.groups.map(group=>{
    const eligible=group.labelIds.every(id=>association(plan,id)?.status==='confirmed');
    const candidate=eligible && group.candidates.find(c=>!c.glyphs.some(g=>selected.some(other=>overlap(g.box,other.box))));
    if(candidate)selected.push(...candidate.glyphs);
    return {...group,candidates:candidate?[candidate]:[],...(!candidate?{reason:eligible?'no-clear-joint-candidate':'unconfirmed-source-association'}:{})};
  });
  return {...proposals,groups};
}

// This is a measured proposal for one joint visual check, never a semantic pass.
// Luna sees the exact native composite that would be accepted. Declining a
// proposal restores source geometry and invalidates its final visual proof.
export async function prepareJointLabelVerification({plan,candidateDataUrl,imageKind,artboard,signal}) {
  const fallback=await bindLabelTargetPlacement({plan,candidateDataUrl,imageKind,labels:plan.labels.map(l=>({id:l.id,status:'uncertain',reason:'Measurement-only source geometry'}))});
  const measured=await createEditableLabelComposite({plan,placement:fallback,candidateDataUrl,artboard,signal});
  const image=new Image();image.src=candidateDataUrl;await image.decode();
  if(signal?.aborted)throw new DOMException('작업이 취소되었습니다.','AbortError');
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
  const raster=context.getImageData(0,0,canvas.width,canvas.height);
  const proposals=selectJointLabelProposal(plan,buildLabelPlacementCandidates({plan,measurements:measured.report.measurements,raster,imageKind}));
  canvas.width=canvas.height=0;
  const response={version:1,groups:proposals.groups.map(g=>g.candidates.length?{
    id:g.id,status:'matched',candidateId:g.candidates[0].candidateId,
    identities:g.labelIds.map(id=>{const a=association(plan,id);return a.bindingKind==='figure'?{id,bindingKind:'figure',sourceRef:a.sourceRef}:{id,sourceObjectId:a.objectId};}),reason:'Provisional measured candidate; not yet visually verified',
  }:{id:g.id,status:'uncertain',reason:g.reason})};
  const labels=parseCompactLabelPlacementResponse(JSON.stringify(response),plan,proposals);
  const placement=await bindLabelTargetPlacement({plan,candidateDataUrl,imageKind,labels});
  const composite=await createEditableLabelComposite({plan,placement,candidateDataUrl,artboard,signal});
  return {proposals,proposalsSha256:await labelBindingHash(JSON.stringify(proposals)),placement,composite,measurementOnly:true,semanticConfirmed:false};
}

export function retainFinalVerification({report,preview,composite,placement}) {
  const retained=structuredClone(report);
  retained.issues ||= [];
  if(!composite || composite.attachment.data!==preview.composite.attachment.data) {
    if(retained.verdict==='pass')retained.verdict='uncertain';
    retained.issues.push({code:'final-composite-changed-after-review',message:'검수 후 원본 좌표로 보류한 라벨이 있어 최종 합성물을 확인해야 합니다.',severity:'major'});
  }
  if(composite) {
    retained.compositeBindings=composite.bindings;
    retained.compositeMeasurements=composite.report;
    if(composite.report.status!=='mechanical-checks-clear'||placement.status==='needs-attention') {
      if(retained.verdict==='pass')retained.verdict='uncertain';
      for(const issue of composite.report.issues)retained.issues.push({...issue,message:issue.message||issue.code,severity:'major'});
    }
  }
  return retained;
}
