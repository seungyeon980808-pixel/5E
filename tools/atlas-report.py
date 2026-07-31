"""figure-atlas*.jsonl → docs/atlas-report*.html

기출 도판 분해 진행 상황을 눈으로 보는 리포트를 만든다.
원본 도판 옆에 분해 결과를 나란히 놓아 판독이 맞는지 직접 검수할 수 있게 한다.

사용:  python tools/atlas-report.py         물리 (기본, 483장)
       python tools/atlas-report.py chem    화학 (280장)

매 배치가 끝날 때마다 다시 돌리면 된다. 입력은 해당 과목의 아틀라스 jsonl 뿐이다.
"""
import base64
import collections
import html
import json
import os
import sys

DOCS = 'docs'
IMG = 'assets/exam-library/images'

SUBJECTS = {
    'phys': dict(atlas='figure-atlas.jsonl', out='atlas-report.html',
                 total=483, label='물리', spec='FIGURE_DECOMPOSE_SPEC.md'),
    'chem': dict(atlas='figure-atlas-c.jsonl', out='atlas-report-c.html',
                 total=280, label='화학', spec='FIGURE_DECOMPOSE_SPEC_CHEM.md'),
}
CFG = SUBJECTS[sys.argv[1] if len(sys.argv) > 1 else 'phys']
TOTAL = CFG['total']

LAYER = {'skeleton': '골격', 'zone': '영역', 'object': '물체',
         'link': '연결', 'aux': '보조', 'annot': '주석'}
REPRO = {'full': ('전부 재현 가능', '#1a7f37'),
         'partial': ('부분 재현', '#9a6700'),
         'none': ('재현 불가', '#cf222e')}
KIND = {'scene': '장면', 'graph': '그래프', 'circuit': '회로',
        'table': '표', 'illustration': '삽화', 'diagram': '도식'}

CSS = """
body{font-family:'IBM Plex Sans KR',sans-serif;background:#f6f8fa;color:#0d1117;margin:0;padding:24px;max-width:1100px;margin:auto}
h1{font-size:20px} h2{font-size:16px;margin-top:32px;border-bottom:1px solid #d0d7de;padding-bottom:6px}
h3{font-size:14px}
.prog{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:16px;display:flex;gap:32px;align-items:center;flex-wrap:wrap}
.big{font-size:28px;font-weight:700;color:#0969da}
.pbar{flex:1;min-width:200px;height:10px;background:#eaeef2;border-radius:5px;overflow:hidden}
table{border-collapse:collapse;background:#fff;border:1px solid #d0d7de;font-size:13px;width:100%}
td{padding:4px 10px;border-top:1px solid #eaeef2}
.b{display:inline-block;height:8px;background:#0e7490;border-radius:2px;vertical-align:middle}
.card{background:#fff;border:1px solid #d0d7de;border-radius:6px;margin:14px 0;overflow:hidden}
.head{padding:8px 14px;border-bottom:1px solid #eaeef2;font-size:14px}
.badge{color:#fff;border-radius:10px;padding:1px 9px;font-size:12px;margin-left:6px}
.body{display:flex;gap:14px;padding:14px;flex-wrap:wrap}
.body img{max-width:420px;width:100%;height:auto;align-self:flex-start;border:1px solid #eaeef2}
.dec{flex:1;min-width:280px}
.panel{border:1px solid #eaeef2;border-radius:4px;padding:8px 10px;margin-bottom:8px;font-size:13px}
.pn{font-weight:600;margin-bottom:4px} .kind{color:#0e7490;font-weight:400;font-size:12px}
.lay{margin:2px 0} .lk{display:inline-block;width:38px;color:#57606a;font-size:12px}
code{background:#eff2f5;border-radius:3px;padding:0 4px;font-family:'IBM Plex Mono',monospace;font-size:12px}
.none{color:#c4cdd5} .note{color:#57606a;font-size:12px;margin-top:4px}
.grid{display:flex;gap:24px;flex-wrap:wrap} .grid>div{flex:1;min-width:260px}
.todo{background:#fff;border:2px solid #0969da;border-radius:6px;padding:16px 18px;margin:16px 0}
.todoq{font-size:17px;font-weight:700;color:#0969da;margin-bottom:8px}
.todo p{font-size:13px;margin:6px 0;line-height:1.6} .todo .opt{color:#57606a;border-top:1px solid #eaeef2;padding-top:8px}
.blk{padding:6px 14px;background:#fbfcfd;border-bottom:1px solid #eaeef2;font-size:12px}
.chip{display:inline-block;border:1px solid;border-radius:10px;padding:0 8px;margin:2px 3px 2px 0;font-size:11px}
.later{font-weight:400;font-size:12px;color:#57606a}
footer{color:#57606a;font-size:12px;margin-top:40px}
"""


