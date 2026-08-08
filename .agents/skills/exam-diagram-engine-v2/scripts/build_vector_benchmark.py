#!/usr/bin/env python3
"""Build an uncontaminated 60-case V2.1 vector benchmark and source assets."""

from __future__ import annotations

import argparse
import json
from copy import deepcopy
from pathlib import Path

from PIL import Image, ImageFilter

from vector_renderer import render_scene


MODES = ("reference_image", "description_only", "sketch_plus_description")
MODE_CODE = {"reference_image": "ref", "description_only": "txt", "sketch_plus_description": "sketch"}


class SceneBuilder:
    def __init__(self, case_id: str, width=1200, height=800):
        self.scene = {
            "case_id": case_id,
            "canvas": {"width": width, "height": height, "background": "white", "minimum_margin_fraction": 0.05},
            "primitives": [], "instances": [], "connections": [],
        }
        self._instances = {}

    def add(self, object_id, kind, primitive_type, role, **geometry):
        primitive_id = f"{object_id}-p{len(self.scene['primitives']) + 1}"
        primitive = {"id": primitive_id, "type": primitive_type, "role": role, "stroke": "black", "fill": "none", "line_width": 2.4}
        primitive.update(geometry)
        self.scene["primitives"].append(primitive)
        if object_id not in self._instances:
            instance = {"id": object_id, "kind": kind, "primitive_ids": []}
            self._instances[object_id] = instance
            self.scene["instances"].append(instance)
        self._instances[object_id]["primitive_ids"].append(primitive_id)
        return primitive_id

    def connect(self, source, target, kind):
        self.scene["connections"].append({"from": source, "to": target, "kind": kind})


def line(builder, obj, kind, points, role="connector", width=2.4):
    builder.add(obj, kind, "polyline", role, points=points, line_width=width)


def ellipse(builder, obj, kind, bbox, role="apparatus", fill="none", width=2.4):
    builder.add(obj, kind, "ellipse", role, bbox=bbox, fill=fill, line_width=width)


def rect(builder, obj, kind, bbox, role="apparatus", fill="none", width=2.4):
    builder.add(obj, kind, "rect", role, bbox=bbox, fill=fill, line_width=width)


def polygon(builder, obj, kind, points, role="apparatus", fill="none", width=2.4, stroke="black"):
    builder.add(obj, kind, "polygon", role, points=points, fill=fill, stroke=stroke, line_width=width)


def path(builder, obj, kind, commands, role="boundary", fill="none", width=2.4):
    builder.add(obj, kind, "path", role, commands=commands, fill=fill, line_width=width)


def spring_points(x, y0, y1, turns=8, amplitude=0.025):
    points = [[x, y0]]
    for index in range(turns * 2):
        y = y0 + (index + 1) * (y1 - y0) / (turns * 2 + 1)
        points.append([x + (amplitude if index % 2 == 0 else -amplitude), y])
    points.append([x, y1])
    return points


def pendulum_two_states(case_id):
    b = SceneBuilder(case_id)
    line(b, "panel", "two-state divider", [[0.5,0.10],[0.5,0.90]], "panel", 1.8)
    for suffix, pivot, bob in (("left",[0.25,0.20],[0.18,0.70]),("right",[0.75,0.20],[0.84,0.70])):
        line(b, f"support-{suffix}", "support", [[pivot[0]-0.14,0.20],[pivot[0]+0.14,0.20]], "support")
        line(b, f"string-{suffix}", "pendulum string", [pivot,bob], "connector")
        ellipse(b, f"bob-{suffix}", "pendulum bob", [bob[0]-0.035,bob[1]-0.05,bob[0]+0.035,bob[1]+0.05])
        b.connect(f"string-{suffix}", f"support-{suffix}", "supported_by")
        b.connect(f"bob-{suffix}", f"string-{suffix}", "supported_by")
    return b.scene, ["two supports", "two equal strings", "two identical pendulum bobs"], ["only pendulum angle differs"]


def lever_balance(case_id):
    b=SceneBuilder(case_id)
    polygon(b,"fulcrum","triangular fulcrum",[[0.46,0.72],[0.54,0.72],[0.50,0.60]],"support")
    line(b,"beam","rigid lever beam",[[0.18,0.52],[0.82,0.66]],"apparatus",3)
    rect(b,"load-left","rectangular load",[0.20,0.43,0.30,0.535])
    rect(b,"load-right","rectangular load",[0.70,0.55,0.78,0.646])
    b.connect("beam","fulcrum","supported_by"); b.connect("load-left","beam","supported_by"); b.connect("load-right","beam","supported_by")
    return b.scene,["one lever beam","one fulcrum","two loads"],["beam is continuous and supported at one pivot"]


