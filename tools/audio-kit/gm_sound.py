#!/usr/bin/env python3
"""gm_sound — write a rendered buffer as a GameMaker GMSound asset. The kit's one engine binding.

A prototype script synthesizes with `synth`, then hands the buffer here:

    import audiolib as A, synth as S, gm_sound as G

    buf = S.adsr(S.tone(A.seconds(0.2), wave="square", f0=880.0, f1=220.0), r=0.08)
    G.write_sound("snd_blip", A.normalize(buf))

The buffer's shape decides the channel format: (n,) writes a mono asset, (n, 2) a stereo one.
SFX stay mono because the engine's spatial audio needs a mono source to position; BGM is
stereo. A GMSound .yy carries no uuids, so re-running is inherently churn-free.

The resource must exist in gems.yyp; `write_sound` registers it through gm-cli when it doesn't.
"""
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import audiolib as A

ROOT = os.path.dirname(os.path.dirname(A.KIT))                  # the GameMaker project root
SFX_FOLDER = "Game/Media/Audio/SFX"                             # BGM lives in .../Audio/BGM


def ensure(name, folder=SFX_FOLDER):
    """Register `name` in gems.yyp through gm-cli if it isn't there. Returns True if it created one.

    Hand-editing the yyp's Resources list corrupts the project, so registration always goes
    through resourcetool (see docs/GMCLI.md)."""
    with open(os.path.join(ROOT, "gems.yyp"), encoding="utf-8") as fh:
        if f'"path":"sounds/{name}/{name}.yy"' in fh.read():
            return False
    cmd = ["gm-cli", "resourcetool", "eval",
           f"RESOURCE CREATE TYPE=Sound NAME={name} FOLDER={folder}"]
    try:
        subprocess.run(cmd, cwd=ROOT, check=True)
    except FileNotFoundError:
        raise RuntimeError(
            f"{name} is not in gems.yyp and gm-cli is not on PATH. Register it first:\n"
            f'  gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sound NAME={name} FOLDER={folder}"')
    return True


def _yy(name, soundfile, duration, channel_format, compression, folder):
    """A GMSound .yy. bitDepth 1 = 16-bit; channelFormat 0 = mono, 1 = stereo;
    compression 0 = uncompressed (instant SFX + seam-perfect BGM loops). Every sound sits in
    audiogroup_default, the only group the project defines — category volume is folded by hand
    at playback (scripts/Audio), not by group gain."""
    parent_name = folder.rstrip("/").split("/")[-1]
    parent_path = f"folders/{folder.rstrip('/')}.yy"
    return f"""{{
  "$GMSound":"v2",
  "%Name":"{name}",
  "audioGroupId":{{
    "name":"audiogroup_default",
    "path":"audiogroups/audiogroup_default",
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
    "name":"{parent_name}",
    "path":"{parent_path}",
  }},
  "preload":false,
  "resourceType":"GMSound",
  "resourceVersion":"2.0",
  "sampleRate":{A.SR},
  "soundFile":"{soundfile}",
  "volume":1.0,
}}"""


def write_sound(name, buf, folder=SFX_FOLDER, compression=0, sr=A.SR, register=True):
    """Write one GMSound into sounds/<name>/ from a (n,) mono or (n, 2) stereo buffer.
    Returns the duration (s)."""
    if buf.ndim not in (1, 2) or len(buf) == 0:
        raise ValueError(f"{name}: expected a non-empty (n,) or (n, 2) buffer, got {buf.shape}")
    if register:
        ensure(name, folder)

    d = os.path.join(ROOT, "sounds", name)
    os.makedirs(d, exist_ok=True)
    wav = name + ".wav"
    dur = A.write_wav(os.path.join(d, wav), buf, sr)
    with open(os.path.join(d, name + ".yy"), "w", newline="\n") as fh:
        fh.write(_yy(name, wav, dur, 1 if buf.ndim == 2 else 0, compression, folder))
    return dur
