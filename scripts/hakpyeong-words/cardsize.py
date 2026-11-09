# 학평 문항 카드(webp) 머리 64바이트만 받아 가로·세로 픽셀을 읽는다 → cardsize.json {id:[w,h]}
import json,gzip,struct,urllib.request,concurrent.futures as cf,os
R='/Users/parkseungyeon/Desktop/project/5e-170-integration/assets/exampool/convert/data/hakpyeong'
ids=[r[0] for c in ['p1','p2','c1','c2','b1','b2','e1','e2'] for r in json.load(gzip.open(f'{R}/{c}.json.gz'))]
done=json.load(open('cardsize.json')) if os.path.exists('cardsize.json') else {}
def dims(b):
    if b[:4]!=b'RIFF' or b[8:12]!=b'WEBP': return None
    k=b[12:16]
    if k==b'VP8X': return (int.from_bytes(b[24:27],'little')+1, int.from_bytes(b[27:30],'little')+1)
    if k==b'VP8L': v=int.from_bytes(b[21:25],'little'); return ((v&0x3FFF)+1, ((v>>14)&0x3FFF)+1)
    if k==b'VP8 ': return (struct.unpack('<H',b[26:28])[0]&0x3FFF, struct.unpack('<H',b[28:30])[0]&0x3FFF)
def get(i):
    for _ in range(3):
        try:
            q=urllib.request.Request(f'https://raw.githubusercontent.com/seungyeon980808-pixel/exam-search/main/cards/{i}.webp',headers={'Range':'bytes=0-63'})
            return i,dims(urllib.request.urlopen(q,timeout=20).read(64))
        except Exception as e: err=e
    return i,None
todo=[i for i in ids if i not in done]
with cf.ThreadPoolExecutor(24) as ex:
    for n,(i,d) in enumerate(ex.map(get,todo)):
        if d: done[i]=list(d)
        if n%1000==0: json.dump(done,open('cardsize.json','w'))
json.dump(done,open('cardsize.json','w'))
print('카드 크기',len(done),'/',len(ids))
