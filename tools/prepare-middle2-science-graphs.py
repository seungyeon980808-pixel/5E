"""Freeze ten crops from the publisher's Korean middle-school Science 2 PDF.
No curve or label edits. Existing 25 exam observations are reused byte-for-byte.
Render spreads with pdftoppm -scale-to 4500 -png -singlefile before invoking.
"""
import argparse, hashlib, json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SELECTION = [
    ('solubility',11,20,'I-6','여러 고체 물질의 용해도 곡선',(340,594,837,1135)),
    ('melting_mass',13,24,'I-8 왼쪽','같은 물질의 양에 따른 녹는점',(273,876,538,1153)),
    ('melting_material',13,24,'I-8 오른쪽','로르산과 팔미트산의 녹는점',(552,875,813,1153)),
    ('heating',14,27,'끓는점 비교','물과 소금물의 가열 곡선',(1082,532,1353,760)),
    ('cooling',14,27,'어는점 비교','물과 소금물의 냉각 곡선',(1382,532,1647,760)),
    ('sound',63,124,'III-16 왼쪽','큰 소리의 주기적 파동',(268,249,528,398)),
    ('photosynthesis_light',88,175,'V-3 왼쪽','빛의 세기와 광합성량',(1074,398,1297,628)),
    ('photosynthesis_co2',88,175,'V-3 가운데','이산화 탄소 농도와 광합성량',(1334,398,1566,628)),
    ('photosynthesis_temperature',88,175,'V-3 오른쪽','온도와 광합성량',(1601,398,1823,628)),
    ('ohm',124,246,'VII-8','저항에 따른 전압과 전류의 관계',(65,892,290,1119)),
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf',type=Path,required=True)
    parser.add_argument('--render-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=ROOT/'outputs/middle2-science-graphs-20261007')
    parser.add_argument('--previous',type=Path,default=ROOT/'outputs/science-graphs-20261007')
    args = parser.parse_args()
    out = args.output.resolve(); old = args.previous.resolve()
    out.mkdir(parents=True,exist_ok=True)
    prior = json.loads((old/'manifest.json').read_text())
    old_hashes = {c['sourceSHA256'] for c in prior['cases']}
    pdf_hash = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    cases=[]
    for slug,pdf_page,printed,figure,title,rect in SELECTION:
        id = 'ms2_'+slug
        page = Image.open(args.render_dir/f'mid2-hi-{pdf_page}.png').convert('RGB')
        crop = tuple(round(v*(page.width/1888 if i%2==0 else page.height/1335)) for i,v in enumerate(rect))
        src = out/'textbook-sources'/f'{id}.png'; src.parent.mkdir(exist_ok=True)
        if src.exists():raise RuntimeError('Refusing to overwrite frozen input '+str(src))
        img = page.crop(crop); img.save(src)
        digest = hashlib.sha256(src.read_bytes()).hexdigest()
        assert digest not in old_hashes
        cases.append(dict(id=id,category='textbook',title=f'중2 과학 2 · {printed}쪽 · {title}',referenceFeature=title,sourcePath=str(src),sourceSHA256=digest,notInPreviousSubmittedHashes=True,priorSourceHashFound=False,
            instructions='그림의 그래프만 편집 가능한 객체로 복원하십시오. 축의 눈금과 기준점의 상대 관계를 우선하고 해석적 함수 후보와 기준점을 명시하십시오. 관찰한 점은 확인 근거로 사용하고, 함수로 표현 가능한 곡선은 간단한 식을 우선하십시오. 직선·꺾은선은 정상 기본 도형으로 표현하십시오. 눈금·격자·라벨·보조선도 유지하십시오. 수치가 없는 축은 상대 좌표라고 표시하고 실제 계수를 임의 확정하지 마십시오. 실측 용해도와 개념적 생물 곡선의 근사식을 정확한 물리 법칙이라고 단정하지 마십시오. 그림 밖 실험 장치와 설명은 제외하십시오.',
            sourceProvenance=dict(kind='textbook',book='천재교과서 중학교 과학 2 (임성숙)',grade='중학교 2학년',curriculum='2022 개정',publisher='천재교과서',printedPage=printed,figure=figure,pdfPage=pdf_page,pageURL='https://text.tsherpa.co.kr/mid/book.html?bookcode=text-mid-science-lss',originalBytesSHA256=pdf_hash,renderedSpreadSHA256=hashlib.sha256((args.render_dir/f'mid2-hi-{pdf_page}.png').read_bytes()).hexdigest(),cropPixels=crop,renderedSpreadSize=page.size,inputTranscoding='Publisher PDF rendered with Poppler; graph rectangle cropped without curve or label edits',originalWidth=img.width,originalHeight=img.height,attribution='천재교과서·임성숙 외; 공식 공개 교과서 미리보기. 그림 I-6의 교과서 내 자료 출처는 CRC handbook of chemistry and physics(105th), 2024'),
            sourceCaveat='국내 중학교 2학년 과학 교과서의 실제 수록 그림. 수치 없는 개념 곡선의 식은 상대 좌표 근사이며 실험 법칙으로 확정하지 않음.',expectationStatus='source-visual-selection-only-not-model-result'))
    assert len({c['sourceSHA256'] for c in cases})==10
    textbook = {**{k:v for k,v in prior.items() if k not in ['cases','categoryCounts']},'expectedCount':10,'cases':cases}
    (out/'textbook-manifest.json').write_text(json.dumps(textbook,ensure_ascii=False,indent=2))
    combined={**prior,'title':'중2 과학 교과서 10개 + 기존 과학 기출 25개','cases':cases+[c for c in prior['cases'] if c['category']!='textbook'],'batches':['probe','physics-run','cbe-run','textbook-run'],'textbookDescription':'교과서는 2022 개정 천재교과서 중학교 과학 2(임성숙)의 실제 수록 그래프 10개입니다. 기존 OpenStax 10개를 대체했으며 기출 25개는 이전 최초 응답을 그대로 유지했습니다.','textbookAttribution':'천재교과서·임성숙 외, 공식 공개 교과서 미리보기','newRequests':10,'reusedExamCount':25}
    assert len(combined['cases'])==35
    (out/'manifest.json').write_text(json.dumps(combined,ensure_ascii=False,indent=2))
    for batch in ['probe','physics-run','cbe-run']:
        (out/batch).symlink_to(old/batch,target_is_directory=True)
    reviews=json.loads((old/'visual-review.json').read_text())
    (out/'visual-review.json').write_text(json.dumps([r for r in reviews if not r['id'].startswith('tb_')],ensure_ascii=False,indent=2))
    edits=json.loads((old/'formula-editing.json').read_text())
    edits['cases']=[c for c in edits['cases'] if not c['id'].startswith('tb_')]
    edits['pass']=all(c['pass'] for c in edits['cases'])
    (out/'formula-editing.json').write_text(json.dumps(edits,ensure_ascii=False,indent=2))
    print(json.dumps({'count':len(cases),'book':cases[0]['sourceProvenance']['book'],'reusedExamCount':25,'output':str(out)},ensure_ascii=False))

if __name__=='__main__':main()
