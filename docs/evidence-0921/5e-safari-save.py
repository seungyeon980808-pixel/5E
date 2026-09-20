import os,subprocess,time,json,urllib.request,socket,base64,re
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
 def js(script):return req('POST',api+'/execute/sync',{'script':script,'args':[]})
 js("document.querySelector('.tut-banner-no')?.click();document.querySelector('#file-menu-btn').click();document.querySelector('#project-save').click();return true;")
 time.sleep(.4)
 assert '프로젝트 저장' in js("return document.querySelector('.modal-overlay:not([hidden])').innerText")
 assert re.fullmatch(r'\d{8}_\d{4}\.5e',js("return document.querySelector('.modal-overlay:not([hidden]) .modal-input').value"))
 Path('docs/evidence-0921/safari-save.png').write_bytes(base64.b64decode(req('GET',api+'/screenshot')))
 js("[...document.querySelectorAll('.modal-overlay:not([hidden]) button')].find(x=>x.textContent==='취소').click();document.querySelector('#settings-menu-btn').click();document.querySelector('#open-shortcuts').click();return true;")
 time.sleep(.4)
 assert 'AI 이미지 변환' in js("return document.querySelector('.shortcut-modal').innerText")
 Path('docs/evidence-0921/safari-shortcuts.png').write_bytes(base64.b64decode(req('GET',api+'/screenshot')))
 print('Safari actual save prompt/cancel and shortcuts: PASS')
finally:
 if sid:
  try:req('DELETE',f'{base}/session/{sid}')
  except Exception:pass
 p.terminate()
