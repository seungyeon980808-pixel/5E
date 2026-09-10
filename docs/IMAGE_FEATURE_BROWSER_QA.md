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

## Remaining product UI work

The UI owner must still connect the documented options, review metadata, and
OCR suggestion state to the product panel/objectification surfaces. Until that
separate work changes and verifies those owner files, only the isolated
processing surface is complete.
