import { SVG_NS } from "./core.js?v=1.7.0-four-session-integration";
import { isPhysicsTool, physicsLayout, projectileState, waveRadii } from "../physics-tools.js?v=1.7.0-four-session-integration";

// Exam diagrams, not a time-running simulation. Each saved object is a state.
export function wavelengthColor(n){
  let r=0,g=0,b=0;if(n<380||n>780)return "#999999";
  if(n<440){r=(440-n)/60;b=1;}else if(n<490){g=(n-440)/50;b=1;}else if(n<510){g=1;b=(510-n)/20;}
  else if(n<580){r=(n-510)/70;g=1;}else if(n<645){r=1;g=(645-n)/65;}else r=1;
  const intensity=n<420?.3+.7*(n-380)/40:n>700?.3+.7*(780-n)/80:1;
  return "#"+[r,g,b].map(v=>Math.round(255*(v*intensity)**.8).toString(16).padStart(2,"0")).join("");
}
export function drawPhysicsTool(g,o,sw,color){
  if(!isPhysicsTool(o))return false;
  const l=physicsLayout(o),s=l.s,f=l.frame,uid="physics-"+String(o.id||o.kind).replace(/[^\w-]/g,"_"),font=Math.min(o.w,o.h)*.042;
  let active=g;
  const attrs={stroke:color,"stroke-width":sw,"stroke-linecap":"round","stroke-linejoin":"round"};
  const el=(tag,a={},parent=active)=>{const n=document.createElementNS(SVG_NS,tag);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);parent.appendChild(n);return n;};
  const line=(a,b,more={})=>el("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,...attrs,...more});
  const path=(points,more={})=>el("path",{d:points.map((p,i)=>(i?"L":"M")+p.x+","+p.y).join(" "),fill:"none",...attrs,...more});
  const circle=(p,r,fill=color,more={})=>el("circle",{cx:p.x,cy:p.y,r,fill,...attrs,...more});
  const label=(p,text,more={})=>{const n=el("text",{x:p.x,y:p.y,fill:color,"font-family":"'Times New Roman',serif","font-size":font,"text-anchor":"middle",...more});n.textContent=text;return n;};
  const arrow=(a,b,more={})=>{
    line(a,b,more);const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<1e-8)return;
    const ux=dx/length,uy=dy/length,r=Math.min(font*.6,length*.25),base={x:b.x-r*ux,y:b.y-r*uy};
    el("polygon",{points:[[b.x,b.y],[base.x-uy*r*.38,base.y+ux*r*.38],[base.x+uy*r*.38,base.y-ux*r*.38]].map(p=>p.join(",")).join(" "),fill:more.stroke||color});
  };
  const frame=()=>el("rect",{x:f.x,y:f.y,width:f.w,height:f.h,fill:"none",stroke:"#aaa","stroke-width":sw*.5});
  const clipped=()=>{const defs=el("defs"),clip=el("clipPath",{id:uid+"-clip"},defs);el("rect",{x:f.x,y:f.y,width:f.w,height:f.h},clip);active=el("g",{"clip-path":`url(#${uid}-clip)`});};
  const dash={"stroke-dasharray":`${font*.7} ${font*.5}`};
  const fmt=v=>Number(v.toFixed(2));
  g.setAttribute("data-physics-kind",o.kind);
  if(o.kind==="projectile_motion"){
    const p=l.state,k=l.k,origin=l.origin;
    arrow(origin,{x:f.x+f.w,y:origin.y});arrow(origin,{x:origin.x,y:f.y});
    label({x:f.x+f.w,y:origin.y+font*1.6},"x (m)");label({x:origin.x-font*.2,y:f.y-font},"y (m)");
    path(Array.from({length:81},(_,i)=>l.at(p.flight*i/80)),{"data-projectile-trajectory":""});
    const vector={x:l.launch.x+p.vx*k*.3,y:l.launch.y-s.speed*Math.sin(s.launchAngle*Math.PI/180)*k*.3};
    arrow(l.launch,vector,{"data-launch-vector":""});label({x:vector.x,y:vector.y-font*.8},"v₀");
    circle(l.bob,font*.65,"#bbb",{"data-projectile-body":""});
    if(s.showVelocity){const velocity={x:l.bob.x+p.vx*k*.2,y:l.bob.y-p.vy*k*.2};arrow(l.bob,velocity);label({x:velocity.x,y:velocity.y-font*.8},"v");}
    if(s.showGuides){line(l.bob,{x:l.bob.x,y:origin.y},dash);line(l.bob,{x:origin.x,y:l.bob.y},dash);}
    if(s.showLabels)label({x:o.x+o.w*.52,y:o.y+o.h*.98},`t = ${fmt(p.t)} s    x = ${fmt(p.x)} m    y = ${fmt(p.y)} m`);
  }else if(o.kind==="circular_wave"){
    frame();clipped();const max=Math.hypot(f.w,f.h)/l.k;
    l.sources.forEach((p,i)=>{const radii=waveRadii(s,i?s.phaseDifference:0,max);
      for(const r of radii.crest)circle(p,r*l.k,"none",{"data-wave-crest":i});
      if(s.showTroughs)for(const r of radii.trough)circle(p,r*l.k,"none",{...dash,opacity:.45,"data-wave-trough":i});
      circle(p,font*.4);label({x:p.x,y:p.y-font},"S"+(i+1));
    });active=g;label({x:o.x+o.w*.5,y:o.y+o.h*.96},`λ = ${fmt(s.wavelength)} cm    f = ${fmt(s.frequency)} Hz    t = ${fmt(s.waveTime)} s`);
  }else if(o.kind==="refraction_scene"){
    frame();clipped();
    l.media.forEach((m,i)=>{
      el("polygon",{points:m.points.map(p=>p.join(",")).join(" "),fill:["#eeeeee","#d9d9d9","#f5f5f5"][i%3],...attrs,"data-medium":i+1});
      const cx=m.points.reduce((a,p)=>a+p[0],0)/m.points.length,cy=m.points.reduce((a,p)=>a+p[1],0)/m.points.length;label({x:cx,y:cy-font*1.5},`n${i+1} = ${fmt(m.n)}`);
    });
    l.trace.segments.forEach((v,i)=>{
      const a={x:v.a[0],y:v.a[1]},b={x:v.b[0],y:v.b[1]};line(a,b,{"stroke-width":sw*1.6,"data-ray-segment":i});
      arrow({x:a.x+(b.x-a.x)*.4,y:a.y+(b.y-a.y)*.4},{x:a.x+(b.x-a.x)*.58,y:a.y+(b.y-a.y)*.58});
    });
    l.trace.events.forEach((e,i)=>{const p={x:e.point[0],y:e.point[1]},r=font*3;
      if(s.showNormals)line({x:p.x-r*e.normal[0],y:p.y-r*e.normal[1]},{x:p.x+r*e.normal[0],y:p.y+r*e.normal[1]},{...dash,stroke:"#666","data-ray-normal":i});
      if(e.tir)label({x:p.x+font*2,y:p.y-font},"전반사",{"font-size":font*.8});
      else if(s.showAngles)label({x:p.x+font*2,y:p.y-font},`${fmt(e.incident)}° → ${fmt(e.refracted)}°`,{"font-size":font*.7});
    });circle(l.source,font*.4);active=g;label({x:o.x+o.w*.5,y:o.y+o.h*.96},`바깥 n = ${fmt(s.exteriorN)}`);
  }else if(o.kind==="lens_model"){
    const {axisY,lensX,k,result,object,image}=l,inside=p=>p&&p.x>=f.x&&p.x<=f.x+f.w&&p.y>=f.y&&p.y<=f.y+f.h;
    frame();clipped();line({x:f.x,y:axisY},{x:f.x+f.w,y:axisY},{stroke:"#888"});
    const height=f.h*.4,width=font*1.05;
    const d=s.lensMode==="converging"?`M ${lensX} ${axisY-height} Q ${lensX-width*2} ${axisY} ${lensX} ${axisY+height} Q ${lensX+width*2} ${axisY} ${lensX} ${axisY-height} Z`:
      `M ${lensX-width} ${axisY-height} Q ${lensX-width*.25} ${axisY} ${lensX-width} ${axisY+height} L ${lensX+width} ${axisY+height} Q ${lensX+width*.25} ${axisY} ${lensX+width} ${axisY-height} Z`;
    el("path",{d,fill:"#f0f0f0",...attrs,"data-lens":""});
    for(const sign of [-1,1]){const fx=lensX+sign*s.focalLength*k;circle({x:fx,y:axisY},font*.23);label({x:fx,y:axisY+font*1.5},"F");}
    if(s.showRays){
      const atLens={x:lensX,y:object.y},central={x:lensX,y:axisY},endX=f.x+f.w;
      arrow(object,atLens);arrow(object,central);
      const ends=[{x:endX,y:object.y+(endX-lensX)*s.objectHeight/result.f},{x:endX,y:axisY+(endX-lensX)*s.objectHeight/s.objectDistance}];
      [atLens,central].forEach((a,i)=>{line(a,ends[i],{"data-lens-ray":i});arrow(a,{x:a.x+(ends[i].x-a.x)*.35,y:a.y+(ends[i].y-a.y)*.35});});
      if(!result.infinite&&!result.real){line(atLens,image,dash);line(central,image,dash);}
    }
    arrow({x:object.x,y:axisY},object,{"stroke-width":sw*2,"data-lens-object":""});label({x:object.x-font*1.2,y:object.y-font},"물체");
    if(image&&inside(image)){arrow({x:image.x,y:axisY},image,{"stroke-width":sw*2,...(!result.real?dash:{}),"data-lens-image":result.real?"real":"virtual"});label({x:image.x+font*1.3,y:image.y+(result.real?font*1.3:-font)},result.real?"실상":"허상");}
    active=g;if(s.showLabels)label({x:o.x+o.w*.5,y:o.y+o.h*.96},result.infinite?"물체가 초점에 있음 · 상은 무한대":`f = ${fmt(result.f)} cm    dᵢ = ${fmt(result.distance)} cm    m = ${fmt(result.magnification)}`);
  }else if(o.kind==="energy_levels"){
    const left=f.x+f.w*.14,right=f.x+f.w*.95;
    arrow({x:f.x,y:f.y+f.h},{x:f.x,y:f.y});label({x:f.x,y:f.y-font},"E (eV)");
    l.data.levels.forEach((v,i)=>{line({x:left,y:l.levelY[i]},{x:right,y:l.levelY[i]},{"data-energy-level":i+1});label({x:left+font*.2,y:l.levelY[i]-font*.5},`E${i+1}  ${fmt(v)}`,{"text-anchor":"start"});});
    l.data.transitions.forEach((v,i)=>{const x=left+(right-left)*(.4+.5*(i+.5)/Math.max(1,l.data.transitions.length)),a={x,y:l.levelY[v.from]},b={x,y:l.levelY[v.to]};
      arrow(a,b,{"data-energy-transition":`${v.from+1}>${v.to+1}`});
      if(s.showWavelengths)label({x:x+font*.7,y:(a.y+b.y)/2},`${fmt(v.wavelength)} nm`,{"text-anchor":"start","font-size":font*.75});
    });
    if(s.spacing==="uniform")label({x:o.x+o.w*.5,y:o.y+o.h*.97},"등간격 · 준위 간격은 도식");
  }else{
    const band={y:f.y+f.h*.18,h:f.h*.45},defs=el("defs"),gradient=el("linearGradient",{id:uid+"-spectrum",x1:"0%",x2:"100%"},defs);
    for(let i=0;i<=60;i++){const n=s.lambdaMin+(s.lambdaMax-s.lambdaMin)*i/60;el("stop",{offset:i/60,"stop-color":wavelengthColor(n)},gradient);}
    const fill=s.spectrumMode==="emission"?(s.useColor?"#111":"white"):(s.useColor?`url(#${uid}-spectrum)`:"#eee");
    el("rect",{x:f.x,y:band.y,width:f.w,height:band.h,fill,...attrs,"data-spectrum-band":""});
    if(s.spectrumMode!=="continuous")l.lines.forEach((v,i)=>{if(v<s.lambdaMin||v>s.lambdaMax)return;const x=l.at(v),stroke=s.spectrumMode==="absorption"||!s.useColor?color:wavelengthColor(v);
      line({x,y:band.y},{x,y:band.y+band.h},{stroke,"stroke-width":Math.max(sw*2,o.w*.005),"data-spectrum-line":i});
      if(s.showLabels)label({x,y:f.y+f.h*.85+(i%2)*font*.8},fmt(v),{"font-size":font*.9});
    });
    const axis=f.y+f.h;arrow({x:f.x,y:axis},{x:f.x+f.w,y:axis});label({x:f.x,y:axis+font*1.5},fmt(s.lambdaMin));label({x:f.x+f.w,y:axis+font*1.5},fmt(s.lambdaMax));label({x:f.x+f.w*.5,y:axis+font*1.5},"λ (nm)");
  }
  return true;
}
