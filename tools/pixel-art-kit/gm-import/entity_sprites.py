#!/usr/bin/env python3
"""entity_sprites — agent-drawn 32x32 entity sprites imported as GameMaker sprites.

The greenfield entity-art counterpart to terrain_sprites.py: instead of cutting tile frames from a
material, it draws each Demo entity (hero / bandit / chest / torch / ...) procedurally into a 32x32
DB32 buffer and writes a multi-frame GMSprite (PNG frames + per-layer PNG + a templated .yy) straight
into the project's sprites/<spr_*>/. Same contract as terrain_sprites.py:

  * the sprite resources must already be REGISTERED (IDE or
    `gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sprite NAME=<spr>"`); this only fills frames.
  * frame/layer/keyframe UUIDs are DETERMINISTIC (uuid5), so re-running is reproducible (no churn).

Style (this project's convention): 32px-native, DawnBringer-32 palette, flat color, one dark outline around each
silhouette (added automatically), hard alpha. Origin is FOOT-ANCHORED (bottom-center, 16,32) — the
engine's RenderEntity draws at the entity Position, so the sprite stands up from its feet.

Usage:  python tools/pixel-art-kit/gm-import/entity_sprites.py [project_root]
  project_root defaults to the repo two levels above the kit (tools/pixel-art-kit/../..).
"""
import os, sys, uuid
# this adapter lives in the kit (gm-import/); add the sibling common/ to the path so `import pixlib` resolves.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P

S = 32                                              # canvas (one cell at 32px-native)
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "gems.entity.sprites")  # stable namespace -> deterministic ids
PARENT = ("Handmade Sprites", "folders/Media/Handmade Sprites.yy")  # IDE folder (matches terrain_sprites)

# ---- DB32 palette (this project's colors) — names -> index into DB32 --------
# DawnBringer 32, the GEMS color standard. Defined here, with the binding — the generic kit is palette-agnostic.
DB32 = [(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)) for h in (
    "000000", "222034", "45283c", "663931", "8f563b", "df7126", "d9a066", "eec39a",
    "fbf236", "99e550", "6abe30", "37946e", "4b692f", "524b24", "323c39", "3f3f74",
    "306082", "5b6ee1", "639bff", "5fcde4", "cbdbfc", "ffffff", "9badb7", "847e87",
    "696a6a", "595652", "76428a", "ac3232", "d95763", "d77bba", "8f974a", "8a6f30",
)]
BLACK, OUT, MAROON, BROWN, WOOD, ORANGE, SKIN_D, SKIN = 0, 1, 2, 3, 4, 5, 6, 7
YELLOW, LGREEN, GREEN, TEAL, DGREEN, OLIVE, SLATE, INDIGO = 8, 9, 10, 11, 12, 13, 14, 15
DBLUE, BLUE, LBLUE, CYAN, PALE, WHITE, LGRAY, GRAY = 16, 17, 18, 19, 20, 21, 22, 23
DGRAY, DDGRAY, PURPLE, RED, PINKRED, PINK, YGREEN, DGOLD = 24, 25, 26, 27, 28, 29, 30, 31

TRANSPARENT = (0, 0, 0, 0)


def rgba(c):
    r, g, b = DB32[c]
    return (r, g, b, 255)


# ---- tiny raster API over a flat 32*32 RGBA buffer -------------------------

def blank():
    return [TRANSPARENT] * (S * S)


def setpx(buf, x, y, c):
    if c is not None and 0 <= x < S and 0 <= y < S:
        buf[y * S + x] = rgba(c)


