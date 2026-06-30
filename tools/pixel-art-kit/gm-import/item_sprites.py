#!/usr/bin/env python3
"""item_sprites — agent-drawn 16x16 item ICONS imported as GameMaker sprites.

The item-icon sibling of entity_sprites.py / terrain_sprites.py: it draws each RPG item
(potion / sword / coin / ore / weapon-mod / ...) procedurally into a 16x16 DB32 buffer and writes a
single-frame GMSprite straight into the project's sprites/spr_item_<id>/. The sprite NAME convention is
`spr_item_<itemId>` — RpgItems.register() auto-wires each Item.sprite by that name, so adding an icon
is: draw it here under that key, register the resource, re-run.

Same contract as the sibling importers:
  * the sprite resources must already be REGISTERED (IDE or
    `gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sprite NAME=<spr>"`); this only fills frames.
  * frame/layer/keyframe UUIDs are DETERMINISTIC (uuid5), so re-running is reproducible (no churn).

Style (G.E.M.S. convention — see GEMS.md): 16px-native, DawnBringer-32 palette, flat color, one dark
outline around each silhouette (added automatically), hard alpha. Unlike entities (foot-anchored),
ITEMS/ICONS are CENTERED (origin 4 = middle-center, 8,8) — they're drawn centered in a slot, not stood
up from the ground. Single frame each (static icon).

Usage:  python tools/pixel-art-kit/gm-import/item_sprites.py [project_root]
  project_root defaults to the repo two levels above the kit (tools/pixel-art-kit/../..).
"""
import os, sys, uuid
# this adapter lives in the kit (gm-import/); add the sibling common/ to the path so `import pixlib` resolves.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P

S = 16                                              # canvas (one cell at 16px-native; see GEMS.md)
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "gems.item.sprites")  # stable namespace -> deterministic ids
PARENT = ("Icons", "folders/Media/Handmade Sprites/Icons.yy")  # existing IDE folder (item + UI icons)

# ---- DB32 palette (this project's colors) — names -> index into DB32 (matches entity_sprites.py) ----
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

# Current canvas dims — set by blank() so an icon can be non-square (e.g. a wide 64x32 gun). The hand-drawn
# icons below are all square S (16); a non-square one calls blank(w, h) + declares its size in SPRITES.
_W, _H = S, S


def rgba(c):
    r, g, b = DB32[c]
    return (r, g, b, 255)


# ---- tiny raster API over a flat _W*_H RGBA buffer (matches entity_sprites.py + an erase helper) ----

def blank(w=S, h=S):
    global _W, _H
    _W, _H = w, h
    return [TRANSPARENT] * (w * h)


def setpx(buf, x, y, c):
    if c is not None and 0 <= x < _W and 0 <= y < _H:
        buf[y * _W + x] = rgba(c)


def erase(buf, x, y):                                # setpx(None) is a NO-OP — carve transparency with this
    if 0 <= x < _W and 0 <= y < _H:
        buf[y * _W + x] = TRANSPARENT


