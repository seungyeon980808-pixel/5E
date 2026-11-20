# 11-20: 실제로 올릴 방문자판(www.5e.ai.kr/page). 시안 도구(문구 탭·시안 알약·번호표·안내 줄)는 빼고, 그림은 쓰는 것만 복사.
import re,shutil,pathlib,sys
d=pathlib.Path(__file__).resolve().parent;root=d.parent
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'page';out.mkdir(parents=True,exist_ok=True)
src=(d/'build.py').read_text()
src=src.replace("+'\\n'+(d/'texttab.css').read_text()","").replace("+'\\n'+(d/'texttab.js').read_text()","").replace("+'\\n'+(d/'mkpill.js').read_text()","")
src=src.split("(d/'_flat.html').write_text(h)")[0]
g={'__file__':str(d/'build.py')};exec(src,g);h=g['h']
h=re.sub(r'<section class="mk-sec" id="tags"[^>]*></section>','',h)
h=re.sub(r'\sdata-(badge|note|mk-legend)="[^"]*"','',h)
h=h.replace('<html lang="ko"','<html lang="ko" data-view="visitor" data-look="gallery"',1)
B='https://www.5e.ai.kr/page/'
h=h.replace('content="img/og.png"',f'content="{B}img/og.png"').replace('<meta property="og:title"',f'<meta property="og:url" content="{B}"><meta property="og:title"',1)
# 실제 판: 시안 안내(V 키)와 그 단축키 끄기
h=h.replace("tip.textContent='방문자 화면 · V 키를 누르면 시안 모드로 돌아갑니다';document.body.appendChild(tip);","tip.textContent='';")
h=h.replace("addEventListener('keydown',e=>{if((e.key==='v'||e.key==='V')","addEventListener('keydown',e=>{if(false&&(e.key==='v'||e.key==='V')")
(out/'index.html').write_text(h)
refs=sorted(set(re.findall(r'img/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|svg|gif)',h)))
n=0;miss=[]
for r in refs:
    s_=root/r
    if s_.exists():
        (out/r).parent.mkdir(parents=True,exist_ok=True)
        if s_.resolve()!=(out/r).resolve():shutil.copy2(s_,out/r)
        n+=1
    else:miss.append(r)
print('index.html',len(h)//1024,'KB · 그림',n,'개 · 없음',miss)
