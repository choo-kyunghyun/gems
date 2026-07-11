#!/usr/bin/env python3
"""human_sprites — import the hand-drawn humanoid strip + derive the paper-doll overlays.

The SOURCE is the hand-animated Aseprite export `templates/human/sheet.png` + `sheet.json`
(32x32 cells; frame tags idle/walk/fist/kick — re-export from Aseprite over those two names).
There is no offset table anymore: the artist animates freely, and every frame keeps the
Rayman floating-parts CONTRACT — head, torso, two hands, two feet as six DISCONNECTED blobs
in 2-color art (white fill + dark outline) — so this script SEGMENTS each frame and cuts the
overlays from the segmented parts, which therefore can never desync from the body:

  spr_human        the canonical humanoid strip, imported verbatim from the sheet; pure
                   white fill -> tinted per entity via Visual.color (skin).
  spr_wear_vest    worn overlays (Appearance): garments cut from the body parts themselves
  spr_wear_blackShirt   (torso / head crown / feet) per frame. COLOR-NAMED sheets are
  spr_wear_redBandana   pre-colored (the bandit outfit, the vest); PLAIN-NAMED sheets
  spr_wear_blackSneakers (shirt/shoes) are near-WHITE and tinted per entity via the
  spr_wear_shirt        Appearance layer color — one sheet, any outfit color (the civilian
  spr_wear_shoes        NPCs/follower). Garments recolor only the white FILL; the dark
                        outline pixels copy through, keeping the hand-drawn look.

Held weapons are NOT sheets anymore: the manifest's spr_human entry carries an `anchors`
table — each part's per-frame centroid as an [dx, dy] OFFSET FROM THE SPRITE ORIGIN
(bottom-center foot anchor; dy negative = up) — and the runtime draws the equipped item's
own ICON at the right hand's anchor (AppearanceSystem "held" layer -> RenderBillboard), so
every weapon gets a held visual with no per-weapon art (replaced the generated
spr_held_pipe/spr_held_blaster sheets, deregistered 2026-07-11).

Part classification: the two biggest blobs are head/torso (head is the higher); the four
limbs split into hands/feet by SIZE — the neutral frame (frame 0) teaches which blob size
is the hand pair (the higher pair) and which the foot pair, then every frame classifies by
that size, so a kicking foot swung above a hand can't be misread. Fails fast (assert) if a
redraw breaks the contract: exactly 6 blobs, constant sizes, hands and feet drawn at
DIFFERENT sizes.

Same deterministic-uuid5 import contract as flat_sprites (resources must be REGISTERED;
re-runs are churn-free).

Usage:  python tools/pixel-art-kit/gm-import/human_sprites.py [project_root]
"""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P
import flat_sprites as F  # reuse the .yy emitter/build machinery (PARENT overridden below)

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
F.ROOT = ROOT
F.PARENT = ("Pending Sprite", "folders/Media/Pending Sprite.yy")  # where the doll sheets live

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates", "human")

VEST = (198, 116, 54)   # armored vest — burnt orange
VEST_D = (140, 78, 36)  # vest lower trim
SHIRT = (52, 52, 58)    # bandit shirt — near-black
SHIRT_D = (36, 36, 42)  # shirt lower trim
BAND = (188, 52, 48)    # bandit bandana — red
BAND_D = (134, 36, 34)  # bandana band edge
SNEAK = (42, 44, 48)    # sneakers — black upper
SOLE = (196, 200, 205)  # sneaker sole — light
WHT = (240, 240, 244)   # tintable garment base (Appearance layer.color multiplies over it)
WHT_D = (198, 198, 208) # tintable garment trim
NECK = 1                # torso rows left uncovered at the top (skin shows at the neckline)
CROWN = 5               # bandana: head rows covered from the top (darker final row)


def load_source():
    """sheet.png + sheet.json -> (cell_w, cell_h, [frame pixel buffers], {tag: (from, to)})."""
    with open(os.path.join(SRC, "sheet.json")) as f:
        meta = json.load(f)
    first = next(iter(meta["frames"].values()))
    cw, ch = first["frame"]["w"], first["frame"]["h"]
    tags = {t["name"]: (t["from"], t["to"]) for t in meta["meta"]["frameTags"]}
    w, h, px = P.read_png(os.path.join(SRC, "sheet.png"))
    assert h == ch and w % cw == 0, f"sheet {w}x{h} does not slice into {cw}x{ch} cells"
    frames = []
    n = w // cw
    for i in range(n):
        frames.append([px[y * w + i * cw + x] for y in range(ch) for x in range(cw)])
    return cw, ch, frames, tags


