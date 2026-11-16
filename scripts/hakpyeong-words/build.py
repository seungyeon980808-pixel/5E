# 학평 OCR 낱말(out/*.json)을 문항 상자별로 나눠 hakpyeong/words/<과목>.json.gz로 만든다.
# 형식: {"v":1,"scale":10000,"items":{"<문항 id>":[["낱말",x,y,w,h], ...]},"cardHeight":{"<문항 id>":카드 높이÷문항 칸 높이}}  (x,y,w,h = 쪽 비율 × 10000 정수, 왼쪽 위 원점)
import json, gzip, os, sys
REPO = '/Users/parkseungyeon/Desktop/project/5e-170-integration/assets/exampool/convert/data/hakpyeong'
OUT = sys.argv[1] if len(sys.argv) > 1 else REPO + '/words'
os.makedirs(OUT, exist_ok=True)
index = json.load(open(REPO + '/index.json'))
sizes = {d['file']: d['pageSizes'] for d in index['documents']}
ocr_cache = {}
card = json.load(open('cardsize.json'))  # {id:[w,h]} 학평 카드 그림 크기
def ocr(file):
    if file not in ocr_cache:
        p = f'out/{file[:-4]}.json'
        ocr_cache[file] = json.load(open(p))['pages'] if os.path.exists(p) else None
    return ocr_cache[file]
total_items = with_words = missing = 0
for code, *_ in index['subjects']:
    rows = json.load(gzip.open(f'{REPO}/{code}.json.gz'))
    items = {}
    heights = {}
    for row in rows:
        total_items += 1
        rid, page, box, pdf = row[0], row[4], row[5], row[6]
        pages = ocr(pdf)
        if not pages or page - 1 >= len(pages): missing += 1; continue
        W, H = sizes[pdf][page - 1]
        if rid in card:
            cw, ch = card[rid]
            frac = (ch / cw) / ((box[3] - box[1]) / (box[2] - box[0]))
            if 0.05 < frac < 0.995: heights[rid] = round(frac, 4)
        x0, y0, x1, y1 = box[0] / W, box[1] / H, box[2] / W, box[3] / H
        words = []
        for t, x, y, w, h in pages[page - 1]:
            cx, cy = x + w / 2, y + h / 2
            if x0 <= cx <= x1 and y0 <= cy <= y1:
                words.append([t, round(x * 10000), round(y * 10000), max(1, round(w * 10000)), max(1, round(h * 10000))])
        if words: items[rid] = words; with_words += 1
    data = json.dumps({'v': 1, 'scale': 10000, 'items': items, 'cardHeight': heights}, ensure_ascii=False, separators=(',', ':')).encode()
    with gzip.open(f'{OUT}/{code}.json.gz', 'wb', compresslevel=9) as f: f.write(data)
    print(code, len(items), '문항', len(data) // 1024, 'KB 원본 →', os.path.getsize(f'{OUT}/{code}.json.gz') // 1024, 'KB')
print('전체', total_items, '낱말 있음', with_words, 'OCR 없음', missing)
