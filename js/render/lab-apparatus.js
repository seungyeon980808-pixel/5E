import { drawPhysicsTool } from "./physics-tools.js?v=1.7.0-four-session-integration";
import { drawSourcePendulum } from "./pendulum-source.js?v=1.7.0-four-session-integration";
import { SVG_NS } from "./core.js?v=1.7.0-four-session-integration";
import { isLabApparatus, labLayout, labSettings, labRingCenter, labBBox, labHandles, labWorldPoint } from "../lab-apparatus.js?v=1.7.0-four-session-integration";
import { SELECTION_COLOR } from "../selection-visuals.js?v=1.7.0-four-session-integration";

// Geometry is native SVG, with front/back surfaces and occlusion kept separate.
// References are the unmodified crops in physics-three-year-review-20261003.
export function drawLabApparatus(g,o,sw,color){
  if(!isLabApparatus(o))return false;
  if(drawPhysicsTool(g,o,sw,color)){g.setAttribute("data-lab-kind",o.kind);return true;}
  // 끌어 놓기 첫 순간(크기 0)에는 비율 계산이 NaN이 되므로 그리지 않는다.
  if(!(o.w>0&&o.h>0)){g.setAttribute("data-lab-kind",o.kind);return true;}
  const {x,y,w,h}=o,X=v=>x+w*v,Y=v=>y+h*v,s=labSettings(o),l=labLayout(o);
  const attrs={stroke:color,"stroke-width":sw,"stroke-linejoin":"round","stroke-linecap":"round"};
  let active=g;
  const el=(tag,a={},parent=active)=>{const n=document.createElementNS(SVG_NS,tag);for(const [k,v]of Object.entries(a))n.setAttribute(k,v);parent.appendChild(n);return n;};
  const line=(x1,y1,x2,y2,a={})=>el("line",{x1,y1,x2,y2,...attrs,...a});
  const path=(d,fill="none",a={})=>el("path",{d,fill,...attrs,...a});
  const rect=(x,y,width,height,fill="white",a={})=>el("rect",{x,y,width,height,fill,...attrs,...a});
  const polygon=(pts,fill="white",a={})=>el("polygon",{points:pts.map(p=>p.join(",")).join(" "),fill,...attrs,...a});
  const circle=(cx,cy,r,fill="white",a={})=>el("circle",{cx,cy,r,fill,...attrs,...a});
  const ellipse=(cx,cy,rx,ry,fill="white",a={})=>el("ellipse",{cx,cy,rx,ry,fill,...attrs,...a});
  const text=(px,py,value,size=2.6,a={})=>{const n=el("text",{x:px,y:py,fill:color,"font-size":size,"font-family":"Arial, sans-serif","text-anchor":"middle","dominant-baseline":"middle",...a});n.textContent=value;return n;};
  const dash={"stroke-dasharray":`${sw*5} ${sw*4}`};
  const arrow=(px,py,dx,dy,size)=>{const a=Math.atan2(dy,dx),c=Math.cos(a),sn=Math.sin(a);polygon([[px,py],[px-size*c+size*.35*sn,py-size*sn-size*.35*c],[px-size*c-size*.35*sn,py-size*sn+size*.35*c]],color,{stroke:"none"});};
  const gradients=new Map();
  const gradient=(name,radial=false)=>{
    if(gradients.has(name))return gradients.get(name);
    const defs=el("defs",{},g),id=`lab-${o.id||"icon"}-${name}`.replace(/[^a-zA-Z0-9_-]/g,"_");
    const grad=el(radial?"radialGradient":"linearGradient",{id,...(radial?{cx:"32%",cy:"26%",r:"70%"}:{x1:"0%",y1:"0%",x2:"100%",y2:"0%"})},defs);
    for(const [offset,shade]of radial?[["0%","#fafafa"],["45%","#c9c9c9"],["100%","#737373"]]:[["0%","#989898"],["28%","#ededed"],["70%","#c2c2c2"],["100%","#919191"]])el("stop",{offset,"stop-color":shade},grad);
    const fill=`url(#${id})`;gradients.set(name,fill);return fill;
  };
  const mass=(cx,top,bw,bh,label)=>{
    path(`M ${cx-bw/2} ${top} V ${top+bh*.85} A ${bw/2} ${bh*.13} 0 0 0 ${cx+bw/2} ${top+bh*.85} V ${top}`,gradient("weight"),{"data-lab-weight-body":"true"});
    ellipse(cx,top,bw/2,bh*.13,"#e4e4e4");
    line(cx,top-bh*.12,cx,top);ellipse(cx,top-bh*.14,bw*.1,bh*.07,"none");
    if(label)text(cx,top+bh*.5,label,Math.min(bw*.25,bh*.35));
  };
  g.setAttribute("data-lab-kind",o.kind);
  if(o.kind==="cart_track"){
    const {rails:r,cart:c,gate:a,sensor:f}=l;
    const rail=el("g",{"data-lab-part":"rail"});active=rail;
    for(const z of [r.back,r.front]){
      polygon([[r.left,z],[r.right,z],[r.right+r.dx,z+r.dy],[r.left+r.dx,z+r.dy]],"#dedede");
      rect(r.left,z,r.right-r.left,r.height,"#bcbcbc");
      polygon([[r.right,z],[r.right+r.dx,z+r.dy],[r.right+r.dx,z+r.height+r.dy],[r.right,z+r.height]],"#aaa");
    }
    active=g;
    const cart=el("g",{"data-lab-part":"cart"});active=cart;
    const {x:dx,y:dy}=c.depth,right=c.left+c.width;
    polygon([[c.left,c.deck],[right,c.deck],[right+dx,c.deck+dy],[c.left+dx,c.deck+dy]],"#ececec");
    polygon([[right,c.deck],[right+dx,c.deck+dy],[right+dx,c.bottom+dy],[right,c.bottom]],"#b7b7b7");
    rect(c.left,c.deck,c.width,c.bottom-c.deck,"#c8c8c8");
    const endWall=ex=>{
      polygon([[ex,c.wallTop],[ex+c.wallWidth,c.wallTop],[ex+c.wallWidth+dx,c.wallTop+dy],[ex+dx,c.wallTop+dy]],"#f4f4f4");
      polygon([[ex+c.wallWidth,c.wallTop],[ex+c.wallWidth+dx,c.wallTop+dy],[ex+c.wallWidth+dx,c.bottom+dy],[ex+c.wallWidth,c.bottom]],"#dedede");
      rect(ex,c.wallTop,c.wallWidth,c.bottom-c.wallTop,"#e6e6e6");
    };
    endWall(c.left);
    for(const b of c.loads){
      polygon([[b.x+b.w,b.y],[b.x+b.w+b.dx,b.y+b.dy],[b.x+b.w+b.dx,b.y+b.h+b.dy],[b.x+b.w,b.y+b.h]],"#b9b9b9");
      polygon([[b.x,b.y],[b.x+b.dx,b.y+b.dy],[b.x+b.w+b.dx,b.y+b.dy],[b.x+b.w,b.y]],"#f5f5f5");
      rect(b.x,b.y,b.w,b.h,"#dedede",{"data-lab-load":b.index});
      if(s.showBoxMass)text(b.x+b.w/2,b.y+b.h*.5,`${s.boxMass}g`,Math.min(b.w*.24,b.h*.34));
    }
    endWall(right-c.wallWidth);
    // Only the two near wheels are visible in the source perspective. The
    // opposite pair is occluded by the tray; invented far wheels add clutter.
    for(const p of c.wheels){
      circle(p.x,p.y,p.r,"#a7a7a7",{"data-cart-wheel":"outer"});
      circle(p.x,p.y,p.r*.78,"#d8d8d8",{"stroke-width":sw*.7});
      circle(p.x,p.y,p.r*.19,"#b5b5b5",{"stroke-width":sw*.7});
    }
    active=g;
    const gate=el("g",{"data-lab-part":"gate"});active=gate;
    const gt=a.bottom-a.height,gl=a.x-a.w/2;
    rect(gl+a.dx,gt+a.dy,a.w,a.height,"#bebebe",{"data-gate-leg":"back"});
    polygon([[gl,gt],[gl+a.dx,gt+a.dy],[gl+a.dx+a.w,gt+a.dy],[gl+a.w,gt]],"#f4f4f4");
    polygon([[gl+a.w,gt],[gl+a.w+a.dx,gt+a.dy],[gl+a.w+a.dx,gt+a.dy+a.beam],[gl+a.w,gt+a.beam]],"#ddd");
    rect(gl,gt,a.w,a.height,"#cfcfcf",{"data-gate-leg":"front"});
    active=g;
    const sensor=el("g",{"data-lab-part":"sensor"});active=sensor;
    polygon([[f.x,f.y],[f.x+f.dx,f.y+f.dy],[f.x+f.w+f.dx,f.y+f.dy],[f.x+f.w,f.y]],"#f4f4f4");
    polygon([[f.x+f.w,f.y],[f.x+f.w+f.dx,f.y+f.dy],[f.x+f.w+f.dx,f.y+f.h+f.dy],[f.x+f.w,f.y+f.h]],"#b4b4b4");
    rect(f.x,f.y,f.w,f.h,"#ddd");
    active=g;
    if(s.showReference){const rx=l.axisStart+(l.axisEnd-l.axisStart)*s.referencePosition/s.railLength;line(rx,r.front,rx+c.depth.x,r.back,dash);}
  }else if(o.kind==="transformer"){
    if(s.coilMode==="core"){
      const a=.25,b=.74,t=.16,z=.94,il=.40,ir=.59,it=.32,ib=.76,dx=.065,dy=-.095;
      // Extruded frame: outer top/right, inner left/bottom, then the front frame.
      polygon([[X(a),Y(t)],[X(b),Y(t)],[X(b+dx),Y(t+dy)],[X(a+dx),Y(t+dy)]],"#e5e5e5");
      polygon([[X(b),Y(t)],[X(b+dx),Y(t+dy)],[X(b+dx),Y(z+dy)],[X(b),Y(z)]],"#9f9f9f");
      polygon([[X(il),Y(it)],[X(il+dx),Y(it+dy)],[X(il+dx),Y(ib+dy)],[X(il),Y(ib)]],"#999");
      polygon([[X(il),Y(ib)],[X(ir),Y(ib)],[X(ir+dx),Y(ib+dy)],[X(il+dx),Y(ib+dy)]],"#e2e2e2");
      path(`M ${X(a)} ${Y(t)} H ${X(b)} V ${Y(z)} H ${X(a)} Z M ${X(il)} ${Y(it)} V ${Y(ib)} H ${X(ir)} V ${Y(it)} Z`,"#c7c7c7",{"fill-rule":"evenodd","data-lab-part":"core"});
      for(const [side,edge,n,key]of [[a,il,s.primaryTurns,"primary"],[ir,b,s.secondaryTurns,"secondary"]]){
        const pitch=h*.33/Math.max(1,n-1),curl=Math.min(pitch*.22,h*.010),wire=Math.min(sw,pitch*.32);
        const coil=el("g",{"data-lab-part":key,"data-turn-count":n});active=coil;
        // The visible diagonal follows the side face and terminates on the
        // back edge of the same core leg. No curve goes across the open window.
        for(let i=0;i<n;i++){
          // Both front and back ends stay below the inner opening's top edge.
          const py=Y(.43+.33*i/Math.max(1,n-1));
          path(`M ${X(side)} ${py-curl} Q ${X(side)-w*.007} ${py-curl} ${X(side)} ${py} H ${X(edge)} Q ${X(edge)+w*.004} ${py} ${X(edge)+w*.006} ${py-curl} L ${X(edge+dx)} ${py+h*dy} Q ${X(edge+dx)+w*.004} ${py+h*dy-curl} ${X(edge+dx)} ${py+h*dy-curl}`,"none",{"stroke-width":wire});
        }
        active=g;
      }
      // Leads are attached to actual first/last turns; circuitry stays a separate
      // simple loop, matching the existing transformer preset scope.
      const first=Y(.43),last=Y(s.primaryTurns===1?.43:.76);
      line(X(a),first,X(.105),first);line(X(.105),first,X(.105),last);line(X(.105),last,X(a),last);
      circle(X(.105),Y(.555),Math.min(w,h)*.045,"white");
      path(`M ${X(.082)} ${Y(.555)} Q ${X(.094)} ${Y(.52)} ${X(.105)} ${Y(.555)} Q ${X(.116)} ${Y(.59)} ${X(.128)} ${Y(.555)}`);
      const sf=Y(.43+dy),sl=Y((s.secondaryTurns===1?.43:.76)+dy);
      line(X(b+dx),sf,X(.945),sf);line(X(.945),sf,X(.945),sl);line(X(.945),sl,X(b+dx),sl);
    }else{
      for(const [cx,n,key]of [[.30,s.primaryTurns,"primary"],[.68,s.secondaryTurns,"secondary"]]){
        const coil=el("g",{"data-lab-part":key,"data-turn-count":n});active=coil;
        const pitch=w*.23/Math.max(1,n-1),wire=Math.min(sw,pitch*.36);
        ellipse(X(cx-.12),Y(.46),w*.027,h*.19,"#ddd");
        rect(X(cx-.12),Y(.27),w*.24,h*.38,"#ededed",{stroke:"none"});
        for(let i=0;i<n;i++)ellipse(X(cx-.115+.23*i/Math.max(1,n-1)),Y(.46),w*.027,h*.19,"none",{"stroke-width":wire});
        line(X(cx-.12),Y(.46),X(cx-.12),Y(.82));line(X(cx+.12),Y(.46),X(cx+.12),Y(.82));active=g;
      }
    }
  }else if(o.kind==="pendulum_rig"){
    drawSourcePendulum(g,o,sw,color);
  }else if(o.kind==="spring_balance"){
    const {cx,bw,top,ch,bot,end,weightTop,each}=l;
    line(X(.17),Y(.04),X(.83),Y(.04),{"stroke-width":sw*3});line(cx,Y(.04),cx,top-h*.041);
    ellipse(cx,top-h*.031,bw*.11,h*.011,"none");
    path(`M ${cx-bw*.23} ${top-h*.014} Q ${cx-bw*.23} ${top-h*.029} ${cx} ${top-h*.029} Q ${cx+bw*.23} ${top-h*.029} ${cx+bw*.23} ${top-h*.014}`,"#ddd");
    rect(cx-bw*.55,top-h*.013,bw*1.1,h*.013,"#e2e2e2");
    rect(cx-bw/2,top,bw,ch,"#f7f7f7",{"data-lab-part":"housing"});
    // Recessed measuring slot, rounded ends and fine/major graduations.
    const slotX=cx-bw*.32,slotW=bw*.23,slotTop=top+ch*.045,slotH=ch*.91;
    rect(slotX,slotTop,slotW,slotH,"#ddd",{rx:slotW*.35,"stroke-width":sw*.7});
    for(let i=0;i<=40;i++){
      const py=top+ch*.08+ch*.84*i/40,major=i%10===0;
      line(slotX-slotW*.25,py,slotX+slotW*(major?.65:.25),py,{"stroke-width":sw*.55});
      if(i%20===0)text(cx+bw*.15,py,Number((s.scaleMax*i/40).toFixed(2)),Math.min(bw*.24,h*.033),{"font-family":"Times New Roman, serif"});
    }
    const pointer=top+ch*(.08+.84*s.reading/s.scaleMax);
    polygon([[slotX+slotW*.88,pointer],[slotX+slotW*.3,pointer-h*.0035],[slotX+slotW*.3,pointer+h*.0035]],color,{stroke:"none"});
    line(slotX+slotW,pointer,cx+bw*.34,pointer,{"stroke-width":sw*.6});
    rect(cx-bw*.55,bot,bw*1.1,h*.013,"#ddd");
    rect(cx-bw*.44,bot+h*.013,bw*.88,Math.max(0,end-bot-h*.013),"#c4c4c4",{"data-lab-part":"extension"});
    rect(cx-bw*.57,end,bw*1.14,h*.012,"#eee");
    path(`M ${cx} ${end+h*.012} v ${h*.012} c ${bw*.42} ${-h*.009} ${bw*.43} ${h*.022} ${bw*.05} ${h*.024} q ${-bw*.16} ${h*.001} ${-bw*.16} ${-h*.012}`);
    for(let i=0;i<s.weightCount;i++){
      const py=weightTop+i*each;line(cx,i===0?end+h*.047:py-each*.16,cx,py-each*.05);mass(cx,py,bw*.95*s.weightSize/100,each*.74);
    }
  }else if(o.kind==="scale"){
    // Low, nearly rectangular face; the source's display dominates the front.
    path(`M ${X(.085)} ${Y(.43)} Q ${X(.085)} ${Y(.38)} ${X(.16)} ${Y(.36)} H ${X(.82)} Q ${X(.94)} ${Y(.36)} ${X(.94)} ${Y(.44)} V ${Y(.82)} Q ${X(.94)} ${Y(.91)} ${X(.83)} ${Y(.91)} H ${X(.16)} Q ${X(.06)} ${Y(.91)} ${X(.06)} ${Y(.82)} V ${Y(.48)} Z`,"#bbb");
    path(`M ${X(.08)} ${Y(.46)} Q ${X(.08)} ${Y(.40)} ${X(.15)} ${Y(.40)} H ${X(.81)} Q ${X(.91)} ${Y(.40)} ${X(.91)} ${Y(.46)} V ${Y(.80)} Q ${X(.91)} ${Y(.86)} ${X(.82)} ${Y(.86)} H ${X(.15)} Q ${X(.08)} ${Y(.86)} ${X(.08)} ${Y(.80)} Z`,"#f0f0f0");
    polygon([[X(.16),Y(.34)],[X(.82),Y(.34)],[X(.87),Y(.38)],[X(.13),Y(.38)]],"#ccc");
    rect(X(.16),Y(.25),w*.66,h*.09,"#eee");line(X(.16),Y(.29),X(.82),Y(.29),{"stroke-width":sw*.55});
    rect(X(.13),Y(.47),w*.60,h*.32,"#c4c4c4",{rx:h*.022});rect(X(.145),Y(.49),w*.57,h*.28,"#fff",{rx:h*.016});
    text(X(.43),Y(.635),s.displayText,Math.min(h*.235,w*.51/Math.max(4,s.displayText.length)*1.5),{"font-family":"Times New Roman, serif","data-scale-reading":"true"});
    for(const by of [.53,.735]){circle(X(.815),Y(by),Math.min(w*.034,h*.052),"#ddd");circle(X(.815),Y(by),Math.min(w*.027,h*.041),"#fff",{"stroke-width":sw*.6});}
    rect(X(.14),Y(.91),w*.12,h*.018,"#666");rect(X(.75),Y(.91),w*.12,h*.018,"#666");
  }else if(o.kind==="piston_gas"){
    // The original is a planar cross section. Preserve that convention.
    path(`M ${X(.10)} ${Y(.05)} V ${Y(.97)} H ${X(.90)} V ${Y(.05)} H ${X(.86)} V ${Y(.93)} H ${X(.14)} V ${Y(.05)} Z`,"#c8c8c8",{"data-lab-part":"cylinder"});
    line(X(.12),Y(.05),X(.12),Y(.945),{"stroke-width":sw*.5,stroke:"#888"});line(X(.12),Y(.945),X(.88),Y(.945),{"stroke-width":sw*.5,stroke:"#888"});
    rect(X(.14),l.top-h*.033,w*.72,h*.033,"#555",{"data-piston-top":l.top});
    line(X(.15),l.top-h*.031,X(.85),l.top-h*.031,{stroke:"#bcbcbc","stroke-width":sw*.65});
    for(const [i,p]of l.particles.entries()){
      if(s.motionMode==="trails")line(p.x-Math.cos(p.angle)*p.length,p.y-Math.sin(p.angle)*p.length,p.x,p.y,{"stroke-width":sw*.65});
      circle(p.x,p.y,p.r,"white",{"data-gas-particle":i,"stroke-width":sw*.65});
      if(s.motionMode==="arrows"){
        const ax=p.x+Math.cos(p.angle)*(p.r+p.length),ay=p.y+Math.sin(p.angle)*(p.r+p.length);
        line(p.x+Math.cos(p.angle)*p.r,p.y+Math.sin(p.angle)*p.r,ax,ay,{"stroke-width":sw*.6});arrow(ax,ay,Math.cos(p.angle),Math.sin(p.angle),Math.min(p.length*.42,p.r*1.6));
      }
    }
  }else if(o.kind==="metal_ring"){
    const c=labRingCenter(o),r=Math.min(w,h)/2,a=s.startAngle*Math.PI/180,b=(s.startAngle+s.closedAngle)*Math.PI/180;
    const p={x:c.x+r*Math.cos(a),y:c.y-r*Math.sin(a)},q={x:c.x+r*Math.cos(b),y:c.y-r*Math.sin(b)};
    if(s.closedAngle===360)circle(c.x,c.y,r,"none");
    else path(`M ${c.x} ${c.y} L ${p.x} ${p.y} A ${r} ${r} 0 ${s.closedAngle>180?1:0} 0 ${q.x} ${q.y} Z`);
  }else if(o.kind==="circular_motion"){
    const c=l.orbit,p=l.pivot,b=l.bob;
    if(s.showOrbit){
      ellipse(c.x,c.y,c.rx,c.ry,"none",{...dash,"data-orbit-line":"true"});
      const a=.73,ax=c.x+c.rx*Math.cos(a),ay=c.y+c.ry*Math.sin(a),sign=s.orbitDirection==="cw"?1:-1;
      arrow(ax,ay,-c.rx*Math.sin(a)*sign,c.ry*Math.cos(a)*sign,Math.min(w,h)*.029);
    }
    if(s.showGuides){
      line(p.x,p.y,c.x,c.y,dash);line(c.x,c.y,b.x,b.y,dash);
      const r=h*.11,v={x:b.x-p.x,y:b.y-p.y},len=Math.hypot(v.x,v.y);
      path(`M ${p.x} ${p.y+r} A ${r} ${r} 0 0 1 ${p.x+v.x/len*r} ${p.y+v.y/len*r}`);
      text(p.x-w*.074,p.y+h*.13,`${s.angle}°`,Math.min(w,h)*.047);
      // Right-angle mark at the projected radius/vertical intersection.
      const vx=(b.x-c.x)/Math.hypot(b.x-c.x,b.y-c.y),vy=(b.y-c.y)/Math.hypot(b.x-c.x,b.y-c.y),d=h*.023;
      path(`M ${c.x} ${c.y-d} l ${vx*d} ${vy*d} v ${d}`);
    }
    rect(p.x-w*.009,p.y,w*.018,l.tubeEnd-p.y,gradient("tube"),{"data-lab-part":"tube"});
    ellipse(p.x,p.y,w*.009,h*.002,"#aaa");line(p.x,p.y,p.x,l.massTop-h*.013);
    line(p.x,p.y,b.x,b.y);
    // Tilted rubber stopper: a cylinder on the string axis, not a generic dot.
    const v={x:b.x-p.x,y:b.y-p.y},len=Math.hypot(v.x,v.y),d={x:v.x/len,y:v.y/len},n={x:-d.y,y:d.x},r=Math.min(w,h)*.035,depth=r*1.15;
    const P=(a,z)=>[b.x+n.x*a+d.x*z,b.y+n.y*a+d.y*z];
    polygon([P(-r,-depth/2),P(r,-depth/2),P(r,depth/2),P(-r,depth/2)],"#888",{"data-lab-part":"stopper"});
    const capAngle=Math.atan2(n.y,n.x)*180/Math.PI;
    for(const [z,fill]of [[depth/2,"#777"],[-depth/2,"#bbb"]]){const [cx,cy]=P(0,z);ellipse(cx,cy,r,r*.24,fill,{transform:`rotate(${capAngle} ${cx} ${cy})`,"stroke-width":sw*.65});}
    line(...P(-r*.5,-depth/2),...P(-r*.5,depth/2),{stroke:"#bcbcbc","stroke-width":sw*.7});
    mass(p.x,l.massTop,w*.075,h*.084);
    if(s.showMass){text(b.x-w*.035,b.y+h*.06,`${s.upperMass} g`,Math.min(w,h)*.042);text(p.x+w*.14,l.massTop+h*.043,`${s.lowerMass} g`,Math.min(w,h)*.042);}
  }
  return true;
}

