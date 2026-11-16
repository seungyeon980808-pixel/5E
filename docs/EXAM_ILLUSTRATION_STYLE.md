# Scientific illustration appearances

The previous basic drawing omitted glass thickness, rim ellipses, perspective and biological shape variants. The optional appearances below redraw native SVG geometry from each object's settings. They are schematic illustrations, not simulations.

## Fields and compatibility

| Type | Field | Values / meaning |
| --- | --- | --- |
| vessel | illustrationStyle | `diagram` or missing: old section drawing; `exam`: illustrated glassware / acrylic tank |
| vessel/tank | depthRatio | Perspective depth, 0.02–0.3. Partition position and each side's liquid level remain independent. |
| vessel/burette | valveAngle | Rotates the lower illustrated valve. Optional upper stopcock retains its existing behavior. |
| apparatus/thermometer | illustrationStyle | `exam` draws a slender glass thermometer, fine graduations and a reservoir; missing retains the original icon. |
| chromosome | chromosomeForm | Missing/`capsule`: original two-capsule notation; `segmented`: rod with centromere constriction; `spread`: separated arms when replicated. |
| chromosome | spreadAngle | Arm opening, 0–50 degrees. `replicated:false` draws one segmented chromatid. |
| chromosome | fillStyle | Existing styles plus `black`. Centromere position, width and homologous pairs remain editable. |
| neuron | illustrationStyle | `exam`: irregular soma, branching dendrites, tapered axon and terminal branches. The same p1/p2 and branch-count controls are used. |

Missing fields are deliberately not migrated into the new appearance. New library presets for illustrated glassware, the tank, thermometer, chromosome and neuron opt in explicitly. Users can change appearance in the inspector. These fields are serialized with the independent object.

Reference drawings have different conventions. An illustrated beaker and a two-dimensional round flask should not be treated as one mandatory visual style. Vessel section drawings remain selectable. Electrode assemblies, clamps, lids, labels and other occluding objects in the reference crops are separate parts and are not baked into the vessel.

## Rendering and bounds

`render/exam-illustration.js` generates absolute drawing-mm coordinates. There are no raster images or SVG group scales; resizing preserves stroke weight and text size. Gradients, clips and masks use per-object IDs. All liquid shading clips to the cavity. U-tube highlights also mask to the independently filled sides.

`vesselLayout` supplies the illustrated interior. `vesselBBox` includes the raised tank handle and the burette valve sweep. Content-fit export rotates the bounds about the vessel body center. Neuron selection includes its Bezier control hull. Spread chromosome bounds include opened arms.

Liquid volume uses the existing schematic width-profile calibration. Width and height in drawing mm do not automatically change the labelled capacity. Fluid flow, density mixing, gravity-horizontal surfaces and mechanical connections are not calculated.

## Reference provenance and verification

The style pass used the following existing question-survey crops, retaining the original files:

- Beaker: 2027 September Chemistry I Q7 (C01).
- Erlenmeyer flask: 2027 June Chemistry II Q5 (C02).
- Round flask: 2026 June Chemistry II Q3 (C03).
- Osmosis U tube, burette, glass thermometer: 2026 CSAT Chemistry II Q1 (C08/C14/C19).
- Acrylic partition tank: 2027 September Earth Science I Q4 (E21).
- Spread chromosome: 2026 June Biology I Q18 (B19).
- Segmented chromosome: 2026 September Biology I Q18 (B20).
- Neuron: 2026 September Biology I Q15 (B21).

`desktop/exam-illustration.test.cjs` exercises appearance selection, undo/lock behavior, independent levels, depth and partition edits, valve rotation, thermometer mode switching, chromosome form/replication, neuron bounds and project persistence. The existing science-object tests remain in place.

The comparison artifact renders the real modules and pairs them with unmodified reference crops. It tests no visual-similarity score. Native GUI addition, editing and export still require a separate smoke check; model/renderer tests are not a substitute for that check.

## Incremental batch 02 — independent lab parts

`render/exam-lab-parts.js` adds six native `apparatus` kinds. Each uses existing box placement, independent object IDs, resizing and project serialization. Presets are registered in `templates.js`; their labels and keywords are searchable. Apparatus icon samples now carry the same preset properties as placement (including the illustrated thermometer), correcting a mismatch in the earlier branch.

| Kind | Inspector fields | Reference |
| --- | --- | --- |
| rubber_stopper | holeCount 0–3; taper 0–0.3 | C04: 2027 June Chemistry II Q5 |
| dropping_funnel | liquid 0–1; valveAngle 0–90; funnelBodyRatio 0.2–1 | C05: same source |
| glass_tube | tubeRoute elbow/bridge; bendAt 0.15–0.8; tubeWidthRatio 0.02–0.16; inletDepth 0.05–0.8 | C06: same source |
| metal_electrode | depthRatio 0.02–0.2 | C09: 2026 CSAT Chemistry II Q1 |
| stirrer | loopRatio 0.25–0.85 | C20: same source |
| pipe_valve | valveAngle 0–90 | E24: 2027 June Earth Science II Q4 |

Stopper holes are masked transparent apertures so separately placed tubes remain visible through them. `funnelBodyRatio` shortens the reservoir while keeping a long lower stem, rather than stretching the whole bulb. A bridge-shaped tube has an adjustable first leg. Its inlet leg is limited to the available box height, and pipe cross-sections are bounded by the box dimensions. Valve angle redraws its stem or plug; it does not simulate flow. Funnel liquid is height-based and has no mL calibration.

The batch project contains six base states, six alternative states, and a four-object flask assembly. The assembly maps the source ROIs and adjusts the pipe to the stopper aperture positions. It is a partial scene reconstruction: the pressure instrument, upper valve, labels and other components are not included. Shape, shading and exact attachment differences remain in `quality-ledger.json`; none of these visual cases is marked approved. Native GUI verification is still outstanding.