def hydraulic_pistons(case_id):
    b=SceneBuilder(case_id)
    path(b,"fluid","continuous liquid",[["M",0.20,0.62],["L",0.20,0.82],["L",0.80,0.82],["L",0.80,0.52],["L",0.70,0.52],["L",0.70,0.76],["L",0.30,0.76],["L",0.30,0.62],["Z"]],"material_region","gray")
    path(b,"vessel","connected vessel",[["M",0.20,0.28],["L",0.20,0.82],["L",0.80,0.82],["L",0.80,0.28]],"boundary")
    rect(b,"piston-small","small piston",[0.18,0.54,0.32,0.61],"apparatus","white")
    rect(b,"piston-large","large piston",[0.68,0.44,0.82,0.51],"apparatus","white")
    b.connect("fluid","vessel","contained_by"); b.connect("piston-small","fluid","touching"); b.connect("piston-large","fluid","touching")
    return b.scene,["one connected vessel","one liquid region","two pistons"],["both pistons contact one continuous liquid"]


def floating_cylinder(case_id):
    b=SceneBuilder(case_id,900,900)
    path(b,"vessel","open vessel",[["M",0.20,0.18],["L",0.20,0.84],["L",0.80,0.84],["L",0.80,0.18]],"boundary")
    rect(b,"liquid","liquid region",[0.205,0.48,0.795,0.835],"material_region","gray",1.8)
    rect(b,"cylinder","floating cylinder",[0.41,0.34,0.59,0.62],"apparatus","white",2.8)
    b.connect("liquid","vessel","contained_by"); b.connect("cylinder","liquid","touching")
    return b.scene,["one vessel","one liquid region","one cylinder"],["liquid line crosses the cylinder below its midpoint"]


def cart_track_collision(case_id):
    b=SceneBuilder(case_id)
    line(b,"panel","two-state divider",[[0.50,0.10],[0.50,0.90]],"panel",1.8)
    for suffix,x1,x2 in (("left",0.17,0.34),("right",0.66,0.74)):
        line(b,f"track-{suffix}","horizontal track",[[x1-0.08,0.70],[x2+0.10,0.70]],"support")
        for index,x in enumerate((x1,x2),1):
            rect(b,f"cart-{suffix}-{index}","cart body",[x-0.055,0.56,x+0.055,0.66])
            ellipse(b,f"wheel-{suffix}-{index}-a","wheel",[x-0.043,0.65,x-0.013,0.69])
            ellipse(b,f"wheel-{suffix}-{index}-b","wheel",[x+0.013,0.65,x+0.043,0.69])
            b.connect(f"cart-{suffix}-{index}",f"track-{suffix}","supported_by")
    return b.scene,["two equal panels","four carts","eight wheels","two tracks"],["cart count and identity remain equal across states"]


def filtration(case_id):
    b=SceneBuilder(case_id)
    path(b,"funnel","filter funnel",[["M",0.33,0.20],["L",0.60,0.20],["L",0.50,0.48],["L",0.50,0.62]],"apparatus")
    line(b,"filter-paper","filter paper",[[0.36,0.24],[0.47,0.46],[0.57,0.24]],"material_region")
    path(b,"receiver","open receiver",[["M",0.38,0.60],["L",0.40,0.84],["L",0.67,0.84],["L",0.69,0.60]],"boundary")
    rect(b,"filtrate","filtrate",[0.405,0.73,0.665,0.835],"material_region","gray",1.6)
    b.connect("filter-paper","funnel","contained_by"); b.connect("filtrate","receiver","contained_by"); b.connect("funnel","receiver","not_connected")
    return b.scene,["one funnel","one filter paper","one receiver","one filtrate region"],["funnel stem enters receiver without a stopper"]


