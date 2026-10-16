const MAX_DIMENSION = 4096;
/** Capture one real frame, release the share, then crop the frozen pixels. */
export async function captureScreenRegion() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('이 브라우저에서는 화면 캡처를 지원하지 않습니다. 이미지 붙여넣기나 파일 첨부를 이용해 주세요.');
  // Must happen before an await: Safari requires the capture button's user activation.
  const pending = navigator.mediaDevices.getDisplayMedia({ video:true, audio:false });
  let stream, video;
  try {
    stream = await pending;
    video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    if (!video.videoWidth) await new Promise((resolve,reject) => {
      const timeout = setTimeout(() => reject(new Error('캡처 화면을 읽지 못했습니다. 다시 시도해 주세요.')),8000);
      video.addEventListener('loadeddata',() => { clearTimeout(timeout); resolve(); },{ once:true });
    });
    const ratio = Math.min(1,MAX_DIMENSION / Math.max(video.videoWidth,video.videoHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(video.videoWidth*ratio); canvas.height = Math.round(video.videoHeight*ratio);
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    return await selectRegion(canvas);
  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') return null;
    throw error;
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    if (video) { video.pause(); video.srcObject = null; }
  }
  function selectRegion(source) {
    // Stop sharing before opening the crop overlay. Only a local frozen frame remains.
    stream.getTracks().forEach(track => track.stop());
    return new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'capture-dialog';
      dialog.setAttribute('aria-label','캡처 영역 선택');
      dialog.innerHTML = '<header><strong>첨부할 영역을 드래그하세요</strong><span>Esc로 취소</span><button type="button" data-cancel>취소</button></header><div class="capture-stage"><img alt="선택한 화면의 정지 이미지"><div class="capture-selection" hidden></div></div>';
      const image = dialog.querySelector('img'), stage = dialog.querySelector('.capture-stage'), selection = dialog.querySelector('.capture-selection');
      image.src = source.toDataURL('image/png'); document.body.append(dialog); dialog.showModal();
      let start = null, point = null;
      const finish = result => { window.removeEventListener('resize',cancel); dialog.close(); dialog.remove(); resolve(result); };
      const cancel = () => finish(null);
      const position = event => { const bounds = image.getBoundingClientRect(); return { x:Math.max(0,Math.min(bounds.width,event.clientX-bounds.left)),y:Math.max(0,Math.min(bounds.height,event.clientY-bounds.top)),bounds }; };
      const rectangle = () => ({x:Math.min(start.x,point.x),y:Math.min(start.y,point.y),w:Math.abs(start.x-point.x),h:Math.abs(start.y-point.y)});
      stage.addEventListener('pointerdown',event => {
        if (event.button !== 0) return;
        event.preventDefault(); start = position(event); point = start; stage.setPointerCapture(event.pointerId); selection.hidden = false;
        Object.assign(selection.style,{left:start.x+'px',top:start.y+'px',width:'0px',height:'0px'});
      });
      stage.addEventListener('pointermove',event => {
        if (!start) return; point = position(event); const box = rectangle();
        Object.assign(selection.style,{left:box.x+'px',top:box.y+'px',width:box.w+'px',height:box.h+'px'});
      });
      stage.addEventListener('pointerup',event => {
        if (!start) return; point = position(event); const box = rectangle(), bounds = image.getBoundingClientRect();
        if (box.w < 4 || box.h < 4) { start = null; selection.hidden = true; return; }
        const sx = source.width / bounds.width, sy = source.height / bounds.height;
        const crop = document.createElement('canvas'); crop.width = Math.max(1,Math.round(box.w*sx)); crop.height = Math.max(1,Math.round(box.h*sy));
        crop.getContext('2d').drawImage(source,box.x*sx,box.y*sy,box.w*sx,box.h*sy,0,0,crop.width,crop.height);
        finish({name:'화면 캡처.png',data:crop.toDataURL('image/png'),public:false});
      });
      stage.addEventListener('pointercancel',() => {start = null; selection.hidden = true;});
      dialog.addEventListener('cancel',event => {event.preventDefault();cancel();});
      dialog.querySelector('[data-cancel]').onclick = cancel;
      window.addEventListener('resize',cancel,{once:true});
    });
  }
}
