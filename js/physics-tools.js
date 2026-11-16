// Authoring models: SI/eV/nm calculations are independent of printed SVG size.
const number=(key,label,value,min,max,step=1)=>({key,label,value,min,max,step,type:"number"});
const select=(key,label,value,options)=>({key,label,value,options,type:"select"});
const flag=(key,label,value=true)=>({key,label,value,type:"checkbox"});
const text=(key,label,value)=>({key,label,value,type:"textarea",maxLength:512});
export const PHYSICS_TOOLS=Object.freeze({
  projectile_motion:{label:"포물선 운동",box:[110,68],fields:[
    number("speed","초기 속력(m/s)",12,0,100,.1),number("launchAngle","발사 각도(°)",45,0,180,.1),
    number("initialHeight","출발 높이(m)",0,0,100,.1),number("gravity","중력 가속도(m/s²)",10,.1,30,.1),
    number("time","관찰 시각(s)",.8,0,200,.01),number("span","가로 표시 범위(m)",20,1,500,1),
    flag("showVelocity","속도 화살표"),flag("showGuides","좌표 보조선"),flag("showLabels","수치 표시")]},
  circular_wave:{label:"원형 물결파",box:[90,70],fields:[
    number("sourceCount","파원 수",2,1,2),number("source1X","파원 1 가로(%)",35,0,100),number("source1Y","파원 1 세로(%)",50,0,100),
    number("source2X","파원 2 가로(%)",65,0,100),number("source2Y","파원 2 세로(%)",50,0,100),
    number("wavelength","파장(cm)",2,.5,100,.1),number("frequency","진동수(Hz)",1,.01,100,.1),number("waveTime","관찰 시각(s)",0,0,100,.01),
    number("phaseDifference","파원 2 위상차(°)",0,-360,360),number("span","가로 표시 범위(cm)",20,1,100,1),flag("showTroughs","골을 점선으로 표시")]},
  refraction_scene:{label:"다중 매질 굴절",box:[110,70],fields:[
    number("exteriorN","바깥 굴절률",1,1,4,.01),number("sourceX","광원 가로(%)",12,0,100),number("sourceY","광원 세로(%)",70,0,100),
    number("rayAngle","광선 각도(°)",25,-180,180,.1),number("selectedMedium","편집할 영역 번호",1,1,6),number("mediumN","선택 영역 굴절률",1.5,1,4,.01),
    select("regionShape","선택 영역 모양","rectangle",[["rectangle","사각형"],["triangle","삼각형"],["polygon","편집한 다각형"]]),
    flag("showNormals","법선 표시"),flag("showAngles","입사·굴절각 표시",false)],
    actions:[["add-medium","매질 영역 추가"],["remove-medium","선택 영역 삭제"],["add-vertex","꼭짓점 추가"]]},
  lens_model:{label:"렌즈와 물체·상",box:[120,65],fields:[
    select("lensMode","렌즈 종류","converging",[["converging","볼록 렌즈"],["diverging","오목 렌즈"]]),
    number("focalLength","초점거리 크기(cm)",15,.5,200,.5),number("objectDistance","물체 거리(cm)",30,.5,400,.5),
    number("objectHeight","물체 높이(cm)",7,.1,50,.1),number("lensPosition","렌즈 가로 위치(%)",50,10,90),
    number("span","가로 표시 범위(cm)",80,5,800,5),flag("showRays","작도 광선 표시"),flag("showLabels","수치 표시")]},
  energy_levels:{label:"에너지 준위",box:[85,80],fields:[
    text("levelsText","에너지(eV) · 낮은 준위부터","-6, -4, -2, 0"),text("transitionsText","전이 · 준위 번호 (예: 3>2)","3>2, 4>2"),
    select("spacing","준위 배치","energy",[["energy","에너지에 비례"],["uniform","등간격 · 도식"]]),flag("showWavelengths","전이 파장 표시")],
    actions:[["hydrogen","수소 준위 예시"],["create-spectrum","전이로 스펙트럼 만들기"]]},
  spectrum:{label:"스펙트럼",box:[115,40],fields:[
    select("spectrumMode","종류","emission",[["emission","방출선"],["absorption","흡수선"],["continuous","연속"]]),
    text("linesText","선의 파장(nm)","410.2, 434.0, 486.1, 656.3"),number("lambdaMin","최소 파장(nm)",380,1,100000,.1),
    number("lambdaMax","최대 파장(nm)",780,1.1,100001,.1),flag("useColor","가시광 색 표시"),flag("showLabels","파장 표시")]}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rad=a=>a*Math.PI/180,deg=a=>a*180/Math.PI;
export function isPhysicsTool(o){return Object.hasOwn(PHYSICS_TOOLS,o?.kind||"");}
export function projectileState(s,t=s.time){
  const vx=s.speed*Math.cos(rad(s.launchAngle)),vy=s.speed*Math.sin(rad(s.launchAngle)),g=s.gravity;
  const flight=(vy+Math.sqrt(vy*vy+2*g*s.initialHeight))/g,at=clamp(t,0,flight);
  return {flight,t:at,x:vx*at,y:Math.max(0,s.initialHeight+vy*at-g*at*at/2),vx,vy:vy-g*at,range:vx*flight,apex:s.initialHeight+Math.max(0,vy)**2/(2*g)};
}
export function thinLens(s){
  const f=s.focalLength*(s.lensMode==="diverging"?-1:1),den=1/f-1/s.objectDistance;
  if(Math.abs(den)<1e-10)return {f,infinite:true,distance:null,magnification:null,height:null};
  const distance=1/den,magnification=-distance/s.objectDistance;
  return {f,infinite:false,distance,magnification,height:s.objectHeight*magnification,real:distance>0};
}
export const HC_EV_NM=6.62607015e-34*299792458/1.602176634e-19*1e9;
export function energyData(s){
  const raw=s.levelsText.split(/[,\s]+/).filter(Boolean),values=raw.map(Number);
  const levels=[...new Set(values.filter(Number.isFinite))].sort((a,b)=>a-b).slice(0,8);
  const tokens=s.transitionsText.split(/[,\s]+/).filter(Boolean),transitions=[];let invalid=raw.length!==values.filter(Number.isFinite).length||new Set(values).size!==values.length||values.length>8;
  for(const token of tokens){const m=token.match(/^(\d+)>(\d+)$/),from=Number(m?.[1])-1,to=Number(m?.[2])-1;
    if(!m||!levels[from]&&levels[from]!==0||!levels[to]&&levels[to]!==0||from===to){invalid=true;continue;}
    const delta=levels[to]-levels[from];transitions.push({from,to,delta,wavelength:HC_EV_NM/Math.abs(delta),emission:delta<0});
  }
  return {levels,transitions,invalid};
}
export function spectrumLines(s){return s.linesText.split(/[,\s]+/).filter(Boolean).map(Number).filter(v=>Number.isFinite(v)&&v>0).slice(0,40);}
const defaultMedia=()=>[{n:1.5,shape:"rectangle",points:[[35,0],[58,0],[58,100],[35,100]]},{n:1.33,shape:"rectangle",points:[[58,0],[80,0],[80,100],[58,100]]}];
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function simplePolygon(p){
  if(p.length<3||Math.abs(p.reduce((a,v,i)=>a+cross(v,p[(i+1)%p.length]),0))<.1)return false;
  for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
    if(j===i+1||i===0&&j===p.length-1)continue;
    const a=p[i],b=p[(i+1)%p.length],c=p[j],d=p[(j+1)%p.length],u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]],w=[c[0]-a[0],c[1]-a[1]],den=cross(u,v);
    if(Math.abs(den)<1e-10)continue;const t=cross(w,v)/den,q=cross(w,u)/den;if(t>=0&&t<=1&&q>=0&&q<=1)return false;
  }return true;
}
export function physicsSettings(o={}){
  const def=PHYSICS_TOOLS[o.kind];if(!def)return {};
  const s={};for(const f of def.fields){let v=o[f.key];
    if(f.type==="number")v=clamp(Number.isFinite(v)?v:f.value,f.min,f.max);
    else if(f.type==="checkbox")v=typeof v==="boolean"?v:f.value;
    else if(f.type==="select")v=f.options.some(a=>a[0]===v)?v:f.value;
    else v=typeof v==="string"?v.slice(0,f.maxLength||32):f.value;s[f.key]=v;
  }
  if(o.kind==="projectile_motion")s.time=projectileState(s).t;
  if(o.kind==="circular_wave")s.sourceCount=Math.round(s.sourceCount);
  if(o.kind==="spectrum")s.lambdaMax=Math.max(s.lambdaMin+.1,s.lambdaMax);
  if(o.kind==="refraction_scene"){
    s.media=(Array.isArray(o.media)?o.media:defaultMedia()).slice(0,6).flatMap(m=>{
      const p=Array.isArray(m?.points)?m.points.slice(0,8).map(p=>[clamp(Number(p?.[0]),0,100),clamp(Number(p?.[1]),0,100)]):[];
      return p.every(p=>p.every(Number.isFinite))&&simplePolygon(p)?[{n:clamp(Number.isFinite(m.n)?m.n:1.5,1,4),shape:m.shape||"polygon",points:p}]:[];
    });
    s.selectedMedium=clamp(Math.round(s.selectedMedium),1,Math.max(1,s.media.length));
    const m=s.media[s.selectedMedium-1];s.mediumN=m?.n??1.5;s.regionShape=m?.shape??"rectangle";
  }return s;
}
export function changePhysicsTool(o,key,value){
  const s=physicsSettings(o);
  if(o.kind==="refraction_scene"&&["mediumN","regionShape"].includes(key)){
    const m=s.media[s.selectedMedium-1];if(!m)return s;
    if(key==="mediumN")m.n=clamp(Number.isFinite(value)?value:m.n,1,4);
    else if(value!==m.shape&&["rectangle","triangle","polygon"].includes(value)){
      const xs=m.points.map(p=>p[0]),ys=m.points.map(p=>p[1]),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);
      if(value!=="polygon")m.points=value==="triangle"?[[a,d],[(a+b)/2,c],[b,d]]:[[a,c],[b,c],[b,d],[a,d]];m.shape=value;
    }
  }else s[key]=value;
  return physicsSettings({...o,...s});
}
function inside(p,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;}
export function traceRefraction(source,direction,media,exteriorN=1,bounds=[0,0,100,100]){
  const unit=d=>{const n=Math.hypot(...d);return [d[0]/n,d[1]/n];},index=p=>{for(let i=media.length-1;i>=0;i--)if(inside(p,media[i].points))return media[i].n;return exteriorN;};
  const [x0,y0,x1,y1]=bounds,frame=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],edges=[];
  for(const [region,points]of [...media.map((m,i)=>[i,m.points]),[-1,frame]])points.forEach((a,i)=>edges.push({a,b:points[(i+1)%points.length],region}));
  let p=source.slice(),d=unit(direction);const segments=[],events=[];const eps=1e-5;
  for(let step=0;step<80;step++){
    const hits=[];for(const edge of edges){const v=[edge.b[0]-edge.a[0],edge.b[1]-edge.a[1]],w=[edge.a[0]-p[0],edge.a[1]-p[1]],den=cross(d,v);if(Math.abs(den)<1e-10)continue;
      const t=cross(w,v)/den,u=cross(w,d)/den;if(t>eps*.1&&u>=-1e-8&&u<=1+1e-8)hits.push({...edge,t,v});
    }
    if(!hits.length)return {segments,events,status:"exit"};hits.sort((a,b)=>a.t-b.t);const h=hits[0],q=[p[0]+h.t*d[0],p[1]+h.t*d[1]];
    segments.push({a:p.slice(),b:q.slice(),n:index([p[0]+d[0]*eps,p[1]+d[1]*eps])});
    if(hits.some(a=>Math.abs(a.t-h.t)<eps&&a.region===-1))return {segments,events,status:"exit"};
    const n1=index([q[0]-d[0]*eps,q[1]-d[1]*eps]),n2=index([q[0]+d[0]*eps,q[1]+d[1]*eps]);
    if(Math.abs(n1-n2)<1e-9){p=[q[0]+d[0]*eps,q[1]+d[1]*eps];continue;}
    // A corner has no unique normal. Stop instead of inventing a refracted ray.
    const tied=hits.filter(a=>Math.abs(a.t-h.t)<eps&&a.region!==-1);
    if(tied.some(a=>Math.abs(cross(unit(a.v),unit(h.v)))>1e-6))return {segments,events,status:"corner"};
    let normal=unit([-h.v[1],h.v[0]]);if(d[0]*normal[0]+d[1]*normal[1]>0)normal=normal.map(v=>-v);
    const ci=clamp(-(d[0]*normal[0]+d[1]*normal[1]),0,1),eta=n1/n2,k=1-eta*eta*(1-ci*ci),tir=k<-1e-10;
    const outgoing=tir?[d[0]+2*ci*normal[0],d[1]+2*ci*normal[1]]:[eta*d[0]+(eta*ci-Math.sqrt(Math.max(0,k)))*normal[0],eta*d[1]+(eta*ci-Math.sqrt(Math.max(0,k)))*normal[1]];
    events.push({point:q,normal,n1,n2,tir,incident:deg(Math.acos(ci)),refracted:tir?null:deg(Math.acos(Math.sqrt(Math.max(0,k))))});
    d=unit(outgoing);p=[q[0]+d[0]*eps-normal[0]*eps*(tir?-1:1),q[1]+d[1]*eps-normal[1]*eps*(tir?-1:1)];
    if(events.length>=20)return {segments,events,status:"limit"};
  }return {segments,events,status:"limit"};
}
export function waveRadii(s,phase,maxRadius){
  const offset=((s.frequency*s.waveTime+phase/360)%1+1)%1,crest=[],trough=[];
  for(let i=0;i<300;i++){const r=(i+offset)*s.wavelength;if(r>maxRadius)break;if(r>1e-8)crest.push(r);const t=r+s.wavelength/2;if(t<=maxRadius)trough.push(t);}
  return {crest,trough};
}
export function physicsLayout(o){
  const s=physicsSettings(o),{x,y,w,h}=o,frame={x:x+w*.09,y:y+h*.08,w:w*.85,h:h*.77};
  const point=(a,b)=>({x:frame.x+frame.w*a/100,y:frame.y+frame.h*b/100});
  if(o.kind==="projectile_motion"){
    const k=frame.w/s.span,origin={x:frame.x,y:frame.y+frame.h},state=projectileState(s),at=t=>{const p=projectileState(s,t);return{x:origin.x+p.x*k,y:origin.y-p.y*k};};
    return {s,frame,k,origin,state,at,bob:at(s.time),launch:at(0)};
  }
  if(o.kind==="circular_wave")return {s,frame,k:frame.w/s.span,sources:[point(s.source1X,s.source1Y),point(s.source2X,s.source2Y)].slice(0,s.sourceCount)};
  if(o.kind==="refraction_scene"){
    const media=s.media.map(m=>({...m,points:m.points.map(p=>[point(...p).x,point(...p).y])})),source=point(s.sourceX,s.sourceY);
    return {s,frame,point,media,source,trace:traceRefraction([source.x,source.y],[Math.cos(rad(s.rayAngle)),-Math.sin(rad(s.rayAngle))],media,s.exteriorN,[frame.x,frame.y,frame.x+frame.w,frame.y+frame.h])};
  }
  if(o.kind==="lens_model"){
    const k=frame.w/s.span,axisY=frame.y+frame.h*.52,lensX=frame.x+frame.w*s.lensPosition/100,result=thinLens(s);
    return {s,frame,k,axisY,lensX,result,object:{x:lensX-s.objectDistance*k,y:axisY-s.objectHeight*k},image:result.infinite?null:{x:lensX+result.distance*k,y:axisY-result.height*k}};
  }
  if(o.kind==="energy_levels"){
    const data=energyData(s),low=data.levels[0]??0,high=data.levels.at(-1)??1,margin=Math.max(.1,(high-low)*.15),min=low-margin,max=high+margin;
    const valueY=e=>frame.y+frame.h*(max-e)/(max-min),levelY=data.levels.map((e,i)=>s.spacing==="uniform"?frame.y+frame.h*(1-(i+1)/(data.levels.length+1)):valueY(e));
    return {s,frame,data,min,max,levelY,valueY};
  }
  const lines=spectrumLines(s),at=lambda=>frame.x+frame.w*(lambda-s.lambdaMin)/(s.lambdaMax-s.lambdaMin);
  return {s,frame,lines,at};
}
export function physicsBBox(o){
  const l=physicsLayout(o);if(o.kind!=="projectile_motion")return {x:o.x,y:o.y,w:o.w,h:o.h};
  const s=l.state,k=l.k,points=[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y+o.h},l.launch,l.bob,
    {x:l.origin.x+s.range*k,y:l.origin.y},{x:l.origin.x,y:l.origin.y-s.apex*k},
    {x:l.launch.x+s.vx*k*.3,y:l.launch.y-l.s.speed*Math.sin(rad(l.s.launchAngle))*k*.3}];
  if(l.s.showVelocity)points.push({x:l.bob.x+s.vx*k*.2,y:l.bob.y-s.vy*k*.2});
  const left=Math.min(...points.map(p=>p.x))-3,top=Math.min(...points.map(p=>p.y))-4,right=Math.max(...points.map(p=>p.x))+3,bottom=Math.max(...points.map(p=>p.y))+3;
  return {x:left,y:top,w:right-left,h:bottom-top};
}
export function physicsHandles(o){
  const l=physicsLayout(o),s=l.s,f=l.frame,handle=(key,p,label)=>{
    const fixed={"launch-vector":s.speed,"time-point":s.time,"ray-source":s.sourceX,"ray-angle":s.rayAngle,"region-center":s.selectedMedium,"focus":s.focalLength,"object-top":s.objectDistance,"lens-position":s.lensPosition,"wavelength":s.wavelength};
    let value=fixed[key];if(key.startsWith("source-"))value=s["source"+(Number(key.slice(7))+1)+"X"];
    if(key.startsWith("vertex-"))value=(p.x-f.x)/f.w*100;
    if(key.startsWith("level-"))value=l.data.levels[Number(key.slice(6))];
    if(key.startsWith("line-"))value=l.lines[Number(key.slice(5))];
    return {key,...p,label,value};
  };
  if(o.kind==="projectile_motion")return [handle("launch-vector",{x:l.launch.x+l.state.vx*l.k*.3,y:l.launch.y-(s.speed*Math.sin(rad(s.launchAngle)))*l.k*.3},"발사 속도 · 속력과 각도"),handle("time-point",l.bob,"관찰 시각 · 공 위치")];
  if(o.kind==="circular_wave")return [...l.sources.map((p,i)=>handle("source-"+i,p,"파원 "+(i+1)+" 위치")),handle("wavelength",{x:l.sources[0].x+s.wavelength*l.k,y:l.sources[0].y},"파장")];
  if(o.kind==="refraction_scene"){
    const m=l.media[s.selectedMedium-1],center=m?{x:m.points.reduce((a,p)=>a+p[0],0)/m.points.length,y:m.points.reduce((a,p)=>a+p[1],0)/m.points.length}:null;
    return [handle("ray-source",l.source,"광원 위치"),handle("ray-angle",{x:l.source.x+f.w*.16*Math.cos(rad(s.rayAngle)),y:l.source.y-f.w*.16*Math.sin(rad(s.rayAngle))},"입사 광선 방향"),...(m?[handle("region-center",center,"선택 매질 위치"),...m.points.map((p,i)=>handle("vertex-"+i,{x:p[0],y:p[1]},"매질 꼭짓점 "+(i+1)))]:[])];
  }
  if(o.kind==="lens_model")return [handle("object-top",l.object,"물체 거리와 높이"),handle("focus",{x:l.lensX+s.focalLength*l.k,y:l.axisY},"초점거리"),handle("lens-position",{x:l.lensX,y:l.axisY},"렌즈 위치")];
  if(o.kind==="energy_levels")return s.spacing==="uniform"?[]:l.levelY.map((y,i)=>handle("level-"+i,{x:f.x+f.w*.9,y},"준위 "+(i+1)+" 에너지"));
  return l.lines.flatMap((v,i)=>v>=s.lambdaMin&&v<=s.lambdaMax?[handle("line-"+i,{x:l.at(v),y:f.y+f.h*.7},"스펙트럼 선 "+(i+1)+" 파장")]:[]);
}
export function physicsHandleChange(o,key,start,p){
  const l=physicsLayout(o),s=l.s,dx=p.x-start.x,dy=p.y-start.y,f=l.frame,h=physicsHandles(o).find(h=>h.key===key);if(!h||Math.abs(dx)+Math.abs(dy)<1e-10)return s;
  const q={x:h.x+dx,y:h.y+dy};
  if(o.kind==="projectile_motion"){
    if(key==="launch-vector"){const vx=(q.x-l.launch.x)/(l.k*.3),vy=(l.launch.y-q.y)/(l.k*.3);s.speed=Math.hypot(vx,vy);s.launchAngle=deg(Math.atan2(vy,vx));}
    else {let best=Infinity;for(let i=0;i<=400;i++){const t=l.state.flight*i/400,v=l.at(t),d=(v.x-q.x)**2+(v.y-q.y)**2;if(d<best){best=d;s.time=t;}}}
  }else if(o.kind==="circular_wave"){
    if(key==="wavelength")s.wavelength=Math.max(.5,(q.x-l.sources[0].x)/l.k);
    else {const n=Number(key.slice(7))+1;s["source"+n+"X"]=(q.x-f.x)/f.w*100;s["source"+n+"Y"]=(q.y-f.y)/f.h*100;}
  }else if(o.kind==="refraction_scene"){
    if(key==="ray-source"){s.sourceX=(q.x-f.x)/f.w*100;s.sourceY=(q.y-f.y)/f.h*100;}
    else if(key==="ray-angle")s.rayAngle=deg(Math.atan2(l.source.y-q.y,q.x-l.source.x));
    else {const m=s.media[s.selectedMedium-1];if(key==="region-center"){
      const xs=m.points.map(p=>p[0]),ys=m.points.map(p=>p[1]),tx=clamp(dx/f.w*100,-Math.min(...xs),100-Math.max(...xs)),ty=clamp(dy/f.h*100,-Math.min(...ys),100-Math.max(...ys));m.points=m.points.map(p=>[p[0]+tx,p[1]+ty]);
    }else {const i=Number(key.slice(7)),points=m.points.map(p=>p.slice());points[i]=[clamp((q.x-f.x)/f.w*100,0,100),clamp((q.y-f.y)/f.h*100,0,100)];if(simplePolygon(points)){m.points=points;m.shape="polygon";}}}
  }else if(o.kind==="lens_model"){
    if(key==="object-top"){s.objectDistance=(l.lensX-q.x)/l.k;s.objectHeight=(l.axisY-q.y)/l.k;}
    else if(key==="focus")s.focalLength=Math.abs(q.x-l.lensX)/l.k;
    else s.lensPosition=(q.x-f.x)/f.w*100;
  }else if(o.kind==="energy_levels"){
    const i=Number(key.slice(6)),levels=l.data.levels.slice(),range=l.max-l.min;levels[i]=clamp(levels[i]-dy/f.h*range,(levels[i-1]??-1e6)+.001,(levels[i+1]??1e6)-.001);s.levelsText=levels.map(v=>Number(v.toFixed(4))).join(", ");
  }else {const i=Number(key.slice(5)),lines=l.lines.slice();lines[i]=clamp(s.lambdaMin+(q.x-f.x)/f.w*(s.lambdaMax-s.lambdaMin),s.lambdaMin,s.lambdaMax);s.linesText=lines.map(v=>Number(v.toFixed(2))).join(", ");}
  return physicsSettings({...o,...s});
}
export function physicsKeyboardChange(o,key,eventKey,shift=false){
  if(!isPhysicsTool(o))return null;const h=physicsHandles(o).find(h=>h.key===key);if(!h)return null;
  if(!eventKey.startsWith("Arrow"))return null;const amount=(shift?5:1)*Math.min(o.w,o.h)*.01;
  return physicsHandleChange(o,key,h,{x:h.x+(eventKey==="ArrowLeft"?-amount:eventKey==="ArrowRight"?amount:0),y:h.y+(eventKey==="ArrowUp"?-amount:eventKey==="ArrowDown"?amount:0)});
}
export function physicsAction(o,action){
  const s=physicsSettings(o);
  if(o.kind==="refraction_scene"){
    if(action==="add-medium"&&s.media.length<6){s.media.push({n:1.5,shape:"rectangle",points:[[30,20],[60,20],[60,80],[30,80]]});s.selectedMedium=s.media.length;}
    else if(action==="remove-medium")s.media.splice(s.selectedMedium-1,1);
    else if(action==="add-vertex"){const m=s.media[s.selectedMedium-1];if(m&&m.points.length<8){const a=m.points[0],b=m.points[1];m.points.splice(1,0,[(a[0]+b[0])/2,(a[1]+b[1])/2]);m.shape="polygon";}}
    return {settings:physicsSettings({...o,...s})};
  }
  if(action==="hydrogen")return {settings:physicsSettings({...o,levelsText:"-13.6, -3.4, -1.5111, -0.85",transitionsText:"3>2, 4>2"})};
  if(action==="create-spectrum"){
    const data=energyData(s),lines=data.transitions.map(t=>t.wavelength);if(!lines.length)return null;
    const kinds=new Set(data.transitions.map(t=>t.emission));if(kinds.size>1)return {error:"방출과 흡수 전이를 분리해서 스펙트럼을 만들어 주세요."};
    const min=Math.min(...lines),max=Math.max(...lines),pad=Math.max(20,(max-min)*.15),spectrum={id:"spectrum-"+Date.now()+"-"+Math.random().toString(36).slice(2,7),type:"apparatus",kind:"spectrum",x:o.x,y:o.y+o.h+8,w:115,h:40,rotation:0,layerId:o.layerId,strokeWidth:o.strokeWidth||.22,lockAspect:true,
      linesText:lines.map(v=>Number(v.toFixed(3))).join(", "),lambdaMin:Math.max(1,min-pad),lambdaMax:max+pad,spectrumMode:data.transitions[0].emission?"emission":"absorption"};
    return {created:{...spectrum,...physicsSettings(spectrum)}};
  }return null;
}
export function physicsToolHint(o){
  if(!isPhysicsTool(o))return "";const l=physicsLayout(o),s=l.s,round=v=>Number(v.toFixed(2));
  if(o.kind==="projectile_motion")return `공기 저항 없음 · 사거리 ${round(l.state.range)} m, 최고 높이 ${round(l.state.apex)} m, 착지 ${round(l.state.flight)} s. 화살표 끝은 발사 조건, 공은 시각을 조절합니다. 표시 범위를 넘는 궤적도 보존합니다.`;
  if(o.kind==="circular_wave")return `파동 속력 ${round(s.wavelength*s.frequency)} cm/s. 파원 위치와 파장을 드래그할 수 있습니다. 실선은 마루, 점선은 골입니다. 관찰 시각·위상차로 상태를 바꿉니다.`;
  if(o.kind==="refraction_scene")return `선택 영역의 꼭짓점·중앙을 드래그합니다. 겹친 영역은 나중에 추가한 영역의 굴절률이 적용됩니다. ${l.trace.events.filter(e=>e.tir).length}회 전반사. `+(l.trace.status==="corner"?"꼭짓점 입사: 방향을 조금 바꿔 주세요.":l.trace.status==="limit"?"20회 경계 계산에서 정지했습니다.":"투과와 전반사를 계산합니다. 부분 반사 분기는 생략합니다.");
  if(o.kind==="lens_model")return "얇은 렌즈·근축 광선 모델. "+(l.result.infinite?"물체가 초점에 있어 유한 거리의 상이 없습니다.":`${l.result.real?"실상":"허상"} 거리 ${round(l.result.distance)} cm, 배율 ${round(l.result.magnification)}.`)+(l.image&&(l.image.x<l.frame.x||l.image.x>l.frame.x+l.frame.w||l.image.y<l.frame.y||l.image.y>l.frame.y+l.frame.h)?" 상이 표시 범위 밖입니다. 범위를 넓혀 주세요.":"");
  if(o.kind==="energy_levels")return (s.spacing==="uniform"?"등간격 도식에서는 에너지 값은 입력창으로 편집합니다. ":"")+"낮은 준위부터 번호 1, 2…입니다. 준위를 드래그하고 전이를 입력합니다. ΔE로 파장을 계산하며 전이의 허용 여부·세기는 계산하지 않습니다."+(l.data.invalid?" 해석할 수 없는 입력이 있습니다.":"");
  const hidden=l.lines.filter(v=>v<s.lambdaMin||v>s.lambdaMax).length;
  return `파장은 왼쪽에서 오른쪽으로 증가합니다. 선 핸들로 파장을 조절합니다. ${hidden}개 선이 표시 범위 밖입니다. 색은 가시광의 근사 표시입니다.`;
}
