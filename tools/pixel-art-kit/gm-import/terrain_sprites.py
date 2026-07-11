#!/usr/bin/env python3
"""terrain_sprites — import the generated terrain materials as GameMaker dual-grid sprites.

Stage 2 of the terrain-tile pipeline (run terrain_materials.py first). For each terrain it cuts the
16 dual-grid corner frames from variant 0 (via tileset.py), appends the remaining variant materials
(plain re-rolls, then decorated) as extra FULL-tile (mask-15) frames, and writes a multi-frame
GMSprite — the `.yy` plus a per-frame composite PNG and a single-layer PNG — into the project's
sprites/<spr_terrain_*>/, templated on the engine's existing dual-grid sprite. It also emits the
sheets' SpriteMeta manifest (datafiles/spritemeta/terrain.json): per sprite the WEIGHTED mask-15
variant table from terrain_materials.variant_plan (frame 15 = the base, 16+ = the extra variants;
decorated frames carry a low weight), which TerrainStream picks from per cell by deterministic
hash. The manifest is generated alongside the frames so the table can't drift from them.

The sprite resources must already be REGISTERED (once, via the IDE or
`gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sprite NAME=spr_terrain_<T>"`); this only fills in
their frames. Frame/layer/keyframe UUIDs are DETERMINISTIC (uuid5), so re-running is reproducible
(no churn). Tile size matches terrain_materials (16px; see GEMS.md); TerrainStream scales it to the cell.

Usage:  python tools/pixel-art-kit/gm-import/terrain_sprites.py [project_root]
  project_root defaults to the repo two levels above the kit (tools/pixel-art-kit/../..).
"""
import json, os, sys, uuid
# this adapter lives in the kit (gm-import/); add the sibling common/ to the path so the kit modules resolve.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import pixlib as P
import tileset as T
import terrain_materials as TM

S = TM.S
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(P.KIT))
NS = uuid.uuid5(uuid.NAMESPACE_DNS, "gems.terrain.tiles")  # stable namespace -> deterministic ids
# The project IDE folder these sprites file under (project-specific; edit if reused elsewhere).
PARENT = ("Bitmap Sprites", "folders/Media/Bitmap Sprites.yy")


def sprite_name(terr):
    return "spr_terrain_" + terr


def frames_for(terr):
    """16 dual-grid frames cut from variant 0, then each extra variant material as a full tile."""
    patch0, _ = T.prep_patch(f"materials/{terr}_0.png", S, False)
    if patch0 is None:
        raise SystemExit(f"missing material materials/{terr}_0.png — run terrain_materials.py first")
    frames = T.synth(patch0, S, range(16))
    i = 1
    while os.path.isfile(os.path.join(P.OUT, "materials", f"{terr}_{i}.png")):
        pv, _ = T.prep_patch(f"materials/{terr}_{i}.png", S, False)
        frames.append(pv)
        i += 1
    return frames


def yy(name, frame_ids, layer_id, key_ids):
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
  "gridX":{S // 2},
  "gridY":{S // 2},
  "height":{S},
  "HTile":false,
  "layers":[
{layers}
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


def build(terr):
    name = sprite_name(terr)
    sprdir = os.path.join(ROOT, "sprites", name)
    frames = frames_for(terr)
    n = len(frames)
    frame_ids = [str(uuid.uuid5(NS, f"{name}:frame:{i}")) for i in range(n)]
    key_ids = [str(uuid.uuid5(NS, f"{name}:key:{i}")) for i in range(n)]
    layer_id = str(uuid.uuid5(NS, f"{name}:layer"))

    os.makedirs(sprdir, exist_ok=True)
    for root, dirs, files in os.walk(sprdir, topdown=False):  # wipe prior frames, keep the dir
        for fn in files:
            os.remove(os.path.join(root, fn))
        for d in dirs:
            os.rmdir(os.path.join(root, d))

    for fid, fr in zip(frame_ids, frames):
        P.write_png(os.path.join(sprdir, f"{fid}.png"), S, S, fr)  # composite
        ld = os.path.join(sprdir, "layers", fid)
        os.makedirs(ld, exist_ok=True)
        P.write_png(os.path.join(ld, f"{layer_id}.png"), S, S, fr)  # single "default" layer
    with open(os.path.join(sprdir, f"{name}.yy"), "w", newline="\n") as fh:
        fh.write(yy(name, frame_ids, layer_id, key_ids))
    return name, n


def write_manifest(entries):
    """SpriteMeta manifest (datafiles/spritemeta/terrain.json) — see module doc. The included
    file must be REGISTERED in gems.yyp once; re-runs only rewrite the content."""
    md = os.path.join(ROOT, "datafiles", "spritemeta")
    os.makedirs(md, exist_ok=True)
    with open(os.path.join(md, "terrain.json"), "w", newline="\n") as f:
        json.dump(entries, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    print(f"importing into {ROOT}/sprites/")
    entries = []
    for terr in TM.TERRAINS:
        name, n = build(terr)
        plan = TM.variant_plan(terr)
        # frames = 16 dual masks + (len(plan) - 1) extra full tiles (frame 15 IS plan entry 0);
        # a mismatch means out/materials is stale vs TERRAINS — regenerate stage 1 first
        assert n - 15 == len(plan), f"{name}: {n} frames vs plan {len(plan)} — rerun terrain_materials.py"
        entry = {"sprite": name, "kind": "tileset", "autotile": "dual", "cell": [S, S]}
        if len(plan) > 1:
            entry["variants"] = {"15": [[15 + i, w] for i, w in plan]}
        entries.append(entry)
        print(f"  {name}: {n} frames ({n - 15} full-tile variant(s))")
    write_manifest(entries)
    print(f"  spritemeta manifest: datafiles/spritemeta/terrain.json ({len(entries)} sheets)")
