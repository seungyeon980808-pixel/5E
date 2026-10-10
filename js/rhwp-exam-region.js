// Source millimetres, document HWP units and viewport pixels are independent.
export const HWP_UNITS_PER_MM = 7200 / 25.4;
export const DEFAULT_PICTURE_LAYOUT = Object.freeze({treatAsChar:true,alignment:'Center',textWrap:'TopAndBottom',top:5,bottom:5,left:0,right:0});
export function validRegion(b) {
  if (!b || !['x','y','w','h'].every(k=>Number.isFinite(b[k])) || b.w<=0 || b.h<=0 || b.w*b.h>286740) throw new Error('보내는 영역의 크기가 올바르지 않습니다.');
  return b;
}
export function resizeRegion(b,dir,delta,{minimum=.5,maximumWidth=Infinity}={}) {
  validRegion(b);let {x,y,w,h}=b;
  if(dir==='move'){x+=delta.x;y+=delta.y;}
  else {
    if(dir.includes('e'))w=Math.min(maximumWidth,Math.max(minimum,w+delta.x));
    if(dir.includes('w')){w=Math.min(maximumWidth,Math.max(minimum,w-delta.x));x=b.x+b.w-w;}
    if(dir.includes('s'))h=Math.max(minimum,h+delta.y);
    if(dir.includes('n')){h=Math.max(minimum,h-delta.y);y=b.y+b.h-h;}
  }
  return {...b,x,y,w,h};
}
export function sourceDelta(dx,dy,geometry,bounds) {
  const a=(geometry.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return {x:(dx*c+dy*s)*(geometry.flipH?-1:1)*bounds.w/geometry.w,
    y:(-dx*s+dy*c)*(geometry.flipV?-1:1)*bounds.h/geometry.h};
}
export function regionGeometry(before,after,props) {
  validRegion(before);validRegion(after);
  const quarter=!props.sourceFrame && ((props.rotationAngle||0)%180+180)%180===90;
  const scale=(quarter?props.height:props.width)/before.w;
  if(!(Number.isFinite(scale)&&scale>0))throw new Error('그림의 출력 크기를 확인하지 못했습니다.');
  const a=(props.rotationAngle||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const fx=props.horzFlip?-1:1,fy=props.vertFlip?-1:1;
  // Move the unrotated frame's centre so its fixed source points stay put.
  const cx=(after.x+after.w/2-before.x-before.w/2)*scale*fx,
    cy=(after.y+after.h/2-before.y-before.h/2)*scale*fy;
  const logicalWidth=Math.max(1,Math.round(after.w*scale)),logicalHeight=Math.max(1,Math.round(after.h*scale));
  const width=quarter?logicalHeight:logicalWidth,height=quarter?logicalWidth:logicalHeight;
  const anchorX=props.horzAlign==='Center'?(width-props.width)/2:props.horzAlign==='Right'?width-props.width:0,anchorY=props.vertAlign==='Center'?(height-props.height)/2:props.vertAlign==='Bottom'?height-props.height:0;
  return {width,height,...(!props.treatAsChar?{
    horzOffset:Math.round((props.horzOffset||0)+cx*c-cy*s-(width-props.width)/2+anchorX),
    vertOffset:Math.round((props.vertOffset||0)+cx*s+cy*c-(height-props.height)/2+anchorY),
  }:{})};
}
export function validatePictureLayout(v) {
  if(!v || typeof v.treatAsChar!=='boolean' || !['Left','Center','Right'].includes(v.alignment) ||
    !['TopAndBottom','Square','Tight','BehindText','InFrontOfText'].includes(v.textWrap) ||
    !['top','bottom','left','right'].every(k=>Number.isFinite(v[k])&&v[k]>=0&&v[k]<=720))throw new Error('그림 배치 설정이 올바르지 않습니다.');
  return v;
}
