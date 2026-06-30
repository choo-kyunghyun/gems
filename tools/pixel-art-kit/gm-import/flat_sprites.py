#!/usr/bin/env python3
"""flat_sprites — the 13 Demo entity sprites in the 'intentional flat/minimal' style.

Supersedes entity_sprites.py (the old hard-alpha 16px set): same deterministic-uuid5 GameMaker
import contract (the sprite resources must already be REGISTERED; re-runs are churn-free), but a
different ART LANGUAGE chosen because the old 16px sprites read worse than colored rectangles in a
busy top-down scene. The flat language keeps the rectangle's one strength — instant saturated color
identity — and adds what it lacked: a clean rounded silhouette, a dark ink outline, and ONE
identifying detail. FLAT by design (no volume gradients — they read as a plastic-toy / edutainment
sheen). The grounding foot-shadow is drawn at RUNTIME by the RenderEntityShadow pass, NOT baked here,
so the sprite art is purely the entity and every body grounds consistently.

Technique: each entity is drawn as hard shapes at 4x (SUPERSAMPLED), then box-downsampled to the final
frame — the alpha averaging gives clean anti-aliased edges, which is what reads as 'designed' rather
than 'failed pixel art'. Default 32px (not 16) because this style needs the room for the detail; the
sprites stay FOOT-ANCHORED (origin bottom-center, w//2, h) so RenderEntity/Animator/facing-flip are
unchanged — only the art differs. Entities therefore draw ~2x the old footprint (more prominent, good
for top-down readability); scale down in Visual.yscale if ever too big.

Frame SIZE is per-sprite: frame(drawfn) defaults to a square S x S, but frame(drawfn, w, h) renders any
W x H — a tall biped (32x64), a wide prop — and build()/yy() write that size with a foot-anchored origin
(w//2, h). Declare the size in the SPRITES table (see its note). The COLLISION box is the entity's own
BBox component, independent of the sprite, so a taller sprite needs no gameplay change.

Usage:  python tools/pixel-art-kit/gm-import/flat_sprites.py [project_root]
"""
import os, sys, math, uuid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P

S = 32                                              # final canvas (foot-anchored 32px; see module doc)
SS = 4                                              # supersample factor for anti-aliasing
W = S * SS
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "gems.entity.sprites")  # SAME namespace as entity_sprites -> churn-free overwrite
PARENT = ("Handmade Sprites", "folders/Media/Handmade Sprites.yy")
TRANSPARENT = (0, 0, 0, 0)
INK = (38, 34, 24)  # outline: a dark WARM brown (RimWorld-style), not cold near-black


def hx(h):
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


# RimWorld-style EARTHY/DESATURATED palette: every hue pulled toward grey/olive/brown, but kept
# value-separated and outlined so entities stay readable in gameplay. Muted color-coding survives
# (cool-teal hero, brick enemy, brass chest) — the look is "serious survival-sim", not "bright toy".
C = {
    "hero": hx("5d8a86"), "heroD": hx("3f615e"), "heroL": hx("82a8a3"), "heroP": hx("76a09b"),
    "foe": hx("9a5048"), "foeD": hx("6b3833"), "foeL": hx("b87168"), "foeEye": hx("e8dcc0"),
    "gold": hx("b39a64"), "goldD": hx("8a7448"), "goldL": hx("cbb488"), "woodDk": hx("4a3f2c"),
    "wood": hx("7a6242"), "woodD": hx("4a3a28"), "woodL": hx("9c8158"),
    "slate": hx("565c54"), "slateD": hx("353a34"), "slateL": hx("808577"),
    "stone": hx("8a8576"), "stoneL": hx("a9a594"),
    "cyan": hx("5a9a98"), "flameO": hx("d4793a"), "flameY": hx("e6bf5e"),
    "purp": hx("6a5a86"), "purpD": hx("2e2840"), "purpDk": hx("443a5a"), "pink": hx("a87a9a"),
    "pale": hx("d8d2c4"), "white": (235, 230, 218),
}


# ---- supersampled soft-shape raster (over-compositing into a float RGBA buffer) ----

