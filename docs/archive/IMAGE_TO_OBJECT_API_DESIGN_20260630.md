# Image-to-Object API Design 20260630

Status: design only. The current repository has local/browser-side rough extraction in `js/image-objectify.js`, but external API image-to-object conversion is not implemented.

## 1. User workflow

User opens 고급 기능, chooses image upload, clipboard paste, drag-and-drop image, or future image URL. The app shows the source image. User chooses conversion mode: simple line drawing, physics diagram, optics diagram, circuit diagram, or general object extraction. API analyzes the image and returns structured JSON. App shows a preview of converted objects. User accepts, rejects, removes bad detections, or edits before insertion. Only after confirmation are objects added to canvas, and insertion is undoable as one history step.

## 2. API architecture options

A. Browser directly calls API: simple, but API key exposure risk. Not recommended for production.

B. Local backend proxy: safer for API key, user runs local server, more setup complexity.

C. Serverless proxy: safer key management and better for GitHub Pages, but requires deployment and cost controls.

D. Local-only computer vision fallback: no API cost and lower privacy risk, but lower accuracy. Existing local objectify code is an early foundation.

Recommended staged approach: schema and mock import first, then preview/confirmation UX, then proxy-based real API.

## 3. Security requirements

Never hardcode API keys in frontend JS. Never commit API keys. Use `.env` only for local backend if needed and commit only `.env.example`. Add API cost, rate, and image-size limits. Warn users before sending images to external APIs. Allow local fallback. School exam images may contain sensitive or copyrighted material, so explicit consent is required before external upload.

## 4. Object conversion JSON schema

```json
{
  "version": "image-to-object-v1",
  "source": { "width": 1200, "height": 800 },
  "objects": [
    {
      "type": "line",
      "p1": { "x": 10, "y": 20 },
      "p2": { "x": 100, "y": 20 },
      "strokeWidth": 0.2,
      "confidence": 0.92,
      "sourceBox": { "x": 8, "y": 18, "w": 95, "h": 5 },
      "notes": [],
      "unsupported": []
    }
  ],
  "warnings": []
}
```

Examples should cover line, arrow line, rectangle, circle, ellipse, triangle, polyline, text, labeler/callout, angle arc, and physics object/template candidates. Each converted object includes type, geometry, style, label/text, confidence, source bounding box, notes, and unsupported parts.

## 5. Mapping rules

Straight strokes map to line/polyline. Arrowheads map to arrow line. Boxes map to rectangle. Circles/ellipses map to ellipse. Text regions map to text. Text with leader line maps to labeler/callout. Angle marks map to angle arc. Optical rays map to line with arrow. Physics apparatus maps to template/object candidate only when confidence is high. If confidence is low, create simple editable primitives.

## 6. Preview and confirmation UX

Show the original image faintly behind converted objects. Display converted objects as a preview layer. Allow toggling object categories, removing bad detections, and adjusting threshold/detail level. Confirm inserts objects; cancel discards. Undo removes inserted objects as one operation.

## 7. Integration points in existing code

Future integration likely touches advanced UI, `js/image-objectify.js`, object creation/store logic in `js/tools.js`/`js/state.js`, history/undo in `js/transform.js`, `js/project-io.js`, `js/render.js`, `js/svg-export.js`, `js/inspector.js`, and `js/snap.js` if converted objects need snap points. Do not modify these files during this design phase.

## 8. Local computer vision fallback

Phase 1: threshold, edge detection, Hough lines, contour detection, rectangle/circle approximation.

Phase 2: optional OCR, arrowhead detection, labeler detection.

Phase 3: physics object/template recognition.

This is optional and lower priority than schema plus preview flow, though the current local objectify feature can be reused.

## 9. Risks

API cost, API key leakage, inaccurate conversion, too many tiny objects, bad text recognition, object schema mismatch, undo/history pollution, export mismatch, large-image performance problems, and privacy issues when sending school exam images to external APIs.

## 10. Development roadmap

Phase 0 — documentation and schema only. Difficulty low, token cost small, risk low, branch main docs, verify no app behavior changes.

Phase 1 — manual image upload plus API mock JSON import. Difficulty medium, token cost medium, risk medium, branch main feature branch, verify mock imports and one-step undo.

Phase 2 — preview converted objects. Difficulty medium, token cost large, risk medium, branch main feature branch, verify preview categories and no committed objects before confirm.

Phase 3 — confirm/cancel insertion. Difficulty medium, token cost medium, risk medium, branch main feature branch, verify confirm inserts and cancel leaves state unchanged.

Phase 4 — real API proxy. Difficulty high, token cost very large, risk high, separate API branch, verify secrets absent, rate limits, consent warning.

Phase 5 — local CV fallback. Difficulty high, token cost large, risk medium, object-dev worktree, verify performance and sample quality.

Phase 6 — physics-object recognition. Difficulty very high, token cost very large, risk high, object-dev worktree, verify confidence fallback and template mapping.

## 11. Excel/README/PPT integration

This planned feature is included in the Excel backlog and future feature sheets, the README planned advanced features section, and the Korean user guide slide titled `고급 기능 예정: 이미지 → 편집 가능한 객체 변환`.