def rect(buf, x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            setpx(buf, x, y, c)


def hline(buf, x0, x1, y, c):
    rect(buf, x0, y, x1, y, c)


def vline(buf, x, y0, y1, c):
    rect(buf, x, y0, x, y1, c)


def line(buf, x0, y0, dx, dy, n, c):                 # n pixels stepping (dx,dy) from (x0,y0)
    for i in range(n):
        setpx(buf, x0 + dx * i, y0 + dy * i, c)


def disc(buf, cx, cy, r, c):
    rr = r * r + r
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rr:
                setpx(buf, x, y, c)


def clear_disc(buf, cx, cy, r):                      # carve a transparent disc (ring/key holes)
    rr = r * r + r
    for y in range(cy - r, cy + r + 1):
        for x in range(cx - r, cx + r + 1):
            if (x - cx) ** 2 + (y - cy) ** 2 <= rr:
                erase(buf, x, y)


def outline(buf, c=OUT):
    """Add a 1px color `c` around every opaque pixel that borders transparency (selective dark
    outline). 4-connected so corners stay clean. Icons are kept within y<=14 so the outline fits all
    the way around (centered, unlike the foot-anchored entities)."""
    src = buf[:]
    for y in range(_H):
        for x in range(_W):
            if src[y * _W + x][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < _W and 0 <= ny < _H and src[ny * _W + nx][3] != 0:
                    buf[y * _W + x] = rgba(c)
                    break


# ---- shared icon shapes (recolored per item) --------------------------------

def _flask(liquid, hi):
    """A round-bottomed potion flask: cork + glass neck + bulbous body filled with `liquid`."""
    b = blank()
    rect(b, 7, 1, 9, 2, BROWN)            # cork
    rect(b, 7, 3, 9, 5, PALE)             # glass neck
    setpx(b, 7, 3, WHITE)
    disc(b, 8, 10, 4, PALE)               # glass bulb
    disc(b, 8, 11, 3, liquid)             # liquid (settled low)
    hline(b, 6, 9, 13, liquid)
    setpx(b, 6, 8, WHITE); setpx(b, 6, 9, WHITE)   # glass shine
    setpx(b, 9, 12, hi)                   # liquid highlight
    outline(b)
    return b


def _gem(c, hi):
    """A faceted diamond/crystal (the shard + currency-gem shape)."""
    b = blank()
    span = {3: (6, 9), 4: (5, 10), 5: (4, 11), 6: (4, 11), 7: (5, 10), 8: (6, 9), 9: (7, 8)}
    for y in span:
        a, e = span[y]
        rect(b, a, y, e, y, c)
    line(b, 6, 3, 1, 0, 2, hi)            # lit upper-left crown facets
    line(b, 5, 4, 1, 0, 2, hi)
    setpx(b, 4, 5, hi)
    setpx(b, 6, 4, WHITE)                 # sparkle
    setpx(b, 9, 8, BLACK); setpx(b, 10, 7, BLACK)  # shaded lower-right pavilion
    outline(b)
    return b


def _ingot(c, hi):
    """A trapezoidal metal ingot/bar."""
    b = blank()
    rect(b, 4, 7, 11, 11, c)              # wide base
    rect(b, 5, 5, 10, 7, c)               # narrow top
    hline(b, 5, 10, 5, hi)                # top edge highlight
    hline(b, 4, 11, 11, DGRAY)            # bottom shadow
    setpx(b, 6, 6, WHITE)
    outline(b)
    return b


def _bullet(tip, case):
    """A vertical cartridge: brass `case` + a colored `tip` (recolored per round)."""
    b = blank()
    rect(b, 6, 8, 9, 14, case)            # case
    rect(b, 6, 5, 9, 8, tip)              # bullet
    rect(b, 7, 4, 8, 4, tip)              # tapered tip
    hline(b, 6, 9, 13, DGRAY)             # rim / base
    setpx(b, 6, 9, WHITE)                 # shine
    setpx(b, 7, 5, WHITE)
    outline(b)
    return b


# ---- item icons (16px, centered, kept within y<=14; outline added last) -----

def rags():
    b = blank()
    rect(b, 4, 5, 11, 11, GRAY)           # cloth patch
    rect(b, 5, 4, 9, 5, LGRAY)
    hline(b, 5, 10, 8, DGRAY)             # fold shadow
    setpx(b, 7, 6, LGRAY)
    erase(b, 11, 5); erase(b, 4, 11); erase(b, 10, 11); erase(b, 5, 4)  # torn corners
    outline(b)
    return b


def water_bottle():
    b = blank()
    rect(b, 6, 1, 9, 2, LBLUE)            # cap
    rect(b, 6, 3, 9, 4, PALE)             # neck
    rect(b, 5, 5, 10, 14, PALE)           # glass body
    rect(b, 6, 7, 9, 14, BLUE)            # water
    setpx(b, 6, 6, WHITE); setpx(b, 6, 9, WHITE)   # shine
    outline(b)
    return b


def bread():
    b = blank()
    rect(b, 3, 7, 12, 13, WOOD)           # loaf body
    hline(b, 4, 11, 6, BROWN)             # crust top
    erase(b, 3, 13); erase(b, 12, 13)     # round the base corners
    setpx(b, 6, 8, BROWN); setpx(b, 8, 8, BROWN); setpx(b, 10, 8, BROWN)  # slashes
    hline(b, 4, 11, 12, SKIN_D)           # underside shadow
    setpx(b, 4, 8, SKIN)
    outline(b)
    return b


def cooked_meat():
    b = blank()
    disc(b, 6, 8, 4, ORANGE)              # meat
    disc(b, 6, 8, 2, RED)                 # juicy center
    rect(b, 9, 9, 13, 10, PALE)           # bone
    rect(b, 12, 8, 14, 11, PALE)          # knuckle
    setpx(b, 4, 6, SKIN)                  # highlight
    outline(b)
    return b


def potion():     return _flask(RED, PINKRED)
def tonic():      return _flask(LGREEN, WHITE)
def elixir():     return _flask(PURPLE, PINK)

def power_shard():     return _gem(RED, PINKRED)
def vitality_shard():  return _gem(GREEN, LGREEN)
def agility_shard():   return _gem(CYAN, LBLUE)
def endurance_shard(): return _gem(ORANGE, YELLOW)

def gem():        return _gem(BLUE, LBLUE)
def iron():       return _ingot(LGRAY, WHITE)

def ammo_light(): return _bullet(ORANGE, DGOLD)   # fast/light → copper tip
def ammo_heavy(): return _bullet(LGRAY, DGOLD)     # heavy → lead
def ammo_ap():    return _bullet(LBLUE, DGOLD)     # armor-piercing → blue steel


def wood_sword():
    b = blank()
    line(b, 4, 11, 1, -1, 9, WOOD)        # wooden blade, lower-left → upper-right
    line(b, 5, 11, 1, -1, 8, BROWN)       # blade shading
    setpx(b, 12, 3, YELLOW)               # tip glint
    rect(b, 2, 11, 4, 13, DGOLD)          # crossguard
    rect(b, 1, 13, 3, 14, MAROON)         # grip
    setpx(b, 1, 14, DGOLD)                # pommel
    outline(b)
    return b


def blaster():
    b = blank()
    rect(b, 2, 6, 11, 9, SLATE)           # body
    rect(b, 10, 7, 14, 8, GRAY)           # barrel
    setpx(b, 14, 7, CYAN); setpx(b, 14, 8, CYAN)   # muzzle glow
    rect(b, 4, 4, 7, 6, GRAY)             # top rail / sight
    rect(b, 3, 9, 6, 13, DGRAY)           # grip
    disc(b, 6, 8, 1, CYAN)                # energy core
    setpx(b, 3, 7, LGRAY)                 # highlight
    outline(b)
    return b


def leather_armor():
    b = blank()
    rect(b, 4, 4, 11, 13, BROWN)          # torso
    rect(b, 3, 4, 4, 7, BROWN)            # shoulders
    rect(b, 11, 4, 12, 7, BROWN)
    rect(b, 6, 4, 9, 6, SKIN_D)           # neckline
    vline(b, 7, 6, 12, MAROON); vline(b, 8, 6, 12, WOOD)  # lacing seam
    hline(b, 4, 11, 11, MAROON)           # belt
    setpx(b, 5, 5, WOOD)                  # highlight
    outline(b)
    return b


def swift_ring():
    b = blank()
    disc(b, 8, 10, 4, DGOLD)              # band
    setpx(b, 5, 11, YELLOW)               # band highlight
    clear_disc(b, 8, 10, 2)               # carve the hole
    rect(b, 7, 3, 9, 5, CYAN)             # set gemstone
    setpx(b, 7, 3, WHITE)
    outline(b)
    return b


def backpack():
    b = blank()
    rect(b, 4, 4, 11, 14, MAROON)         # body
    rect(b, 5, 4, 10, 6, BROWN)           # top flap
    rect(b, 5, 9, 10, 13, BROWN)          # front pocket
    rect(b, 7, 6, 8, 8, DGOLD)            # buckle
    vline(b, 3, 5, 12, MAROON); vline(b, 12, 5, 12, MAROON)  # side straps
    setpx(b, 5, 5, WOOD)                  # highlight
    outline(b)
    return b


def coin():
    b = blank()
    disc(b, 8, 8, 5, DGOLD)               # rim
    disc(b, 8, 8, 4, YELLOW)              # face
    setpx(b, 6, 6, WHITE); setpx(b, 7, 6, WHITE)   # shine
    setpx(b, 8, 8, DGOLD)                 # mint mark
    setpx(b, 11, 10, BROWN); setpx(b, 10, 11, BROWN)  # rim shadow
    outline(b)
    return b


def key():
    b = blank()
    disc(b, 5, 5, 3, DGOLD)               # bow
    clear_disc(b, 5, 5, 1)                # bow hole
    line(b, 6, 6, 1, 1, 7, DGOLD)         # shaft, diagonal down-right
    line(b, 7, 6, 1, 1, 6, YELLOW)        # shaft highlight
    setpx(b, 12, 13, DGOLD); setpx(b, 13, 12, DGOLD)  # teeth
    setpx(b, 10, 11, DGOLD)
    outline(b)
    return b


def wood():
    b = blank()
    rect(b, 2, 6, 13, 11, WOOD)           # plank stack
    hline(b, 2, 13, 6, BROWN); hline(b, 2, 13, 9, BROWN)  # plank seams
    vline(b, 2, 6, 11, MAROON); vline(b, 13, 6, 11, MAROON)  # cut ends
    setpx(b, 4, 7, SKIN_D); setpx(b, 9, 10, SKIN_D)  # grain
    outline(b)
    return b


def mod_scope():
    b = blank()
    rect(b, 3, 6, 11, 9, DGRAY)           # tube
    rect(b, 11, 5, 13, 10, SLATE)         # objective bell
    disc(b, 12, 7, 1, CYAN)               # lens
    rect(b, 6, 4, 8, 6, DGRAY)            # turret knob
    setpx(b, 4, 7, LGRAY)                 # highlight
    outline(b)
    return b


def mod_long_barrel():
    b = blank()
    rect(b, 2, 7, 13, 9, GRAY)            # barrel
    rect(b, 13, 7, 14, 9, DDGRAY)         # muzzle end
    rect(b, 2, 7, 3, 9, DGRAY)            # chamber end
    hline(b, 3, 13, 7, LGRAY)             # top highlight
    outline(b)
    return b


def mod_extended_mag():
    b = blank()
    rect(b, 5, 3, 10, 13, DGRAY)          # box
    rect(b, 5, 3, 10, 4, GRAY)            # feed lips
    setpx(b, 6, 4, YELLOW); setpx(b, 7, 4, YELLOW)  # top round
    hline(b, 5, 10, 7, DDGRAY); hline(b, 5, 10, 10, DDGRAY)  # witness lines
    vline(b, 5, 3, 13, SLATE)
    outline(b)
    return b


def mod_grip():
    b = blank()
    rect(b, 5, 3, 10, 5, DGRAY)           # mount
    rect(b, 6, 5, 9, 13, DDGRAY)          # grip body
    hline(b, 6, 9, 8, SLATE); hline(b, 6, 9, 10, SLATE)  # texture
    setpx(b, 6, 6, GRAY)                  # highlight
    outline(b)
    return b


def mod_suppressor():
    b = blank()
    rect(b, 2, 6, 13, 10, DDGRAY)         # can
    rect(b, 2, 6, 3, 10, DGRAY)           # mount end
    hline(b, 3, 13, 6, SLATE)             # top highlight
    vline(b, 6, 6, 10, BLACK); vline(b, 9, 6, 10, BLACK)  # baffle bands
    outline(b)
    return b


def mod_sharp():
    b = blank()
    rect(b, 3, 7, 12, 10, LGRAY)          # whetstone
    hline(b, 3, 12, 7, WHITE)             # gritty top
    hline(b, 3, 12, 10, DGRAY)            # shadow
    setpx(b, 12, 5, YELLOW); setpx(b, 11, 6, WHITE)  # spark
    outline(b)
    return b


def mod_heavy():
    b = blank()
    disc(b, 8, 9, 4, SLATE)               # iron weight
    disc(b, 8, 9, 3, GRAY)
    rect(b, 6, 4, 9, 6, DGRAY)            # neck
    setpx(b, 6, 7, WHITE)                 # shine
    outline(b)
    return b


def forge():
    b = blank()
    rect(b, 3, 6, 11, 8, SLATE)           # anvil face
    rect(b, 11, 5, 13, 7, SLATE)          # horn
    rect(b, 6, 8, 9, 10, GRAY)            # waist
    rect(b, 4, 10, 11, 12, SLATE)         # base
    hline(b, 3, 11, 6, LGRAY)             # face highlight
    setpx(b, 5, 7, WHITE)
    outline(b)
    return b


def alembic():
    b = blank()
    disc(b, 7, 11, 3, PALE)               # round flask
    disc(b, 7, 11, 2, LGREEN)             # distillate
    rect(b, 8, 4, 9, 9, PALE)             # long neck
    rect(b, 9, 3, 12, 4, PALE)            # bent spout
    setpx(b, 5, 9, WHITE)                 # glass shine
    outline(b)
    return b


def hearth():
    b = blank()
    rect(b, 4, 7, 11, 11, DGRAY)          # pot
    rect(b, 3, 7, 12, 8, GRAY)            # pot rim
    setpx(b, 5, 9, LGRAY)                 # highlight
    hline(b, 4, 11, 14, BROWN)            # logs
    disc(b, 7, 13, 1, ORANGE)             # flames
    setpx(b, 6, 14, ORANGE); setpx(b, 9, 13, ORANGE)
    setpx(b, 8, 13, YELLOW)
    outline(b)
    return b


def toolkit():
    b = blank()
    line(b, 4, 12, 1, -1, 8, GRAY)        # wrench shaft, diagonal
    line(b, 5, 12, 1, -1, 7, LGRAY)
    rect(b, 11, 3, 13, 5, GRAY)           # open jaw head
    erase(b, 12, 3)                        # the jaw gap
    rect(b, 3, 11, 5, 13, DGRAY)          # handle end
    outline(b)
    return b


# spr name (== "spr_item_" + itemId) -> single-frame icon
SPRITES = {
    "spr_item_rags":           rags(),
    "spr_item_potion":         potion(),
    "spr_item_tonic":          tonic(),
    "spr_item_elixir":         elixir(),
    "spr_item_water_bottle":   water_bottle(),
    "spr_item_bread":          bread(),
    "spr_item_cooked_meat":    cooked_meat(),
    "spr_item_power_shard":    power_shard(),
    "spr_item_vitality_shard": vitality_shard(),
    "spr_item_agility_shard":  agility_shard(),
    "spr_item_endurance_shard": endurance_shard(),
    "spr_item_wood_sword":     wood_sword(),
    "spr_item_blaster":        blaster(),
    "spr_item_leather_armor":  leather_armor(),
    "spr_item_swift_ring":     swift_ring(),
    "spr_item_backpack":       backpack(),
    "spr_item_coin":           coin(),
    "spr_item_gem":            gem(),
    "spr_item_key":            key(),
    "spr_item_wood":           wood(),
    "spr_item_iron":           iron(),
    "spr_item_ammo_light":     ammo_light(),
    "spr_item_ammo_heavy":     ammo_heavy(),
    "spr_item_ammo_ap":        ammo_ap(),
    "spr_item_mod_scope":      mod_scope(),
    "spr_item_mod_long_barrel": mod_long_barrel(),
    "spr_item_mod_extended_mag": mod_extended_mag(),
    "spr_item_mod_grip":       mod_grip(),
    "spr_item_mod_suppressor": mod_suppressor(),
    "spr_item_mod_sharp":      mod_sharp(),
    "spr_item_mod_heavy":      mod_heavy(),
    "spr_item_forge":          forge(),
    "spr_item_alembic":        alembic(),
    "spr_item_hearth":         hearth(),
    "spr_item_toolkit":        toolkit(),
}


def _spec(v):
    """(frame, w, h) for a SPRITES value — a bare frame is square S; a (frame, w, h) tuple carries its
    own size (a hand-drawn non-square icon, e.g. blank(64, 32))."""
    return (v[0], v[1], v[2]) if isinstance(v, tuple) else (v, S, S)

# ---- GameMaker .yy emitter (CENTERED w x h; single frame; origin enum 4 = middle-center) ----
# (w, h) default to the module S (square). The non-square path is for the AI-bridge importer
# (import_items) writing a wide icon like a 64x32 gun; the hand-drawn raster above stays square S.

def yy(name, frame_id, layer_id, key_id, w=S, h=S):
    sprpath = f"sprites/{name}/{name}.yy"
    frames = (f'    {{"$GMSpriteFrame":"v1","%Name":"{frame_id}","name":"{frame_id}",'
              f'"resourceType":"GMSpriteFrame","resourceVersion":"2.0",}},')
    layers = (f'    {{"$GMImageLayer":"","%Name":"{layer_id}","blendMode":0,"displayName":"default",'
              f'"isLocked":false,"name":"{layer_id}","opacity":100.0,"resourceType":"GMImageLayer",'
              f'"resourceVersion":"2.0","visible":true,}},')
    keyframes = (
        '            {"$Keyframe<SpriteFrameKeyframe>":"","Channels":{\n'
        f'                "0":{{"$SpriteFrameKeyframe":"","Id":{{"name":"{frame_id}","path":"{sprpath}",}},'
        '"resourceType":"SpriteFrameKeyframe","resourceVersion":"2.0",},\n'
        f'              }},"Disabled":false,"id":"{key_id}","IsCreationKey":false,"Key":0.0,'
        '"Length":1.0,"resourceType":"Keyframe<SpriteFrameKeyframe>","resourceVersion":"2.0","Stretch":false,},')
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
  "origin":4,
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
{keyframes}
          ],"resourceType":"KeyframeStore<SpriteFrameKeyframe>","resourceVersion":"2.0",}},"modifiers":[],"name":"frames","resourceType":"GMSpriteFramesTrack","resourceVersion":"2.0","spriteId":null,"trackColour":0,"tracks":[],"traits":0,}},
    ],
    "visibleRange":null,
    "volume":1.0,
    "xorigin":{w // 2},
    "yorigin":{h // 2},
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


def build(name, frame, w=S, h=S):
    sprdir = os.path.join(ROOT, "sprites", name)
    frame_id = str(uuid.uuid5(NS, f"{name}:frame:0"))
    key_id = str(uuid.uuid5(NS, f"{name}:key:0"))
    layer_id = str(uuid.uuid5(NS, f"{name}:layer"))

    os.makedirs(sprdir, exist_ok=True)
    for root, dirs, files in os.walk(sprdir, topdown=False):    # wipe prior frames, keep the dir
        for fn in files:
            os.remove(os.path.join(root, fn))
        for d in dirs:
            os.rmdir(os.path.join(root, d))

    P.write_png(os.path.join(sprdir, f"{frame_id}.png"), w, h, frame)        # composite
    ld = os.path.join(sprdir, "layers", frame_id)
    os.makedirs(ld, exist_ok=True)
    P.write_png(os.path.join(ld, f"{layer_id}.png"), w, h, frame)            # single "default" layer
    with open(os.path.join(sprdir, f"{name}.yy"), "w", newline="\n") as fh:
        fh.write(yy(name, frame_id, layer_id, key_id, w, h))


def preview():
    """A scaled contact sheet of every icon on a checker -> out/items/sheet.png (for review)."""
    od = P.out_dir("items")
    flat = [(nm, *_spec(v)) for nm, v in SPRITES.items()]   # (nm, frame, w, h)
    scale, pad = 8, 8
    cell = max((max(w, h) for _, _, w, h in flat), default=S) * scale   # fits the widest/tallest icon
    cols = 7
    rows = (len(flat) + cols - 1) // cols
    SW = pad + cols * (cell + pad)
    SH = pad + rows * (cell + pad)
    sheet = [TRANSPARENT] * (SW * SH)
    for Y in range(SH):
        for X in range(SW):
            sheet[Y * SW + X] = P.checker(X, Y, 8)
    for idx, (nm, fr, w, h) in enumerate(flat):
        gx, gy = idx % cols, idx // cols
        P.blit(sheet, SW, pad + gx * (cell + pad), pad + gy * (cell + pad), fr, w, h, scale, ck=8)
    P.write_png(os.path.join(od, "sheet.png"), SW, SH, sheet)
    return os.path.join(od, "sheet.png")


if __name__ == "__main__":
    print(f"importing into {ROOT}/sprites/")
    for name, v in SPRITES.items():
        frame, w, h = _spec(v)
        build(name, frame, w, h)
        print(f"  {name} ({w}x{h})")
    print(f"preview -> {preview()}")
