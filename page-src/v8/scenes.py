# 출시본 v1.7.0 실제 촬영본(~/Work/2026-11-16_5E-README/real/S*/manifest.json) → v8 장면 HTML + 재생 데이터
import json, pathlib, subprocess, html
from PIL import Image

REAL = pathlib.Path.home() / 'Work/2026-11-16_5E-README/real'
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_IMG = ROOT / 'img/rf8'

GROUPS = [
    ('image', '그림 · 그래프', '⌥⌘1', ['S1', 'S2', 'S3']),
    ('exam', '문항 · 기출 · 시험지', '⌥⌘2', ['S4', 'S5', 'S6']),
    ('hwp', '조판 · 인쇄', '⌥⌘3', ['S8']),
    ('clipboard', '세 프로그램을 잇는 것', '⇧⌘V', ['S9']),
]
TEXT = {
    'S1': ('교과서 그림', '교과서 그림을<br><span class="soft">평가원 그림으로.</span>', '라이브러리에서 잘라 넣으면 흑백 선화로 다시 그립니다. 글자는 지우지 않고 고칠 수 있는 라벨로 다시 얹습니다.', ['라이브러리에서 찾기', '자르기', '작업대 → 변환', '원본과 나란히', '라벨 끄고 켜기', '라벨 고치기', '5E 클립보드로']),
    'S2': ('기출 그림', '라벨이 그대로.<br><span class="soft">그런데 고칠 수 있습니다.</span>', '기출 그림 속 글자를 원래 크기·자리 그대로 라벨로 되살립니다. 끄면 그림만, 켜면 라벨까지. 옮기고 바꾸면 내 문항의 그림이 됩니다.', ['기출 찾기', '자르기 → 작업대', '라벨 복원', '끄고 켜기', '옮기고 바꾸기', '5E 클립보드로']),
    'S3': ('그래프', '그래프 사진이<br><span class="soft">고칠 수 있는 그래프로.</span>', '축과 눈금, 곡선을 읽어 다시 그립니다. 수식 눈금까지. 선 모양을 바꾸고 축 이름을 고친 뒤, 고칠 수 있는 그래프째 클립보드로 보냅니다.', ['기출에서 자르기', '그래프 복원', '복원 끝', '선 모양 바꾸기', '축 이름 고치기', '5E 클립보드로']),
    'S4': ('문항 카드', '쓰는 대로<br><span class="soft">한글 시험지가 됩니다.</span>', '그림·그래프는 클립보드에서 꺼내 칸에 넣고, 쓰면 옆에 실제 한글 조판이 그려집니다. 〈보기〉 ○·×만 누르면 정답 선지까지.', ['유형 고르기', '그림은 클립보드에서', '쓰기', '○·× → 정답']),
    'S5': ('기출 변형', '낱말 하나로 찾은 기출이<br><span class="soft">고칠 수 있는 카드로.</span>', '평가원·학평 기출을 낱말로 찾고, 고르면 AI 없이 바로 바꿉니다. 발문·자료·표·〈보기〉가 칸마다 나뉘어 들어갑니다.', ['검색', '변형', '고치기']),
    'S6': ('학교 양식', '수능 양식이 기본.<br><span class="soft">내 학교 양식도 그대로.</span>', '담은 문항은 수능 틀 B4 2단에 자리 잡습니다. 학교 원안지 한글 파일을 넣으면 같은 문항이 그 양식으로 옮겨 갑니다.', ['담기', '조판', '점검 · 보내기']),
    'S7': ('학교 양식', '수능 양식이 기본.<br><span class="soft">내 학교 양식도 그대로.</span>', '걱정하지 마세요. 처음엔 수능 틀로 짭니다. 학교 원안지 한글 파일을 넣으면 같은 문항이 그 양식으로 옮겨 갑니다.', ['수능 틀', '내 틀 올리기', '다시 조판']),
    'S8': ('시험지 위에서', '시험지를 한글로 옮기는 일?<br><span class="soft">그건 기본입니다.</span>', '시험지에 들어간 그대로 그림을 두 번 누르면 그 자리에서 고칩니다. 라벨, 그래프, AI 변환까지 — 쪽 모양은 그대로.', ['라벨 고치기', '그래프 모양', '이미지 변환', '그래프 수치']),
    'S9': ('5E 클립보드', '⌘C 한 번으로<br><span class="soft">세 프로그램을 건너갑니다.</span>', '그림·그래프·표·문항이 클립보드에 쌓입니다. ⇧⌘V로 골라 어디에든.', ['복사', '클립보드', '붙이기']),
}
WIPE = {
    'S1': {'chrome': {'w': 1440, 'h': 900, 'off': 'img/s1v2/chrome-off.jpg', 'on': 'img/s1v2/chrome-on.jpg', 'rect': {'x': 341.92, 'y': 185.5, 'w': 580.14, 'h': 678}},
           'base': 'img/s1v2/orig.jpg', 'baseAlt': '중학교 과학 2 교과서 215쪽 심장 그림', 'wipe': 'img/s1v2/result.jpg',
           'layers': [{'src': 'img/s1v2/label-clean.jpg'}, {'src': 'img/s1v2/label-edited.jpg'}],
           'tagA': '교과서 원본', 'tagB': '5E 변환', 'source': '출시본 5E 1.7.0 실제 결과 · 교과서_중2 215쪽',
           'steps': ['평가원 그림으로', '라벨은 그대로', '라벨을 내 문항에 맞게'],
           'states': [{'p': 50, 'layers': [], 'cap': '손잡이를 끌어 원본과 비교해 보세요'}, {'p': 100, 'layers': [0], 'cap': '그림 속 글자가 원래 자리에 라벨로'}, {'p': 100, 'layers': [1], 'cap': '우심방 → ㉠ · 우심실 → ㉡'}],
           'resume': [1, 5, 6],
           'timeline': [
               {'step': 0, 'cap': '교과서 사진 한 장', 'hold': 700},
               {'do': 'sweep', 'to': 100, 'ms': 1700, 'cap': '흑백 선화로 다시 그립니다'},
               {'do': 'sweep', 'to': 35, 'ms': 800},
               {'do': 'sweep', 'to': 100, 'ms': 700, 'hold': 150},
               {'do': 'hide', 'hold': 350},
               {'step': 1, 'do': 'layer', 'i': 0, 'to': 1, 'ms': 500, 'cap': '그림 속 글자가 원래 자리에 라벨로', 'hold': 1500},
               {'step': 2, 'do': 'layer', 'i': 1, 'to': 1, 'only': True, 'ms': 450, 'cap': '우심방 → ㉠ · 우심실 → ㉡ — 바로 문항 그림', 'hold': 2000},
               {'do': 'reset', 'ms': 600, 'cap': '', 'hold': 250},
           ]},
}
WIPE.update(json.load(open(pathlib.Path(__file__).with_name('wipe-extra.json'))))
for _p in sorted(pathlib.Path(__file__).parent.glob('scene-S*.json')):
    WIPE[_p.stem.split('-')[1]] = json.load(open(_p))
