# -*- coding: utf-8 -*-
"""수집물 손질 — 쓰레기를 버리고 한글 이름·검색어를 붙인다.

`harvest_parts.py` 가 받아 온 것을 사람이 쓸 수 있는 모양으로 만든다.
기존에 손으로 모은 10장(meta.json)의 형식을 그대로 따른다 — 한글 name, 한글+영문 keywords.

## 왜 거르나

`deepcat` 검색은 카테고리 나무를 통째로 훑어서, 과학 도해를 찾는데 **이모지 세트·아이콘 폰트·
로고**까지 딸려 온다(실측: 제목 빈출어 상위에 emoji 51, icon 32, noto 21, twemoji 14).
이것들은 선화로 바꿔도 시험지에 쓸 수 없다.

## 한글화의 한계

2천 장을 손으로 번역할 수는 없으므로 **용어 사전으로 기계 번역**한다. 제목이 사전에 걸리면
한글 이름을 짓고, 안 걸리면 영문 제목을 그대로 둔다. 어차피 `sourceTags`(Commons 카테고리)가
같이 색인되므로 영문으로도 찾힌다. 마음에 드는 것만 나중에 meta.json 에 손으로 옮겨 적으면
그쪽이 이긴다.

    python tools/curate_parts.py            # 손질 (버릴 것은 보고만)
    python tools/curate_parts.py --apply    # 실제로 지우고 harvest.json 갱신
"""

import argparse
import io
import json
import pathlib
import re
import sys
import urllib.parse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)

HERE = pathlib.Path(__file__).resolve().parent
LIB = HERE.parent / "assets" / "parts-library"
SVG_DIR = LIB / "svg"
HARVEST = LIB / "harvest.json"

# ── 버릴 것 ────────────────────────────────────────────────────────────
# 제목이나 카테고리에 이게 있으면 과학 도해가 아니다.
JUNK = re.compile(
    r"emoji|twemoji|noto[ _-]|openmoji|fluent[ _-]?ui|icons8|noun[ _-]project"
    r"|\blogo\b|iucn|\bflag\b|coat[ _-]of[ _-]arms|barnstar|userbox|wikiproject"
    r"|\bavatar\b|\bcursor\b|font[ _-]awesome|material[ _-]design[ _-]icon"
    r"|\bemote\b|sticker|\bbadge\b",
    re.I)