# Current frame's buffer dims: _BW/_BH = supersampled buffer, _OW/_OH = downsampled output. Set by
# frame() per call so a sprite can be non-square (e.g. a 32x64 human) — square (S x S) is the default.
_BW, _BH, _OW, _OH = W, W, S, S


def buf():
    return [[0.0, 0.0, 0.0, 0.0] for _ in range(_BW * _BH)]


def over(d, x, y, rgba):
    if x < 0 or x >= _BW or y < 0 or y >= _BH:
        return
    a = rgba[3]
    if a <= 0:
        return
    i = y * _BW + x
    px = d[i]
    na = a + px[3] * (1 - a)
    if na <= 0:
        return
    for k in range(3):
        px[k] = (rgba[k] * a + px[k] * px[3] * (1 - a)) / na
    px[3] = na


def rrect(d, x0, y0, x1, y1, r, col, a=1.0):
    x0 *= SS; y0 *= SS; x1 *= SS; y1 *= SS; r *= SS
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            cx = min(max(x, x0 + r), x1 - r); cy = min(max(y, y0 + r), y1 - r)
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                over(d, x, y, (col[0], col[1], col[2], a))


def ellipse(d, cx, cy, rx, ry, col, a=1.0):
    cx *= SS; cy *= SS; rx *= SS; ry *= SS
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                over(d, x, y, (col[0], col[1], col[2], a))


def tri(d, pts, col, a=1.0):
    xs = [p[0] * SS for p in pts]; ys = [p[1] * SS for p in pts]

    def sg(ax, ay, bx, by, cx, cy):
        return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)

    for y in range(int(min(ys)), int(max(ys)) + 1):
        for x in range(int(min(xs)), int(max(xs)) + 1):
            d1 = sg(x, y, xs[0], ys[0], xs[1], ys[1])
            d2 = sg(x, y, xs[1], ys[1], xs[2], ys[2])
            d3 = sg(x, y, xs[2], ys[2], xs[0], ys[0])
            if not (((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0))):
                over(d, x, y, (col[0], col[1], col[2], a))


def thickline(d, x0, y0, x1, y1, w, col, a=1.0):
    """a thick line = a rotated quad (two triangles) — used for the sword blade + crate brace."""
    dx = x1 - x0; dy = y1 - y0; L = math.hypot(dx, dy) or 1
    px = -dy / L * w / 2; py = dx / L * w / 2
    p = [(x0 + px, y0 + py), (x1 + px, y1 + py), (x1 - px, y1 - py), (x0 - px, y0 - py)]
    tri(d, [p[0], p[1], p[2]], col, a); tri(d, [p[0], p[2], p[3]], col, a)


def outline(d):
    """darken a ~1.5px rim where opaque meets transparent — a clean ink line that separates the
    silhouette from the terrain. Run last (after every fill), before downsample."""
    src = [px[:] for px in d]
    rad = int(1.6 * SS)
    for y in range(_BH):
        for x in range(_BW):
            if src[y * _BW + x][3] > 0.5:
                continue
            hit = False
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < _BW and 0 <= ny < _BH and src[ny * _BW + nx][3] > 0.5:
                        hit = True; break
                if hit:
                    break
            if hit:
                over(d, x, y, (INK[0], INK[1], INK[2], 0.9))


def downsample(d):
    """4x box-downsample the float buffer to an _OW x _OH list of RGBA int tuples (the AA happens here)."""
    out = [TRANSPARENT] * (_OW * _OH)
    for y in range(_OH):
        for x in range(_OW):
            r = g = b = a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    px = d[(y * SS + sy) * _BW + (x * SS + sx)]
                    r += px[0] * px[3]; g += px[1] * px[3]; b += px[2] * px[3]; a += px[3]
            n = SS * SS
            out[y * _OW + x] = (int(r / a), int(g / a), int(b / a), int(255 * a / n)) if a > 0 else TRANSPARENT
    return out


def frame(drawfn, w=S, h=S):
    """Render drawfn into a fresh w x h foot-anchored frame (default square S). drawfn works in
    output-pixel coords (0..w, 0..h); the raster supersamples internally."""
    global _BW, _BH, _OW, _OH
    _OW, _OH, _BW, _BH = w, h, w * SS, h * SS
    d = buf(); drawfn(d); outline(d); return downsample(d)