// Editing overlays have constant pixel sizes and never enter renderObject/export.
export function renderLabApparatusHandles(o,scene,scale,tool="V"){
  if(o.locked)return;
  const group=document.createElementNS(SVG_NS,"g");group.setAttribute("data-ui","lab-apparatus-handles");scene.appendChild(group);
  const el=(tag,a)=>{const n=document.createElementNS(SVG_NS,tag);for(const[k,v]of Object.entries(a))n.setAttribute(k,v);group.appendChild(n);return n;};
  const k=1/Math.max(.001,scale),b=labBBox(o);
  for(const [key,px,py]of [["nw",b.x,b.y],["n",b.x+b.w/2,b.y],["ne",b.x+b.w,b.y],["e",b.x+b.w,b.y+b.h/2],["se",b.x+b.w,b.y+b.h],["s",b.x+b.w/2,b.y+b.h],["sw",b.x,b.y+b.h],["w",b.x,b.y+b.h/2]]){
    const rotating=tool==="rotate"&&key.length===2;
    const p=labWorldPoint(o,{x:px,y:py}),base={"data-id":o.id,"data-handle":"lab-size-"+key,"data-lab-handle":(rotating?"rotate-":"size-")+key};
    el("rect",{...base,x:p.x-7*k,y:p.y-7*k,width:14*k,height:14*k,fill:"transparent"});
    const n=el("rect",{...base,x:p.x-3.5*k,y:p.y-3.5*k,width:7*k,height:7*k,fill:"white",stroke:SELECTION_COLOR,"stroke-width":1,"vector-effect":"non-scaling-stroke",tabindex:0,role:"button","aria-label":(rotating?"전체 회전 ":"전체 크기 조절 ")+key});n.style.cursor=key.length===1?(key==="e"||key==="w"?"ew-resize":"ns-resize"):(key==="nw"||key==="se"?"nwse-resize":"nesw-resize");
  }
  if(o.kind==="metal_ring"){
    const c=labRingCenter(o);el("circle",{cx:c.x,cy:c.y,r:2.7*k,fill:SELECTION_COLOR,"pointer-events":"none"});
    el("line",{x1:c.x-6*k,y1:c.y,x2:c.x+6*k,y2:c.y,stroke:SELECTION_COLOR,"stroke-width":.8,"vector-effect":"non-scaling-stroke","pointer-events":"none"});
    el("line",{x1:c.x,y1:c.y-6*k,x2:c.x,y2:c.y+6*k,stroke:SELECTION_COLOR,"stroke-width":.8,"vector-effect":"non-scaling-stroke","pointer-events":"none"});
  }
  const placed=[];
  for(const handle of tool==="V"?labHandles(o):[]){
    let local={x:handle.x,y:handle.y};
    if(handle.key==="bobSize")local.x=labLayout(o).bob.x+Math.max(labLayout(o).bobRadius,23*k);
    let p=labWorldPoint(o,local);
    if(o.kind==="metal_ring"){
      const center=labRingCenter(o),a=Math.atan2(p.y-center.y,p.x-center.x);
      for(let i=0;i<12&&placed.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<23*k);i++)p={x:p.x+Math.cos(a)*12*k,y:p.y+Math.sin(a)*12*k};
    }
    const original=labWorldPoint(o,handle);
    if(Math.hypot(p.x-original.x,p.y-original.y)>k)el("line",{x1:original.x,y1:original.y,x2:p.x,y2:p.y,stroke:SELECTION_COLOR,"stroke-width":.8,"vector-effect":"non-scaling-stroke","pointer-events":"none"});
    placed.push(p);
    const base={cx:p.x,cy:p.y,"data-id":o.id,"data-handle":"lab-part","data-lab-handle":handle.key};
    el("circle",{...base,r:(handle.small?7:10)*k,fill:"transparent"});
    const n=el("circle",{...base,r:(handle.small?3.8:5.3)*k,fill:handle.small?"#e8f1ff":"white",stroke:SELECTION_COLOR,"stroke-width":1.6,"vector-effect":"non-scaling-stroke",tabindex:0,role:"slider","aria-label":handle.label,"aria-valuenow":handle.value??labSettings(o)[handle.key]??labSettings(o).angle});
    n.style.cursor=handle.cursor||"move";const title=document.createElementNS(SVG_NS,"title");title.textContent=handle.label+" · 드래그 / 방향키";n.appendChild(title);
  }
}
