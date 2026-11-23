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
# 휴대폰 데이터: 장면 그림은 그 장면에 가까워질 때 받기(브라우저 기본 늦게 받기)
h=re.sub(r'<img(?![^>]*\bloading=)\s',lambda m:'<img loading="lazy" decoding="async" ',h)
# 장면이 화면 1.5배 거리 안에 들어오면 그 장면 그림을 모두 바로 받기(잘려 있던 결과 그림도 늦지 않게)
pf='<script>/* prefetchScene */(function(){if(!("IntersectionObserver" in window))return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;e.target.querySelectorAll("img[loading=lazy]").forEach(function(i){i.loading="eager"});io.unobserve(e.target)})},{rootMargin:"150% 0px"});function go(){document.querySelectorAll("section[id^=f-S],#studio,#arch,#hx,#download").forEach(function(s){io.observe(s)})}if(document.readyState==="loading")addEventListener("DOMContentLoaded",function(){setTimeout(go,50)});else setTimeout(go,50)})();</script>'
h=h.replace('</body>',pf+'\n</body>',1)
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