# ---- the 13 entities (flat fills + outline + one identity detail; NO volume gradients, and the foot
# shadow is drawn at runtime by RenderEntityShadow — not baked here) ----

def _hero_body(d, step, right_arm=True):
    dy = step  # 1px nod on frame 1 -> a gentle walk bob
    rrect(d, 9, 15 + dy, 23, 28, 5, C["hero"])                      # body
    rrect(d, 12.5, 20, 19.5, 27, 3, C["heroP"], 0.5)               # flat lit panel = 'has a body'
    rrect(d, 10, 7 + dy, 22, 18 + dy, 5, C["hero"])                # head (overlaps body, no neck)
    for ex in (14, 18):                                            # calm round eyes
        ellipse(d, ex, 12.5 + dy, 1.8, 2.0, C["white"]); ellipse(d, ex, 13.4 + dy, 0.9, 1.0, INK)


def hero():
    return [frame(lambda d: _hero_body(d, 0)), frame(lambda d: _hero_body(d, 1))]


def _blade(d, hx0, hy0, tx, ty):
    thickline(d, hx0, hy0, tx, ty, 2.0, C["slateL"])               # steel blade
    thickline(d, hx0, hy0, tx, ty, 0.7, C["white"])                # bright edge
    ellipse(d, hx0, hy0, 1.6, 1.6, C["gold"])                      # hilt


def hero_attack():
    def f0(d):
        _hero_body(d, 0); _blade(d, 22, 13, 29, 6)                 # raised strike (up-right)
    def f1(d):
        _hero_body(d, 0); _blade(d, 23, 18, 30, 23)               # follow-through (down-right)
    return [frame(f0), frame(f1)]


def _foe(d, step):
    dy = step
    rrect(d, 8, 15 + dy, 24, 29, 8, C["foe"])                      # blob
    for ex in (12, 20):                                            # menacing eyes
        ellipse(d, ex, 21 + dy, 2.0, 2.0, C["foeEye"]); ellipse(d, ex, 22 + dy, 0.9, 1.1, INK)
    tri(d, [(10, 17 + dy), (16, 20.5 + dy), (16, 18.5 + dy)], C["foeD"])   # angled brows
    tri(d, [(22, 17 + dy), (16, 20.5 + dy), (16, 18.5 + dy)], C["foeD"])
    ellipse(d, 16, 25.5 + dy, 1.7, 0.9, C["foeD"])                 # frown


def bandit():
    return [frame(lambda d: _foe(d, 0)), frame(lambda d: _foe(d, 1))]


def chest():
    def f(d):
        rrect(d, 7, 16, 25, 29, 3, C["gold"])                      # body
        rrect(d, 7, 15, 25, 20, 3, C["goldD"])                     # darker lid band
        rrect(d, 7, 19.4, 25, 20.2, 0.4, C["woodDk"])              # seam
        ellipse(d, 16, 22, 1.7, 1.7, C["woodDk"]); ellipse(d, 16, 21.6, 0.8, 0.8, C["goldL"])  # latch
    return [frame(f)]


def bench():
    def f(d):
        rrect(d, 6, 21, 9, 29, 1, C["woodD"]); rrect(d, 23, 21, 26, 29, 1, C["woodD"])   # legs
        rrect(d, 4, 16, 28, 20.5, 2, C["wood"])                    # top slab
        rrect(d, 17, 11, 25, 15, 1, C["gold"])                     # a plank on top
        rrect(d, 7, 12.5, 16, 15, 0.8, C["slateL"])                # saw blade
        rrect(d, 7, 13.2, 16, 13.6, 0.2, C["white"])               # blade glint
        ellipse(d, 6, 14, 1.2, 1.2, C["woodDk"])                   # saw handle
    return [frame(f)]