def load():
    path = os.path.join(DOCS, CFG['atlas'])
    rows = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]
    rows.sort(key=lambda x: (x['year'], x['subject'], x['no']))
    return rows


def freq_table(counter, total, n=14):
    out = []
    for k, v in counter.most_common(n):
        pct = round(v / total * 100) if total else 0
        out.append(f"<tr><td><code>{html.escape(k)}</code></td><td>{v}</td>"
                   f"<td><div class='b' style='width:{pct * 2}px'></div> {pct}%</td></tr>")
    return ''.join(out)


BTYPE = {'part': ('부품 없음', '#0969da', '만든다 — 낱개 부품/기호'),
         'assembly': ('묶음 없음', '#8250df', '만든다 — 조립체'),
         'illustration': ('삽화', '#57606a', '만들지 않는다 — 원본 크롭 사용'),
         'layout': ('구성 문제', '#bc4c00', '5E 구조 과제로 분류')}


def queue_section(rows):
    """blockers 를 what 별로 묶어 '부품 제작 대기열'을 만든다.

    이 표가 선생님이 지시하는 화면이다 — 무엇을 만들면 몇 장이 살아나는지 보고
    체크할 항목을 고르면 된다. 같은 what 이 여러 장에 나오면 그게 곧 우선순위다.
    """
    agg = {}
    for r in rows:
        for b in r.get('blockers', []):
            key = (b['type'], b['what'])
            agg.setdefault(key, []).append(r['file'])
    if not agg:
        return '<p>아직 blockers 데이터가 없습니다.</p>'
    order = {'assembly': 0, 'part': 1, 'layout': 2, 'illustration': 3}
    items = sorted(agg.items(), key=lambda kv: (order[kv[0][0]], -len(kv[1])))
    out = ["<table><tr><td><b>구분</b></td><td><b>막고 있는 것</b></td>"
           "<td><b>장수</b></td><td><b>기본 조치</b></td><td><b>나온 도판</b></td></tr>"]
    for (btype, what), files in items:
        label, color, action = BTYPE[btype]
        uniq = sorted(set(files))
        out.append(
            f"<tr><td><span class='badge' style='background:{color}'>{label}</span></td>"
            f"<td>{html.escape(what)}</td><td><b>{len(uniq)}</b></td>"
            f"<td style='font-size:12px;color:#57606a'>{action}</td>"
            f"<td style='font-size:11px;color:#57606a'>{', '.join(uniq)}</td></tr>")
    out.append('</table>')
    return ''.join(out)