CONTROLS = {
    'S1': {'compare': {'from': '28.png', 'left': {'x': 157, 'y': 254, 'w': 467, 'h': 545}, 'rect': {'x': 640, 'y': 254, 'w': 467, 'h': 545}, 'frames': ['28.png']},
           'toggle': {'files': ['29.png', '30.png']}},
    'S2': {'compare': {'from': '32.png', 'left': {'x': 157, 'y': 335, 'w': 467, 'h': 384}, 'rect': {'x': 640, 'y': 335, 'w': 468, 'h': 384}, 'frames': ['32.png']},
           'toggle': {'files': ['33.png', '34.png']}},
    'S3': {'compare': {'from': '24.png', 'dirf': 'S3a', 'left': {'x': 157, 'y': 343, 'w': 467, 'h': 368}, 'rect': {'x': 640, 'y': 343, 'w': 468, 'h': 368}, 'frames': ['24.png']}},
}


def load(sid):
    m = REAL / sid / 'manifest.json'
    if not m.exists():
        return None
    man = json.loads(m.read_text())
    frames = [dict(f, _dir=f.get('dir', sid)) for f in man.get('frames', []) if (REAL / f.get('dir', sid) / f['file']).exists()]
    if not frames:
        return None
    dst = OUT_IMG / sid
    dst.mkdir(parents=True, exist_ok=True)
    out, names = [], []
    for f in frames:
        src = REAL / f['_dir'] / f['file']
        jpg = dst / (f['_dir'] + '-' + pathlib.Path(f['file']).stem + '.jpg')
        if not jpg.exists() or jpg.stat().st_mtime < src.stat().st_mtime:
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1440', str(src), '--out', str(jpg)], check=True, capture_output=True)
        names.append(f['_dir'] + '/' + f['file'])
        out.append({'src': f'img/rf8/{sid}/{jpg.name}', 'step': int(f.get('step', 0)), 'hold': int(f.get('hold', 1400)),
                    'cursor': f.get('cursor'), 'click': bool(f.get('click'))})
    r = man['region']
    ctl = {}
    C = CONTROLS.get(sid, {})
    def idx(name, d=None):
        key = (d or sid) + '/' + name
        return names.index(key) if key in names else -1
    if 'compare' in C:
        c = C['compare']; d = c.get('dirf', sid)
        src = REAL / d / c['from']; L = c['left']
        im = Image.open(src).convert('RGB'); s = im.size[0] / 1440
        crop = im.crop((round(L['x'] * s), round(L['y'] * s), round((L['x'] + L['w']) * s), round((L['y'] + L['h']) * s)))
        crop.save(dst / 'cmp-left.jpg', quality=85)
        ctl['compare'] = {'frames': [idx(n, d) for n in c['frames']], 'rect': c['rect'], 'src': f'img/rf8/{sid}/cmp-left.jpg'}
    if 'toggle' in C:
        fs = [idx(n) for n in C['toggle']['files']]
        ctl['toggle'] = {'frames': fs, 'at': out[fs[0]]['cursor']}
    return {'w': r['w'], 'h': r['h'], 'frames': out, 'controls': ctl, 'todo': man.get('todo', '')}