def survey_post():
    def f(d):
        rrect(d, 14, 9, 17, 30, 1, C["wood"])                      # pole
        rrect(d, 17, 9, 26, 16, 1, C["cyan"])                      # flag
        tri(d, [(26, 9), (26, 16), (29, 12.5)], C["cyan"])         # pennant tip
        ellipse(d, 21, 12.5, 1.0, 1.0, C["white"])                 # mark
        rrect(d, 10, 28, 21, 30, 1, C["slate"])                    # base
    return [frame(f)]


def torch():
    def f(d):
        ellipse(d, 16, 11, 11, 11, C["flameO"], 0.13)              # flame glow (light cue, not volume)
        rrect(d, 14, 16, 18, 30, 1.5, C["wood"])                   # post
        rrect(d, 12.5, 16, 19.5, 18, 0.6, C["slate"])              # bracket
        ellipse(d, 16, 10, 5, 6, C["flameO"]); ellipse(d, 16, 11, 3, 4, C["flameY"])      # flame
        ellipse(d, 16, 12, 1.4, 2, C["white"], 0.95)               # core
    return [frame(f)]


def turret():
    def f(d):
        rrect(d, 14, 7, 18, 20, 1.5, C["slate"]); rrect(d, 15.2, 7, 15.8, 20, 0.3, C["slateL"])  # barrel + glint line
        rrect(d, 7, 18, 25, 29, 3.5, C["slate"])                   # base
        ellipse(d, 16, 23, 4, 4, C["cyan"]); ellipse(d, 14.5, 21.5, 1.2, 1.2, C["white"], 0.9)   # core + glint
    return [frame(f)]


def doorway():
    def f(d):
        rrect(d, 6, 8, 26, 29, 9, C["stone"])                      # arch
        rrect(d, 10, 13, 22, 29, 6, C["purpDk"])                   # portal interior
        ellipse(d, 16, 18, 3.4, 3.4, C["cyan"], 0.6); ellipse(d, 16, 24, 2.8, 2.8, C["pink"], 0.55)  # swirl
    return [frame(f)]


def crate():
    def f(d):
        rrect(d, 6, 14, 26, 29, 2.5, C["wood"])
        rrect(d, 6, 14, 26, 16, 1, C["woodD"], 0.6); rrect(d, 6, 27, 26, 29, 1, C["woodD"], 0.6)  # top/bottom frame
        rrect(d, 6, 14, 8.5, 29, 1, C["woodD"], 0.6); rrect(d, 23.5, 14, 26, 29, 1, C["woodD"], 0.6)  # side frame
        thickline(d, 9, 17, 23, 26, 1.4, C["woodDk"]); thickline(d, 23, 17, 9, 26, 1.4, C["woodDk"])  # X brace
    return [frame(f)]


def barrel():
    def f(d):
        rrect(d, 10, 12, 22, 29, 4, C["wood"])
        rrect(d, 9.5, 16.5, 22.5, 18.5, 0.8, C["woodDk"]); rrect(d, 9.5, 24, 22.5, 26, 0.8, C["woodDk"])  # hoops
        rrect(d, 15.4, 13, 16.6, 28, 0.4, C["woodL"], 0.5)         # stave highlight
    return [frame(f)]


def fence():
    def f(d):
        for px in (8.5, 23.5):                                     # two thick posts w/ pointed caps
            rrect(d, px - 2.5, 10, px + 2.5, 29, 1.5, C["wood"])
            tri(d, [(px - 2.5, 10), (px + 2.5, 10), (px, 7)], C["wood"])
        rrect(d, 6, 13, 26, 16.5, 1, C["woodL"])                   # top rail (plank)
        rrect(d, 6, 21, 26, 24.5, 1, C["woodL"])                   # bottom rail
    return [frame(f)]


def bed():
    def f(d):
        rrect(d, 5, 7, 27, 30, 2.5, C["woodD"])                    # frame
        rrect(d, 6, 8, 26, 29, 2, C["pale"])                       # mattress
        rrect(d, 8, 10, 24, 16, 2, C["cyan"])                      # pillow
        rrect(d, 6, 18, 26, 29, 2, C["foe"])                       # blanket
        rrect(d, 6, 18, 26, 19.2, 0.4, C["foeL"])                  # blanket fold
    return [frame(f)]


