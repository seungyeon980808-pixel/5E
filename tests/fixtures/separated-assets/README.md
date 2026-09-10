# Separated asset regression fixtures

These are permanent AI-generated PNG regression inputs, copied byte-for-byte from local test results. They are not textbook reference inputs.

- `rgb-checkerboard-atlas.png`: rejects a checkerboard baked into RGB pixels.
- `near-white-nonuniform-atlas.png`: reproduces the actual near-white frame and 4/5/1 layout failure; verifies ten assets, complete foreground coverage and exact retained RGBA.
- `lab-assemblies-atlas.png`: deterministic compact fixture for independent beaker, thermometer and stand assemblies, including partially transparent strokes.
- `scientific-assemblies-atlas.png`: deterministic local fixture with a beaker, thermometer, detached scale/stand parts, a grid-boundary crossing, enclosed near-white pixels and a translucent pixel. It verifies assembly grouping and the manual-region handoff without AI.

The first two generated files remain preserved in the local evidence directory and were copied without re-encoding. The assembly fixtures were written locally with deterministic PNG data; no AI generation was performed.
