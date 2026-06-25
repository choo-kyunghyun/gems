#!/usr/bin/env python3
"""sfx — render sound-effect templates to mono WAV (pure Python stdlib).

The SFX analogue of pixel-art-kit's draw.py: art (here, sound) lives in data files
(`templates/sfx/*.json`), never inlined in the generator. Each effect is a stack of
synth LAYERS mixed together; the renderer reads the JSON, synthesizes via synth.py,
and writes out/sfx/<name>.wav.

A template:  {"gain"?, "lowpass"?, "fadeOut"?, "layers": [ <layer>, ... ]}
A layer:     {"wave", "f0", "f1"?, "dur", "start"?, "duty"?, "a","d","s","r",
              "gain"?, "vib_rate"?, "vib_depth"?, "glide"?, "lowpass"?, "highpass"?}
  f0 / f1   note name ("C5") OR raw Hz (number); f1 present => pitch sweep.
  start     offset (s) of the layer within the effect (default 0 => layers stack).

Determinism: the noise seed is crc32(name) (+ layer index), so re-renders are
bit-identical. Run `python sfx.py` to render every templates/sfx/*.json.
"""
import json, os, sys, zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # ensure sibling imports resolve
import audiolib as A
import synth as S

SFX_DIR = os.path.join(A.KIT, "templates", "sfx")


def _freq(v):
    """Layer f0/f1: a number is Hz; a string is a note name."""
    if isinstance(v, (int, float)):
        return float(v)
    return S.note_freq(v)


def render(spec, sr=A.SR, seed=0):
    """A loaded SFX template -> a mono float buffer."""
    master = []
    for li, L in enumerate(spec.get("layers", [])):
        n = A.seconds(L.get("dur", 0.2), sr)
        buf = S.tone(n, sr, L.get("wave", "square"),
                     f0=_freq(L.get("f0", 440)),
                     f1=_freq(L["f1"]) if "f1" in L else None,
                     duty=L.get("duty", 0.5),
                     vib_rate=L.get("vib_rate", 0.0), vib_depth=L.get("vib_depth", 0.0),
                     glide=L.get("glide", "lin"), seed=seed * 131 + li)
        if "highpass" in L:
            buf = S.highpass(buf, L["highpass"], sr)
        if "lowpass" in L:
            buf = S.lowpass(buf, L["lowpass"], sr)
        S.adsr(buf, sr, L.get("a", 0.005), L.get("d", 0.05), L.get("s", 0.7), L.get("r", 0.05))
        A.add_into(master, A.gain(buf, L.get("gain", 1.0)), A.seconds(L.get("start", 0.0), sr))
    if "lowpass" in spec:
        master = S.lowpass(master, spec["lowpass"], sr)
    master = A.normalize(master, spec.get("gain", 0.9))
    A.fade(master, spec.get("fadeIn", 0.0), spec.get("fadeOut", 0.004), sr)   # tiny out-fade: no end click
    return master


def render_file(path, sr=A.SR):
    """Load + render one template; returns (name, mono_buffer)."""
    name = os.path.splitext(os.path.basename(path))[0]
    spec = json.load(open(path, encoding="utf-8"))
    return name, render(spec, sr, seed=zlib.crc32(name.encode()))


def render_all(sr=A.SR):
    """Render every templates/sfx/*.json -> out/sfx/<name>.wav. Returns [(name, dur)]."""
    od = A.out_dir("sfx")
    done = []
    for fn in sorted(os.listdir(SFX_DIR)):
        if not fn.lower().endswith(".json"):
            continue
        name, buf = render_file(os.path.join(SFX_DIR, fn), sr)
        dur = A.write_wav(os.path.join(od, name + ".wav"), [buf], sr)
        done.append((name, dur))
    return done


if __name__ == "__main__":
    for name, dur in render_all():
        print(f"  sfx {name}: {dur:.3f}s -> out/sfx/{name}.wav")