# name -> (frames, playbackSpeed[, w, h]). Omitting (w, h) ⇒ square S x S (the default). A non-square
# entity declares its size here AND passes it to frame(drawfn, w, h) so the raster matches — e.g. a
# 32x64 human: "spr_soldier": (soldier(), 8.0, 32, 64) with soldier()'s frames built at frame(..., 32, 64).
# Origin stays foot-anchored (bottom-center, w//2, h) regardless of size.
SPRITES = {
    "spr_hero":       (hero(),        8.0),
    "spr_heroAttack": (hero_attack(), 10.0),
    "spr_bandit":     (bandit(),      6.0),
    "spr_chest":      (chest(),       0.0),
    "spr_bench":      (bench(),       0.0),
    "spr_surveyPost": (survey_post(), 0.0),
    "spr_torch":      (torch(),       0.0),
    "spr_turret":     (turret(),      0.0),
    "spr_doorway":    (doorway(),     0.0),
    "spr_crate":      (crate(),       0.0),
    "spr_barrel":     (barrel(),      0.0),
    "spr_fence":      (fence(),       0.0),
    "spr_bed":        (bed(),         0.0),
}


# ---- GameMaker .yy emitter (foot-anchored w x h; origin enum 7 = bottom-center; mirrors entity_sprites.py) ----

def yy(name, frame_ids, layer_id, key_ids, speed, w=S, h=S):
    sprpath = f"sprites/{name}/{name}.yy"
    frames = ",\n".join(
        f'    {{"$GMSpriteFrame":"v1","%Name":"{fid}","name":"{fid}","resourceType":"GMSpriteFrame","resourceVersion":"2.0",}}'
        for fid in frame_ids) + ","
    layers = (f'    {{"$GMImageLayer":"","%Name":"{layer_id}","blendMode":0,"displayName":"default",'
              f'"isLocked":false,"name":"{layer_id}","opacity":100.0,"resourceType":"GMImageLayer",'
              f'"resourceVersion":"2.0","visible":true,}},')
    kfs = []
    for i, (fid, kid) in enumerate(zip(frame_ids, key_ids)):
        kfs.append(
            '            {"$Keyframe<SpriteFrameKeyframe>":"","Channels":{\n'
            f'                "0":{{"$SpriteFrameKeyframe":"","Id":{{"name":"{fid}","path":"{sprpath}",}},'
            '"resourceType":"SpriteFrameKeyframe","resourceVersion":"2.0",},\n'
            f'              }},"Disabled":false,"id":"{kid}","IsCreationKey":false,"Key":{float(i)},'
            '"Length":1.0,"resourceType":"Keyframe<SpriteFrameKeyframe>","resourceVersion":"2.0","Stretch":false,}')
    keyframes = ",\n".join(kfs) + ","
    return f"""{{
  "$GMSprite":"v2",
  "%Name":"{name}",
  "bboxMode":0,
  "bbox_bottom":{h - 1},
  "bbox_left":0,
  "bbox_right":{w - 1},
  "bbox_top":0,
  "collisionKind":1,
  "collisionTolerance":0,
  "DynamicTexturePage":false,
  "edgeFiltering":false,
  "For3D":false,
  "frames":[
{frames}
  ],
  "gridX":0,
  "gridY":0,
  "height":{h},
  "HTile":false,
  "layers":[
{layers}
  ],
  "name":"{name}",
  "nineSlice":null,
  "origin":7,
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
    "length":{float(len(frame_ids))},
    "lockOrigin":false,
    "moments":{{
      "$KeyframeStore<MomentsEventKeyframe>":"",
      "Keyframes":[],
      "resourceType":"KeyframeStore<MomentsEventKeyframe>",
      "resourceVersion":"2.0",
    }},
    "name":"{name}",
    "playback":1,
    "playbackSpeed":{speed},
    "playbackSpeedType":0,
    "resourceType":"GMSequence",
    "resourceVersion":"2.0",
    "showBackdrop":true,
    "showBackdropImage":false,
    "timeUnits":1,
    "tracks":[
      {{"$GMSpriteFramesTrack":"","builtinName":0,"events":[],"inheritsTrackColour":true,"interpolation":1,"isCreationTrack":false,"keyframes":{{"$KeyframeStore<SpriteFrameKeyframe>":"","Keyframes":[
{keyframes}
          ],"resourceType":"KeyframeStore<SpriteFrameKeyframe>","resourceVersion":"2.0",}},"modifiers":[],"name":"frames","resourceType":"GMSpriteFramesTrack","resourceVersion":"2.0","spriteId":null,"trackColour":0,"tracks":[],"traits":0,}},
    ],
    "visibleRange":null,
    "volume":1.0,
    "xorigin":{w // 2},
    "yorigin":{h},
  }},
  "swatchColours":null,
  "swfPrecision":0.5,
  "textureGroupId":{{
    "name":"Default",
    "path":"texturegroups/Default",
  }},
  "type":0,
  "VTile":false,
  "width":{w},
}}"""


