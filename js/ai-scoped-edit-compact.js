import { collectScopedAreaComments } from './ai-scoped-edit-prompt.js?v=1.7.0-four-session-integration';

// An opt-in experimental prompt; the existing request builder remains the default.
export function buildCompactScopedEditPrompt({ session, comments, candidateId, context = null, correction = '' }) {
  const areas = collectScopedAreaComments(comments, candidateId);
  if (areas.length !== session.rectangles.length) throw new Error('수정 박스와 코멘트의 연결이 일치하지 않습니다.');
  const areaNumbers = (comments || []).flatMap((comment, index) => comment.type === 'area' ? [index + 1] : []);
  const specification = {
    canvas_pixels: context ? [context.width, context.height] : [session.width, session.height],
    coordinate_system: 'attached-image-pixels; top-left inclusive, bottom-right exclusive',
    ...(context ? {
      selected_image_pixels: [session.width, session.height],
      attached_origin_in_selected_pixels: [context.origin.x, context.origin.y],
      instruction_positions: 'Positions in comments refer to the selected image. Subtract the attached origin for attached coordinates. All lengths and offsets stay 1:1 pixels.',
    } : {}),
    edits: areas.map((comment, index) => ({
      box: areaNumbers[index],
      allowed_pixels: context ? context.rectangles[index] : session.rectangles[index],
      instruction: comment.text,
    })),
    ...(correction.trim() ? { previous_error: correction.trim() } : {}),
  };
  return `Edit the single attached clean source. Return one PNG at the exact canvas size below.
Apply each instruction only to its paired target. A box is permission, not a request to redraw everything inside it. If allowed_pixels contains a polygon, change only inside that polygon, not its surrounding rectangle.
For a move, use the stated destination or offset once; retain the complete target, its size and shape, and clear its former position. For additions, keep all existing objects. For a disconnection, delete only the requested segment and add no terminal symbols.
Preserve unnamed objects, connections, line style, fills and background inside the boxes. Change no pixels outside them. Do not restyle, remove unrequested labels, or draw markers.
<5e-scoped-edit-spec>
${JSON.stringify(specification, null, 2)}
</5e-scoped-edit-spec>
If the complete edit cannot fit, reply EDIT_SCOPE_TOO_SMALL with the reason. If the target is unclear, reply EDIT_INSTRUCTION_UNCLEAR with the reason.
Otherwise use the native image editing tool exactly once with the attached source and return its actual image.`;
}

// Checks are validated against the captured original frame before this builder.
export function buildVerifiedScopedEditPrompt({session,comments,candidateId,context=null,checks,sourceMeasurements=[]}) {
  const areas=collectScopedAreaComments(comments,candidateId);
  if (!Array.isArray(checks) || checks.length!==session.rectangles.length || areas.length!==checks.length
      || checks.some((check,index)=>check.box!==index)) {
    throw new Error('모든 수정 박스에 연결된 수치 검증 기준이 필요합니다.');
  }
  const areaNumbers=(comments || []).flatMap((comment,index)=>comment.type==='area'?[index+1]:[]);
  const origin=context?.origin || {x:0,y:0};
  const attachedRect=r=>({x0:r.x0-origin.x,y0:r.y0-origin.y,x1:r.x1-origin.x,y1:r.y1-origin.y});
  const specification={
    canvas_pixels:context?[context.width,context.height]:[session.width,session.height],
    coordinate_system:'attached-image-pixels; top-left inclusive, bottom-right exclusive',
    edits:checks.map((check,index)=>({
      box:areaNumbers[index],
      allowed_pixels:attachedRect(session.rectangles[index]),
      original_user_instruction:areas[index].text,
      required_edit:{
        kind:check.kind,
        target_search_pixels:attachedRect(check.search),
        ...(check.kind==='move'?{offset_pixels:[check.dx,check.dy],
          ...(sourceMeasurements[index]?.sourceBounds?{
            source_bounds_pixels:attachedRect(sourceMeasurements[index].sourceBounds),
            destination_bounds_pixels:attachedRect({
              x0:sourceMeasurements[index].sourceBounds.x0+check.dx,y0:sourceMeasurements[index].sourceBounds.y0+check.dy,
              x1:sourceMeasurements[index].sourceBounds.x1+check.dx,y1:sourceMeasurements[index].sourceBounds.y1+check.dy,
            }),
          }:{})}:
          check.kind==='circles'?{diameter_pixels:check.diameter,
            centers_pixels:check.centers.map(center=>[center.x-origin.x,center.y-origin.y])}:
          {gap_pixels:check.gap}),
      },
    })),
  };
  return `Edit the single attached clean source once. Return one PNG at the exact canvas size below.
The executable required_edit coordinates below are already in attached-image pixels. Do not subtract an origin again. Original user wording is preserved for target meaning; use the compiled pixel requirements for numeric positions.
Each box grants permission only. Preserve all unnamed content, line style, fills and background inside it, and change nothing outside it.
For a move, translate the complete named target once by offset_pixels, preserve its length/shape/scale/stroke, and clear its old position. For circles, add exactly the specified circles while keeping every existing object. For a gap, remove only the specified segment without adding ends, symbols or contours.
<5e-verified-edit-spec>
${JSON.stringify(specification,null,2)}
</5e-verified-edit-spec>
If the requested complete target cannot fit its permission, reply EDIT_SCOPE_TOO_SMALL. If its identity is ambiguous, reply EDIT_INSTRUCTION_UNCLEAR.
Otherwise use the native image editing tool exactly once with this source. Do not use code or filters to create or correct the image. Return its actual image.`;
}