def blobs(w, h, px):
    """4-neighbor connected components of opaque pixels -> [(size, cx, cy, cells)]."""
    seen = [False] * (w * h)
    out = []
    for i in range(w * h):
        if seen[i] or px[i][3] < 128:
            continue
        stack = [i]
        seen[i] = True
        cells = []
        while stack:
            j = stack.pop()
            cells.append((j % w, j // w))
            x, y = j % w, j // w
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    k = ny * w + nx
                    if not seen[k] and px[k][3] >= 128:
                        seen[k] = True
                        stack.append(k)
        out.append((len(cells),
                    sum(x for x, _ in cells) / len(cells),
                    sum(y for _, y in cells) / len(cells),
                    cells))
    return out


def segment(w, h, px, hand_size=None):
    """One frame -> {part: [(x, y), ...]}. `hand_size` (learned from the neutral frame)
    classifies the limb pairs by blob size; None = classify by height (neutral frame only)."""
    bl = blobs(w, h, px)
    assert len(bl) == 6, f"expected 6 floating parts, got {len(bl)}"
    bl.sort(reverse=True, key=lambda b: b[0])
    big = sorted(bl[:2], key=lambda b: b[2])              # head is the higher of the two
    head, torso = big[0], big[1]
    limbs = bl[2:]
    assert limbs[0][0] != limbs[3][0], "hands and feet must be drawn at different sizes"
    if hand_size is None:
        by_y = sorted(limbs, key=lambda b: b[2])          # neutral pose: hands above feet
        hand_size = by_y[0][0]
    hands = sorted((b for b in limbs if b[0] == hand_size), key=lambda b: b[1])
    feet = sorted((b for b in limbs if b[0] != hand_size), key=lambda b: b[1])
    assert len(hands) == 2 and len(feet) == 2, "limb sizes did not split into two pairs"
    return {
        "head": head[3], "torso": torso[3],
        "handL": hands[0][3], "handR": hands[1][3],
        "footL": feet[0][3], "footR": feet[1][3],
    }, hand_size


def is_fill(p):
    """white body fill vs the dark outline (2-color contract)."""
    return p[0] >= 200


def cut(w, h, px, parts, only, recolor, skip_top=0):
    """Garment frame: the named parts' own pixels in place — FILL pixels recolored, outline
    pixels copied through; `recolor(x, y, top, bot)` may return None to leave a fill pixel
    uncovered (partial garments); `skip_top` drops the part's top rows (neckline)."""
    out = [(0, 0, 0, 0)] * (w * h)
    for name in only:
        cells = parts[name]
        top = min(y for _, y in cells)
        bot = max(y for _, y in cells)
        for x, y in cells:
            if y - top < skip_top:
                continue
            src = px[y * w + x]
            if is_fill(src):
                col = recolor(x, y, top, bot)
                if col is None:
                    continue
                out[y * w + x] = col
            else:
                out[y * w + x] = src
    return out


def two_tone(base, trim, split=0.62):
    """garment recolor: `base` with a darker `trim` on the lower part-fraction."""
    def fn(x, y, top, bot):
        col = trim if (y - top) > (bot - top) * split else base
        return (col[0], col[1], col[2], 255)
    return fn


def crown(base, edge, rows=CROWN):
    """bandana recolor: only the part's top `rows` (the head crown), darker final row."""
    def fn(x, y, top, bot):
        if y - top >= rows:
            return None
        col = edge if y - top == rows - 1 else base
        return (col[0], col[1], col[2], 255)
    return fn


def part_anchors(w, h, frame_parts):
    """{part: [[dx, dy], ...]} — each part's per-frame centroid as an offset from the sprite
    ORIGIN (bottom-center foot anchor, dy negative = up). The runtime consumers (a held item
    icon at the right hand; a future hat at the head) draw at these via SpriteMeta.anchor."""
    out = {}
    for name in ("head", "torso", "handL", "handR", "footL", "footR"):
        table = []
        for parts in frame_parts:
            cells = parts[name]
            hx = round(sum(c[0] for c in cells) / len(cells))
            hy = round(sum(c[1] for c in cells) / len(cells))
            table.append([hx - w // 2, hy - h])
        out[name] = table
    return out


def write_manifest(w, h, overlays, anchors):
    """SpriteMeta manifest (datafiles/spritemeta/human.json): the runtime's semantic sprite
    layer — kind / density / cell per sheet — is GENERATED alongside the art so declarations
    can never drift from it (see scripts/SpriteMeta). Density 1 = the sheet is authored at
    world scale (1 source px per world px, the 2026-07 32px-cell convention); raise it here
    if the sheet is ever redrawn denser. The included file must be REGISTERED in gems.yyp
    once (like the sprite resources); re-runs only rewrite the content."""
    entries = [{
        "sprite": "spr_human", "kind": "entity", "density": 1, "cell": [w, h],
        "anchors": anchors,
    }]
    for name in overlays:
        entries.append({"sprite": name, "kind": "overlay", "density": 1, "cell": [w, h]})
    md = os.path.join(ROOT, "datafiles", "spritemeta")
    os.makedirs(md, exist_ok=True)
    with open(os.path.join(md, "human.json"), "w", newline="\n") as f:
        json.dump(entries, f, indent=2)
        f.write("\n")


def main():
    w, h, body, tags = load_source()
    frame_parts = []
    hand_size = None
    for fi, frame in enumerate(body):
        parts, hand_size = segment(w, h, frame, hand_size)
        frame_parts.append(parts)

    def torso_garment(recolor):
        return [cut(w, h, body[fi], frame_parts[fi], ("torso",), recolor, skip_top=NECK)
                for fi in range(len(body))]

    def feet_garment(recolor):
        return [cut(w, h, body[fi], frame_parts[fi], ("footL", "footR"), recolor)
                for fi in range(len(body))]

    vest = torso_garment(two_tone(VEST, VEST_D))
    shirt = torso_garment(two_tone(SHIRT, SHIRT_D))
    shirt_w = torso_garment(two_tone(WHT, WHT_D))
    bandana = [cut(w, h, body[fi], frame_parts[fi], ("head",), crown(BAND, BAND_D))
               for fi in range(len(body))]
    sneakers = feet_garment(two_tone(SNEAK, SOLE, split=0.55))
    shoes_w = feet_garment(two_tone(WHT, WHT_D, split=0.55))

    F.build("spr_human", body, 8.0, w, h)
    F.build("spr_wear_vest", vest, 8.0, w, h)
    F.build("spr_wear_blackShirt", shirt, 8.0, w, h)
    F.build("spr_wear_redBandana", bandana, 8.0, w, h)
    F.build("spr_wear_blackSneakers", sneakers, 8.0, w, h)
    F.build("spr_wear_shirt", shirt_w, 8.0, w, h)
    F.build("spr_wear_shoes", shoes_w, 8.0, w, h)
    write_manifest(w, h, (
        "spr_wear_vest", "spr_wear_blackShirt", "spr_wear_redBandana",
        "spr_wear_blackSneakers", "spr_wear_shirt", "spr_wear_shoes",
    ), part_anchors(w, h, frame_parts))
    print(f"wrote spr_human + 6 wear sheets ({len(body)} frames, {w}x{h}) "
          f"+ spritemeta manifest (part anchors); tags: {tags}")

    # contact sheet: body / vest / bandit / tinted-civilian rows
    def tint(frame, rgb):
        return [(p[0] * rgb[0] // 255, p[1] * rgb[1] // 255, p[2] * rgb[2] // 255, p[3])
                if p[3] else p for p in frame]

    sc, pad = 4, 6
    n = len(body)
    sw = pad + n * (w * sc + pad)
    sh = pad + 4 * (h * sc + pad)
    sheet = [(46, 52, 46, 255)] * (sw * sh)
    for i in range(n):
        skin = tint(body[i], (232, 184, 144))  # preview-only skin tint
        dressed = [P.over(vest[i][j], skin[j]) for j in range(w * h)]
        bandit = skin
        for layer in (shirt[i], sneakers[i], bandana[i]):
            bandit = [P.over(layer[j], bandit[j]) for j in range(w * h)]
        civ = skin
        for layer in (tint(shirt_w[i], (122, 138, 102)), tint(shoes_w[i], (85, 86, 94))):
            civ = [P.over(layer[j], civ[j]) for j in range(w * h)]
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad, skin, w, h, sc)
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad * 2 + h * sc, dressed, w, h, sc)
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad * 3 + 2 * (h * sc), bandit, w, h, sc)
        P.blit(sheet, sw, pad + i * (w * sc + pad), pad * 4 + 3 * (h * sc), civ, w, h, sc)
    od = P.out_dir("entities")
    P.write_png(os.path.join(od, "human_sheet.png"), sw, sh, sheet)
    print("preview:", os.path.join(od, "human_sheet.png"))


if __name__ == "__main__":
    main()