def titration(case_id):
    b=SceneBuilder(case_id)
    rect(b,"stand","vertical stand",[0.18,0.16,0.205,0.84],"support","none",2.5)
    path(b,"burette","plain burette",[["M",0.44,0.16],["L",0.44,0.62],["L",0.45,0.68],["L",0.46,0.62],["L",0.46,0.16],["Z"]],"apparatus")
    line(b,"clamp","clamp",[[0.20,0.28],[0.44,0.28]],"support")
    path(b,"flask","conical flask",[["M",0.41,0.70],["L",0.34,0.84],["L",0.59,0.84],["L",0.51,0.70]],"boundary")
    polygon(b,"solution","solution",[[0.37,0.79],[0.56,0.79],[0.59,0.84],[0.34,0.84]],"material_region","gray",1.5)
    b.connect("burette","clamp","supported_by"); b.connect("clamp","stand","supported_by"); b.connect("solution","flask","contained_by"); b.connect("burette","flask","not_connected")
    return b.scene,["one stand","one clamp","one burette","one conical flask","one solution region"],["burette tip remains above the open flask"]


def calorimetry(case_id):
    b=SceneBuilder(case_id,900,900)
    rect(b,"cup","insulated cup",[0.25,0.28,0.75,0.80],"boundary","none",3)
    rect(b,"liquid","liquid region",[0.258,0.50,0.742,0.792],"material_region","gray",1.5)
    rect(b,"lid","plain lid",[0.22,0.24,0.78,0.31],"apparatus","white")
    line(b,"thermometer","unmarked thermometer",[[0.47,0.12],[0.47,0.66]],"apparatus",3)
    ellipse(b,"thermometer-bulb","thermometer bulb",[0.445,0.63,0.495,0.69],"apparatus","white")
    b.connect("liquid","cup","contained_by"); b.connect("lid","cup","touching"); b.connect("thermometer","liquid","touching"); b.connect("thermometer-bulb","thermometer","touching")
    return b.scene,["one insulated cup","one liquid region","one lid","one unmarked thermometer"],["thermometer enters liquid through lid"]


def chromatography(case_id):
    b=SceneBuilder(case_id,900,900)
    path(b,"chamber","open chamber",[["M",0.18,0.16],["L",0.18,0.84],["L",0.82,0.84],["L",0.82,0.16]],"boundary")
    rect(b,"solvent","solvent",[0.185,0.70,0.815,0.835],"material_region","gray",1.5)
    rect(b,"paper","chromatography paper",[0.38,0.22,0.62,0.78],"material_region","white",2)
    ellipse(b,"spot-low","sample spot",[0.47,0.61,0.53,0.67],"particle","black",1.5)
    ellipse(b,"spot-mid","separated spot",[0.45,0.45,0.51,0.51],"particle","gray",1.5)
    ellipse(b,"spot-high","separated spot",[0.52,0.31,0.58,0.37],"particle","white",1.5)
    b.connect("solvent","chamber","contained_by"); b.connect("paper","solvent","touching"); b.connect("spot-low","paper","contained_by"); b.connect("spot-mid","paper","contained_by"); b.connect("spot-high","paper","contained_by")
    return b.scene,["one chamber","one solvent region","one paper strip","three spots"],["lowest spot lies above solvent surface"]


def diffusion_membrane(case_id):
    b=SceneBuilder(case_id)
    rect(b,"container","two-compartment container",[0.12,0.18,0.88,0.82],"boundary")
    line(b,"membrane","porous membrane",[[0.50,0.18],[0.50,0.82]],"material_region",3)
    for index,(x,y) in enumerate(((0.23,0.32),(0.31,0.53),(0.40,0.69),(0.61,0.39),(0.72,0.61)),1):
        ellipse(b,f"particle-{index}","round solute particle",[x-0.025,y-0.035,x+0.025,y+0.035],"particle","white")
        b.connect(f"particle-{index}","container","contained_by")
    for index,(x,y) in enumerate(((0.27,0.66),(0.66,0.29),(0.78,0.70)),1):
        polygon(b,f"solute-{index}","angular solute particle",[[x,y-0.035],[x+0.03,y],[x,y+0.035],[x-0.03,y]],"particle","white")
        b.connect(f"solute-{index}","container","contained_by")
    b.connect("membrane","container","contained_by")
    return b.scene,["one container","one membrane","five round particles","three angular particles"],["particles occur on both sides without direction marks"]