# ── 용어 사전 (영 → 한) ────────────────────────────────────────────────
# 실제로 걸려 온 제목의 빈출어를 보고 골랐다. 없는 말은 그냥 안 붙는다.
TERMS = {
    # 실험 기구
    "flask": "플라스크", "erlenmeyer": "삼각플라스크", "florence": "둥근바닥플라스크",
    "volumetric": "부피", "beaker": "비커", "test tube": "시험관", "tube": "관",
    "burette": "뷰렛", "buret": "뷰렛", "pipette": "피펫", "pipet": "피펫",
    "funnel": "깔때기", "condenser": "냉각관", "retort": "레토르트",
    "crucible": "도가니", "mortar": "막자사발", "pestle": "막자",
    "petri": "페트리접시", "dish": "접시", "watch glass": "시계접시",
    "cylinder": "실린더", "graduated": "눈금", "stopper": "마개",
    "bunsen": "분젠버너", "burner": "버너", "tripod": "삼발이",
    "clamp": "클램프", "stand": "스탠드", "balance": "저울", "scale": "저울",
    "microscope": "현미경", "thermometer": "온도계", "barometer": "기압계",
    "distillation": "증류", "titration": "적정", "filtration": "여과",
    "filter": "여과", "evaporating": "증발", "desiccator": "건조기",
    "centrifuge": "원심분리기", "spectrometer": "분광기", "apparatus": "장치",
    "laboratory": "실험실", "lab": "실험", "experiment": "실험",
    "safety": "안전", "goggles": "보안경", "glove": "장갑",
    "vacuum": "진공", "pump": "펌프", "valve": "밸브", "syringe": "주사기",
    # 회로·전기
    "circuit": "회로", "resistor": "저항", "capacitor": "축전기",
    "inductor": "인덕터", "diode": "다이오드", "transistor": "트랜지스터",
    "battery": "전지", "cell": "전지", "switch": "스위치", "lamp": "전구",
    "led": "LED", "voltmeter": "전압계", "ammeter": "전류계",
    "galvanometer": "검류계", "transformer": "변압기", "motor": "전동기",
    "generator": "발전기", "amplifier": "증폭기", "voltage": "전압",
    "current": "전류", "resistance": "저항", "ground": "접지",
    "capacitance": "전기용량", "inductance": "유도계수", "relay": "계전기",
    "thermocouple": "열전대", "fuse": "퓨즈", "antenna": "안테나",
    "oscilloscope": "오실로스코프", "schematic": "회로도", "wiring": "배선",
    # 물리
    "wave": "파동", "frequency": "진동수", "amplitude": "진폭",
    "wavelength": "파장", "pendulum": "진자", "spring": "용수철",
    "lever": "지레", "pulley": "도르래", "inclined": "빗면", "friction": "마찰",
    "force": "힘", "vector": "벡터", "momentum": "운동량", "energy": "에너지",
    "lens": "렌즈", "mirror": "거울", "prism": "프리즘", "refraction": "굴절",
    "reflection": "반사", "diffraction": "회절", "interference": "간섭",
    "polarization": "편광", "magnet": "자석", "magnetic": "자기",
    "field": "장", "optics": "광학", "laser": "레이저", "ray": "광선",
    "spectrum": "스펙트럼", "photon": "광자", "electron": "전자",
    # 화학
    "atom": "원자", "molecule": "분자", "molecular": "분자", "ion": "이온",
    "bond": "결합", "covalent": "공유결합", "orbital": "오비탈",
    "electrolysis": "전기분해", "electrode": "전극", "anode": "양극",
    "cathode": "음극", "reaction": "반응", "catalyst": "촉매",
    "acid": "산", "base": "염기", "ph": "pH", "buffer": "완충",
    "solution": "용액", "solvent": "용매", "solute": "용질",
    "crystal": "결정", "lattice": "격자", "isotope": "동위원소",
    "periodic": "주기율", "synthesis": "합성", "polymer": "고분자",
    "structural": "구조식", "formula": "화학식", "chromatography": "크로마토그래피",
    "phase": "상", "equilibrium": "평형", "entropy": "엔트로피",
    # 생명
    "nucleus": "핵", "mitochondrion": "미토콘드리아", "mitochondria": "미토콘드리아", "chloroplast": "엽록체",
    "ribosome": "리보솜", "membrane": "막", "cytoplasm": "세포질",
    "chromosome": "염색체", "dna": "DNA", "rna": "RNA",
    "gene": "유전자", "protein": "단백질", "enzyme": "효소",
    "mitosis": "체세포분열", "meiosis": "감수분열", "neuron": "뉴런",
    "synapse": "시냅스", "photosynthesis": "광합성", "respiration": "호흡",
    "bacteria": "세균", "virus": "바이러스", "tissue": "조직",
    "organ": "기관", "blood": "혈액", "heart": "심장", "lung": "폐",
    "kidney": "콩팥", "liver": "간", "muscle": "근육", "bone": "뼈",
    "plant": "식물", "animal": "동물", "leaf": "잎", "root": "뿌리",
    "flower": "꽃", "seed": "씨", "anatomy": "해부",
    # 지구·천문
    "earth": "지구", "rock": "암석", "mineral": "광물", "volcano": "화산",
    "earthquake": "지진", "fault": "단층", "fossil": "화석", "strata": "지층",
    "plate": "판", "tectonic": "판구조", "erosion": "침식",
    "atmosphere": "대기", "cloud": "구름", "front": "전선", "pressure": "기압",
    "wind": "바람", "ocean": "해양", "tide": "조석", "ocean current": "해류",
    "planet": "행성", "star": "항성", "orbit": "궤도", "eclipse": "식",
    "moon": "달", "sun": "태양", "galaxy": "은하", "telescope": "망원경",
    # 일반
    "diagram": "도해", "scheme": "도식", "structure": "구조",
    "cross section": "단면", "section": "단면", "model": "모형",
    "graph": "그래프", "chart": "도표", "symbol": "기호", "icon": "기호",
}


