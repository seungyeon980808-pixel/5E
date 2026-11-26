# 11-26: 맥의 Georgia·Times New Roman 글자 모양을 SVG 경로로 뽑아 georgia-glyphs.js로(맥에서만 실행).
# 페이지에서 Georgia·Times로 쓰는 글자만 담는다 — 글자를 더 쓰게 되면 아래 USED에 넣고 다시 실행.
import json,string,pathlib
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
D='/System/Library/Fonts/Supplemental/'
LOW=string.ascii_lowercase+string.digits+'5E_ .-·'
USED={'i':('Georgia Italic.ttf','AFQabcdeghilmnoprstuwxy'+LOW),'bi':('Georgia Bold Italic.ttf',' 5E_abcdeghilmoprwx'+LOW),'tr':('Times New Roman.ttf','0123456789ABab()/., -+')}
out={}
for k,(f,chars) in USED.items():
    t=TTFont(D+f);gs=t.getGlyphSet();cmap=t.getBestCmap();hm=t['hmtx'];g={}
    for c in sorted(set(chars)):
        n=cmap.get(ord(c))
        if not n: continue
        pen=SVGPathPen(gs,ntos=lambda v:'%d'%round(v));gs[n].draw(pen);g[c]=[hm[n][0],pen.getCommands()]
    out[k]={'upm':t['head'].unitsPerEm,'g':g}
p=pathlib.Path(__file__).with_name('georgia-glyphs.js')
p.write_text('window.GEORGIA='+json.dumps(out,separators=(',',':'),ensure_ascii=False)+';')
print(p,p.stat().st_size)