def stomata(case_id):
    b=SceneBuilder(case_id,900,900)
    path(b,"guard-left","left guard cell",[["M",0.47,0.20],["C",0.25,0.28,0.25,0.72,0.47,0.80],["C",0.37,0.63,0.37,0.37,0.47,0.20],["Z"]],"anatomy","gray")
    path(b,"guard-right","right guard cell",[["M",0.53,0.20],["C",0.75,0.28,0.75,0.72,0.53,0.80],["C",0.63,0.63,0.63,0.37,0.53,0.20],["Z"]],"anatomy","gray")
    path(b,"pore","stomatal pore",[["M",0.49,0.27],["C",0.45,0.40,0.45,0.60,0.49,0.73],["C",0.51,0.60,0.51,0.40,0.49,0.27],["Z"]],"material_region","white",1.5)
    b.connect("pore","guard-left","adjacent"); b.connect("pore","guard-right","adjacent")
    return b.scene,["two guard cells","one central pore"],["guard cells are paired around one open pore"]


def onion_cells(case_id):
    b=SceneBuilder(case_id)
    for row in range(2):
        for col in range(4):
            index=row*4+col+1; x0=0.12+col*0.19; y0=0.20+row*0.30
            rect(b,f"cell-{index}","rectangular epidermal cell",[x0,y0,x0+0.19,y0+0.30],"anatomy")
            ellipse(b,f"nucleus-{index}","cell nucleus",[x0+0.07,y0+0.11,x0+0.11,y0+0.17],"anatomy","gray",1.5)
            b.connect(f"nucleus-{index}",f"cell-{index}","contained_by")
    return b.scene,["eight epidermal cells","eight nuclei"],["each cell contains exactly one nucleus"]


def seed_germination(case_id):
    b=SceneBuilder(case_id)
    ellipse(b,"seed","seed body",[0.38,0.30,0.62,0.55],"anatomy","gray")
    path(b,"root","primary root",[["M",0.50,0.52],["C",0.49,0.64,0.43,0.72,0.44,0.86]],"anatomy")
    path(b,"shoot","young shoot",[["M",0.51,0.32],["C",0.54,0.24,0.56,0.18,0.54,0.12]],"anatomy")
    path(b,"leaf-left","first leaf",[["M",0.54,0.18],["C",0.43,0.12,0.39,0.18,0.54,0.22],["Z"]],"anatomy")
    path(b,"leaf-right","second leaf",[["M",0.55,0.16],["C",0.66,0.10,0.70,0.18,0.55,0.21],["Z"]],"anatomy")
    b.connect("root","seed","continuous_path"); b.connect("shoot","seed","continuous_path"); b.connect("leaf-left","shoot","touching"); b.connect("leaf-right","shoot","touching")
    return b.scene,["one seed","one primary root","one shoot","two young leaves"],["root emerges downward and shoot upward"]


def digestive_path(case_id):
    b=SceneBuilder(case_id,800,1000)
    ellipse(b,"mouth","mouth opening",[0.43,0.08,0.57,0.13],"anatomy")
    line(b,"esophagus","esophagus",[[0.50,0.13],[0.50,0.34]],"anatomy",5)
    path(b,"stomach","stomach",[["M",0.50,0.34],["C",0.68,0.31,0.70,0.49,0.57,0.54],["C",0.43,0.52,0.42,0.39,0.50,0.34],["Z"]],"anatomy")
    path(b,"intestine","intestinal path",[["M",0.57,0.52],["C",0.34,0.58,0.68,0.63,0.40,0.68],["C",0.67,0.73,0.35,0.78,0.55,0.84]],"anatomy","none",5)
    line(b,"terminal","terminal tract",[[0.55,0.84],[0.55,0.92]],"anatomy",5)
    b.connect("esophagus","mouth","continuous_path"); b.connect("stomach","esophagus","continuous_path"); b.connect("intestine","stomach","continuous_path"); b.connect("terminal","intestine","continuous_path")
    return b.scene,["one mouth","one esophagus","one stomach","one intestinal path","one terminal tract"],["digestive tube is one continuous path"]


