"""Render original/first-restored image pairs from an existing science report.
No provider requests, curve changes, or edits to saved 5E objects.
"""
import argparse, html, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--font',type=Path,default=Path('/System/Library/Fonts/AppleSDGothicNeo.ttc'))
    args=parser.parse_args();out=args.output.resolve()
    summary=json.loads((out/'summary.json').read_text());manifest=json.loads((out/'manifest.json').read_text())
    font=ImageFont.truetype(str(args.font),26);small=ImageFont.truetype(str(args.font),21)
    comparisons=out/'comparisons';comparisons.mkdir(exist_ok=True)
    def wrap(draw,text,x,y,width,font):
        line=''
        for ch in text:
            if ch=='\n':
                draw.text((x,y),line,font=font,fill='#17212b');line='';y+=29
                continue
            if draw.textlength(line+ch,font=font)>width:
                draw.text((x,y),line,font=font,fill='#17212b');line='';y+=29
            line+=ch
        draw.text((x,y),line,font=font,fill='#17212b');return y+29
    cards=[]
    for c in summary['cases']:
        folder=out/'cases'/c['id'];plan_file=folder/'plan.json'
        plan=json.loads(plan_file.read_text()) if c['nativeResult'] and plan_file.exists() else None
        pb=plan['source']['plotBox'] if plan else None
        roi=None
        if pb:
            sw,sh=plan['source']['width'],plan['source']['height']
            roi=(max(0,pb['x']-pb['w']*.5),max(0,pb['y']-pb['h']*.18),min(sw,pb['x']+pb['w']*1.28),min(sh,pb['y']+pb['h']*1.4))
        sheet=Image.new('RGB',(1760,710),'white');draw=ImageDraw.Draw(sheet)
        draw.line((880,0,880,565),fill='#d7dee5',width=2)
        draw.text((24,12),'원본',font=font,fill='#17212b');draw.text((906,12),'첫 자동 변환본',font=font,fill='#17212b')
        for index,name in enumerate(['source.png','native.png']):
            file=folder/name
            if file.exists():
                im=Image.open(file).convert('RGBA')
                if roi:im=im.crop(tuple(round(v) for v in roi))
                background=Image.new('RGBA',im.size,'white');background.alpha_composite(im)
                im=ImageOps.contain(background.convert('RGB'),(828,495))
                sheet.paste(im,(index*880+26+(828-im.width)//2,55+(495-im.height)//2))
            else:
                wrap(draw,'변환본 미생성: '+(c.get('error') or c.get('statusText') or '대기'),906,210,810,small)
        draw.line((20,565,1740,565),fill='#d7dee5',width=2)
        y=wrap(draw,f"{c['representation']} · 편집·저장·재열기 {'통과' if c['editingPass'] else '미확인'}",24,580,1710,small)
        equations=' / '.join(f"{f['id']}: {f['expression']}" for f in c['formulas'])
        if equations:wrap(draw,equations,24,y,1710,small)
        elif c['nativeResult']:wrap(draw,'함수식 없음 · 직선/꺾은선/산점도와 남은 곡선의 구분은 상세 보고서에서 확인',24,y,1710,small)
        filename=c['id']+'.png';sheet.save(comparisons/filename)
        finding=c.get('visualReview',{}).get('finding','') if c.get('visualReview') else '시각 검수 대기'
        cards.append(f'<article id="{c["id"]}" data-category="{c["category"]}"><h2>{html.escape(c["title"])}</h2><a href="comparisons/{filename}" target="_blank"><img loading="lazy" src="comparisons/{filename}" alt="{html.escape(c["title"])} 원본·변환 비교"></a><p>{html.escape(finding)} <a href="index.html#{c["id"]}">함수식·5E 파일·검증 보기</a></p></article>')
    labels={'textbook':'중2 과학 교과서 10개','physics':'물리 기출 10개','chemistry':'화학 기출 5개','biology':'생명과학 기출 5개','earth':'지구과학 기출 5개'}
    description=html.escape(manifest.get('textbookDescription','출처는 상세 보고서의 원문 링크 참고'))
    page='''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>중2 과학 교과서·기출 원본과 변환 이미지</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#eef1f5;color:#17212b;font:16px/1.6 -apple-system,sans-serif}header,article{max-width:1760px;margin:0 auto 24px;background:white;padding:20px;border-radius:10px}h1{margin:0;font-size:25px}h2{font-size:19px;margin:0 0 12px}img{display:block;width:100%;height:auto}a{color:#2463b0}select{font:inherit;padding:8px}.hidden{display:none}</style></head><body><header><h1>중2 과학 교과서 10개 · 원본과 첫 자동 변환본</h1>'''
    page+=f'<p>{description}</p><p>왼쪽 원본 · 오른쪽 변환본. Sol 6.1·medium, 수동 보정 0회. 미생성 결과도 표시합니다. 이미지를 누르면 큰 PNG가 열립니다.</p><p><a href="index.html">전체 결과·함수식 보고서</a></p><label>분류 <select id="filter"><option value="textbook">중2 과학 교과서 10개</option><option value="all">전체 35개</option>'
    page+=''.join(f'<option value="{k}">{v}</option>' for k,v in labels.items() if k!='textbook')+'</select></label></header>'+''.join(cards)
    page+='''<script>const f=document.getElementById('filter');function filter(){for(const a of document.querySelectorAll('article'))a.classList.toggle('hidden',f.value!=='all'&&a.dataset.category!==f.value)}f.addEventListener('change',filter);filter()</script></body></html>'''
    (out/'images.html').write_text(page)
    print(json.dumps({'comparisons':len(cards),'output':str(out/'images.html')},ensure_ascii=False))

if __name__=='__main__':main()
