"""배치 파일들을 figure-atlas*.jsonl 로 합치고 PART_FREQUENCY*.md 를 만든다.

사용:  python tools/atlas-merge.py         물리 (기본, 483장)
       python tools/atlas-merge.py chem    화학 (280장)

하는 일
  1. docs/atlas-parts*/batch-*.jsonl + 기존 아틀라스를 합친다
  2. 중복 파일명은 나중 것으로 덮는다(재판독분 우선)
  3. 아틀라스 jsonl 로 쓰고 .atlas-done 목록을 갱신한다
  4. 부품 대기열 + 요소 동시출현표 md 를 만든다

과목별로 산출물 파일을 나누는 이유: 물리 483장 집계에 다른 과목이 섞이면
"이 부품을 만들면 몇 장이 사는가"의 근거가 어긋난다.

이 표가 무엇을 만들지 정하는 근거다. 판정 기준은 FIGURE_DECOMPOSE_SPEC.md §6 참고.
화학 어휘는 FIGURE_DECOMPOSE_SPEC_CHEM.md 가 덮어쓴다.
"""
import collections
import json
import glob
import os
import sys

# 과목별 경로·장수. 키는 명령행 첫 인자.
SUBJECTS = {
    'phys': dict(parts='atlas-parts', atlas='figure-atlas.jsonl',
                 done='.atlas-done.txt', out='PART_FREQUENCY.md',
                 total=483, label='물리'),
    'chem': dict(parts='atlas-parts-c', atlas='figure-atlas-c.jsonl',
                 done='.atlas-done-c.txt', out='PART_FREQUENCY_CHEM.md',
                 total=280, label='화학'),
}

DOCS = 'docs'
CFG = SUBJECTS[sys.argv[1] if len(sys.argv) > 1 else 'phys']
PARTS = os.path.join(DOCS, CFG['parts'])
TOTAL = CFG['total']

# 판독은 배치별 서브에이전트가 나눠 하므로, 같은 물건이 배치마다 다른 이름으로
# 적히는 표류가 실제로 일어난다(화학 1차에서 전극이 세 배치에 각각 신설됐다).
# 흩어진 채로 집계하면 "이걸 만들면 몇 장이 사는가"를 못 세므로 여기서 정본으로 합친다.
# 규격에 정식 편입된 어휘는 `misc:` 접두사만 떼면 되고, 이름 자체가 갈린 것만 따로 적는다.
CANON = {
    'bar_column': 'bar', 'sector_circle': 'pie_sector', 'pie_chart': 'pie_sector',
    'precipitate': 'solid_chunk', 'solid_pile': 'solid_chunk',
    'furniture': 'lab_bench',
}
# `misc:` 를 떼고 정식 어휘로 승격된 것들 (규격 §2 에 편입 완료)
PROMOTED = {'bar', 'pie_sector', 'solid_chunk', 'zoom_circle', 'stopper',
            'partition', 'membrane', 'weight', 'fixing_device',
            'orbital_box', 'spin_arrow', 'electrode', 'particle_square',
            'tube_clamp', 'panel_divider', 'bracket_region'}


def canon(name):
    """`misc:` 접두사와 동의어를 정본 이름으로 되돌린다."""
    bare = name[5:] if name.startswith('misc:') else name
    bare = CANON.get(bare, bare)
    return bare if bare in PROMOTED or not name.startswith('misc:') else 'misc:' + bare


def normalize(rows):
    # 물리 483장은 재판독까지 끝나 이름이 이미 정리돼 있다. 건드리지 않는다.
    if CFG is not SUBJECTS['chem']:
        return rows
    for r in rows:
        for b in r.get('blockers', []):
            b['what'] = canon(b['what'])
        for p in r['panels']:
            for key, vals in p['elements'].items():
                seen, out = set(), []
                for v in vals:
                    c = canon(v)
                    if c not in seen:
                        seen.add(c)
                        out.append(c)
                p['elements'][key] = out
    return rows

BTYPE_KO = {'part': '낱개 부품', 'assembly': '묶음 부품',
            'illustration': '삽화(만들지 않음)', 'layout': '구성 문제'}


def load_all():
    """배치 + 기존 아틀라스를 합친다. 같은 파일이 여러 번 나오면 마지막 것을 쓴다."""
    by_file = {}
    sources = sorted(glob.glob(os.path.join(PARTS, 'batch-*.jsonl')))
    atlas = os.path.join(DOCS, CFG['atlas'])
    if os.path.exists(atlas):
        sources.insert(0, atlas)
    for fp in sources:
        for line in open(fp, encoding='utf-8'):
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            by_file[row['file']] = row
    return [by_file[k] for k in sorted(by_file,
                                       key=lambda f: (by_file[f]['year'],
                                                      by_file[f]['subject'],
                                                      by_file[f]['no']))]


