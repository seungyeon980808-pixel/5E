import { PHYSICS_TOOLS, isPhysicsTool, physicsSettings, changePhysicsTool, physicsLayout, physicsBBox, physicsHandles, physicsHandleChange, physicsKeyboardChange, physicsAction, physicsToolHint } from "./physics-tools.js?v=1.7.0-four-session-integration";
export { physicsKeyboardChange, physicsAction, physicsToolHint };
import { PENDULUM_REFERENCE } from "./pendulum-reference.js?v=1.7.0-four-session-integration";
/* Approved exam apparatus. Physical conditions belong to the apparatus, while
 * x/y/w/h describe its printed illustration. No dynamics are inferred from mass.
 * The field schema is shared by creation, inspector and project migration. */
const num=(key,label,value,min,max,step=1)=>({key,label,value,min,max,step,type:"number"});
const choice=(key,label,value,options)=>({key,label,value,options,type:"select"});
const flag=(key,label,value=true)=>({key,label,value,type:"checkbox"});
export const LAB_APPARATUS = Object.freeze({
  ...PHYSICS_TOOLS,
  cart_track:{number:2,label:"수레 실험대",box:[110,36],fields:[
    num("railLength","레일 길이(m)",2,0.2,100,.1),num("cartPosition","수레 위치(m)",.55,0,100,.01),
    num("cartSize","수레 크기(%)",100,60,140,5),num("boxCount","수레 위 상자 수",2,0,6),
    num("boxMass","상자 하나의 질량(g)",100,1,100000),flag("showBoxMass","상자 질량 표시",false),
    num("gatePosition","포토게이트 위치(m)",1.15,0,100,.01),num("sensorPosition","힘 센서 위치(m)",1.8,0,100,.01),
    num("referencePosition","기준선 위치(m)",.2,0,100,.01),flag("showReference","기준선 표시",false)]},
  transformer:{number:5,label:"변압기·상호 유도",box:[60,46],fields:[
    choice("coilMode","철심 형태","core",[["core","사각 철심"],["air","두 코일"]]),
    num("primaryTurns","1차 코일 감은 수",10,1,40),num("secondaryTurns","2차 코일 감은 수",6,1,40)]},
  pendulum_rig:{number:6,label:"스탠드 단진자",box:[70,100],fields:[
    num("stringLength","실 길이(cm)",67.78,5,80,.01),num("angle","연직 기준 각도(°)",4.85,-75,75,.01),
    num("bobSize","추 지름(cm)",5.76,1,10,.01),num("pivotHeight","지지점 높이(cm)",85,30,90),
    num("standHeight","스탠드 높이(cm)",90,35,95),num("standWidth","스탠드 폭(cm)",30,15,45),
    flag("showGuides","연직선·각도 표시"),flag("showLabels","원본 기호·치수 표시"),
    {key:"lengthLabel",label:"실 길이 기호",value:"L",type:"text"},
    {key:"angleLabel",label:"각도 기호",value:"θ₀",type:"text"},
    {key:"bobLabel",label:"추 라벨",value:"추",type:"text"}]},
  spring_balance:{number:8,label:"용수철 저울",box:[26,80],fields:[
    num("reading","저울 표시값(N)",10,0,1000,.1),num("scaleMax","최대 눈금(N)",20,1,1000),
    num("extension","늘어난 길이(%)",35,0,100),num("caseWidth","외장 폭(%)",100,65,130),
    num("caseHeight","외장 높이(%)",100,65,110),num("weightCount","매단 추 개수",1,0,8),
    num("weightSize","추 크기(%)",100,50,130),num("topString","상단 실 길이(%)",8,0,18)]},
  scale:{number:9,label:"전자저울",box:[38,24],fields:[{key:"displayText",label:"저울 표시값",value:"0.99 N",type:"text"}]},
  piston_gas:{number:10,label:"기체 피스톤",box:[36,50],fields:[
    num("pistonHeight","피스톤 높이(%)",68,12,92),num("particleCount","입자 개수",12,0,100),
    choice("motionMode","입자 운동 표시","none",[["none","없음"],["arrows","속도 화살표"],["trails","짧은 이동 궤적"]]),
    choice("particleDirection","입자 방향","random",[["random","제각각"],["right","오른쪽"],["left","왼쪽"],["up","위쪽"],["down","아래쪽"]]),
    num("motionLength","운동 표시 길이(%)",50,10,100,5)]},
  metal_ring:{number:13,label:"회전 금속고리",box:[40,40],fields:[
    num("startAngle","기준각도(°)",45,-360,360),num("closedAngle","닫힌 부분 각도(°)",180,1,360),
    num("radius","반지름(mm)",20,.5,200,.5)]},
  circular_motion:{number:18,label:"구심력 실험",box:[64,82],fields:[
    num("angle","연직 기준 각도(°)",60,10,90),num("upperMass","회전하는 추 질량(g)",20,1,100000),
    num("lowerMass","아래쪽 추 질량(g)",100,1,100000),num("orbitRadius","회전 반지름(cm)",30,3,40),
    choice("orbitDirection","궤도 방향","cw",[["cw","시계 방향"],["ccw","반시계 방향"]]),
    flag("showOrbit","궤도 선 표시"),flag("showGuides","반지름·각도 보조선"),flag("showMass","질량 표시")]},
});
export function isLabApparatus(o){return o?.type==="apparatus"&&Object.hasOwn(LAB_APPARATUS,o.kind);}
export function labSettings(o={}){
  if(isPhysicsTool(o))return physicsSettings(o);
  const def=LAB_APPARATUS[o.kind];if(!def)return {};
  const result={};
  for(const f of def.fields){let v=o[f.key];
    if(f.type==="number") {if(f.key==="radius")v=Math.min(o.w??40,o.h??40)/2;
      v=Math.max(f.min,Math.min(f.max,Number.isFinite(v)?v:f.value));
      if(["boxCount","primaryTurns","secondaryTurns","weightCount","particleCount"].includes(f.key))v=Math.round(v);
    } else if(f.type==="checkbox")v=typeof v==="boolean"?v:f.value;
    else if(f.type==="select")v=f.options.some(a=>a[0]===v)?v:f.value;
    else v=typeof v==="string"?v.slice(0,32):f.value;
    result[f.key]=v;
  }
  if(o.kind==="cart_track")for(const k of ["cartPosition","gatePosition","sensorPosition","referencePosition"])result[k]=Math.min(result[k],result.railLength);
  if(o.kind==="spring_balance")result.reading=Math.min(result.reading,result.scaleMax);
  if(o.kind==="pendulum_rig"){
    result.pivotHeight=Math.min(result.pivotHeight,result.standHeight);
  }
  return result;
}
export function changeLabApparatus(o,key,value){
  if(isPhysicsTool(o))return changePhysicsTool(o,key,value);
  const settings=labSettings(o);if(!(key in settings))return settings;
  if(key==="radius"){
    if(!Number.isFinite(value))return settings;
    const radius=Math.max(.5,Math.min(200,value)),cx=o.x+o.w/2,cy=o.y+o.h/2;
    return {...settings,radius,x:cx-radius,y:cy-radius,w:2*radius,h:2*radius};
  }
  return labSettings({...o,...settings,[key]:value});
}
export function labWorldPoint(o,p){const a=(o.rotation||0)*Math.PI/180,cx=o.x+o.w/2,cy=o.y+o.h/2;return{x:cx+(p.x-cx)*Math.cos(a)-(p.y-cy)*Math.sin(a),y:cy+(p.x-cx)*Math.sin(a)+(p.y-cy)*Math.cos(a)};}
export function labRingCenter(o){return {x:o.x+o.w/2,y:o.y+o.h/2};}
export function labLayout(o){
  if(isPhysicsTool(o))return physicsLayout(o);
  const s=labSettings(o),x=o.x,y=o.y,w=o.w,h=o.h;
  if(o.kind==="cart_track"){
    const axisStart=x+w*.15,axisEnd=x+w*.9,ground=y+h*.86;
    const parts=[["cartPosition","수레"],["gatePosition","포토게이트"],["sensorPosition","힘 센서"]]
      .map(([prop,label])=>({prop,label,x:axisStart+(axisEnd-axisStart)*s[prop]/s.railLength,y:ground}));
    // Source: 2025 September Physics I Q10, cart A. The wheel contact plane is
    // fixed by the rails. Resizing the cart raises/lowers its body from that
    // plane, rather than scaling it around a centre and lifting the wheels.
    const q=s.cartSize/100,depth={x:w*.016,y:-h*.052},radius=h*.055*q;
    const width=w*.132*q,cx=parts[0].x,left=cx-width/2;
    const deck=ground-radius*2.27,bottom=ground-radius,wallTop=ground-radius*3.45,wallWidth=width*.048;
    const loadWidth=width*.38,loadHeight=h*.072*q;
    const loads=Array.from({length:s.boxCount},(_,i)=>({index:i,
      x:cx+(i%2===0?-loadWidth:0)+depth.x*.15,
      y:deck+depth.y*.2-loadHeight*(Math.floor(i/2)+1),
      w:loadWidth,h:loadHeight,dx:depth.x*.65,dy:depth.y*.65}));
    const cart={cx,left,width,deck,bottom,wallTop,wallWidth,depth,loads,
      wheels:[-.27,.27].map(t=>({x:cx+width*t,y:ground-radius,r:radius}))};
    const rails={left:x+w*.025,right:x+w*.97,front:ground,back:ground+depth.y,
      dx:w*.006,dy:-h*.017,height:h*.018};
    // The measuring gate spans the rail plane: two legs and a connecting beam,
    // with an open window. Its feet are on the same projected ground plane.
    const gate={x:parts[1].x,w:w*.023,bottom:ground+h*.10,height:h*.34,
      dx:w*.052,dy:-h*.185,beam:h*.027};
    const sensor={x:parts[2].x-w*.02,y:ground+h*.058-h*.27,w:w*.04,h:h*.27,
      dx:w*.035,dy:-h*.118};
    return {settings:s,axisStart,axisEnd,parts,ground,cart,rails,gate,sensor};
  }
  if(o.kind==="pendulum_rig"){
    const unit=Math.min(h/100,w/65),base=y+h*.95;
    const pivot={x:x+w*.50,y:base-s.pivotHeight*unit},a=s.angle*Math.PI/180;
    const ref=PENDULUM_REFERENCE,sourceScale=unit/ref.pixelsPerCm,bobRadius=ref.bobRadius*sourceScale*s.bobSize/5.76;
    // The source attaches the string slightly off the sphere's centre. Keep
    // that mount instead of changing the source contour to fit a generic ball.
    const a0=4.85*Math.PI/180,rx=ref.bobCenter[0]-ref.pivot[0],ry=ref.bobCenter[1]-ref.pivot[1];
    const stringUnit=(rx*Math.sin(a0)+ry*Math.cos(a0))*sourceScale/67.78;
    const eccentricity=(rx*Math.cos(a0)-ry*Math.sin(a0))*sourceScale*s.bobSize/5.76;
    const bob={x:pivot.x+s.stringLength*stringUnit*Math.sin(a)+eccentricity*Math.cos(a),y:pivot.y+s.stringLength*stringUnit*Math.cos(a)-eccentricity*Math.sin(a)};
    const bandCenter={x:pivot.x,y:base+(ref.bandCenter[1]-ref.base[1])*sourceScale*s.standHeight/90};
    const factor=s.stringLength/67.78,delta=(s.angle-4.85)*Math.PI/180;
    const vx=325.5-ref.pivot[0],vy=744-ref.pivot[1];
    const verticalBob={x:pivot.x+(379-ref.pivot[0])*sourceScale,y:pivot.y+(749-ref.pivot[1])*sourceScale*factor};
    const leftBob={x:pivot.x+(vx*Math.cos(delta)-vy*Math.sin(delta))*sourceScale*factor,y:pivot.y+(vx*Math.sin(delta)+vy*Math.cos(delta))*sourceScale*factor};
    const da=delta,markerEnd={x:pivot.x+((405-ref.pivot[0])*Math.cos(da)+318*Math.sin(da))*sourceScale*factor,y:pivot.y+(-(405-ref.pivot[0])*Math.sin(da)+318*Math.cos(da))*sourceScale*factor};
    return {settings:s,base,pivot,bob,bobRadius,unit,stringUnit,sourceScale,eccentricity,bandCenter,verticalBob,leftBob,markerEnd,protractorRadius:bandCenter.y-pivot.y,standTop:base-s.standHeight*unit};
  }
  if(o.kind==="circular_motion"){
    // Fixed illustration scale. Auto-fitting against drop used to cancel radius
    // changes at small angles. Extended geometry belongs in labBBox, not a scale.
    const a=s.angle*Math.PI/180,drop=s.orbitRadius/Math.tan(a),unit=Math.min(w*.46/40,h*.58/40),cx=x+w*.5;
    const pivot={x:cx,y:y+h*.09},orbit={x:cx,y:pivot.y+drop*unit,rx:s.orbitRadius*unit,ry:s.orbitRadius*unit*.25};
    const bob={x:cx-orbit.rx*.8,y:orbit.y+orbit.ry*.6};
    // The tube ends just below the projected orbit, as in the source apparatus.
    const tubeEnd=Math.max(pivot.y+h*.36,orbit.y+orbit.ry+h*.04),massTop=tubeEnd+h*.105;
    return {settings:s,unit,pivot,orbit,bob,tubeEnd,massTop,stringLength:s.orbitRadius/Math.sin(a)};
  }
  if(o.kind==="piston_gas"){
    const left=x+w*.17,right=x+w*.83,bottom=y+h*.92,top=bottom-h*.78*s.pistonHeight/100;
    // Fixed index-based jitter: directions and locations survive reopen and
    // resizing. Reserve room for marks so nothing penetrates the piston/walls.
    const count=s.particleCount,cols=Math.max(1,Math.ceil(Math.sqrt(count*(right-left)/Math.max(1,bottom-top)))),rows=Math.max(1,Math.ceil(count/cols));
    const cellW=(right-left)/cols,cellH=(bottom-top)/rows,r=Math.min(w*.011,cellW*.12,cellH*.12);
    const dir={right:0,left:Math.PI,up:-Math.PI/2,down:Math.PI/2};
    const length=Math.min(cellW,cellH)*.28*s.motionLength/100,pad=r+length;
    const hash=i=>{const a=Math.sin(i*127.1+311.7)*43758.5453;return a-Math.floor(a);};
    const particles=[];
    for(let i=0;i<count;i++){
      let p;
      for(let trial=0;trial<100;trial++){
        const seed=i*101+trial;
        p={x:left+pad+(right-left-2*pad)*hash(seed+1),y:top+pad+(bottom-top-2*pad)*hash(seed+47)};
        if(particles.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=r*2.5))break;
      }
      const angle=s.particleDirection==="random"?((i*137.508+23)%360)*Math.PI/180:dir[s.particleDirection];
      particles.push({...p,angle,r,length});
    }
    return {settings:s,left,right,bottom,top,particles};
  }
  if(o.kind==="spring_balance"){
    const cx=x+w*.5,bw=w*.34*s.caseWidth/100,top=y+h*(.075+s.topString/100),ch=h*.37*s.caseHeight/100,bot=top+ch;
    const end=bot+h*.025+h*.13*s.extension/100,weightTop=end+h*.057;
    const each=Math.min(h*.066*s.weightSize/100,Math.max(0,y+h*.98-weightTop)/Math.max(1,s.weightCount));
    return {settings:s,cx,bw,top,ch,bot,end,weightTop,each};
  }
  return {settings:s};
}