def rect(buf, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            setpx(buf, x, y, c)


def hline(buf, x0, x1, y, c):
    rect(buf, x0, y, x1, y, c)


def vline(buf, x, y0, y1, c):
    rect(buf, x, y0, x, y1, c)


def disc(buf, cx, cy, r, c):
    rr = r * r + r
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rr:
                setpx(buf, x, y, c)


def outline(buf, c=OUT):
    """Add a 1px color `c` around every opaque pixel that borders transparency (selective dark
    outline). 4-connected so corners stay clean. Pixels at y=31 get no outline
    below (clipped) — the feet sit on the bottom edge, which is what foot-anchoring wants."""
    src = buf[:]
    for y in range(S):
        for x in range(S):
            if src[y * S + x][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < S and 0 <= ny < S and src[ny * S + nx][3] != 0:
                    buf[y * S + x] = rgba(c)
                    break


# ---- entity drawings (foot at the bottom row; outline added last) ----------

def _humanoid(tunic, tunic_hi, tunic_sh, pants, hair, step, right_arm=True, do_outline=True):
    """Shared top-down humanoid: hair+face, tunic torso with arms, two legs+boots. `step` (0/1)
    nudges the legs into a 2-pose walk. `right_arm=False` omits the right arm so an attack frame can
    draw a SWINGING arm there instead (and `do_outline=False` defers the outline until that arm +
    sword are added). Used for the hero (blue) and recolored by tint for NPC/companion at runtime."""
    b = blank()
    # hair cap
    rect(b, 11, 5, 20, 8, hair)
    setpx(b, 11, 5, None); setpx(b, 20, 5, None)
    # face
    rect(b, 12, 8, 19, 12, SKIN)
    vline(b, 19, 9, 12, SKIN_D)          # cheek shadow
    setpx(b, 14, 10, OUT); setpx(b, 17, 10, OUT)   # eyes
    # torso (tunic) + shading
    rect(b, 11, 13, 20, 21, tunic)
    vline(b, 11, 14, 21, tunic_hi)       # lit left edge
    vline(b, 20, 14, 21, tunic_sh)       # shaded right edge
    hline(b, 11, 20, 21, BROWN)          # belt
    # arms (sleeve over skin); the right arm is the one a swing replaces
    rect(b, 9, 14, 10, 16, tunic); rect(b, 9, 17, 10, 20, SKIN)
    if right_arm:
        rect(b, 21, 14, 22, 16, tunic); rect(b, 21, 17, 22, 20, SKIN)
    # legs + boots, stepped
    la, ra = (1, 0) if step == 0 else (0, 1)   # which leg leads (drops 1px)
    rect(b, 12, 22, 14, 27 + la, pants)
    rect(b, 17, 22, 19, 27 + ra, pants)
    rect(b, 12, 28 + la, 14, 30, BROWN)
    rect(b, 17, 28 + ra, 19, 30, BROWN)
    if do_outline:
        outline(b)
    return b


def hero():
    return [_humanoid(BLUE, LBLUE, DBLUE, INDIGO, BROWN, 0),
            _humanoid(BLUE, LBLUE, DBLUE, INDIGO, BROWN, 1)]


def _blade(b, x, y, dx, dy, n):
    """A 2px-wide diagonal sword blade of length n from (x,y) stepping (dx,dy): steel core + a white
    edge running alongside it."""
    for i in range(n):
        setpx(b, x + dx * i, y + dy * i, LGRAY)
        setpx(b, x + dx * i - dy, y + dy * i + dx, WHITE)   # edge offset perpendicular


def hero_attack():
    """Hero mid-swing — the right arm actually MOVES (the resting arm is omitted), carrying the sword
    through a down-right arc: frame 0 raised strike (blade up-right), frame 1 follow-through (blade
    down-right). Reads as one slash in the facing direction, not a floating sword beside a still pose."""
    out = []
    for f in range(2):
        b = _humanoid(BLUE, LBLUE, DBLUE, INDIGO, BROWN, f, right_arm=False, do_outline=False)
        if f == 0:                       # raised strike: forearm up-right, blade up-right
            rect(b, 21, 14, 22, 16, BLUE)         # shoulder/sleeve
            rect(b, 22, 12, 24, 14, SKIN)         # forearm raised
            rect(b, 24, 10, 25, 12, DGOLD)        # grip/guard
            _blade(b, 25, 10, 1, -1, 9)           # blade up-right
        else:                            # follow-through: forearm out-right, blade down-right
            rect(b, 21, 16, 22, 18, BLUE)         # shoulder/sleeve
            rect(b, 22, 17, 25, 19, SKIN)         # forearm extended
            rect(b, 25, 18, 26, 20, DGOLD)        # grip/guard
            _blade(b, 26, 20, 1, 1, 8)            # blade down-right
        outline(b)
        out.append(b)
    return out


def bandit():
    """Hostile humanoid — dark hood + red tunic, hunched. 2-frame idle bob. Own sprite (not the
    tinted hero), so it reads as an enemy without runtime tinting."""
    out = []
    for f in range(2):
        b = blank()
        dy = f                            # bob down 1px on frame 1
        # hood
        rect(b, 10, 4 + dy, 21, 9 + dy, MAROON)
        setpx(b, 10, 4 + dy, None); setpx(b, 21, 4 + dy, None)
        rect(b, 12, 9 + dy, 19, 12 + dy, SKIN_D)     # shadowed face
        setpx(b, 14, 10 + dy, RED); setpx(b, 17, 10 + dy, RED)  # glowing eyes
        # tunic
        rect(b, 10, 13 + dy, 21, 22 + dy, RED)
        vline(b, 10, 14 + dy, 22 + dy, MAROON)
        vline(b, 21, 14 + dy, 22 + dy, MAROON)
        hline(b, 10, 21, 22 + dy, BLACK)             # belt
        # arms
        rect(b, 8, 14 + dy, 9, 20 + dy, MAROON)
        rect(b, 22, 14 + dy, 23, 20 + dy, MAROON)
        # legs + boots
        rect(b, 12, 23 + dy, 14, 28, DDGRAY)
        rect(b, 17, 23 + dy, 19, 28, DDGRAY)
        rect(b, 12, 29, 14, 30, BLACK)
        rect(b, 17, 29, 19, 30, BLACK)
        outline(b)
        out.append(b)
    return out


def chest():
    b = blank()
    rect(b, 7, 17, 24, 30, WOOD)          # body
    vline(b, 24, 17, 30, MAROON); hline(b, 7, 24, 30, MAROON)
    rect(b, 7, 13, 24, 18, BROWN)         # domed lid
    hline(b, 7, 24, 13, WOOD)
    vline(b, 15, 13, 30, MAROON); vline(b, 16, 13, 30, BROWN)  # center seam bands
    vline(b, 9, 13, 30, GRAY); vline(b, 22, 13, 30, GRAY)      # metal straps
    rect(b, 14, 19, 17, 23, DGOLD)        # lock plate
    setpx(b, 15, 21, BLACK); setpx(b, 16, 21, BLACK)
    outline(b)
    return b


def bench():
    """Workbench: a wood top slab on legs with a saw + plank laid on top."""
    b = blank()
    rect(b, 5, 14, 26, 18, WOOD)          # top slab
    hline(b, 5, 26, 14, BROWN)
    hline(b, 5, 26, 18, MAROON)
    rect(b, 6, 19, 8, 30, BROWN)          # legs
    rect(b, 23, 19, 25, 30, BROWN)
    rect(b, 18, 9, 24, 13, DGOLD)         # a plank on top
    hline(b, 18, 24, 9, YELLOW)
    rect(b, 8, 11, 16, 13, GRAY)          # saw blade
    hline(b, 8, 16, 11, WHITE)
    rect(b, 6, 12, 8, 13, BROWN)          # saw handle
    outline(b)
    return b


def survey_post():
    """Claim / Survey Post: a flagged pole on a small base."""
    b = blank()
    rect(b, 25, 30, 25, 30, None)
    vline(b, 15, 7, 29, BROWN); vline(b, 16, 7, 29, WOOD)   # pole
    rect(b, 17, 7, 26, 13, CYAN)          # flag
    hline(b, 17, 26, 7, WHITE)
    vline(b, 26, 7, 13, TEAL)
    setpx(b, 23, 10, WHITE)               # a mark on the flag
    rect(b, 11, 29, 20, 30, DGRAY)        # base
    outline(b)
    return b


def torch():
    """Torch: wood post + a flame. The Light component supplies the glow at runtime."""
    b = blank()
    vline(b, 14, 14, 30, BROWN); rect(b, 15, 14, 16, 30, WOOD); vline(b, 17, 14, 30, MAROON)
    rect(b, 13, 13, 18, 15, DGRAY)        # bracket
    # flame
    disc(b, 15, 8, 5, ORANGE)
    disc(b, 15, 9, 3, YELLOW)
    setpx(b, 15, 4, ORANGE); setpx(b, 15, 3, YELLOW)
    setpx(b, 16, 5, YELLOW)
    outline(b)
    return b


def turret():
    """Defense turret: a heavy base, an angled barrel, and a glowing energy core."""
    b = blank()
    rect(b, 7, 22, 24, 30, SLATE)         # base
    hline(b, 7, 24, 22, GRAY)
    vline(b, 24, 22, 30, DDGRAY)
    rect(b, 10, 16, 21, 23, GRAY)         # turret housing
    hline(b, 10, 21, 16, LGRAY)
    vline(b, 21, 16, 23, DGRAY)
    disc(b, 15, 19, 3, CYAN)              # energy core
    setpx(b, 15, 18, WHITE)
    rect(b, 19, 10, 22, 17, GRAY)         # barrel (up-right)
    rect(b, 20, 9, 21, 11, DDGRAY)        # muzzle
    outline(b)
    return b


def doorway():
    """Portal doorway: a stone arch around a swirling portal."""
    b = blank()
    rect(b, 8, 5, 23, 30, GRAY)           # stone frame
    hline(b, 8, 23, 5, LGRAY)
    rect(b, 11, 8, 20, 30, INDIGO)        # portal interior
    rect(b, 12, 10, 19, 29, PURPLE)
    # swirl
    rect(b, 13, 14, 18, 16, CYAN)
    rect(b, 14, 18, 17, 20, PINK)
    rect(b, 13, 22, 18, 24, CYAN)
    vline(b, 8, 5, 30, DGRAY); vline(b, 23, 5, 30, DGRAY)   # frame edges
    outline(b)
    return b


def crate():
    b = blank()
    rect(b, 7, 14, 24, 30, WOOD)
    vline(b, 24, 14, 30, MAROON); hline(b, 7, 24, 30, MAROON)
    hline(b, 7, 24, 14, BROWN)
    # plank borders + an X brace
    rect(b, 7, 14, 8, 30, BROWN); rect(b, 23, 14, 24, 30, BROWN)
    for i in range(17):
        setpx(b, 8 + i, 14 + i, MAROON)
        setpx(b, 24 - i, 14 + i, MAROON)
    outline(b)
    return b


def barrel():
    b = blank()
    for y in range(12, 31):              # tapered round body (inset at top/bottom rows)
        inset = 2 if y in (12, 13, 29, 30) else (1 if y in (14, 28) else 0)
        rect(b, 9 + inset, y, 22 - inset, y, WOOD)
    vline(b, 22, 14, 28, MAROON)          # shaded side
    vline(b, 9, 14, 28, BROWN)            # lit side
    hline(b, 9, 22, 16, GRAY); hline(b, 9, 22, 24, GRAY)   # metal hoops
    hline(b, 11, 20, 12, BROWN)           # top rim
    outline(b)
    return b


def fence():
    """A wooden fence segment: two posts joined by two rails."""
    b = blank()
    rect(b, 8, 12, 11, 30, BROWN); vline(b, 8, 12, 30, WOOD)
    rect(b, 20, 12, 23, 30, BROWN); vline(b, 20, 12, 30, WOOD)
    rect(b, 8, 16, 23, 18, WOOD); hline(b, 8, 23, 16, BROWN)
    rect(b, 8, 23, 23, 25, WOOD); hline(b, 8, 23, 23, BROWN)
    setpx(b, 9, 12, None); setpx(b, 10, 12, None)          # post caps
    setpx(b, 21, 12, None); setpx(b, 22, 12, None)
    outline(b)
    return b


def bed():
    """Top-down bed: wood frame, mattress, pillow, blanket. Wide; foot at the bottom."""
    b = blank()
    rect(b, 4, 9, 27, 30, BROWN)          # frame
    rect(b, 6, 11, 25, 30, PALE)          # mattress
    rect(b, 7, 12, 24, 17, CYAN)          # pillow
    hline(b, 7, 24, 12, WHITE)
    rect(b, 6, 19, 25, 30, RED)           # blanket
    hline(b, 6, 25, 19, PINKRED)
    vline(b, 6, 19, 30, PINKRED)
    rect(b, 4, 9, 5, 12, WOOD)            # bedpost knobs (top corners)
    rect(b, 26, 9, 27, 12, WOOD)
    outline(b)
    return b


# name -> (frames, idle playbackSpeed for the IDE preview; runtime uses Animator/Visual.speed)
SPRITES = {
    "spr_hero":       (hero(),        8.0),
    "spr_heroAttack": (hero_attack(), 10.0),
    "spr_bandit":     (bandit(),      6.0),
    "spr_chest":      ([chest()],     0.0),
    "spr_bench":      ([bench()],     0.0),
    "spr_surveyPost": ([survey_post()], 0.0),
    "spr_torch":      ([torch()],     0.0),
    "spr_turret":     ([turret()],    0.0),
    "spr_doorway":    ([doorway()],   0.0),
    "spr_crate":      ([crate()],     0.0),
    "spr_barrel":     ([barrel()],    0.0),
    "spr_fence":      ([fence()],     0.0),
    "spr_bed":        ([bed()],       0.0),
}

# ---- GameMaker .yy emitter (foot-anchored, 32x32; mirrors terrain_sprites.py) ----

def yy(name, frame_ids, layer_id, key_ids, speed):
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
{frames}
  ],
  "gridX":0,
  "gridY":0,
  "height":{S},
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
    "xorigin":{S // 2},
    "yorigin":{S},
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


def build(name, frames, speed):
    sprdir = os.path.join(ROOT, "sprites", name)
    n = len(frames)
    frame_ids = [str(uuid.uuid5(NS, f"{name}:frame:{i}")) for i in range(n)]
    key_ids = [str(uuid.uuid5(NS, f"{name}:key:{i}")) for i in range(n)]
    layer_id = str(uuid.uuid5(NS, f"{name}:layer"))

    os.makedirs(sprdir, exist_ok=True)
    for root, dirs, files in os.walk(sprdir, topdown=False):    # wipe prior frames, keep the dir
        for fn in files:
            os.remove(os.path.join(root, fn))
        for d in dirs:
            os.rmdir(os.path.join(root, d))

    for fid, fr in zip(frame_ids, frames):
        P.write_png(os.path.join(sprdir, f"{fid}.png"), S, S, fr)            # composite
        ld = os.path.join(sprdir, "layers", fid)
        os.makedirs(ld, exist_ok=True)
        P.write_png(os.path.join(ld, f"{layer_id}.png"), S, S, fr)           # single "default" layer
    with open(os.path.join(sprdir, f"{name}.yy"), "w", newline="\n") as fh:
        fh.write(yy(name, frame_ids, layer_id, key_ids, speed))
    return n


def preview():
    """A scaled contact sheet of every frame on a checker -> out/entities/sheet.png (for review)."""
    od = P.out_dir("entities")
    flat = []
    for nm, (frs, _) in SPRITES.items():
        for i, fr in enumerate(frs):
            flat.append((f"{nm}#{i}", fr))
    scale, pad, cell = 5, 8, S * 5
    cols = 8
    rows = (len(flat) + cols - 1) // cols
    SW = pad + cols * (cell + pad)
    SH = pad + rows * (cell + pad)
    sheet = [TRANSPARENT] * (SW * SH)
    for Y in range(SH):
        for X in range(SW):
            sheet[Y * SW + X] = P.checker(X, Y, 8)
    for idx, (nm, fr) in enumerate(flat):
        gx, gy = idx % cols, idx // cols
        P.blit(sheet, SW, pad + gx * (cell + pad), pad + gy * (cell + pad), fr, S, S, scale, ck=8)
    P.write_png(os.path.join(od, "sheet.png"), SW, SH, sheet)
    return os.path.join(od, "sheet.png")


if __name__ == "__main__":
    print(f"importing into {ROOT}/sprites/")
    for name, (frames, speed) in SPRITES.items():
        n = build(name, frames, speed)
        print(f"  {name}: {n} frame(s)")
    print(f"preview -> {preview()}")