def build():
    data, parts, n, wipe = {}, [], 0, {}
    for key, sub, kb, ids in GROUPS:
        secs = []
        for sid in ids:
            if sid in WIPE:
                n += 1
                W = WIPE[sid]; wipe[sid] = W
                kick, h2, lede, _ = TEXT[sid]
                if W.get('text'): kick, h2, lede = W['text'][:3]
                li = ''.join(f'<li><button><span class="n">{k+1:02d}</span><span class="t">{html.escape(t)}</span><span class="bar"><i></i></span></button></li>' for k, t in enumerate(W['steps']))
                secs.append(f'''<section class="wrap feat" id="f-{sid}" data-wipe="{sid}" data-badge="D-{sid}" data-note="장면 {sid}. 출시본 v1.7.0이 실제로 만든 그림(원본·결과·라벨·고친 라벨)을 한 장에 겹침.">
  <div class="feat__text rise">
    <p class="kicker"><span class="num">{n:02d}</span><span class="rule"></span>{kick}</p>
    <h2 class="h2" data-badge="C-{sid}">{h2}</h2>
    <p class="lede">{lede}</p>
    <ol class="steps">{li}</ol>
    <p class="hint"><i></i><span>저절로 보여 드리는 중 · 그림 위를 좌우로 끌어 보세요</span></p>
  </div>
  <div class="wfit rise" style="--delay:.1s"></div>
</section>''')
                continue
            d = load(sid)
            if not d:
                continue
            n += 1
            data[sid] = d
            kick, h2, lede, steps = TEXT[sid]
            used = sorted({f['step'] for f in d['frames']})
            li = ''.join(f'<li><button><span class="n">{k+1:02d}</span><span class="t">{html.escape(steps[k] if k < len(steps) else str(k+1))}</span><span class="bar"><i></i></span></button></li>' for k in used)
            note = html.escape(f'장면 {sid}. 출시본 v1.7.0(127.0.0.1:8986, Codex 로그인 AI)을 실제로 조작해 찍은 {len(d["frames"])}장. ' + (d['todo'] or ''))
            secs.append(f'''<section class="wrap feat" id="f-{sid}" data-real="{sid}" data-badge="D-{sid}" data-note="{note}">
  <div class="feat__text rise">
    <p class="kicker"><span class="num">{n:02d}</span><span class="rule"></span>{kick}</p>
    <h2 class="h2" data-badge="C-{sid}">{h2}</h2>
    <p class="lede">{lede}</p>
    <ol class="steps">{li}</ol>
    <p class="hint"><i></i><span>저절로 보여 드리는 중 · 빛나는 곳을 누르면 직접 해 볼 수 있어요</span></p>
  </div>
  <div class="rfit rise" style="--delay:.1s"></div>
</section>''')
        if secs:
            parts.append(f'<div class="wrap"><div class="group rise" id="g-{key}"><b>{key}</b><span>{sub}</span><span class="k">{kb}</span></div></div>\n' + '\n'.join(secs))
    return '\n\n'.join(parts), 'window.REAL=' + json.dumps(data, ensure_ascii=False) + ';window.WIPE=' + json.dumps(wipe, ensure_ascii=False) + ';'


if __name__ == '__main__':
    h, js = build()
    print(js[:400])