def build(name, frames, speed, w=S, h=S):
    sprdir = os.path.join(ROOT, "sprites", name)
    n = len(frames)
    frame_ids = [str(uuid.uuid5(NS, f"{name}:frame:{i}")) for i in range(n)]
    key_ids = [str(uuid.uuid5(NS, f"{name}:key:{i}")) for i in range(n)]
    layer_id = str(uuid.uuid5(NS, f"{name}:layer"))

    os.makedirs(sprdir, exist_ok=True)
    for root, dirs, files in os.walk(sprdir, topdown=False):     # wipe prior frames, keep the dir
        for fn in files:
            os.remove(os.path.join(root, fn))
        for dd in dirs:
            os.rmdir(os.path.join(root, dd))

    for fid, fr in zip(frame_ids, frames):
        P.write_png(os.path.join(sprdir, f"{fid}.png"), w, h, fr)
        ld = os.path.join(sprdir, "layers", fid)
        os.makedirs(ld, exist_ok=True)
        P.write_png(os.path.join(ld, f"{layer_id}.png"), w, h, fr)
    with open(os.path.join(sprdir, f"{name}.yy"), "w", newline="\n") as fh:
        fh.write(yy(name, frame_ids, layer_id, key_ids, speed, w, h))
    return n


def _size(spec):
    """(w, h) for a SPRITES spec tuple — its optional 3rd/4th elements, else square S."""
    return (spec[2] if len(spec) > 2 else S, spec[3] if len(spec) > 3 else S)


def preview():
    """scaled contact sheet of every frame on an earthy ground -> out/entities/flat_sheet.png."""
    od = P.out_dir("entities")
    flat = []
    for nm, spec in SPRITES.items():
        frs = spec[0]; w, h = _size(spec)
        for i, fr in enumerate(frs):
            flat.append((nm if len(frs) == 1 else f"{nm}#{i}", fr, w, h))
    scale, pad = 6, 10
    cell = max((max(w, h) for _, _, w, h in flat), default=S) * scale   # fits the tallest/widest sprite
    cols = 6
    rows = (len(flat) + cols - 1) // cols
    SW = pad + cols * (cell + pad); SH = pad + rows * (cell + pad)
    sheet = [(0, 0, 0, 255)] * (SW * SH)
    for Y in range(SH):
        for X in range(SW):
            gx = (X // 6) % 2; gy = (Y // 6) % 2
            sheet[Y * SW + X] = (74, 96, 58, 255) if (gx ^ gy) else (88, 110, 66, 255)
    for idx, (nm, fr, w, h) in enumerate(flat):
        gx, gy = idx % cols, idx // cols
        P.blit(sheet, SW, pad + gx * (cell + pad), pad + gy * (cell + pad), fr, w, h, scale)
    P.write_png(os.path.join(od, "flat_sheet.png"), SW, SH, sheet)
    return os.path.join(od, "flat_sheet.png")


if __name__ == "__main__":
    print(f"importing flat entities into {ROOT}/sprites/")
    for name, spec in SPRITES.items():
        frames, speed = spec[0], spec[1]
        w, h = _size(spec)
        n = build(name, frames, speed, w, h)
        print(f"  {name}: {n} frame(s) ({w}x{h})")
    print(f"preview -> {preview()}")
