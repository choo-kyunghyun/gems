#!/usr/bin/env python3
"""bgm_sounds — render the BGM song templates and import them as GameMaker GMSound assets.

The BGM counterpart to sfx_sounds.py: it renders every templates/bgm/*.json (via
common/music.py) to a looping stereo WAV and writes it into sounds/mus_<name>/ as a
GMSound. The same render also exports an editable .mid into the kit's out/bgm/ (the
"MIDI base"). compression 0 (uncompressed) keeps the loop seam sample-perfect; in the
IDE set the asset to loop, or switch it to streamed for a very long track.

Usage:  python tools/audio-kit/gm-import/bgm_sounds.py [project_root]
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # sibling gm_sound
import audiolib as A
import music as MUS
import gm_sound as G

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(A.KIT))
PARENT = ("BGM", "folders/Media/Audio/BGM.yy")
PREFIX = "mus_"                                   # GEMS naming: BGM = mus_<template>


def build():
    done = []
    for fn in sorted(os.listdir(MUS.BGM_DIR)):
        if not fn.lower().endswith(".json"):
            continue
        name, left, right, bpm, beats = MUS.render_file(os.path.join(MUS.BGM_DIR, fn))
        asset = PREFIX + name
        dur = G.write_sound(ROOT, asset, [left, right], PARENT, compression=0)
        done.append((asset, dur, bpm, beats))
    return done


if __name__ == "__main__":
    print(f"importing BGM into {ROOT}/sounds/  (.mid -> {A.OUT}/bgm/)")
    for asset, dur, bpm, beats in build():
        print(f"  {asset}: {dur:.2f}s  ({beats} beats @ {bpm} bpm)")
