#!/usr/bin/env python3
"""gm_sound — write a rendered float buffer as a GameMaker GMSound asset.

The shared GameMaker binding for the two sound importers (sfx_sounds / bgm_sounds),
analogous to how the sprite importers share common/. Writes sounds/<name>/<name>.wav
+ a templated <name>.yy. Same contract as the sprite importers:

  * the GMSound resource must already be REGISTERED (IDE or
    `gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sound NAME=<name>"`); this only
    fills the audio file + overwrites the .yy (so the asset is filed under `parent`).
  * there are NO uuids in a GMSound .yy, so re-running is inherently churn-free.
"""
import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "common"))
import audiolib as A


def yy(name, soundfile, duration, channel_format, compression, parent, group):
    """A GMSound .yy. bitDepth 1 = 16-bit; channelFormat 0 = mono, 1 = stereo;
    compression 0 = uncompressed (instant SFX + seam-perfect BGM loops). `group` is the
    GMAudioGroup name (e.g. "bgm"/"sfx" for live category-volume control via audio_group_set_gain;
    a non-default group must be audio_group_load()'d before playback — see scripts/Audio)."""
    return f"""{{
  "$GMSound":"v2",
  "%Name":"{name}",
  "audioGroupId":{{
    "name":"{group}",
    "path":"audiogroups/{group}",
  }},
  "bitDepth":1,
  "channelFormat":{channel_format},
  "compression":{compression},
  "compressionQuality":4,
  "conversionMode":0,
  "duration":{duration:.6f},
  "exportDir":"",
  "name":"{name}",
  "parent":{{
    "name":"{parent[0]}",
    "path":"{parent[1]}",
  }},
  "preload":false,
  "resourceType":"GMSound",
  "resourceVersion":"2.0",
  "sampleRate":{A.SR},
  "soundFile":"{soundfile}",
  "volume":1.0,
}}"""


def write_sound(root, name, channels, parent, group="audiogroup_default", compression=0, sr=A.SR):
    """Write one GMSound. channels = [mono] or [L, R]; `group` is the GMAudioGroup name. Returns the duration (s)."""
    d = os.path.join(root, "sounds", name)
    os.makedirs(d, exist_ok=True)
    wav = name + ".wav"
    dur = A.write_wav(os.path.join(d, wav), channels, sr)
    chfmt = 1 if len(channels) > 1 else 0
    with open(os.path.join(d, name + ".yy"), "w", newline="\n") as fh:
        fh.write(yy(name, wav, dur, chfmt, compression, parent, group))
    return dur
