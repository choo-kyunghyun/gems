#!/usr/bin/env python3
"""texture_sprites — generate the near-white 32x32 wall/floor face textures as GameMaker sprites.

The spr_tex_* family (RenderWalls / the floor RenderTileMap layers) is texture x tint x light:
a near-white pattern sheet serves every material color by tint, so this generator emits PATTERN,
not color — luminance ~200-230 with subtle features, tileable by construction. The original
spr_tex_brick/plaid/tile/carpet/mosaic are hand-made; these are the 2026-07-12 procedural
additions (poured concrete / metal panel / scrap plank wall materials):

  spr_tex_concrete — coarse noise blotches + sparse pocks (poured concrete)
  spr_tex_metal    — panel seams + corner rivets + faint horizontal brushing (metal panel)
  spr_tex_plank    — vertical planks: 1px gaps, per-plank tone, grain strokes + a knot (scrap plank)

Single-frame GMSprites written like terrain_sprites.py: the resource must be REGISTERED once
(gm-cli resourcetool RESOURCE CREATE TYPE=Sprite), then this fills frames deterministically
(uuid5 — churn-free re-runs).

Usage:  python tools/pixel-art-kit/gm-import/texture_sprites.py [project_root]
"""
import os, sys, uuid, random
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P
from terrain_materials import _coarse_noise

S = 32
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "gems.textures")  # stable namespace -> deterministic ids
PARENT = ("Textures", "folders/Media/Bitmap Sprites/Textures.yy")


def tex_concrete(seed=101):
    """Poured concrete: coarse low-contrast noise blotches over a light grey + sparse pocks."""
    rng = random.Random(seed)
    n = _coarse_noise(S, 5, seed)
    lo, hi = min(n), max(n)
    span = (hi - lo) or 1.0
    px = []
    for v in n:
        t = (v - lo) / span
        c = (203, 200, 195) if t < 0.22 else (222, 219, 214) if t > 0.82 else (214, 211, 206)
        px.append(c + (255,))
    for _ in range(9):  # small air-pocket pocks, kept off the border (tiling)
        x = rng.randrange(2, S - 2)
        y = rng.randrange(2, S - 2)
        px[y * S + x] = (188, 185, 180, 255)
        if rng.random() < 0.4:
            px[y * S + x + 1] = (196, 193, 188, 255)
    return px


def tex_metal(seed=103):
    """Metal panel: one cell = one plate — dark seam along the right/bottom edge, corner rivets,
    faint horizontal brush streaks."""
    rng = random.Random(seed)
    base = (211, 214, 218)
    px = [base + (255,)] * (S * S)
    for _ in range(16):  # brushing: short 1px horizontal streaks, slightly light or dark
        x = rng.randrange(S)
        y = rng.randrange(1, S - 2)
        ln = rng.randint(6, 14)
        c = (218, 221, 225) if rng.random() < 0.5 else (204, 207, 212)
        for i in range(ln):
            px[y * S + ((x + i) % S)] = c + (255,)
    seam = (184, 188, 194, 255)
    for i in range(S):  # plate seam on the right + bottom edges (tiles into a panel grid)
        px[i * S + (S - 1)] = seam
        px[(S - 1) * S + i] = seam
    rivet = (178, 182, 190, 255)
    hi = (226, 229, 233, 255)
    for cx, cy in ((4, 4), (S - 7, 4), (4, S - 7), (S - 7, S - 7)):
        for dy in range(2):
            for dx in range(2):
                px[(cy + dy) * S + (cx + dx)] = rivet
        px[(cy - 1) * S + cx] = hi  # top-left catchlight
    return px


def tex_plank(seed=107):
    """Scrap plank: four 8px vertical planks — 1px gaps, per-plank tone jitter, vertical grain
    strokes, one knot."""
    rng = random.Random(seed)
    px = [(0, 0, 0, 255)] * (S * S)
    gap = (176, 170, 160, 255)
    for p in range(4):
        d = rng.randint(-5, 5)  # per-plank tone
        tone = (212 + d, 206 + d, 196 + d)
        for y in range(S):
            for x in range(p * 8, p * 8 + 8):
                px[y * S + x] = tone + (255,)
        for _ in range(7):  # grain: short vertical strokes inside the plank (off the gap columns)
            x = p * 8 + rng.randrange(1, 8)
            y = rng.randrange(S)
            ln = rng.randint(3, 7)
            g = rng.random()
            c = (tone[0] - 14, tone[1] - 15, tone[2] - 16) if g < 0.6 else (tone[0] + 9, tone[1] + 9, tone[2] + 8)
            for i in range(ln):
                px[((y + i) % S) * S + x] = c + (255,)
    for p in range(4):  # 1px board gap on each plank's left edge (tiles: rightmost gap = x0)
        for y in range(S):
            px[y * S + p * 8] = gap
    kx, ky = 8 * rng.randrange(4) + rng.randint(2, 5), rng.randint(4, S - 6)  # one knot
    for dy in range(2):
        for dx in range(2):
            px[(ky + dy) * S + (kx + dx)] = (182, 172, 158, 255)
    px[(ky - 1) * S + kx] = (194, 186, 174, 255)
    px[(ky + 2) * S + kx + 1] = (194, 186, 174, 255)
    return px


TEXTURES = {
    "spr_tex_concrete": tex_concrete,
    "spr_tex_metal": tex_metal,
    "spr_tex_plank": tex_plank,
}


