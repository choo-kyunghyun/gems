#!/usr/bin/env python3
"""sfx_sounds — render the SFX templates and import them as GameMaker GMSound assets.

The SFX counterpart to the sprite kit's entity_sprites.py: it renders every
templates/sfx/*.json (via common/sfx.py) to a mono WAV and writes it straight into
the project's sounds/snd_<name>/ as a GMSound (compression 0 = uncompressed, for
instant low-latency playback). The resources must already be REGISTERED (see
gm_sound.py / the README); this only fills the audio + .yy.

Usage:  python tools/audio-kit/gm-import/sfx_sounds.py [project_root]
  project_root defaults to the repo two levels above the kit.
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # sibling gm_sound
import audiolib as A
import sfx as SFX
import gm_sound as G

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(A.KIT))
PARENT = ("SFX", "folders/Media/Audio/SFX.yy")   # IDE folder (created via resourcetool FOLDER CREATE)
PREFIX = "snd_"                                   # GEMS naming: SFX = snd_<template>


def build():
    done = []
    for fn in sorted(os.listdir(SFX.SFX_DIR)):
        if not fn.lower().endswith(".json"):
            continue
        name, buf = SFX.render_file(os.path.join(SFX.SFX_DIR, fn))
        asset = PREFIX + name
        dur = G.write_sound(ROOT, asset, [buf], PARENT, group="sfx", compression=0)
        done.append((asset, dur))
    return done


if __name__ == "__main__":
    print(f"importing SFX into {ROOT}/sounds/")
    for asset, dur in build():
        print(f"  {asset}: {dur:.3f}s")
