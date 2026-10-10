"""Bounded raster measurements; recommendations are design decisions, not KICE specifications."""
import json, pathlib, hashlib, argparse
import numpy as np
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];output=root/args.output;output.mkdir(parents=True,exist_ok=True)
ids=['p1_2024_06_17','p1_2026_06_14','p1_2025_06_10','p1_2024_06_08','p2_2021_09_03'];records=[]
for id in ids:
 folder=root/'outputs/graph-restoration-20261008/live'/id;plan=json.loads((folder/'plan.json').read_text());source=folder/'source.png';gray=np.asarray(Image.open(source).convert('L'),dtype=float);dark=np.clip((255-gray)/255,0,1);ink=gray<140;b=plan['source']['plotBox'];x,y,w,h=(b[k] for k in ['x','y','w','h']);bottom=int(round(y+h));right=int(round(x+w));
 # Locate the vertical shaft in a narrow window: repeated vertical ink wins over curve crossings.
 top=int(y+h*.2);bot=int(y+h*.8);columns=range(max(0,int(x)-3),min(ink.shape[1],int(x)+4));center=max(columns,key=lambda c:ink[top:bot,c].sum());masses=[]
 for row in range(top,bot):
  mass=float(dark[row,max(0,center-3):center+4].sum())
  if .4<mass<4:masses.append(mass)
 shaft=float(np.median(masses));
 # The numeral at the origin is isolated below/left of the axis; includes no other caption.
 roi=[max(0,int(x-w*.10)),bottom+2,max(0,int(x-2)),min(ink.shape[0],bottom+int(h*.20))];a=ink[roi[1]:roi[3],roi[0]:roi[2]];rows=np.flatnonzero(a.any(axis=1));height=int(rows[-1]-rows[0]+1) if len(rows) else None
 r=int(min(18,max(7,w*.04)));spans=[]
 for col in range(max(0,right-int(w*.14)),min(ink.shape[1],right+8)):
  pixels=np.flatnonzero(ink[max(0,bottom-r):min(ink.shape[0],bottom+r+1),col])+max(0,bottom-r)
  if len(pixels) and abs((pixels[0]+pixels[-1])/2-bottom)<=2 and np.any(abs(pixels-bottom)<=2):spans.append((col,int(pixels[-1]-pixels[0]+1)))
 peak=max((v for _,v in spans),default=0);thick=[c for c,v in spans if v>max(3,shaft*1.8)];tail=[c for c,v in spans if c<=right+7]
 length=(max(tail)-min(thick)+1) if thick and tail else None
 record={'id':id,'source':str(source.relative_to(root)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'plotBoxFromPriorObservation':b,'axisShaftInkPx':round(shaft,3),'originGlyphHeightPx':height,'originROI':roi,'headLengthPx':length,'headWidthPx':peak,'ratios':{'labelHeightToAxis':round(height/shaft,2) if height else None,'headLengthToAxis':round(length/shaft,2) if length else None,'headWidthToLength':round(peak/length,3) if length else None}}
 records.append(record)
report={'method':'Five local KICE reference rasters. Shaft: median grayscale ink coverage across repeated rows near observed axis. Origin: ink bounds in the recorded ROI. Head: symmetric cross-sections near x-axis tip. Pixel resolution, antialiasing and prior plot boxes limit precision. No generated-plan font sizes are treated as measurements.','notAnOfficialKiceSpecification':True,'cases':records,'recommendedAt70mm':{'axis':.3,'curve':.5,'guide':.15,'tick':.24,'tickLength':1.2,'arrowLength':3.6,'arrowWidthApprox':2.28,'visibleLabelHeight':4.8,'markerRadius':.7,'guideDash':.8,'guideGap':.6},'decision':'One stable editable compromise selected from these examples; 50 mm default plot width, 50–70 mm suggested range; 90 mm exceeds the 100 mm whole-figure guide in the P/Q example, 35 mm small-size stress test. Actual physical paper print was not performed.'}
(output/'source-measurements.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps([{**{'id':r['id']},**r['ratios']} for r in records],ensure_ascii=False))