def yy(name, fid, layer_id, kid):
    sprpath = f"sprites/{name}/{name}.yy"
    return f"""{{
  "$GMSprite":"v2",
  "%Name":"{name}",
  "bboxMode":0,
  "bbox_bottom":{S - 1},
  "bbox_left":0,
  "bbox_right":{S - 1},
  "bbox_top":0,
  "collisionKind":1,
  "collisionTolerance":0,
  "DynamicTexturePage":false,
  "edgeFiltering":false,
  "For3D":false,
  "frames":[
    {{"$GMSpriteFrame":"v1","%Name":"{fid}","name":"{fid}","resourceType":"GMSpriteFrame","resourceVersion":"2.0",}},
  ],
  "gridX":0,
  "gridY":0,
  "height":{S},
  "HTile":false,
  "layers":[
    {{"$GMImageLayer":"","%Name":"{layer_id}","blendMode":0,"displayName":"default","isLocked":false,"name":"{layer_id}","opacity":100.0,"resourceType":"GMImageLayer","resourceVersion":"2.0","visible":true,}},
  ],
  "name":"{name}",
  "nineSlice":null,
  "origin":0,
  "parent":{{
    "name":"{PARENT[0]}",
    "path":"{PARENT[1]}",
  }},
  "preMultiplyAlpha":false,
  "resourceType":"GMSprite",
  "resourceVersion":"2.0",
  "sequence":{{
    "$GMSequence":"v1",
    "%Name":"{name}",
    "autoRecord":true,
    "backdropHeight":768,
    "backdropImageOpacity":0.5,
    "backdropImagePath":"",
    "backdropWidth":1366,
    "backdropXOffset":0.0,
    "backdropYOffset":0.0,
    "events":{{
      "$KeyframeStore<MessageEventKeyframe>":"",
      "Keyframes":[],
      "resourceType":"KeyframeStore<MessageEventKeyframe>",
      "resourceVersion":"2.0",
    }},
    "eventStubScript":null,
    "eventToFunction":{{}},
    "length":1.0,
    "lockOrigin":false,
    "moments":{{
      "$KeyframeStore<MomentsEventKeyframe>":"",
      "Keyframes":[],
      "resourceType":"KeyframeStore<MomentsEventKeyframe>",
      "resourceVersion":"2.0",
    }},
    "name":"{name}",
    "playback":1,
    "playbackSpeed":0.0,
    "playbackSpeedType":0,
    "resourceType":"GMSequence",
    "resourceVersion":"2.0",
    "showBackdrop":true,
    "showBackdropImage":false,
    "timeUnits":1,
    "tracks":[
      {{"$GMSpriteFramesTrack":"","builtinName":0,"events":[],"inheritsTrackColour":true,"interpolation":1,"isCreationTrack":false,"keyframes":{{"$KeyframeStore<SpriteFrameKeyframe>":"","Keyframes":[
            {{"$Keyframe<SpriteFrameKeyframe>":"","Channels":{{
                "0":{{"$SpriteFrameKeyframe":"","Id":{{"name":"{fid}","path":"{sprpath}",}},"resourceType":"SpriteFrameKeyframe","resourceVersion":"2.0",}},
              }},"Disabled":false,"id":"{kid}","IsCreationKey":false,"Key":0.0,"Length":1.0,"resourceType":"Keyframe<SpriteFrameKeyframe>","resourceVersion":"2.0","Stretch":false,}},
          ],"resourceType":"KeyframeStore<SpriteFrameKeyframe>","resourceVersion":"2.0",}},"modifiers":[],"name":"frames","resourceType":"GMSpriteFramesTrack","resourceVersion":"2.0","spriteId":null,"trackColour":0,"tracks":[],"traits":0,}},
    ],
    "visibleRange":null,
    "volume":1.0,
    "xorigin":0,
    "yorigin":0,
  }},
  "swatchColours":null,
  "swfPrecision":0.5,
  "textureGroupId":{{
    "name":"Default",
    "path":"texturegroups/Default",
  }},
  "type":0,
  "VTile":false,
  "width":{S},
}}"""


def build(name, fn):
    sprdir = os.path.join(ROOT, "sprites", name)
    fid = str(uuid.uuid5(NS, f"{name}:frame:0"))
    kid = str(uuid.uuid5(NS, f"{name}:key:0"))
    layer_id = str(uuid.uuid5(NS, f"{name}:layer"))

    os.makedirs(sprdir, exist_ok=True)
    for root, dirs, files in os.walk(sprdir, topdown=False):  # wipe stale files, keep the dir
        for f in files:
            os.remove(os.path.join(root, f))
        for d in dirs:
            os.rmdir(os.path.join(root, d))

    px = fn()
    P.write_png(os.path.join(sprdir, f"{fid}.png"), S, S, px)  # composite
    ld = os.path.join(sprdir, "layers", fid)
    os.makedirs(ld, exist_ok=True)
    P.write_png(os.path.join(ld, f"{layer_id}.png"), S, S, px)  # single "default" layer
    with open(os.path.join(sprdir, f"{name}.yy"), "w", newline="\n") as fh:
        fh.write(yy(name, fid, layer_id, kid))


if __name__ == "__main__":
    print(f"importing into {ROOT}/sprites/")
    for name, fn in TEXTURES.items():
        build(name, fn)
        print(f"  {name}: 1 frame ({S}x{S})")
