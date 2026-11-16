"""Prepare untouched publisher/education-office graph crops; never call AI.
Requires the retained official PDFs and Poppler. Gold expectations are separate.
"""
import argparse, base64, hashlib, json, re, shutil, subprocess
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs/graph-stability-20261007'
PUBLISHER = 'https://text.tsherpa.co.kr/mid/book.html?bookcode=text-mid-science-lss'
TEXTBOOK_PREVIEW = 'https://text.tsherpa.co.kr/modal/preview_file.html?filePath=%2F00_%EA%B5%90%EA%B3%BC%EC%84%9C%ED%99%8D%EB%B3%B4%EA%B4%80_%EC%A4%91%ED%95%99%2F%EA%B5%90%EA%B3%BC%EC%84%9CPDF%2F05_%EA%B3%BC%ED%95%99%2F%EC%B2%9C%EC%9E%AC_%EC%A4%91%ED%95%99_%EA%B3%BC%ED%95%992%28%EC%9E%84%EC%84%B1%EC%88%99%29_%EA%B5%90%EA%B3%BC%EC%84%9C.pdf'
URLS = {'textbook': TEXTBOOK_PREVIEW, 'ice': 'https://www.ice.go.kr/upload/board/530/2023/06/064b53ac7f6c1924c55dbb53c3aa6671.pdf', 'cbe': 'https://after.cbe.go.kr/upload/cbe/na/bbs_1762/2024/09/7E6CE0E3-72D4-8152-19C3-672DC5A29E28.pdf'}
INSTRUCTIONS = '' # First default reconstruction: native v22 prompt only.
# Bounds are read on 1888px Poppler renders. Full source PDFs/pages are retained.
SELECTION = [
 ('stable_ms2_small_sound','textbook',63,124,'III-16 오른쪽','작은 소리 파동',(556,258,810,394)),
 ('stable_ms2_high_sound','textbook',63,124,'III-17 왼쪽','높은 소리 파동',(271,623,502,758)),
 ('stable_ms2_low_sound','textbook',63,124,'III-17 오른쪽','낮은 소리 파동',(534,623,766,758)),
 ('stable_ms2_xylophone','textbook',63,124,'III-18 왼쪽','실로폰의 음색 파동',(271,1021,516,1156)),
 ('stable_ms2_recorder','textbook',63,124,'III-18 오른쪽','리코더의 음색 파동',(566,1021,810,1156)),
 ('stable_ms2_cooling_ab','textbook',23,45,'개념 적용하기 4번','액체 A와 B의 냉각 곡선',(1650,234,1820,375)),
 ('stable_ms2_solubility_comparison','textbook',23,45,'개념 적용하기 6번','두 고체 용질의 용해도 비교',(1648,640,1820,781)),
 ('stable_ms2_distillation','textbook',23,45,'개념 적용하기 7번','물과 에탄올 혼합물의 가열',(1657,977,1819,1095)),
 ('stable_ms2_co2_decline','textbook',92,183,'개념 적용하기 2번','빛을 비춘 잎의 이산화 탄소 농도',(1130,794,1407,953)),
 ('stable_ms2_diurnal_exchange','textbook',93,184,'문제 해결하기 9번','하루 동안 이산화 탄소 기체 교환',(520,915,800,1058)),
 ('stable_g2_2023_06_02','ice',1,1,2,'위치와 시간',(398,836,625,988)),
 ('stable_g2_2023_06_10','ice',2,2,10,'충돌 동안 두 물체의 속도',(968,1203,1173,1362)),
 ('stable_g2_2023_06_11','ice',3,3,11,'물체에 작용하는 힘과 시간',(386,367,614,515)),
 ('stable_g2_2023_06_12','ice',3,3,12,'충돌 힘의 크기와 충격량',(443,890,615,1010)),
 ('stable_g2_2023_06_18','ice',4,4,18,'등압과 등적 상태 변화',(420,1304,635,1502)),
 ('stable_g2_2023_06_19','ice',4,4,19,'이상 기체의 순환 과정',(683,395,881,572)),
 ('stable_g2_2024_09_05','cbe',77,1,5,'두 수레의 이동 거리와 시간',(830,1322,1058,1450)),
 ('stable_g2_2024_09_06','cbe',78,2,6,'충돌 힘과 시간',(470,440,635,566)),
 ('stable_g2_2024_09_12','cbe',79,3,12,'교류 전원의 정류 전류',(426,1402,597,1477)),
 ('stable_g2_2024_09_13','cbe',79,3,13,'이상 기체의 온도와 부피 순환',(1034,269,1201,442)),
]
def gold(case):
 id,kind,*_=case
 base={'caseId':id,'evaluationOnly':True,'neverIncludeInAIInstructions':True,'basis':'human visual inspection of official source; no provider plan/result consulted','inventory':{'axes':2,'series':1,'grid':False,'boxBorder':False},'relativeRelationships':[]}
 inv=base['inventory']; rel=base['relativeRelationships']; labels=[]
 if kind=='textbook': inv['boxBorder']=True
 if any(s in id for s in ['small_sound','high_sound','low_sound','xylophone','recorder']):
  inv.update(grid={'directions':['vertical','horizontal']},interiorHorizontalAxis=True,labelBackgrounds=1,axisArrows=False)
  labels=['시간',{'small_sound':'작은 소리','high_sound':'높은 소리','low_sound':'낮은 소리','xylophone':'실로폰','recorder':'리코더'}[id.replace('stable_ms2_','')]]
  rel+=['Continuous periodic curve crosses the middle time baseline; all printed border/grid lines remain visible.','Curve and label backgrounds retain source positions; hidden portions are not invented.']
  if 'small_sound' in id: inv['amplitudeArrow']=True;labels+=['진폭'];rel+=['Amplitude is small compared with frame height; about 2.5 periods across the frame.']
  elif 'high_sound' in id: rel+=['About five periods across the frame; amplitude about three eighths of frame height.']
  elif 'low_sound' in id: rel+=['About 2.5 periods across the frame; amplitude about three eighths of frame height.']
  else: rel+=['Repeated waveform contains secondary shoulders/wiggles within each cycle; preserve its distinct timbre instead of replacing it with one sine wave.']
 elif 'cooling_ab' in id:
  inv.update(series=2,axisArrows=True);labels=['온도(℃)','냉각 시간(분)','0','액체 A','액체 B'];rel+=['Both curves start together. A decreases and reaches a horizontal plateau. B decreases farther then keeps decreasing gently below A.','No numerical tick values or lattice are printed.']
 elif 'solubility_comparison' in id:
  inv.update(series=2,axisArrows=True,dashedGuides=4);labels=['용해도(g/물 100 g)','온도(℃)','20','60','31.6','108','(가)','(나)','0'];rel+=['Increasing red convex curve and increasing blue straight line intersect at 20℃ and 31.6 g.','Red curve reaches 108 g at 60℃; it is above the blue line after the intersection.','Dashed horizontal/vertical contacts at 20/31.6 and 60/108 share the curve coordinates.']
 elif 'distillation' in id:
  inv.update(axisArrows=True,dashedGuides=2);labels=['온도(℃)','가열 시간(분)','80','100','A','B','C','D','0'];rel+=['Orange curve rises rapidly, rises only gently through A–B near 80℃, rises again B–C, then stays horizontal C–D near 100℃.','A, B, C, D retain their printed order; no dots are printed at those labels.']
 elif 'co2_decline' in id:
  inv['axisArrows']=True;labels=['이산화 탄소 ppm','시간(분)','1000','500','0'];rel+=['Red curve starts near 1000, decreases smoothly and progressively flattens; it stays above zero.','No x-axis numerical times and no grid are printed.']
 elif 'diurnal' in id:
  inv.update(interiorHorizontalAxis=True,dashedGuides=3,semanticDirectionArrows=2);labels=['이산화 탄소 흡수량(상댓값)','이산화 탄소 방출량(상댓값)','오전 6시','12시','오후 6시','0시','0','1','2','3','4'];rel+=['Horizontal zero baseline divides uptake above from release below.','Red curve is negative near midnight, crosses zero near 6am and 6pm and reaches roughly 3 at noon.','Three dashed time guides align with zero crossings and the noon maximum.','Below-zero tick labels are printed positive release magnitudes 1 and 2; preserve those labels and the uptake/release arrows.']
 elif id.endswith('2023_06_02'):
  inv.update(dashedGuides=2,axisArrows=True);labels=['위치(m)','시간(s)','0','5','7','15'];rel+=['Straight segment (0,0)→(5,15) then straight segment →(7,0); dashed guides meet apex.']
 elif id.endswith('2023_06_10'):
  inv.update(series=2,dashedGuides=True,interiorHorizontalAxis=True,axisArrows=True);labels=['속도','시간','A','B','2v₀','v₀','0','−v₀','−2v₀'];rel+=['Curve A starts at −v₀, increases smoothly and becomes a horizontal v₀ plateau earlier.','Curve B starts at 2v₀, decreases smoothly across zero and becomes a −2v₀ plateau later.','Curve A is dashed and curve B is solid; preserve those distinct line styles.', 'Curve labels and baseline crossing/plateau projection guides retain their source contacts.']
 elif id.endswith('2023_06_11'):
  inv.update(dashedGuides=3,axisArrows=True);labels=['F(N)','t(s)','0','1','3','2','5'];rel+=['Force is 2 from time0 to1, then increases linearly through (3,5).','Dashed projections identify time1/time3 and force5; no lattice is printed.']
 elif id.endswith('2023_06_12') or id.endswith('2024_09_06'):
  inv.update(filledRegions=1,axisArrows=True);labels=['힘의 크기','시간','0','6mv' if '2023' in id else '4mv'];rel+=['One positive smooth finite pulse starts and ends on the time baseline.','Gray area under the pulse is retained; its area label remains inside the shaded region.']
 elif id.endswith('2023_06_18'):
  inv.update(series=2,filledMarkers=3,curveDirectionArrows=2,dashedGuides=2,axisArrows=True);labels=['압력','부피','0','A','B','C'];rel+=['A→B is horizontal rightward; A→C is vertical upward. Both share A.','A, B, C have printed filled dots; dashed projections connect A to both axes.']
 elif id.endswith('2023_06_19'):
  inv.update(closedCycle=True,filledMarkers=4,curveDirectionArrows=4,dashedGuides=2,axisArrows=True);labels=['압력','부피','0','A','B','C','D'];rel+=['A→B horizontal rightward, B→C curved down/right, C→D vertical downward, D→A curved up/left.','A is left of B; C and D share a larger volume; C is above D; all four dots and direction arrows remain.','Preserve both curved branches and the enclosed cycle; no shading is printed.']
 elif id.endswith('2024_09_05'):
  inv.update(series=2,dashedGuides=3,axisArrows=True);labels=['거리','시간','0','d','2t₀','4t₀','A','B'];rel+=['Two straight lines start at origin; A is steeper than B.','A reaches d at2t₀; B reaches d at4t₀; projections and line labels retain their contacts.']
 elif id.endswith('2024_09_12'):
  inv.update(grid={'directions':['vertical','horizontal'],'dash':'dotted'},axisArrows=True);labels=['전류','시간','0'];rel+=['Four repeated positive half-wave pulses meet zero at the shared baseline; none extends below the baseline.','Dotted rectangular lattice and the baseline/axis arrows remain printed geometry.']
 elif id.endswith('2024_09_13'):
  inv.update(closedCycle=True,filledMarkers=3,curveDirectionArrows=3,axisArrows=True);labels=['온도','부피','0','A','B','C','단열'];rel+=['A→B is horizontal leftward, B→C is vertical upward, C→A is a smooth decreasing curved branch labelled 단열.','B and C share volume; A and B share temperature; all point labels/dots and directed branches remain.']
 inv['labels']=labels
 return base

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def prior_hashes():
 evidence={}; seen=set(); files=0; requests=0
 def add(h,p):
  if re.fullmatch('[0-9a-f]{64}',h):evidence.setdefault(h,set()).add(str(p.relative_to(ROOT)))
 def walk(o,p):
  if isinstance(o,dict):
   for k,v in o.items():
    if isinstance(v,str) and (k in ['sourceSHA256','sourceHash','sourceImageHash'] or k=='hash' and v.startswith('sha256:')):add(v.removeprefix('sha256:'),p)
    walk(v,p)
  elif isinstance(o,list):
   for v in o:walk(v,p)
 for p in (ROOT/'outputs').rglob('*'):
  if OUT in p.parents or not p.is_file():continue
  resolved=p.resolve()
  if resolved in seen:continue
  seen.add(resolved)
  if p.suffix=='.png':add(digest(p),p);files+=1
  if p.suffix=='.json':
   try:a=json.loads(p.read_text())
   except (ValueError,UnicodeError):continue
   walk(a,p)
   if p.name=='request.json':
    requests+=1
    for att in a.get('attachments',[]):
     data=att.get('data','')
     if isinstance(data,str) and data.startswith('data:') and ';base64,' in data:
      try:add(hashlib.sha256(base64.b64decode(data.split(',',1)[1])).hexdigest(),p)
      except ValueError:pass
 return evidence,files,requests

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--textbook-pdf',type=Path,default=Path('/tmp/mid2-science-lss.pdf'));ap.add_argument('--ice-pdf',type=Path,default=Path('/tmp/stability-ice202306.pdf'));ap.add_argument('--cbe-pdf',type=Path,default=Path('/tmp/stability-cbe202409.pdf'));args=ap.parse_args()
 prior,png_count,request_count=prior_hashes()
 src=OUT/'sources';originals=src/'originals';renders=src/'rendered-pages';originals.mkdir(parents=True,exist_ok=True);renders.mkdir(exist_ok=True)
 pdfs={}
 for kind,file in [('textbook',args.textbook_pdf),('ice',args.ice_pdf),('cbe',args.cbe_pdf)]:
  if file.read_bytes()[:5]!=b'%PDF-':raise ValueError('Original PDF required')
  dest=originals/({'textbook':'chunjae-middle-school-science2-lss','ice':'official-2023-06-grade2-science','cbe':'official-2024-09-grade2-all-subjects'}[kind]+'.pdf');shutil.copyfile(file,dest);pdfs[kind]=dest
 assert digest(pdfs['textbook'])=='896b4efab9d5e6bf16fbcc774c70d83c5af84aa1730c19233bc54c8364fb4632','Publisher PDF differs from previously verified official download'
 pages={};cases=[];refs=[]
 for selection in SELECTION:
  id,kind,pdfpage,printed,figure,title,rect=selection;key=(kind,pdfpage)
  if key not in pages:
   low=Path(f'/tmp/stability-{kind}-selection-{pdfpage}');subprocess.run(['pdftoppm','-f',str(pdfpage),'-l',str(pdfpage),'-scale-to','1888','-png','-singlefile',str(pdfs[kind]),str(low)],check=True,stderr=subprocess.DEVNULL)
   dest=renders/f'{kind}-page-{pdfpage}.png';subprocess.run(['pdftoppm','-f',str(pdfpage),'-l',str(pdfpage),'-scale-to','4500','-png','-singlefile',str(pdfs[kind]),str(dest.with_suffix(''))],check=True,stderr=subprocess.DEVNULL)
   pages[key]=(dest,Image.open(low.with_suffix('.png')).size)
  pagePath,smallsize=pages[key];page=Image.open(pagePath).convert('RGB');crop=tuple(round(v*page.size[i%2]/smallsize[i%2]) for i,v in enumerate(rect));img=page.crop(crop);dest=src/f'{id}.png';img.save(dest);h=digest(dest)
  assert h not in prior,f'Prior submitted/source image hash collision: {id}'
  prov={'kind':'textbook' if kind=='textbook' else 'physics-exam','primarySourceURL':URLS[kind],'originalPDFPath':str(pdfs[kind]),'originalBytesSHA256':digest(pdfs[kind]),'pdfPage':pdfpage,'printedPage':printed,'renderedPagePath':str(pagePath),'renderedPageSHA256':digest(pagePath),'renderedPageSize':list(page.size),'cropPixels':list(crop),'originalWidth':img.width,'originalHeight':img.height,'inputTranscoding':'Official PDF rendered with Poppler at 4500px; graph rectangle cropped without any edits, redraw, recolor, annotation removal, or source geometry changes.'}
  if kind=='textbook':prov.update(book='천재교과서 중학교 과학 2 (임성숙)',grade='중학교 2학년',curriculum='2022 개정',publisher='천재교과서',figure=figure,pageURL=PUBLISHER,officialSourceVerification='Publisher official book page links this exact Science 2 preview; retained PDF SHA256 matches the previously downloaded publisher PDF. Preview webpage retained separately.')
  else:prov.update(exam='2023학년도 6월 고2 전국연합학력평가' if kind=='ice' else '2024학년도 9월 고2 전국연합학력평가',subject='물리학Ⅰ',questionNumber=figure,graphPanel='(다)' if kind=='cbe' and figure==12 else '(나)' if figure in [10,11,12,6] else None,officialHost='인천광역시교육청' if kind=='ice' else '충청북도교육청',officialSourceVerification='Downloaded complete PDF directly from education-office official domain; exam title, grade, question number and printed page visually verified.')
  cases.append({'id':id,'category':'textbook' if kind=='textbook' else 'physics','title':f'중2 과학2 · {printed}쪽 · {title}' if kind=='textbook' else f'{prov["exam"]} 물리학Ⅰ {figure}번','referenceFeature':'원본 그래프의 전체 구성과 상대적 관계','sourcePath':str(dest),'sourceSHA256':h,'notInPreviousSubmittedHashes':True,'priorSourceHashFound':False,'instructions':INSTRUCTIONS,'sourceProvenance':prov,'expectationStatus':'reference-inventory-stored-separately-never-sent-to-provider'})
  refs.append(gold(selection))
 assert len(cases)==20 and len({c['sourceSHA256'] for c in cases})==20
 prompt=re.search(r"GRAPH_ENGINE_PROMPT_VERSION\s*=\s*'([^']+)'",(ROOT/'preview/js/graph/reconstruction-contract.js').read_text()).group(1)
 manifest={'schema':'5e.science-graph-evaluation/v1','title':'새 중2 공식 교과서 그래프10개 + 공식 물리 기출 그래프10개','model':'gpt-6.1-sol','effort':'medium','frozenPromptVersion':prompt,'expectedCount':20,'categoryCounts':{'textbook':10,'physics':10},'manualPlanCorrections':0,'automaticRetries':0,'actualModelCalls':0,'cases':cases,'evaluationReferencePath':str(src/'reference-inventory.json')}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 (src/'reference-inventory.json').write_text(json.dumps({'schema':'5e.graph-source-reference-inventory/v1','evaluationOnly':True,'neverIncludeInAIInstructions':True,'cases':refs},ensure_ascii=False,indent=2))
 proof={'schema':'5e.graph-source-provenance/v1','preparedAt':'2026-10-07','actualModelCalls':0,'sourceEdits':0,'sourceCropCount':20,'primarySources':[{**{'kind':k,'url':URLS[k]},'retainedPDFPath':str(p),'sha256':digest(p)} for k,p in pdfs.items()],'noveltyProof':{'method':'Scan every existing outputs JSON source-hash field and each request attachment data URL; additionally hash every existing outputs PNG as a conservative superset of prior actual AI inputs. Resolve duplicate symlink targets once. Exclude only the new graph-stability-20261007 directory.','priorPNGFilesHashed':png_count,'priorRequestFilesChecked':request_count,'priorUniqueHashes':len(prior),'newDistinctHashes':len(cases),'intersection':[],'notInPreviousSubmittedHashes':True,'previousHashEvidence':{h:sorted(paths) for h,paths in sorted(prior.items())}},'caseProvenance':{c['id']:c['sourceProvenance'] for c in cases},'goldSeparation':{'referenceInventoryPath':str(src/'reference-inventory.json'),'providerInstructionsSameForEveryCase':True,'goldInProviderInstructions':False,'initialInstructionsEmpty':True,'firstGenerationRoute':'native v22 default observation; source grid/frame/arrow measurements enabled'},'limitations':['Physics cases are official grade2 national school achievement assessments, not CSAT/KICE university entrance exam cases.','Five source crops of tone/wave periodicity share one textbook spread but are distinct unused published figures/panels.','Novelty proof establishes no prior submitted bytes; distinct figure selection was additionally reviewed to avoid recropping a previously evaluated graph.']}
 (OUT/'sources-provenance.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
 contact=Image.new('RGB',(1500,320*5),'white');draw=ImageDraw.Draw(contact)
 for i,c in enumerate(cases):
  im=Image.open(c['sourcePath']);im.thumbnail((365,285));x=(i%4)*375;y=(i//4)*320;contact.paste(im,(x,y+28));draw.text((x+5,y+5),c['id'],fill='black')
 contact.save(src/'contact-sheet.png')
 print(json.dumps({'count':20,'manifest':str(OUT/'manifest.json'),'priorHashes':len(prior),'priorRequests':request_count,'overlap':0,'modelCalls':0},ensure_ascii=False))
if __name__=='__main__':main()
