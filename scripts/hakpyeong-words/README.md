# 학평 낱말 위치·카드 높이 만들기 (11-09)

학평 검색 형광 상자용 `assets/exampool/convert/data/hakpyeong/words/<과목>.json.gz`를 만든다.

1. `pdfs.json`(학평 PDF 경로 목록, 드라이브 `5E_공유폴더테스트_0916/학력평가/…/문제/`, 색인 sha256과 같은 것만)과 `list.tsv`를 작업 폴더에 둔다.
2. `swiftc -O ocr.swift -o ocr` 뒤 `./runall.sh` — 맥 Vision OCR로 쪽마다 낱말·위치(`out/<파일>.json`). 560개·2,252쪽, 4개씩 약 10분.
3. `python3 cardsize.py` — 학평 카드 그림(exam-search/cards/*.webp) 머리 64바이트만 받아 크기(`cardsize.json`).
4. `python3 build.py` — 문항 칸 안 낱말(좌표 ×10000 정수)과 카드 높이÷칸 높이(`cardHeight`)를 과목별로 묶음.

카드 그림은 문항 칸 위·폭은 그대로, 아래 빈 곳만 잘라 낸 그림이라 `js/pdf-library/hakpyeong-pack.js`가 칸 높이를 `cardHeight`만큼 줄인다.
