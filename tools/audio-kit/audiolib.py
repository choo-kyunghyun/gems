#!/usr/bin/env python3
"""audiolib — shared audio primitives for the kit (pure Python stdlib, no deps).

The audio counterpart to pixel-art-kit's pixlib: 16-bit PCM WAV encode, float
sample-buffer helpers (mix / gain / normalize / fade), and the path helpers that
resolve the toolkit root so every script writes to the one shared out/.

Samples are plain Python floats in [-1, 1]; a "buffer" is a flat list of them. A
WAV is written from a list of channel-buffers (mono = [buf], stereo = [L, R]).
"""
import os, struct, sys
from array import array

KIT = os.path.dirname(os.path.abspath(__file__))    # toolkit root
OUT = os.path.join(KIT, "out")                       # shared output root (gitignored)
SR = 44100                                           # sample rate (Hz) — the GEMS audio convention


def out_dir(*parts):
    """Path under the shared out/, creating it. e.g. out_dir('sfx') -> .../out/sfx."""
    d = os.path.join(OUT, *parts)
    os.makedirs(d, exist_ok=True)
    return d


# ---- buffers (float samples in [-1, 1]) ------------------------------------

def silence(n):
    return [0.0] * n


def seconds(t, sr=SR):
    """Seconds -> whole sample count."""
    return int(round(t * sr))


def add_into(dst, src, at=0, g=1.0):
    """Mix src into dst starting at sample `at`, extending dst if needed. Returns dst."""
    end = at + len(src)
    if end > len(dst):
        dst.extend([0.0] * (end - len(dst)))
    for i in range(len(src)):
        dst[at + i] += src[i] * g
    return dst


def gain(buf, g):
    return [s * g for s in buf]


def peak(buf):
    p = 0.0
    for s in buf:
        a = -s if s < 0 else s
        if a > p:
            p = a
    return p


def normalize(buf, target=0.95):
    """Scale so the loudest sample hits `target`. No-op on silence."""
    p = peak(buf)
    if p <= 0.0:
        return buf
    k = target / p
    return [s * k for s in buf]


def fade(buf, fin=0.0, fout=0.0, sr=SR):
    """Linear fade-in / fade-out (seconds), in place. A tiny out-fade kills the
    end-of-sample click that an abrupt cut leaves on a non-zero last sample."""
    n = len(buf)
    fi, fo = seconds(fin, sr), seconds(fout, sr)
    for i in range(min(fi, n)):
        buf[i] *= i / fi
    for i in range(min(fo, n)):
        buf[n - 1 - i] *= i / fo
    return buf


# ---- WAV encode (16-bit PCM, little-endian; mono or interleaved stereo) -----

def write_wav(path, channels, sr=SR):
    """channels: list of float-buffers (mono = [buf], stereo = [L, R]); each sample
    clamped to [-1, 1] then quantized to int16. Returns the duration in seconds.

    Uses `array('h')` for the bulk pack so a multi-second stereo BGM encodes fast."""
    nch = len(channels)
    n = max((len(c) for c in channels), default=0)
    ints = [0] * (n * nch)
    k = 0
    for i in range(n):
        for c in channels:
            s = c[i] if i < len(c) else 0.0
            if s > 1.0:
                s = 1.0
            elif s < -1.0:
                s = -1.0
            ints[k] = int(s * 32767.0)
            k += 1
    pcm = array("h", ints)
    if sys.byteorder == "big":
        pcm.byteswap()                      # WAV is little-endian
    data = pcm.tobytes()
    byte_rate = sr * nch * 2
    block_align = nch * 2
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, nch, sr, byte_rate, block_align, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)
    return n / sr if sr else 0.0