def orig_title(it):
    """Commons 원제. name 은 손질하며 바뀌므로 출처 URL 에서 되찾는다."""
    src = it.get("source", "")
    if "File:" in src:
        t = urllib.parse.unquote(src.split("File:", 1)[1])
        return t.rsplit(".", 1)[0].replace("_", " ")
    return it.get("sourceTitle") or it.get("name", "")


# 낱말 중간에 걸리면 안 된다. 경계 없이 찾으면 "ion" 이 "representation" 안에서,
# "cell" 이 "cellulose" 안에서 걸려 엉뚱한 이름이 붙는다(실측으로 잡은 오탐).
# 앞은 접두어로 써야 하는 몇 개만 뒤 경계를 뺀다.
PREFIX_OK = {"mitochondri", "molecul", "magnet"}
_COMPILED = [
    (re.compile(r"\b" + re.escape(en.strip()) + ("" if en.strip() in PREFIX_OK else r"\b"),
                re.I), ko)
    for en, ko in TERMS.items()
]


def koreanize(title):
    """제목에서 한글 검색어를 뽑는다. 낱말 단위로만 맞춘다."""
    hits = []
    for pat, ko in _COMPILED:
        if pat.search(title) and ko not in hits:
            hits.append(ko)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제로 지우고 갱신")
    args = ap.parse_args()

    if not HARVEST.exists():
        print("harvest.json 이 없다 — 먼저 harvest_parts.py 를 돌려야 한다")
        return 1
    items = json.loads(HARVEST.read_text(encoding="utf-8"))

    keep, junk = [], []
    for it in items:
        hay = it.get("name", "") + " " + " ".join(it.get("sourceTags", []))
        (junk if JUNK.search(hay) else keep).append(it)

    for it in keep:
        # 원제는 출처 URL 에서 되찾는다. name 을 그대로 쓰면 두 번 돌렸을 때
        # 이미 한글로 바뀐 것을 다시 번역하려 들어 원제가 영영 사라진다.
        title = orig_title(it)
        ko = koreanize(title)
        # 한글 검색어 + 영문 원제 토큰을 함께 넣는다 — 둘 다로 찾히게.
        en = [t for t in re.findall(r"[a-zA-Z]{3,}", title.lower())][:6]
        it["keywords"] = ko + en
        # 한글은 앞에 세우되 **원제를 지우지 않는다.** "판"만 남으면
        # 그게 접시인지 지각판인지 알 수 없다.
        it["name"] = f"{' · '.join(ko[:3])} ({title})" if ko else title
        it["sourceTitle"] = title
        it.setdefault("defaultLevel", "L2")

    named = sum(1 for it in keep if it["keywords"] and re.search(r"[가-힣]", it["name"]))
    print(f"전체 {len(items)}장")
    print(f"  버릴 것 {len(junk)}장 (이모지·아이콘·로고 계열)")
    print(f"  남길 것 {len(keep)}장 · 그중 한글 이름이 붙은 것 {named}장 ({named*100//max(len(keep),1)}%)")
    if junk[:8]:
        print("  버릴 것 예시:", ", ".join(j["name"][:28] for j in junk[:8]))

    if not args.apply:
        print("\n(--apply 를 붙이면 실제로 지우고 harvest.json 을 갱신한다)")
        return 0

    removed = 0
    for j in junk:
        f = SVG_DIR / j["file"]
        if f.exists():
            f.unlink(); removed += 1
    HARVEST.write_text(json.dumps(keep, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n파일 {removed}장 삭제 · harvest.json {len(keep)}건으로 갱신")
    print("다음: python tools/build_parts_manifest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
