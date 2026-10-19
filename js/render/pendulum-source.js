import { SVG_NS } from "./core.js?v=1.7.0-four-session-integration";
import { PENDULUM_REFERENCE } from "../pendulum-reference.js?v=1.7.0-four-session-integration";
import { labLayout, labSettings } from "../lab-apparatus.js?v=1.7.0-four-session-integration";

// Fixed outlines are the source's traced contours. Only anchors and conditions
// move; no generic replacement is used for the head, stand, scale or sphere.
export function drawSourcePendulum(g,o,sw,color){
  const r=PENDULUM_REFERENCE,l=labLayout(o),s=labSettings(o),k=l.sourceScale,p=l.pivot,b=l.bob;
  const el=(tag,attrs,parent=g)=>{const n=document.createElementNS(SVG_NS,tag);for(const[key,v]of Object.entries(attrs))n.setAttribute(key,v);parent.appendChild(n);return n;};
  const stroke={fill:"none",stroke:color,"stroke-width":2.6*k*sw/.2,"stroke-linecap":"butt","stroke-linejoin":"round"};
  const line=(x1,y1,x2,y2,extra={})=>el("line",{x1,y1,x2,y2,...stroke,...extra});
  const part=(name,anchor,at,sx=k,sy=sx,partName=name,parent=g)=>{
    const data=r.parts[name],group=el("g",{"data-lab-part":partName,"data-source-part":name,transform:`translate(${at.x} ${at.y}) scale(${sx} ${sy}) translate(${data.bbox[0]-anchor[0]} ${data.bbox[1]-anchor[1]})`},parent);
    for(const attrs of data.paths){const shade=parseInt(attrs.fill?.slice(1,3)||"ff",16);el("path",{...attrs,...(shade===0?{fill:color}:{} )},group);}return group;
  };
  const ray=(name,referenceAngle,angle,f)=>{
    const a=referenceAngle*Math.PI/180,d={x:Math.sin(a),y:Math.cos(a)},n={x:Math.cos(a),y:-Math.sin(a)},delta=-(angle-referenceAngle)*Math.PI/180,c=Math.cos(delta),sn=Math.sin(delta);
    const xx=n.x*n.x+f*d.x*d.x,xy=n.x*n.y+f*d.x*d.y,yy=n.y*n.y+f*d.y*d.y;
    const A=c*xx-sn*xy,B=sn*xx+c*xy,C=c*xy-sn*yy,D=sn*xy+c*yy;
    const layer=el("g",{transform:`matrix(${k*A} ${k*B} ${k*C} ${k*D} ${p.x-k*(A*r.pivot[0]+C*r.pivot[1])} ${p.y-k*(B*r.pivot[0]+D*r.pivot[1])})`});
    part(name,[0,0],{x:0,y:0},1,1,name,layer);
  };
  // Keep the panel attached to the post when its height changes, independently
  // of the string. Source pixels confirm that the panel covers the post.
  const rodBottom=l.base+(886-r.base[1])*k;
  const rodTop=p.y-Math.max(0,s.standHeight-90)*l.unit;
  part("stem",[370,146],{x:p.x+(370-r.pivot[0])*k,y:rodTop},k,Math.max(k*.01,(rodBottom-rodTop)/740),"stand");
  // Reference rays sit behind the opaque graduated band in the PDF.
  if(s.showGuides){
    if(s.stringLength===67.78&&s.angle===4.85&&s.pivotHeight===85&&s.standHeight===90){ray("vertical-guide-ray",0,0,1);ray("left-guide-ray",-4.85,-s.angle,1);}
    else {
      // The reference ray crosses a shaded post. Once moved off that post,
      // draw the isolated dash geometry instead of carrying its shaded pixels.
      const dash={"stroke-dasharray":`${14*k} ${10*k}`};
      line(p.x,p.y,l.verticalBob.x,l.verticalBob.y-l.bobRadius,dash);
      const vx=l.leftBob.x-p.x,vy=l.leftBob.y-p.y,d=Math.hypot(vx,vy),f=Math.max(0,1-l.bobRadius/d);
      line(p.x,p.y,p.x+vx*f,p.y+vy*f,dash);
    }
  }
  part("band",r.bandCenter,l.bandCenter,k,k,"protractor");
  part("head",r.pivot,p,k,k,"pivot-clamp");
  part("base",r.base,{x:p.x,y:l.base},k*s.standWidth/30,k,"stand-base");
  const refLength=67.78,len=s.stringLength*l.stringUnit,a=s.angle*Math.PI/180;
  const refBob=l.verticalBob;
  if(s.showGuides){
    part("left-guide-bob",[325.5,744],l.leftBob,k*s.bobSize/5.76);
    part("vertical-guide-bob",[379,749],refBob,k*s.bobSize/5.76);
    part("reference-dot",[379,749],refBob);
    const rr=318*k*s.stringLength/refLength,end=l.markerEnd;
    if(Math.abs(s.angle-4.85)<.001)part("angle-mark",r.pivot,p,k,k*s.stringLength/refLength);
    else if(Math.abs(s.angle)>.001)el("path",{d:`M ${p.x} ${p.y+rr} A ${rr} ${rr} 0 0 ${a>0?0:1} ${end.x} ${end.y}`,...stroke});
    if(s.showLabels){
      part("angle-leader",[405,464],end);
      const labelAt={x:end.x+(468.5-405)*k,y:end.y+(539.5-464)*k};
      if(s.angleLabel==="θ₀")part("angle-label",[468.5,539.5],labelAt);
      else text(labelAt,s.angleLabel,58*k,"Times New Roman, serif");
    }
  }
  if(s.showLabels){
    const dimX=p.x+(46-r.pivot[0])*k,top=p.y,bottom=refBob.y,labelY=top+(453-146)/(749-146)*(bottom-top);
    part("dimension-top",r.pivot,p);part("dimension-bottom",[379,749],refBob);
    part("arrow-top",[46,146],{x:dimX,y:top});part("arrow-bottom",[46,749],{x:dimX,y:bottom});
    part("dimension-upper-shaft",[46,176],{x:dimX,y:top+30*k},k,Math.max(k*.01,(labelY-42*k-top-30*k)/235));
    part("dimension-lower-shaft",[46,493],{x:dimX,y:labelY+40*k},k,Math.max(k*.01,(bottom-17*k-labelY-40*k)/239));
    if(s.lengthLabel==="L")part("length-label",[46,453],{x:dimX,y:labelY});
    else text({x:dimX,y:labelY},s.lengthLabel,65*k,"Times New Roman, serif");
  }
  // The measured ray meets the original eccentric attachment on the sphere.
  const referenceRay=s.angle===4.85&&s.stringLength===refLength&&s.bobSize===5.76&&s.showGuides&&s.showLabels;
  if(referenceRay)ray("main-ray",4.85,s.angle,s.stringLength/refLength);
  else line(p.x,p.y,p.x+len*Math.sin(a),p.y+len*Math.cos(a));
  // The source ray ends inside its reference sphere. Continue it underneath
  // the sphere so shrinking the sphere never leaves a disconnected string.
  if(referenceRay)line(p.x+len*.957*Math.sin(a),p.y+len*.957*Math.cos(a),p.x+len*Math.sin(a),p.y+len*Math.cos(a));
  part("bob",r.bobCenter,b,k*s.bobSize/5.76);
  if(s.showLabels){
    part("bob-leader",r.bobCenter,b);
    if(s.bobLabel==="추")part("bob-label",[432,744],b);
    else text({x:b.x+92*k,y:b.y+49*k},s.bobLabel,65*k,"AppleMyungjo, serif");
  }
  function text(at,value,size,font){const n=el("text",{x:at.x,y:at.y,fill:color,"font-size":size,"font-family":font,"text-anchor":"middle","dominant-baseline":"middle"});n.textContent=value;}
}
