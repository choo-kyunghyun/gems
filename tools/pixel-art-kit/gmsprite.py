#!/usr/bin/env python3
"""gmsprite — write frames into a GameMaker sprite asset. The kit's one engine binding.

A prototype script draws frames with `raster`, then hands them here:

    import raster as R, gmsprite as G

    c = R.Canvas(32, 64)
    ...
    G.write("spr_goblin", [c.px], 32, 64, anchor="foot")

`anchor` picks the sprite origin, which is the thing the IDE makes tedious to set by hand:

    foot     bottom-center  — entities that stand on the ground (the project default)
    center   middle-center  — item icons, drawn centered in a UI slot
    topleft  0,0            — tiles and wall/floor textures

Frame and layer uuids are uuid5-derived from the sprite name, so re-running a script
rewrites the same ids instead of churning the .yy with fresh ones. That is free and has
nothing to do with whether the art itself is reproducible.

The resource must exist in gems.yyp; `write` registers it through gm-cli when it doesn't.
"""
import os
import subprocess
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pixlib as P

ROOT = os.path.dirname(os.path.dirname(P.KIT))                  # the GameMaker project root
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "gems.sprites")
SPRITES_FOLDER = "Game/Media/Bitmap Sprites"                    # the IDE folder new sprites land in

# anchor -> (origin enum, (xorigin, yorigin) from the frame size)
ANCHORS = {
    "foot":    (7, lambda w, h: (w // 2, h)),
    "center":  (4, lambda w, h: (w // 2, h // 2)),
    "topleft": (0, lambda w, h: (0, 0)),
}


def ensure(name, folder=SPRITES_FOLDER):
    """Register `name` in gems.yyp through gm-cli if it isn't there. Returns True if it created one.

    Hand-editing the yyp's Resources list corrupts the project, so registration always goes
    through resourcetool (see docs/GMCLI.md)."""
    with open(os.path.join(ROOT, "gems.yyp"), encoding="utf-8") as fh:
        if f'"path":"sprites/{name}/{name}.yy"' in fh.read():
            return False
    cmd = ["gm-cli", "resourcetool", "eval",
           f"RESOURCE CREATE TYPE=Sprite NAME={name} FOLDER={folder}"]
    try:
        subprocess.run(cmd, cwd=ROOT, check=True)
    except FileNotFoundError:
        raise RuntimeError(
            f"{name} is not in gems.yyp and gm-cli is not on PATH. Register it first:\n"
            f'  gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sprite NAME={name} FOLDER={folder}"')
    return True


def _yy(name, frame_ids, layer_id, key_ids, w, h, anchor, folder, speed):
    sprpath = f"sprites/{name}/{name}.yy"
    origin, place = ANCHORS[anchor]
    xorigin, yorigin = place(w, h)
    parent_name = folder.rstrip("/").split("/")[-1]
    parent_path = f"folders/{folder.rstrip('/')}.yy"
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
  "origin":{origin},
  "parent":{{
    "name":"{parent_name}",
    "path":"{parent_path}",
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
    "xorigin":{xorigin},
    "yorigin":{yorigin},
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


def write(name, frames, w, h, anchor="foot", folder=SPRITES_FOLDER, speed=0.0, register=True):
    """Write `frames` (each a flat w*h list of RGBA tuples) into sprites/<name>/. Returns the count.

    Prior frames are wiped, so the asset always matches exactly what was passed in."""
    if anchor not in ANCHORS:
        raise ValueError(f"anchor must be one of {sorted(ANCHORS)}, got {anchor!r}")
    if not frames:
        raise ValueError(f"{name}: no frames")
    if register:
        ensure(name, folder)

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
        fh.write(_yy(name, frame_ids, layer_id, key_ids, w, h, anchor, folder, speed))
    return n
