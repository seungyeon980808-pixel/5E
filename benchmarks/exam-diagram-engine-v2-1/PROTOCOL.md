# V2.1 benchmark protocol

This successor benchmark was created because the original V2 final split had already produced a release failure and could not ethically be reused for tuning.

- The 20 scenario families are distinct from the original final families.
- Families 1–3 per subject form development; families 4–5 form final.
- Each family appears once in every input mode.
- Development-only corrections were completed before `FINAL_FREEZE.json`.
- Final rendering is single-attempt evaluation. No failed final output may be replaced.
- Vector results require schema validation, closed-inventory validation, exact deterministic rendering, rubric scoring, and manual visual/science review.
- Stability selects one hard development case per subject/input-mode cell and renders it independently three times.

The vector benchmark validates the reviewed scene-contract workflow, not autonomous pixel recognition. Reference and sketch inputs are evidence used by Codex during contract analysis; the renderer consumes only the approved contract.