export function labLocalPoint(o,p){return labWorldPoint({...o,rotation:-(o.rotation||0)},p);}

// Actual illustration extent. Storage x/y/w/h retains the drawing's reference
// frame and rotation pivot; its empty margins must not become grab targets.
export function labBBox(o){
  if(isPhysicsTool(o))return physicsBBox(o);
  const {x,y,w,h}=o,s=labSettings(o),l=labLayout(o);
  if(o.kind==="pendulum_rig"){
    const r=PENDULUM_REFERENCE,k=l.sourceScale,px=l.pivot.x,py=l.pivot.y;
    const boxes=[[px+(290-r.pivot[0])*k,py+(10-r.pivot[1])*k,151*k,138*k],
      [px+(137-r.pivot[0])*k,l.bandCenter.y+(568-r.bandCenter[1])*k,492*k,104*k],
      [px+(256-r.base[0])*k*s.standWidth/30,l.base+(844-r.base[1])*k,260*k*s.standWidth/30,136*k],
      [px-9*k,py-Math.max(0,s.standHeight-90)*l.unit,20*k,l.base+(886-r.base[1])*k-py+Math.max(0,s.standHeight-90)*l.unit],
      [l.bob.x-l.bobRadius-k,l.bob.y-l.bobRadius-k,2*l.bobRadius+2*k,2*l.bobRadius+2*k]];
    if(s.showGuides){const br=l.bobRadius+3*k;for(const p of [l.verticalBob,l.leftBob])boxes.push([p.x-br,p.y-br,2*br,2*br]);}
    if(s.showLabels){
      const bottom=l.verticalBob.y,dimX=px+(46-r.pivot[0])*k,labelY=py+(453-146)/(749-146)*(bottom-py);
      boxes.push([px+(15-r.pivot[0])*k,Math.min(py,bottom)-k,(r.pivot[0]-15)*k,Math.abs(bottom-py)+3*k],
        [l.bob.x+20*k,l.bob.y+10*k,105*k,82*k]);
      const textBox=(p,text,size)=>{const half=Math.max(size,text.length*size*.65);boxes.push([p.x-half,p.y-size,2*half,2*size]);};
      if(s.lengthLabel!=="L")textBox({x:dimX,y:labelY},s.lengthLabel,65*k);
      if(s.bobLabel!=="추")textBox({x:l.bob.x+92*k,y:l.bob.y+49*k},s.bobLabel,65*k);
      if(s.showGuides){const e=l.markerEnd;boxes.push([e.x-18*k,e.y-5*k,113*k,122*k]);if(s.angleLabel!=="θ₀")textBox({x:e.x+63.5*k,y:e.y+75.5*k},s.angleLabel,58*k);}
    }
    const left=Math.min(...boxes.map(b=>b[0])),top=Math.min(...boxes.map(b=>b[1])),right=Math.max(...boxes.map(b=>b[0]+b[2])),bottom=Math.max(...boxes.map(b=>b[1]+b[3]));
    return{x:left-k,y:top-k,w:right-left+2*k,h:bottom-top+2*k};
  }
  if(o.kind==="circular_motion"){
    const b=Math.min(w,h)*.052,left=Math.min(l.orbit.x-l.orbit.rx,l.bob.x-b-(s.showMass?w*.17:w*.01)),right=Math.max(l.orbit.x+l.orbit.rx,l.pivot.x+w*.30);
    return{x:left-w*.015,y:l.pivot.y-h*.02,w:right-left+w*.03,h:l.massTop+h*.115-(l.pivot.y-h*.02)};
  }
  if(o.kind==="metal_ring"){
    const c=labRingCenter(o),r=Math.min(w,h)/2,angles=[s.startAngle,s.startAngle+s.closedAngle];
    for(let a=Math.ceil(s.startAngle/90)*90;a<=s.startAngle+s.closedAngle;a+=90)angles.push(a);
    const points=[c,...angles.map(a=>({x:c.x+r*Math.cos(a*Math.PI/180),y:c.y-r*Math.sin(a*Math.PI/180)}))];
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  if(o.kind==="spring_balance")return{x:x+w*.16,y:y+h*.024,w:w*.68,h:Math.max(l.end+h*.051,s.weightCount?l.weightTop+l.each*s.weightCount:y+h*.04)-y-h*.024};
  if(o.kind==="piston_gas")return{x:x+w*.095,y:y+h*.045,w:w*.81,h:h*.93};
  if(o.kind==="scale")return{x:x+w*.06,y:y+h*.24,w:w*.89,h:h*.69};
  if(o.kind==="transformer")return{x:x+w*.065,y:y+h*.055,w:w*.895,h:h*.905};
  if(o.kind==="cart_track"){
    const {cart:c,rails:r,gate:g,sensor:f}=l;
    const left=Math.min(r.left,c.left,g.x-g.w/2,f.x);
    const right=Math.max(r.right+r.dx,c.left+c.width+c.depth.x,g.x+g.w/2+g.dx,f.x+f.w+f.dx);
    const top=Math.min(c.wallTop+c.depth.y,g.bottom-g.height+g.dy,f.y+f.dy,...c.loads.map(a=>a.y+a.dy));
    const bottom=Math.max(r.front+r.height,g.bottom,f.y+f.h);
    return{x:left-w*.003,y:top-h*.006,w:right-left+w*.006,h:bottom-top+h*.012};
  }
  return{x,y,w,h};
}

export function labHandles(o){
  if(isPhysicsTool(o))return physicsHandles(o);
  const s=labSettings(o),l=labLayout(o),{x,y,w,h}=o;
  const field=(key,p,label,extra={})=>({key,...p,label,...extra});
  if(o.kind==="cart_track")return l.parts.map(p=>field(p.prop,{x:p.x,y:y+h*.96},p.label+" 위치",{cursor:"ew-resize"}));
  if(o.kind==="pendulum_rig")return [field("bob",l.bob,"추 위치 · 각도와 실 길이"),field("bobSize",{x:l.bob.x+l.bobRadius,y:l.bob.y},"추 크기",{small:true}),field("pivotHeight",l.pivot,"지지점 높이",{cursor:"ns-resize"})];
  if(o.kind==="piston_gas")return [field("pistonHeight",{x:x+w*.5,y:l.top-h*.0175},"피스톤 높이",{cursor:"ns-resize"})];
  if(o.kind==="spring_balance")return [field("extension",{x:l.cx,y:l.end+h*.032},"저울 신장",{cursor:"ns-resize"}),field("reading",{x:l.cx+l.bw*.25,y:l.top+l.ch*(.08+.84*s.reading/s.scaleMax)},"저울 표시값",{cursor:"ns-resize",small:true}),field("topString",{x:l.cx,y:l.top-h*.026},"상단 실 길이",{cursor:"ns-resize"})];
  if(o.kind==="metal_ring"){
    const c=labRingCenter(o),r=Math.min(w,h)/2,at=a=>({x:c.x+r*Math.cos(a*Math.PI/180),y:c.y-r*Math.sin(a*Math.PI/180)});
    return [field("startAngle",at(s.startAngle),"기준각도"),field("closedAngle",at(s.startAngle+s.closedAngle),"닫힌 각도"),field("radius",at(s.startAngle+s.closedAngle*.5),"반지름")];
  }
  if(o.kind==="circular_motion")return [field("orbitRadius",{x:l.orbit.x+l.orbit.rx,y:l.orbit.y},"회전 반지름",{cursor:"ew-resize"}),field("angle",l.bob,"추를 위아래로 이동 · 연직 각도",{cursor:"ns-resize"})];
  if(o.kind==="transformer")return [field("primaryTurns",{x:x+w*.28,y:y+h*.79},"1차 코일 감은 수",{cursor:"ns-resize"}),field("secondaryTurns",{x:x+w*.67,y:y+h*.79},"2차 코일 감은 수",{cursor:"ns-resize"})];
  return [];
}

export function labHandleChange(o,key,start,p,shift=false){
  if(isPhysicsTool(o))return physicsHandleChange(o,key,start,p);
  const s=labSettings(o),l=labLayout(o),dy=p.y-start.y,dx=p.x-start.x;
  let value;
  if(o.kind==="cart_track")value=s[key]+dx/(l.axisEnd-l.axisStart)*s.railLength;
  else if(o.kind==="pendulum_rig"){
    if(Math.abs(dx)+Math.abs(dy)<1e-9)return s;
    if(key==="bob"){
      const v={x:l.bob.x+dx-l.pivot.x,y:l.bob.y+dy-l.pivot.y};
      const length=shift?s.stringLength:Math.sqrt(Math.max(0,v.x*v.x+v.y*v.y-l.eccentricity*l.eccentricity))/l.stringUnit;
      const angle=(Math.atan2(v.x,v.y)-Math.atan2(l.eccentricity,length*l.stringUnit))*180/Math.PI;
      return labSettings({...o,...s,angle:Math.round(angle*100)/100,stringLength:shift?s.stringLength:Math.round(length*100)/100});
    }
    if(key==="bobSize")value=s.bobSize*Math.hypot(l.bobRadius+dx,dy)/l.bobRadius;
    else value=s.pivotHeight-dy/l.unit;
  }else if(o.kind==="piston_gas")value=s.pistonHeight-dy/(o.h*.78)*100;
  else if(o.kind==="spring_balance")value=key==="extension"?s.extension+dy/(o.h*.13)*100:key==="reading"?s.reading+dy/(l.ch*.84)*s.scaleMax:s.topString+dy/o.h*100;
  else if(o.kind==="metal_ring"){
    const c=labRingCenter(o),handle=labHandles(o).find(a=>a.key===key),q={x:handle.x+dx-c.x,y:handle.y+dy-c.y};
    if(key==="radius")value=Math.hypot(q.x,q.y);
    else {const a=Math.atan2(-q.y,q.x)*180/Math.PI;
      const base=key==="startAngle"?s.startAngle:s.startAngle+s.closedAngle;
      const delta=((a-base+540)%360)-180;
      value=(key==="startAngle"?s.startAngle:s.closedAngle)+delta;
    }
  }else if(o.kind==="circular_motion"){
    if(key==="orbitRadius")value=s.orbitRadius+dx/l.unit;
    else {const q={x:l.bob.x+dx,y:l.bob.y+dy};const drop=Math.max(0,(q.y-l.pivot.y-l.orbit.ry*.6)/l.unit);value=Math.atan2(s.orbitRadius,drop)*180/Math.PI;}
  }else if(o.kind==="transformer")value=Math.round(s[key]-dy/o.h*60);
  return changeLabApparatus(o,key,Math.round(value*100)/100);
}

export function labResize(o,label,start,p){
  const b=labBBox(o),horizontal=label.includes("e")||label.includes("w"),vertical=label.includes("n")||label.includes("s");
  const anchor={x:label.includes("e")?b.x:label.includes("w")?b.x+b.w:b.x+b.w/2,y:label.includes("s")?b.y:label.includes("n")?b.y+b.h:b.y+b.h/2};
  let fx=horizontal?1+(p.x-start.x)/(label.includes("e")?b.w:-b.w):1;
  let fy=vertical?1+(p.y-start.y)/(label.includes("s")?b.h:-b.h):1;
  if(o.lockAspect!==false){const f=horizontal&&vertical?(Math.abs(fx-1)>Math.abs(fy-1)?fx:fy):horizontal?fx:fy;fx=fy=f;}
  fx=Math.max(1/o.w,fx);fy=Math.max(1/o.h,fy);
  const c={x:o.x+o.w/2,y:o.y+o.h/2},a=labWorldPoint(o,anchor),angle=(o.rotation||0)*Math.PI/180;
  const vx=(c.x-anchor.x)*fx,vy=(c.y-anchor.y)*fy,w=o.w*fx,h=o.h*fy;
  if(o.positionLocked)return{x:c.x-w/2,y:c.y-h/2,w,h};
  return{x:a.x+vx*Math.cos(angle)-vy*Math.sin(angle)-w/2,y:a.y+vx*Math.sin(angle)+vy*Math.cos(angle)-h/2,w,h};
}
