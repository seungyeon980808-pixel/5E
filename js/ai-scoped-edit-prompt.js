/** Each rectangle grants permission, not a request to redraw its contents. */
export function collectScopedAreaComments(comments, candidateId) {
  const areas = (comments || []).filter(comment => comment.type === 'area');
  if (!areas.length) throw new Error('수정할 부분을 박스로 표시하고 박스마다 수정 내용을 입력하세요.');
  return areas.map((comment, index) => {
    if (comment.imageId && comment.imageId !== candidateId) throw new Error('현재 선택한 이미지의 박스만 수정할 수 있습니다.');
    const box = ['x', 'y', 'w', 'h'].map(key => comment[key]);
    if (!box.every(Number.isFinite) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0
        || box[0] + box[2] > 100 || box[1] + box[3] > 100) throw new Error('이미지 안에 유효한 수정 박스를 지정하세요.');
    const text = String(comment.text || '').trim();
    if (!text) throw new Error(`박스 ${comment.number ?? index + 1}의 수정 내용을 입력하세요.`);
    return { ...comment, text };
  });
}

export function buildScopedEditPrompt({ session, comments, candidateId }) {
  const areas = collectScopedAreaComments(comments, candidateId);
  if (areas.length !== session.rectangles.length) throw new Error('수정 박스와 코멘트의 연결이 일치하지 않습니다.');
  const instructions = areas.map((comment, index) => ({
    box: comment.number ?? index + 1,
    allowed_pixels: session.rectangles[index],
    instruction: comment.text,
  }));
  return `Edit the attached current-version PNG itself. Return one PNG at exactly ${session.width} by ${session.height} pixels.
The boxes are the MAXIMUM permitted edit boundaries, not areas to redraw entirely.
Interpret each comment in the context of the supplied image. Inside each box, change only the named target and requested properties. Preserve all other objects, shapes, counts, connections, positions, proportions, fills and line style, INCLUDING unrequested content inside the boxes.
Outside the union of the listed boxes, change zero pixels. Never expand a box or move an object or connector outside it. Pixel bounds include the top-left and exclude the bottom-right.
Each instruction belongs only to its paired box:
${JSON.stringify(instructions, null, 2)}
Do not restyle, globally clean up, remove labels, or alter colors unless a paired comment explicitly requests it. Do not draw box borders, comment numbers, markers or new explanatory text.
If the requested edit needs space outside the permitted boxes, do not generate an image. Reply EDIT_SCOPE_TOO_SMALL followed by a short explanation of which box needs enlarging. If the instructions conflict or the target is ambiguous, reply EDIT_INSTRUCTION_UNCLEAR with a short explanation instead of guessing.
For a valid edit, call the image generation/editing tool exactly once with the attached image and these complete constraints. Do not use code, filters, tracing, web or filesystem searches to create the image. Return the actual image result. Change only the requested properties. Everything else stays as in the selected version.`;
}
