"""Publish retained-source reproduction evidence, not a new unseen AI benchmark."""
import html
import json
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'outputs/middle2-reproduction-20261007'
manifest = json.loads((root / 'outputs/middle2-science-graphs-20261007/textbook-manifest.json').read_text())
report = json.loads((out / 'summary.json').read_text())
assert report['pass'], 'Do not publish an incomplete editing replay as passed'
rows = {r['id']: r for r in report['cases'] if r['engine'] == 'chromium'}
notes = {
 'ms2_solubility': '전체 격자를 기존 격자 기능으로 복원했습니다. 실측 용해도 5개 곡선은 자유곡선으로 유지했습니다. 곡선 이름의 회전 방향은 원본과 다릅니다.',
 'ms2_melting_mass': '말풍선 배경을 포함해 새 지침으로 한 번 재인식했습니다. 2개 꺾은선과 격자, 43.8℃ 기준선을 유지했습니다. 기준선 점선은 원본의 선 7px·공백 4px를 측정해 적용했습니다.',
 'ms2_melting_material': '말풍선 배경을 포함해 새 지침으로 한 번 재인식했습니다. 2개 꺾은선·격자·두 온도 기준선을 분리했습니다. 기준선 점선은 선 7px·공백 4px로 복원했습니다.',
 'ms2_heating': '말풍선 배경을 포함해 새 지침으로 한 번 재인식했습니다. 빠졌던 전체 격자와 위·오른쪽 테두리를 복원했습니다. 축 생략 표기를 유지하며, 생략 구간의 수치·물리적 기울기는 확정하지 않았습니다.',
 'ms2_cooling': '격자·박스 테두리·냉각 곡선·0℃ 눈금·축 생략 표기를 유지했습니다. 생략된 시간은 추정하지 않았습니다.',
 'ms2_sound': '박스 테두리와 중앙 시간축을 독립적으로 표시합니다. 규칙적인 격자·진폭 화살표·큰 소리 표시를 유지했습니다. 사인 식은 그림 상대 좌표의 근사입니다.',
 'ms2_photosynthesis_light': '제목이 빠진 이전 응답을 새 지침으로 한 번 다시 인식했습니다. 내부 제목과 포화 곡선이 들어왔습니다. 곡선은 관찰 자유곡선입니다.',
 'ms2_photosynthesis_co2': '내부 제목과 포화 곡선을 유지했습니다. 수치 없는 생물 개념 곡선은 실제 실험 법칙으로 확정하지 않았습니다.',
 'ms2_photosynthesis_temperature': '내부 제목과 극대점·고온에서의 급감 형태를 유지했습니다. 곡선은 관찰 자유곡선입니다.',
 'ms2_ohm': '새 지침으로 한 번 다시 인식하여 내부 그림 제목과 두 직선·물체 이름·기준선을 포함했습니다.',
}
e = html.escape
cards = []
for c in manifest['cases']:
 r = rows[c['id']]; folder = out / 'cases' / c['id']; prefix = 'cases/' + c['id'] + '/'
 plan = json.loads((folder / 'plan.json').read_text())
 formulas = r['formulas']
 marks = [s for s in plan['series'] if str(s.get('id', '')).startswith('axis-omission-')]
 data_series = [s for s in plan['series'] if s not in marks]
 basic = sum(s['kind'] == 'bar' or s.get('curveStyle') == 'straight' for s in data_series)
 curves = sum(s['kind'] == 'points' and s.get('curveStyle') != 'straight' for s in data_series)
 expr = ' / '.join(f['expression'] for f in formulas) or ('직선·꺾은선 · 정상 기본도형' if basic and not curves else '관찰 자유곡선 · 해석식 변환 미적용')
 origin = '새 AI 응답 · Sol 6.1 / medium' if r['observationSource'].startswith('new-') else '기존 AI 응답 재사용'
 before = f'<details><summary>수정 전 복원 보기</summary><img src="{prefix}before.png" alt="수정 전 복원"></details>' if (folder / 'before.png').exists() else '<p class="minor">수정 전에는 생성이 차단된 사례입니다.</p>'
 cards.append(f'''<article id="{c['id']}"><h2>{e(c['title'])}</h2><p class="minor">{origin} · 두 브라우저에서 편집/저장/재열기 통과</p>
 <div class="pair"><figure><figcaption>원본</figcaption><a href="{prefix}source.png" target="_blank"><img src="{prefix}source.png" alt="교과서 원본"></a></figure><figure><figcaption>수정 후 · 편집 가능한 5E 객체</figcaption><a href="{prefix}native.png" target="_blank"><img src="{prefix}native.png" alt="5E 복원 결과"></a></figure></div>
 <p>{e(notes[c['id']])}</p><p class="minor">해석식 {len(formulas)} · 직선/꺾은선/막대 {basic} · 관찰 자유곡선 {curves} · 축 생략 표기 {len(marks)} · 원본 확인 격자선 {len(r['grid']['coverage'])}</p>
 <code>{e(expr)}</code><div class="links"><a href="{prefix}editable-graph.5e" download>편집용 .5e 다운로드</a><a href="{prefix}plan.json" target="_blank">복원 데이터</a></div>
 <details><summary>좌우로 밀어 겹쳐 비교</summary><div class="wipe"><img src="{prefix}source.png" alt="원본"><img class="over" src="{prefix}native.png" alt="복원"></div><label>원본 ↔ 복원 <input type="range" min="0" max="100" value="50" aria-label="원본과 복원 비교" oninput="this.closest('details').querySelector('.over').style.clipPath='inset(0 0 0 '+this.value+'%)'"></label></details>{before}</article>''')