def queue_table(rows):
    """blockers 를 (type, what) 별로 묶어 '무엇을 만들면 몇 장이 살아나는가'를 낸다."""
    agg = collections.Counter()
    for r in rows:
        for key in {(b['type'], b['what']) for b in r.get('blockers', [])}:
            agg[key] += 1
    return agg


def cooccurrence(rows, kind='scene'):
    """해당 패널 종류에서 요소가 몇 %의 패널에 나오는지."""
    cnt, n = collections.Counter(), 0
    for r in rows:
        for p in r['panels']:
            if p['kind'] != kind:
                continue
            n += 1
            for v in p['elements'].values():
                cnt.update(set(v))
    return cnt, n


def main():
    rows = normalize(load_all())
    with open(os.path.join(DOCS, CFG['atlas']), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    with open(os.path.join(DOCS, CFG['done']), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(r['file'] + '\n')

    rep = collections.Counter(r['repro'] for r in rows)
    kin = collections.Counter(p['kind'] for r in rows for p in r['panels'])
    agg = queue_table(rows)
    scene, n_scene = cooccurrence(rows, 'scene')
    graph, n_graph = cooccurrence(rows, 'graph')

    # 부품만 다 만들었을 때의 천장 — 삽화/구성이 걸린 장은 못 넘는다
    ceiling = sum(1 for r in rows
                  if not any(b['type'] in ('illustration', 'layout')
                             for b in r.get('blockers', [])))

    cmd = ('python tools/atlas-merge.py ' + (sys.argv[1] if len(sys.argv) > 1 else '')).strip()
    out = [f"# 부품 대기열 · 요소 빈도 — {CFG['label']} 기출 도판 {len(rows)}장 집계\n",
           f"> `{CFG['atlas']}` 에서 자동 생성. 다시 만들려면 `{cmd}`.",
           "> 규격은 `FIGURE_DECOMPOSE_SPEC.md`.\n",
           "## 재현 현황\n",
           "| | 장수 | 비율 |", "|---|---:|---:|"]
    for k, ko in (('full', '완벽 재현'), ('partial', '일부만'), ('none', '재현 불가')):
        c = rep.get(k, 0)
        out.append(f"| {ko} | {c} | {c / len(rows) * 100:.0f}% |")
    out += [f"\n**부품을 전부 만들었을 때 천장: {ceiling}장 "
            f"({ceiling / len(rows) * 100:.0f}%)** — 나머지는 삽화·구성 문제라 5E 대상이 아니다.\n",
            "패널 종류: " + " · ".join(f"{k} {v}" for k, v in kin.most_common()) + "\n",
            "## 부품 대기열 — 만들 것\n",
            "장수가 곧 우선순위다. 한 항목을 만들면 그만큼의 도판이 등급 상승한다.\n",
            "| 장수 | 종류 | id |", "|---:|---|---|"]
    for (t, w), c in agg.most_common():
        if t == 'illustration':
            continue
        out.append(f"| {c} | {BTYPE_KO[t]} | `{w}` |")

    out += ["\n## 삽화 — 만들지 않는다\n",
            "원본에서 잘라 `image` 로 얹는다(MCP `add_objects` 의 `srcPath`).\n",
            "| 장수 | id |", "|---:|---|"]
    for (t, w), c in agg.most_common():
        if t == 'illustration':
            out.append(f"| {c} | `{w}` |")

    for title, cnt, n in (("장면(scene) 패널", scene, n_scene),
                          ("그래프(graph) 패널", graph, n_graph)):
        out += [f"\n## 요소 동시출현 — {title} {n}개\n",
                "**80% 이상이면 조립체 기본값 ON**, 30~80%는 파라미터, 30% 미만은 제외.\n",
                "| 요소 | 패널 수 | 비율 |", "|---|---:|---:|"]
        for k, v in cnt.most_common(25):
            out.append(f"| `{k}` | {v} | {v / n * 100:.0f}% |" if n else "")

    misc = collections.Counter(e for r in rows for p in r['panels']
                               for v in p['elements'].values()
                               for e in v if e.startswith('misc:'))
    if misc:
        out += ["\n## 어휘에 없던 것 (`misc:`) — 편입 후보\n",
                "| 항목 | 횟수 |", "|---|---:|"]
        for k, v in misc.most_common(20):
            out.append(f"| `{k}` | {v} |")

    path = os.path.join(DOCS, CFG['out'])
    with open(path, 'w', encoding='utf-8') as f:
        f.write("\n".join(out) + "\n")
    print('rows %d / %d | ceiling %d | %s' % (len(rows), TOTAL, ceiling, path))


if __name__ == '__main__':
    main()
