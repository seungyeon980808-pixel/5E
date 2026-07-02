# 5E Physics Drawing Web

5E Physics Drawing Web은 과학/물리 교사가 시험지와 학습지에 넣을 그림을 빠르게 만들기 위한 웹 기반 과학 다이어그램 드로잉 도구입니다.

## 대상 사용자

- 과학 교사
- 물리 교사
- 시험지/학습지 그림 제작자

## 주요 기능

기본 도형, 선/화살표/길이 표시, 텍스트와 수식형 텍스트, 라벨러/각도 호/직각 표시, 회로/광학/역학/전자기학 템플릿, 스냅, 가이드/눈금자, JSON 저장/불러오기, 이미지 불러오기, 로컬 이미지 객체화 초안, PNG/SVG 및 영역 지정 내보내기를 지원합니다.

## 로컬 실행

```powershell
cd C:\Users\user\Desktop\project\51_phy_draw_web
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Export features

- PNG export with 200/300/400 dpi
- SVG export
- Selected-area export
- Timestamp filename behavior: `YYYYMMDD_HHmm`
- File System Access API save picker where supported, with browser download fallback

## Save/load features

Project JSON saves `objects`, `guides`, `layers`, and `artboard` using schema `0.15`. Undo history, selection state, and current viewBox are not saved.

## Current limitations

- Fonts are not embedded, so export appearance depends on installed fonts.
- Some shortcuts are implemented but not fully discoverable in UI.
- Snap and transform paths are complex and need regression QA before major edits.
- Local image objectify is a rough draft, not a complete automatic conversion.

## Planned advanced features

API-based image-to-object conversion is planned but not currently available. No API key is included in this repository. A local computer vision fallback may be explored.

## Development status

Current displayed version: `v0.36.1`.

## Screenshot

Placeholder for future screenshots.

## GitHub Pages deployment note

The app is static and can be deployed to GitHub Pages. Keep module `?v=` values aligned with the release version to avoid stale browser module cache.

## Credits

Developed by 박승연 | SMOE

## License

License placeholder.
