import json
import re,subprocess,pathlib,sys
d=pathlib.Path(__file__).resolve().parent; root=d.parent
sys.path.insert(0,str(d)); import scenes
h=(root/'index-v8.html').read_text()
secs,realjs=scenes.build()
a=h.index('<!-- ============ image ============ -->'); b=h.index('<section class="wrap history"')
h=h[:a]+secs+'\n\n'+h[b:]
css=(d/'v7.css').read_text().replace('../img/','img/')+'\n'+(d/'engine-hero.css').read_text()+'\n'+(d/'wipe-scene.css').read_text()+'\n'+(d/'engine-s12.css').read_text()+'\n'+(d/'engine-s7.css').read_text()+'\n'+(d/'history.css').read_text()+'\n'+(d/'theme-light.css').read_text()+'\n'+(d/'focus.css').read_text()+'\n'+(d/'gallery.css').read_text()+'\n'+(d/'texttab.css').read_text()+'\n'+(d/'opts1120.css').read_text()+'\n'+(d/'download.css').read_text()+'\n'+(d/'arch.css').read_text()+'\n'+(d/'faq.css').read_text()+'\n'+(d/'polish1120.css').read_text()+'\n'+(d/'mobile1121.css').read_text()
js=(d/'v7.js').read_text()+'\n'+(d/'engine-hero.js').read_text()+'\n'+realjs+'\n'+(d/'real-player.js').read_text()+'\n'+(d/'engine-s34.js').read_text()+'\n'+(d/'engine-s7.js').read_text()+'\n'+(d/'engine-s12.js').read_text()+'\n'+(d/'focus.js').read_text()+'\n'+(d/'texttab.js').read_text()+'\n'+(d/'opts1120.js').read_text()+'\n'+(d/'download.js').read_text()+'\n'+(d/'arch.js').read_text()+'\n'+(d/'faq.js').read_text()+'\n'+(d/'mkpill.js').read_text()+'\n'+(d/'kbd.js').read_text()+'\n'+(d/'navsync.js').read_text()
h=h.replace('<link rel="stylesheet" href="v8/v7.css">','<style>\n'+css+'\n</style>')
h=h.replace('<script src="v8/v7.js"></script>','<script>\n'+js+'\n</script>')
h=h.replace('__MASK__',(d/'mask.txt').read_text().strip()).replace('__HOLE__',(d/'hole.txt').read_text().strip())
# fontfix1121: 갤럭시(안드로이드)에는 Georgia·Times·애플 글꼴이 없음 → 거의 같은 무료 글꼴을 뒤에 붙여 어느 기기든 같게
import re as _re
h=_re.sub(r"Georgia\s*,(?!\s*Gelasio)","Georgia,Gelasio,",h)
h=_re.sub(r"((?:[^;{}]*?)(?:AppleMyungjo|Times New Roman)[^;{}]*?),\s*serif",lambda m:m.group(0) if 'Noto Serif KR' in m.group(1) else m.group(1)+",'Noto Serif KR',serif",h)
h=_re.sub(r"((?:-apple-system|Apple SD Gothic Neo)[^;{}<>]*?),\s*sans-serif",lambda m:m.group(0) if 'Pretendard' in m.group(1) else m.group(1)+',"Pretendard Variable",sans-serif',h)
h=h.replace('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR','<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gelasio:ital,wght@0,400;0,700;1,400;1,700&display=swap">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR',1)
# 11-21: 「말로 그리기」 장면(1.7.2 그림 생성) — 그래프 장면 다음에 넣고, 장면 번호를 차례대로 다시 매긴다.
_tk=json.load(open(d/'talk-data.json'))
_tks=''.join(f'<li><button><span class="n">{k+1:02d}</span><span class="t">{x["sub"]}</span><span class="bar"><i></i></span></button></li>' for k,x in enumerate(_tk))
_tksec=f'''<section class="wrap feat" id="f-TK">
  <div class="feat__text rise">
    <p class="kicker"><span class="num">04</span><span class="rule"></span>말로 그리기<span class="v172">1.7.2</span></p>
    <h2 class="h2">말로 그리세요.<br><span class="soft">시험용 그림이 됩니다.</span></h2>
    <p class="lede">그리고 싶은 그림을 말로 설명하면 평가원식 흑백 그림으로 그립니다. 마음에 안 드는 곳은 「여기 고쳐 줘」 한마디면 그 부분만. 물리부터 윤리까지.</p>
    <ol class="steps">{_tks}</ol>
    <p class="hint"><i></i><span>저절로 과목을 돌며 보여 드리는 중 · 과목을 눌러 보세요</span></p>
  </div>
  <div class="wfit rise" style="--delay:.1s"></div>
</section>
'''
_i=h.find('<section class="wrap feat" id="f-S3"');_j=h.find('</section>',_i)+len('</section>')
if _i>=0 and 'id="f-TK"' not in h:
    h=h[:_j]+'\n'+_tksec+h[_j:]
    _n=iter(range(1,99));h=_re.sub(r'(<p class="kicker"><span class="num">)\d\d(</span>)',lambda m:f'{m.group(1)}{next(_n):02d}{m.group(2)}',h)
    h=h.replace('</head>','<style>'+(d/'talk-scene.css').read_text()+'</style></head>',1)
    h=h.replace('</body>','<script>window.TALK='+json.dumps(_tk,ensure_ascii=False)+';</script><script>'+(d/'talk-scene.js').read_text()+'</script></body>',1)
(d/'_flat.html').write_text(h)
subprocess.run(['python3',str(pathlib.Path.home()/'Projects/mockup/skills/mockup/scripts/bundle.py'),str(d/'_flat.html'),'-o',str(root/'5e-landing-v8.html')],check=True)
