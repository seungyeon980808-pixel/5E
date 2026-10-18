# 채점 기준: 원본 PDF 문항 영역에서 본문 글자(그림 속 작은 글·수식 글꼴 제외), [3점], 실제 내용 높이를 읽는다. 읽기 전용.
import sys, json, re, collections, os
import pymupdf
root, corpus_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
corpus = json.load(open(corpus_path))
EQFONT = re.compile(r'HyhwpEQ|Symbol|Math|EQ', re.I)
docs = {}
res = {}
def body_size(doc):
    c = collections.Counter()
    for pg in doc:
        for b in pg.get_text('dict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    t = s['text'].strip()
                    if len(t) > 2 and not EQFONT.search(s['font']): c[round(s['size'], 1)] += len(t)
    return c.most_common(1)[0][0]
for it in corpus:
    p = os.path.join(root, it['publicPath'])
    if p not in docs:
        d = pymupdf.open(p); docs[p] = (d, body_size(d))
    d, bs = docs[p]
    pg = d[it['page'] - 1]
    x0, y0, x1, y1 = it['box']
    # 색인 box는 PDF 좌표(pt, 위가 0)
    rect = pymupdf.Rect(x0, y0, x1, y1)
    chars, allt, bottom = [], [], y0
    for b in pg.get_text('dict', clip=rect)['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                t = s['text']
                if not t.strip(): continue
                bb = pymupdf.Rect(s['bbox'])
                if not rect.contains(pymupdf.Point((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2)): continue
                allt.append(t)
                if re.search(r'저작권|홀수형|짝수형|^\s*\d+\s*$', t): continue
                bottom = max(bottom, bb.y1)
                if abs(s['size'] - bs) <= 0.6 and not EQFONT.search(s['font']): chars.append(t)
    for dr in pg.get_drawings():
        r = dr['rect']
        if rect.contains(r) and r.height < 600: bottom = max(bottom, r.y1)
    for im in pg.get_image_info():
        r = pymupdf.Rect(im['bbox'])
        if rect.intersects(r) and rect.contains(pymupdf.Point((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2)): bottom = max(bottom, r.y1)
    body = re.sub(r'\s+', '', ''.join(chars))
    body = re.sub(r'^\d{1,2}\.', '', body)
    res[it['id']] = {'body': body, 'three': '[3점]' in ''.join(allt).replace(' ', ''), 'heightMm': round((bottom - y0) / 72 * 25.4, 1), 'bodySize': bs,
                     'scaleToB4': 1.0}
json.dump(res, open(out_path, 'w'), ensure_ascii=False)
print('ref', len(res))
