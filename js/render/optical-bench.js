/* Oblique exam apparatus, drawn from complete geometry at every setting.
 * Reference: p2_2027_09_02 (laser/double slit) and p2_2025_09_12 (lens bench).
 * The rail is drawn first; slider/stand/body is one translated component.
 */
import { SVG_NS } from "./core.js?v=1.7.0-four-session-integration";
import { opticalBenchLayout, opticalBenchWorldPoint } from "../optical-bench.js?v=1.7.0-four-session-integration";
import { SELECTION_COLOR } from "../selection-visuals.js?v=1.7.0-four-session-integration";

function el(g,tag,attrs) {
  const n=document.createElementNS(SVG_NS,tag);
  for(const [key,value] of Object.entries(attrs)) n.setAttribute(key,value);
  g.appendChild(n);return n;
}
export function drawOpticalBench(g,o,sw,color) {
  const {x,y,w,h,parts,settings}=opticalBenchLayout(o);
  const X=t=>x+w*t, Y=t=>y+h*t;
  const attrs={stroke:color,"stroke-width":sw,"stroke-linejoin":"round","stroke-linecap":"round"};
  const polygon=(parent,points,fill="white")=>el(parent,"polygon",{points:points.map(p=>p.join(",")).join(" "),fill,...attrs});
  const line=(parent,x1,y1,x2,y2)=>el(parent,"line",{x1,y1,x2,y2,...attrs});
  const rail=el(g,"g",{"data-bench-rail":"true"});
  polygon(rail,[[X(.016),Y(.68)],[X(.94),Y(.68)],[X(.984),Y(.92)],[X(.06),Y(.92)]],"#fff");
  polygon(rail,[[X(.06),Y(.92)],[X(.984),Y(.92)],[X(.984),Y(.976)],[X(.06),Y(.976)]],"#d9d9d9");
  polygon(rail,[[X(.016),Y(.68)],[X(.06),Y(.92)],[X(.06),Y(.976)],[X(.016),Y(.736)]],"#bcbcbc");
  for(const p of [...parts].sort((a,b)=>a.x-b.x)) {
    const unit=el(g,"g",{"data-bench-part":p.id,"data-bench-position":p.position});
    const ax=p.x;
    // Footprint on the SAME rail plane. The front locking screw stays attached.
    polygon(unit,[[ax-w*.023,Y(.92)],[ax+w*.023,Y(.92)],[ax-w*.021,Y(.68)],[ax-w*.067,Y(.68)]],"#ededed");
    polygon(unit,[[ax-w*.023,Y(.92)],[ax+w*.023,Y(.92)],[ax+w*.023,Y(.976)],[ax-w*.023,Y(.976)]],"#bdbdbd");
    el(unit,"circle",{cx:ax,cy:Y(.946),r:Math.min(w*.005,h*.017),fill:"#fff",...attrs});
    if(p.id==="source") {
      // A rod joins the box to its own slider, never to a fixed canvas point.
      polygon(unit,[[ax-w*.027,Y(.81)],[ax-w*.019,Y(.81)],[ax-w*.019,Y(.56)],[ax-w*.027,Y(.56)]],"#ddd");
      const lens=settings.benchMode==="lens";
      const bx=ax-w*.032, by=Y(lens?.19:.52), bw=w*(lens?.020:.085), bh=h*(lens?.40:.09), dx=-w*(lens?.017:.044),dy=-h*(lens?.07:.13);
      polygon(unit,[[bx,by],[bx+bw,by],[bx+bw,by+bh],[bx,by+bh]],"#f6f6f6");
      polygon(unit,[[bx,by],[bx+dx,by+dy],[bx+bw+dx,by+dy],[bx+bw,by]],"#fff");
      polygon(unit,[[bx,by],[bx+dx,by+dy],[bx+dx,by+dy+bh],[bx,by+bh]],"#dedede");
    } else if(p.id==="element" && settings.benchMode==="lens") {
      polygon(unit,[[ax-w*.027,Y(.81)],[ax-w*.019,Y(.81)],[ax-w*.019,Y(.43)],[ax-w*.027,Y(.43)]],"#ddd");
      el(unit,"ellipse",{cx:ax-w*.023,cy:Y(.345),rx:w*.022,ry:h*.225,fill:"#c6c6c6",...attrs});
      el(unit,"ellipse",{cx:ax-w*.027,cy:Y(.339),rx:w*.018,ry:h*.224,fill:"#fff",...attrs});
    } else if(p.id==="element") {
      polygon(unit,[[ax-w*.027,Y(.81)],[ax-w*.020,Y(.81)],[ax-w*.020,Y(.45)],[ax-w*.027,Y(.45)]],"#ddd");
      // Panel coordinates form a vertical plane parallel to the screen.
      const fx=ax-w*.007, fy=Y(.63), dx=-w*.043,dy=-h*.205,ph=h*.37;
      const P=(t,v)=>[fx+dx*t,fy+dy*t-ph*v];
      const panel=[P(0,0),P(1,0),P(1,1),P(0,1)];
      const defs=el(unit,"defs",{}), id=`bench-${o.id || "icon"}-slit`.replace(/[^a-zA-Z0-9_-]/g,"_");
      const mask=el(defs,"mask",{id,maskUnits:"userSpaceOnUse",x:ax-w*.08,y:Y(.02),width:w*.12,height:h*.7});
      el(mask,"polygon",{points:panel.map(v=>v.join(",")).join(" "),fill:"white"});
      for(const t of [.30,.66]) {
        const aperture=[P(t-.07,.19),P(t+.07,.19),P(t+.07,.77),P(t-.07,.77)];
        el(mask,"polygon",{points:aperture.map(v=>v.join(",")).join(" "),fill:"black"});
      }
      el(unit,"polygon",{points:panel.map(v=>v.join(",")).join(" "),fill:"#e6e6e6",mask:`url(#${id})`,...attrs});
      for(const t of [.30,.66]) polygon(unit,[P(t-.07,.19),P(t+.07,.19),P(t+.07,.77),P(t-.07,.77)],"none");
      line(unit,...P(0,0),...P(0,1));
    } else {
      // Back supports are occluded by the front panel, exactly as in the source.
      polygon(unit,[[ax-w*.036,Y(.79)],[ax-w*.028,Y(.79)],[ax-w*.028,Y(.60)],[ax-w*.036,Y(.60)]],"#ccc");
      const fx=ax+w*.040, fy=Y(.94), dx=-w*.11,dy=-h*.41,ph=h*.47;
      const face=[[fx,fy],[fx+dx,fy+dy],[fx+dx,fy+dy-ph],[fx,fy-ph]];
      polygon(unit,face,"#ececec");
      polygon(unit,[[fx,fy],[fx+w*.004,fy-h*.012],[fx+w*.004,fy-ph-h*.012],[fx,fy-ph]],"#b5b5b5");
    }
  }
}

export function renderOpticalBenchHandles(o,scene,scale) {
  const group=el(scene,"g",{"data-ui":"optical-bench-handles"});
  const radius=5/Math.max(.001,scale), hitRadius=10/Math.max(.001,scale);
  for(const part of opticalBenchLayout(o).parts) {
    const p=opticalBenchWorldPoint(o,{x:part.x,y:o.y+o.h*.946});
    const shared={cx:p.x,cy:p.y,"data-bench-handle":part.prop,"data-id":o.id};
    el(group,"circle",{...shared,r:hitRadius,fill:"transparent","data-handle":"bench-part"});
    const c=el(group,"circle",{...shared,r:radius,fill:"#fff",stroke:SELECTION_COLOR,"stroke-width":1.5,"vector-effect":"non-scaling-stroke","data-handle":"bench-part",tabindex:0,role:"slider","aria-label":part.label+" 레일 위치","aria-valuemin":0,"aria-valuemax":opticalBenchLayout(o).settings.railLength,"aria-valuenow":part.position});
    c.style.cursor="ew-resize";
    const title=el(c,"title",{});title.textContent=part.label+" 위치: 드래그 또는 방향키";
  }
}
