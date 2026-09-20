import os,subprocess,time,json,urllib.request,socket,base64
from pathlib import Path

def req(method,url,data=None):
 b=None if data is None else json.dumps(data).encode()
 q=urllib.request.Request(url,data=b,method=method,headers={'Content-Type':'application/json'})
 return json.loads(urllib.request.urlopen(q,timeout=30).read().decode())['value']
s=socket.socket();s.bind(('',0));port=s.getsockname()[1];s.close()
p=subprocess.Popen(['safaridriver','-p',str(port)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
base=f'http://127.0.0.1:{port}';sid=None
try:
 time.sleep(.8)
 sid=req('POST',base+'/session',{'capabilities':{'alwaysMatch':{'browserName':'safari'}}})['sessionId'];api=f'{base}/session/{sid}'
 req('POST',api+'/window/rect',{'width':1440,'height':1040,'x':0,'y':0})
 req('POST',api+'/url',{'url':os.environ.get('PREVIEW_URL','http://127.0.0.1:8767/preview/')})
 time.sleep(2)
 req('POST',api+'/execute/sync',{'script':"document.querySelectorAll('.tut-welcome-overlay').forEach(e=>e.remove()); return true;",'args':[]})
 out=[]
 for theme in ['dark','light']:
  req('POST',api+'/execute/sync',{'script':"document.documentElement.dataset.theme=arguments[0];window.dispatchEvent(new Event('resize'));return true;",'args':[theme]})
  time.sleep(.3)
  metrics=req('POST',api+'/execute/sync',{'script':"return ['#ruler-h','#ruler-v','#canvas','#panel-right','.canvas-global-controls','.app-brand'].map(s=>{const e=document.querySelector(s);return {s,rect:e.getBoundingClientRect().toJSON(),client:[e.clientWidth,e.clientHeight],backing:[e.width,e.height]}})",'args':[]})
  assert metrics[0]['client'][1]>0,metrics
  assert abs(metrics[1]['rect']['bottom']-metrics[2]['rect']['bottom'])<1,metrics
  assert metrics[4]['rect']['right']<=metrics[3]['rect']['left'],metrics
  out.append({'theme':theme,'metrics':metrics})
  img=req('GET',api+'/screenshot');Path(f'docs/evidence-0921/safari-{theme}.png').write_bytes(base64.b64decode(img))
 print(json.dumps(out,ensure_ascii=False,indent=2));Path('docs/evidence-0921/safari-layout.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
finally:
 if sid:
  try:req('DELETE',f'{base}/session/{sid}')
  except Exception:pass
 p.terminate()