body = f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>중2 교과서 그래프 재현 · 원본 비교</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f3f4f5;color:#202329;font:16px/1.65 -apple-system,BlinkMacSystemFont,sans-serif}}main{{max-width:1400px;margin:auto;padding:30px 24px}}header,article{{background:white;border:1px solid #ddd;border-radius:12px;padding:24px;margin-bottom:24px}}h1{{font-size:26px;margin:0 0 14px}}h2{{font-size:21px;margin:0}}p{{margin:10px 0}}.minor{{color:#60656d;font-size:14px}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px}}figure{{margin:0;min-width:0}}figcaption{{font-weight:600;margin-bottom:8px}}img{{display:block;width:100%;height:auto;background:#fff;border:1px solid #e4e4e4}}code{{display:block;padding:10px;background:#f5f6f8;overflow:auto}}a{{color:#175d9c}}.links{{display:flex;gap:20px;flex-wrap:wrap;margin:12px 0}}details{{margin:14px 0}}summary{{cursor:pointer}}.wipe{{position:relative;max-width:800px;margin:12px auto}}.wipe .over{{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}}input[type=range]{{width:70%;vertical-align:middle}}nav{{display:flex;gap:12px;flex-wrap:wrap}}@media(max-width:650px){{main{{padding:12px}}header,article{{padding:16px}}.pair{{grid-template-columns:1fr}}}}@media print{{details,.links,nav{{display:none}}article{{break-inside:avoid}}}}
</style><main><header><h1>중학교 2학년 과학 · 교과서 그래프 10개 재현</h1>
<p>중앙축·격자·보조선·테두리를 수정한 실제 5E 출력입니다. 이미지를 클릭하면 크게 볼 수 있습니다. 다운로드한 .5e 파일은 작업대에서 열어 그래프를 더블클릭해 수정할 수 있습니다.</p>
<p><b>생성·편집·저장 후 재열기: 10/10 · Chromium/WebKit 총 20/20 통과.</b> 이 수치는 편집 검증이며 원본과의 완전한 시각 일치를 뜻하지 않습니다.</p>
<p class="minor">기존 응답 5개 재사용 + 제목/말풍선이 빠진 5개만 Sol 6.1·medium으로 새 AI 인식(5회). 그 뒤 원본 픽셀로 격자·테두리·점선·화살촉을 측정했습니다. 곡선 좌표를 사람이 다시 찍은 것은 아닙니다. 질량 라벨의 ‘로산→로르산’ 인식 오자 2곳은 원문 대조로 보완했고 reference-text-review.json에 기록했습니다. 원본 이미지 파일은 변경하지 않았습니다.</p>
<p class="minor">현재 출력은 평가원식 흑백입니다. 원본 색상, 둥근 말풍선 모서리, 일부 글꼴·회전 방향은 일치하지 않습니다. 실측·개념 곡선을 임의의 정확한 물리 법칙으로 바꾸지 않았습니다.</p>
<p class="minor">출처: <a href="https://text.tsherpa.co.kr/mid/book.html?bookcode=text-mid-science-lss" target="_blank">천재교과서 중학교 과학 2 · 임성숙 외 · 2022 개정 공식 미리보기</a>. 공개 배포용 페이지가 아닌 로컬 검증 자료입니다.</p><nav>{''.join(f'<a href="#{c["id"]}">{i+1}. {e(c["referenceFeature"])}</a>' for i,c in enumerate(manifest['cases']))}</nav></header>{''.join(cards)}</main></html>'''
(out / 'index.html').write_text(body)
(out / 'images.html').write_text(body)
# Compact actual source/render contact sheet, with no redraw or curve editing.
selected = ['ms2_sound', 'ms2_heating', 'ms2_melting_material']
canvas = Image.new('RGB', (1400, len(selected) * 440), 'white'); d = ImageDraw.Draw(canvas)
for i, ident in enumerate(selected):
 d.text((24, i * 440 + 10), ident + ' | ORIGINAL (left) / 5E (right)', fill='black')
 for j, file in enumerate(['source.png', 'native.png']):
  image = ImageOps.contain(Image.open(out / 'cases' / ident / file).convert('RGB'), (650, 390))
  canvas.paste(image, (j * 700 + 25 + (650 - image.width)//2, i * 440 + 40))
canvas.save(out / 'comparison.png')
canvas.crop((0,0,1400,440)).save(out / 'wave-comparison.png')
print(out / 'images.html')
