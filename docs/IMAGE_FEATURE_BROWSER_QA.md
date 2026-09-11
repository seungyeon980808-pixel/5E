# Image feature isolated browser QA

Date: 2026-09-10

Browser: Safari 26.6.2 on macOS

Surface: `experiments/image-features-qa.html`

## Boundary

This is an isolated fixture page that calls the public processing modules in a
real browser. It does not modify or claim integration with `js/ai-panel.js` or
`js/image-objectify.js`, and it makes no AI-generation request.

## Result

Both the lead run and an independent QA executor ran:

```sh
node experiments/image-features-qa-driver.mjs
```

Final result: **4 passed, 0 failed**.

1. Open-beaker background processing removed the exterior while retaining
   internal white `[255,255,255,255]` and pale gray `[226,226,226,255]`.
2. The beaker, thermometer, and stand fixture produced three independently
   movable image groups, assigned all 169 foreground pixels, used one undo
   snapshot, and reconstructed all three groups after project serialization
   and reopening.
3. Scoped apply preserved hidden outside-mask RGBA `[9,8,7,0]`, changed two
   selected pixels, and rejected discarded and duplicate applications.
4. A simulated OCR network failure returned `NETWORK_DOWN`, retained the
   original bytes, and kept `replacementAllowed: false`.

The retained independent screenshot is 249,065 bytes with SHA-256:

```text
5b8d9ce7ff06182eef1c72211a818fb71279a60571fc9e0cdb2e644ef53a98da
```

Retained evidence:

- `.omo/evidence/st_01a08af8-safari.png`
- `.omo/evidence/st_01a08af8-safari-report.json`
- `.omo/evidence/st_01a08af8-command-output.txt`
- `.omo/evidence/st_01a08af8-manual-qa.md`

## Product UI integration (2026-09-11)

The AI workbench now exposes the background and color processing options in
the product panel. The selected result is shared by the live preview, PNG
download, and page insertion, while the first generated PNG remains unchanged.
The default remains `preserve` with the original colors.

Manual QA used the real `index.html` workbench and production modules with a
local desktop bridge. It confirmed option switching, processed PNG download,
page insertion, and undo. The browser console remained free of warnings and
errors. Responsive captures were checked at 375, 768, and 1280 pixels.

The full automated suite completed with **559 passed, 0 failed**.

## Default-option regression check (2026-09-11)

The Codex in-app browser ran the isolated fixture page: **4 passed**.
Background checks now omit `examPalette` and also exercise the real PNG
`transparentizeGeneratedImage` wrapper. Exterior alpha was 0, internal white
remained `[255,255,255,255]`, pale gray remained `[226,226,226,255]`, and
`backgroundPolicy: "preserve"` retained the complete source RGBA.
Explicit palette conversion remains covered by automated tests.
This run does not claim product-panel integration or repeat the Safari run.