def mitosis_cell(case_id):
    b=SceneBuilder(case_id,900,900)
    ellipse(b,"cell","cell boundary",[0.12,0.12,0.88,0.88],"anatomy")
    ellipse(b,"pole-left","left spindle pole",[0.22,0.47,0.26,0.53],"anatomy","black",1)
    ellipse(b,"pole-right","right spindle pole",[0.74,0.47,0.78,0.53],"anatomy","black",1)
    for index,y in enumerate((0.35,0.46,0.57,0.68),1):
        line(b,f"chromatid-{index}","paired chromosome",[[0.47,y-0.05],[0.53,y+0.05],[0.53,y-0.05],[0.47,y+0.05]],"anatomy",2.5)
        line(b,f"spindle-left-{index}","spindle fiber",[[0.26,0.50],[0.50,y]],"anatomy",1.5)
        line(b,f"spindle-right-{index}","spindle fiber",[[0.74,0.50],[0.50,y]],"anatomy",1.5)
        b.connect(f"chromatid-{index}",f"spindle-left-{index}","touching"); b.connect(f"chromatid-{index}",f"spindle-right-{index}","touching")
    b.connect("pole-left","cell","contained_by"); b.connect("pole-right","cell","contained_by")
    return b.scene,["one cell boundary","two spindle poles","four paired chromosomes","eight spindle fibers"],["chromosomes align between two poles"]


def anticline(case_id):
    b=SceneBuilder(case_id)
    for index,offset in enumerate((0.00,0.07,0.14,0.21),1):
        path(b,f"layer-{index}","folded layer boundary",[["M",0.08,0.72-offset],["C",0.30,0.72-offset,0.36,0.35-offset,0.50,0.32-offset],["C",0.64,0.35-offset,0.70,0.72-offset,0.92,0.72-offset]],"geology",width=2)
    return b.scene,["four folded layer boundaries"],["all layers form one upward arch without crossing"]


def unconformity(case_id):
    b=SceneBuilder(case_id)
    for index,y in enumerate((0.28,0.38,0.48),1): line(b,f"upper-{index}","horizontal upper layer",[[0.10,y],[0.90,y]],"geology",2)
    path(b,"surface","erosional surface",[["M",0.10,0.58],["C",0.28,0.52,0.40,0.62,0.55,0.56],["C",0.68,0.50,0.78,0.61,0.90,0.55]],"geology",width=2.6)
    for index,shift in enumerate((0.00,0.10,0.20),1): line(b,f"lower-{index}","tilted lower layer",[[0.12+shift,0.82],[0.48+shift,0.58]],"geology",2)
    return b.scene,["three horizontal layers","one erosional surface","three tilted layers"],["horizontal layers overlie truncated tilted layers"]


def ocean_floor_profile(case_id):
    b=SceneBuilder(case_id)
    polygon(b,"water","ocean water",[[0.06,0.15],[0.94,0.15],[0.94,0.30],[0.82,0.34],[0.82,0.68],[0.66,0.72],[0.57,0.72],[0.50,0.42],[0.43,0.72],[0.34,0.72],[0.18,0.68],[0.18,0.34],[0.06,0.30]],"material_region","gray",1.5,"none")
    path(b,"seafloor","ocean-floor profile",[["M",0.06,0.30],["C",0.18,0.34,0.18,0.68,0.34,0.72],["C",0.43,0.72,0.45,0.48,0.50,0.42],["C",0.55,0.48,0.57,0.72,0.66,0.72],["C",0.82,0.68,0.82,0.34,0.94,0.30]],"geology",width=3)
    b.connect("water","seafloor","touching")
    return b.scene,["one symmetric ocean-floor profile","one water region"],["central ridge lies between two deep basins"]


def crater_cross_section(case_id):
    b=SceneBuilder(case_id)
    path(b,"surface","crater surface",[["M",0.06,0.38],["L",0.28,0.38],["C",0.34,0.40,0.38,0.70,0.50,0.72],["C",0.62,0.70,0.66,0.40,0.72,0.38],["L",0.94,0.38]],"geology",width=3)
    path(b,"layer-one","first subsurface layer",[["M",0.08,0.53],["C",0.34,0.53,0.38,0.78,0.50,0.79],["C",0.62,0.78,0.66,0.53,0.92,0.53]],"geology",width=2)
    path(b,"layer-two","second subsurface layer",[["M",0.10,0.68],["C",0.34,0.68,0.40,0.86,0.50,0.87],["C",0.60,0.86,0.66,0.68,0.90,0.68]],"geology",width=2)
    return b.scene,["one crater surface","two subsurface layers"],["layers bend downward beneath one bowl-shaped crater"]