def card(x):
    with open(os.path.join(IMG, x['file']), 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    panels = []
    for p in x['panels']:
        els = ''.join(
            "<div class='lay'><span class='lk'>%s</span>%s</div>" % (
                LAYER[k],
                ' '.join(f"<code>{html.escape(e)}</code>" for e in v) or "<span class=none>—</span>")
            for k, v in p['elements'].items())
        assets = p.get('assets') or []
        a = (' · 부품: ' + ' '.join(f"<code>{html.escape(e)}</code>" for e in assets)) if assets else ''
        panels.append(
            f"<div class='panel'><div class='pn'>{html.escape(p.get('name') or '단일')} "
            f"<span class='kind'>{KIND.get(p['kind'], p['kind'])}</span>{a}</div>{els}"
            f"<div class='note'>{html.escape(p.get('note', ''))}</div></div>")
    label, color = REPRO[x['repro']]
    blk = x.get('blockers') or []
    blk_html = ''
    if blk:
        chips = ' '.join(
            f"<span class='chip' style='border-color:{BTYPE[b['type']][1]};color:{BTYPE[b['type']][1]}'>"
            f"{BTYPE[b['type']][0]}: {html.escape(b['what'])}</span>" for b in blk)
        blk_html = f"<div class='blk'><b>full이 아닌 이유</b> {chips}</div>"
    return (f"<div class='card'><div class='head'><b>{x['file']}</b> · "
            f"{x['year']}년 {x['subject']} {x['no']}번 "
            f"<span class='badge' style='background:{color}'>{label}</span></div>{blk_html}"
            f"<div class='body'><img src='data:image/png;base64,{b64}' alt=''>"
            f"<div class='dec'>{''.join(panels)}</div></div></div>")


def main():
    rows = load()
    all_el, scene_el = collections.Counter(), collections.Counter()
    n_scene = 0
    for x in rows:
        for p in x['panels']:
            for v in p['elements'].values():
                all_el.update(v)
            if p['kind'] == 'scene':
                n_scene += 1
                for v in p['elements'].values():
                    scene_el.update(v)
    rep = collections.Counter(x['repro'] for x in rows)
    kin = collections.Counter(p['kind'] for x in rows for p in x['panels'])
    done = len(rows)
    pct = round(done / TOTAL * 100, 1)

    if done < TOTAL:
        todo = f"""<div class=todo>
  <div class=todoq>지금 판단하실 것은 하나입니다 — <b>나머지 {TOTAL - done}장을 마저 돌릴까?</b></div>
  <p>그 외에는 결정하실 게 없습니다. 아래 표들은 <b>참고용</b>이고,
     표본이 {done}장뿐이라 아직 순위를 믿을 단계가 아닙니다.
     {TOTAL}장이 다 모이면 그때 "무엇을 만들지"를 고르시면 됩니다.</p>
  <p class=opt><b>검수는 선택입니다.</b> 하신다면 맨 아래 도판 카드에서 <u>이것 하나만</u> 보십시오 —
     <b>왼쪽 그림에 있는 것이 오른쪽 목록에 빠져 있지 않은가.</b>
     빠졌으면 파일 이름만 알려주시면 됩니다. 용어는 몰라도 됩니다.</p>
</div>"""
    else:
        todo = f"""<div class=todo>
  <div class=todoq>{TOTAL}장 판독이 끝났습니다 — 이제 <b>무엇을 만들지</b> 고르실 차례입니다.</div>
  <p>아래 <b>부품 제작 대기열</b>이 그 근거입니다. 장수가 곧 우선순위이고,
     한 항목을 만들면 그만큼의 도판이 등급 상승합니다.
     <b>삽화는 만들지 않습니다</b> — 원본에서 잘라 얹습니다.</p>
  <p class=opt><b>검수는 선택입니다.</b> 하신다면 맨 아래 도판 카드에서 <u>이것 하나만</u> 보십시오 —
     <b>왼쪽 그림에 있는 것이 오른쪽 목록에 빠져 있지 않은가.</b>
     빠졌으면 파일 이름만 알려주시면 됩니다. 용어는 몰라도 됩니다.</p>
</div>"""

    doc = f"""<!doctype html><html lang=ko><head><meta charset=utf-8>
<title>{CFG['label']} 기출 도판 분해 리포트</title><style>{CSS}</style></head><body>
<h1>{CFG['label']} 기출 도판 분해 — 진행 리포트</h1>

{todo}

<div class=prog>
  <div><div class=big>{done} / {TOTAL}장</div>
       <div style='font-size:12px;color:#57606a'>판독 완료 ({pct}%)</div></div>
  <div class=pbar><div style='height:100%;background:#0969da;width:{pct}%'></div></div>
  <div style='font-size:13px'>재현 등급 — 전부 가능 <b>{rep.get('full', 0)}</b> ·
    부분 <b>{rep.get('partial', 0)}</b> · 불가 <b>{rep.get('none', 0)}</b><br>
    패널 — {' · '.join(f"{KIND.get(k, k)} {v}" for k, v in kin.most_common())}</div>
</div>
<h2>참고 ① 부품 제작 대기열 <span class=later>— {'장수가 곧 우선순위입니다' if done >= TOTAL else f'{TOTAL}장이 다 모인 뒤에 고르는 표입니다'}</span></h2>
<p style='font-size:13px;color:#57606a'>도판이 <b>full</b>이 되지 못한 이유를 모은 것.
장수가 곧 우선순위이며, 한 항목을 만들면 그만큼의 도판이 등급 상승한다.
<b>삽화는 만들지 않는다</b> — 원본에서 잘라 <code>image</code> 로 얹는다.</p>
{queue_section(rows)}
<h2>참고 ② 요소 출현 빈도 <span class=later>— 조립체 기본값을 정할 때 쓰는 표입니다</span></h2>
<div class=grid>
  <div><h3>전체 패널 기준</h3><table>{freq_table(all_el, sum(kin.values()))}</table></div>
  <div><h3>장면(scene) 패널만 ({n_scene}개)</h3><table>{freq_table(scene_el, n_scene)}</table></div>
</div>
<p style='font-size:13px;color:#57606a'>장면 패널에서 <b>80%를 넘는 요소가 조립체 기본값 후보</b>다.
표본이 작을 때는 참고용으로만 본다.</p>
<h2>도판 {done}장 <span class=later>— 검수하실 곳(선택). 왼쪽 그림에 있는데 오른쪽에 빠진 게 없는지만 보십시오</span></h2>
{''.join(card(x) for x in rows)}
<footer>{CFG['atlas']} 기준 자동 생성 · {CFG['spec']}</footer>
</body></html>"""
    out = os.path.join(DOCS, CFG['out'])
    with open(out, 'w', encoding='utf-8') as f:
        f.write(doc)
    # 한국어 Windows 콘솔은 cp949라 em-dash 같은 문자에서 죽는다. ASCII로만 찍는다.
    print('%s : %d rows, %d KB' % (out, done, round(os.path.getsize(out) / 1024)))


if __name__ == '__main__':
    main()
