// 그림을 읽는다. image.decode()는 일부 브라우저·숨은 창에서 끝나지 않을 때가 있어 load 이벤트를 함께 쓰고 시간 제한을 둔다.
export function loadImage(src,timeout=15000){
  return new Promise((resolve,reject)=>{
    const image=new Image();let done=false,timer=0;
    const finish=(ok,error)=>{if(done)return;done=true;clearTimeout(timer);image.onload=image.onerror=null;ok?resolve(image):reject(error);};
    image.onload=()=>finish(true);image.onerror=()=>finish(false,Error('그림을 읽지 못했습니다. PNG·JPEG·WebP 파일인지 확인하세요.'));
    timer=setTimeout(()=>finish(false,Error('그림을 읽는 데 시간이 너무 오래 걸립니다. 창을 앞으로 가져온 뒤 다시 시도하세요.')),timeout);
    image.src=src;
    image.decode?.().then(()=>finish(true),()=>{});
  });
}