def glacier_valley(case_id):
    b=SceneBuilder(case_id)
    path(b,"valley","U-shaped valley",[["M",0.08,0.20],["C",0.16,0.30,0.20,0.72,0.38,0.78],["C",0.45,0.81,0.55,0.81,0.62,0.78],["C",0.80,0.72,0.84,0.30,0.92,0.20]],"geology",width=3)
    path(b,"ice","glacier ice",[["M",0.22,0.44],["C",0.29,0.62,0.34,0.71,0.42,0.73],["C",0.48,0.75,0.52,0.75,0.58,0.73],["C",0.66,0.71,0.71,0.62,0.78,0.44],["L",0.22,0.44],["Z"]],"material_region","gray",2)
    ellipse(b,"moraine-one","rounded moraine clast",[0.36,0.72,0.42,0.78],"geology","white",1.5)
    ellipse(b,"moraine-two","rounded moraine clast",[0.47,0.74,0.53,0.80],"geology","white",1.5)
    ellipse(b,"moraine-three","rounded moraine clast",[0.58,0.72,0.64,0.78],"geology","white",1.5)
    b.connect("ice","valley","contained_by"); b.connect("moraine-one","valley","contained_by"); b.connect("moraine-two","valley","contained_by"); b.connect("moraine-three","valley","contained_by")
    return b.scene,["one U-shaped valley","one ice region","three moraine clasts"],["ice occupies the valley and clasts lie at its base"]


FAMILIES = {
    "physics": [("pendulum-two-states",pendulum_two_states),("lever-balance",lever_balance),("hydraulic-pistons",hydraulic_pistons),("floating-cylinder",floating_cylinder),("cart-track-collision",cart_track_collision)],
    "chemistry": [("filtration",filtration),("titration",titration),("calorimetry",calorimetry),("chromatography",chromatography),("diffusion-membrane",diffusion_membrane)],
    "biology": [("stomata",stomata),("onion-cells",onion_cells),("seed-germination",seed_germination),("digestive-path",digestive_path),("mitosis-cell",mitosis_cell)],
    "earth_science": [("anticline",anticline),("unconformity",unconformity),("ocean-floor-profile",ocean_floor_profile),("crater-cross-section",crater_cross_section),("glacier-valley",glacier_valley)],
}


def make_source(image_path: Path, target: Path, mode: str):
    image=Image.open(image_path).convert("L")
    target.parent.mkdir(parents=True,exist_ok=True)
    if mode=="reference_image":
        image.resize((max(256,image.width//2),max(256,image.height//2)),Image.Resampling.LANCZOS).save(target)
    elif mode=="sketch_plus_description":
        sketch=image.resize((max(256,image.width//2),max(256,image.height//2)),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(0.7))
        sketch=sketch.point(lambda pixel: 255 if pixel>210 else 35)
        sketch.save(target)


def build(root: Path):
    benchmark=root/"benchmarks"/"exam-diagram-engine-v2-1"
    results=root/"results"/"exam-diagram-engine-v2-1"
    development=[]; final=[]
    for subject,families in FAMILIES.items():
        for family_index,(family,builder) in enumerate(families):
            split="development" if family_index<3 else "final"
            for mode in MODES:
                case_id=f"v21-{MODE_CODE[mode]}-{subject.replace('_science','')}-{family}"
                scene,objects,invariants=builder(case_id)
                scene_path=benchmark/"scenes"/split/f"{case_id}.json"
                scene_path.parent.mkdir(parents=True,exist_ok=True)
                scene_path.write_text(json.dumps(scene,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
                preview=benchmark/"source-base"/f"{subject}-{family}.png"
                render_scene(scene,preview)
                input_asset=None
                if mode!="description_only":
                    input_asset=benchmark/"inputs"/mode/f"{case_id}.png"
                    make_source(preview,input_asset,mode)
                case={"case_id":case_id,"split":split,"input_mode":mode,"subject":subject,"scenario_family":family,"difficulty":"hard" if family_index in {2,4} else "medium","required_objects":objects,"scientific_invariants":invariants,"scene_contract":str(scene_path.relative_to(benchmark)).replace('\\','/'),"evaluation":"V2_100_POINT_RUBRIC"}
                if input_asset: case["input_asset"]=str(input_asset.relative_to(benchmark)).replace('\\','/')
                (development if split=="development" else final).append(case)
    for name,cases in (("development",development),("final",final)):
        payload={"benchmark":"exam-diagram-engine-v2-1","version":"2.1.0","split":name,"frozen":False,"cases":cases}
        (benchmark/f"{name}.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"development":len(development),"final":len(final),"benchmark":str(benchmark),"results":str(results)},ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument("--root",default=".")
    build(Path(parser.parse_args().root).resolve())


if __name__=="__main__": main()
