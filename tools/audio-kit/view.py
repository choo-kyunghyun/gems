#!/usr/bin/env python3
"""view — pictures of a signal, for the one sense the kit's author does not have.

The meters say how loud a buffer is and whether its loop point clicks; they say nothing
about what happens across it. A spectrogram does: whether events clump or spread, whether a
reverb tail dies before the next event or is cut off, whether a bed breathes or stalls,
whether a modulation reads as a period, and whether a fast sweep aliases (a line reflected
off the top of the picture). It is a diagnostic, not a meter — read levels from `meter`, not
from a colour.

  spectrogram()  log-frequency STFT as an RGB image: dB colour, time and decade gridlines
  ends()         the last and first milliseconds butted together — the seam of a loop, or
                 whether a one-shot starts and stops at zero
  sheet()        named tracks stacked into one PNG
  write_png()    8-bit RGB PNG encoder, hand-rolled like the WAV one
  text()         a 3x5 pixel font, so a picture can carry its own labels

Pixels are the axes: `px_per_s` and `px_per_oct` are the caller's, so a position in the
picture is a time and a frequency without an axis to read.

    python view.py out/bgm/*.wav      -> out/view/sheet.png
"""
import os
import struct
import sys
import zlib

import numpy as np

import audiolib as A
import loop as L


# ---- PNG ----------------------------------------------------------------------

def write_png(path, rgb):
    """Write an (h, w, 3) uint8 array as an 8-bit RGB PNG. Returns the path."""
    rgb = np.ascontiguousarray(rgb, dtype=np.uint8)
    h, w, _ = rgb.shape
    raw = np.concatenate([np.zeros((h, 1), np.uint8), rgb.reshape(h, w * 3)], axis=1).tobytes()

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b"IDAT", zlib.compress(raw, 6)))
        f.write(chunk(b"IEND", b""))
    return path


# ---- colour and text ------------------------------------------------------------

# Dark-to-light ramp, ordered in lightness so a picture reads the same in greyscale.
_RAMP = np.array([(0, 0, 4), (80, 18, 123), (182, 54, 121), (251, 135, 97), (252, 253, 191)], float)
_INK = (255, 255, 255)
_TRACE = (251, 135, 97)


def _colour(u):
    """u in [0, 1] -> RGB along the ramp."""
    pos = np.linspace(0.0, 1.0, len(_RAMP))
    u = np.clip(u, 0.0, 1.0)
    return np.stack([np.interp(u, pos, _RAMP[:, c]) for c in range(3)], axis=-1).astype(np.uint8)


def _blend(px, a, colour=_INK):
    return (px * (1.0 - a) + np.array(colour, float) * a).astype(np.uint8)


_GLYPHS = {k: v.replace(" ", "") for k, v in {
    "A": ".#. #.# ### #.# #.#", "B": "##. #.# ##. #.# ##.", "C": "### #.. #.. #.. ###",
    "D": "##. #.# #.# #.# ##.", "E": "### #.. ##. #.. ###", "F": "### #.. ##. #.. #..",
    "G": "### #.. #.# #.# ###", "H": "#.# #.# ### #.# #.#", "I": "### .#. .#. .#. ###",
    "J": "..# ..# ..# #.# ###", "K": "#.# #.# ##. #.# #.#", "L": "#.. #.. #.. #.. ###",
    "M": "#.# ### ### #.# #.#", "N": "##. #.# #.# #.# #.#", "O": "### #.# #.# #.# ###",
    "P": "### #.# ### #.. #..", "Q": "### #.# #.# ### ..#", "R": "### #.# ##. #.# #.#",
    "S": ".## #.. .#. ..# ##.", "T": "### .#. .#. .#. .#.", "U": "#.# #.# #.# #.# ###",
    "V": "#.# #.# #.# #.# .#.", "W": "#.# #.# ### ### #.#", "X": "#.# #.# .#. #.# #.#",
    "Y": "#.# #.# .#. .#. .#.", "Z": "### ..# .#. #.. ###",
    "0": "### #.# #.# #.# ###", "1": ".#. ##. .#. .#. ###", "2": "### ..# ### #.. ###",
    "3": "### ..# ### ..# ###", "4": "#.# #.# ### ..# ..#", "5": "### #.. ### ..# ###",
    "6": "### #.. ### #.# ###", "7": "### ..# ..# ..# ..#", "8": "### #.# ### #.# ###",
    "9": "### #.# ### ..# ###",
    " ": "... ... ... ... ...", ".": "... ... ... ... .#.", "-": "... ... ### ... ...",
    "+": "... .#. ### .#. ...", "/": "..# ..# .#. #.. #..", "_": "... ... ... ... ###",
}.items()}


def text(img, x, y, s, scale=2, colour=_INK, back=0.6):
    """Draw `s` (upper-cased) into `img` at (x, y), 3x5 glyphs at `scale`, over a box darkened
    by `back`. Anything past the edge is clipped."""
    s = str(s).upper()
    w, h = len(s) * 4 * scale - scale, 5 * scale
    x0, y0 = max(x - scale, 0), max(y - scale, 0)
    box = img[y0:y + h + scale, x0:x + w + scale]
    box[:] = (box * (1.0 - back)).astype(np.uint8)
    for i, ch in enumerate(s):
        g = _GLYPHS.get(ch, _GLYPHS[" "])
        for r in range(5):
            for c in range(3):
                if g[r * 3 + c] == "#":
                    px, py = x + (i * 4 + c) * scale, y + r * scale
                    img[py:py + scale, px:px + scale] = colour
    return img


def _tick(px_per_s):
    """The time gridline interval: the smallest 1-2-5 step that leaves room for a label
    between lines."""
    for t in (0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0):
        if t * px_per_s >= 100.0:
            return t
    return 60.0


def _label(t):
    return f"{t:g}S" if t >= 1.0 else f"{t * 1000:g}MS"


# ---- the pictures -----------------------------------------------------------------

def spectrogram(x, px_per_s=20.0, px_per_oct=24, nfft=4096, fmin=30.0, fmax=16000.0,
                range_db=80.0, sr=A.SR):
    """Log-frequency STFT of the mono downmix as an (h, w, 3) image. Columns run at `px_per_s`
    per second, rows at `px_per_oct` per octave from `fmax` at the top down to `fmin`; colour
    is dB below the picture's own peak, over `range_db`. `nfft` trades frequency resolution
    for time: 4096 resolves the harmonics of a hum, 512 the attack of a click. Gridlines
    fall on the decades (bright) and their 2x and 5x (faint), and on a 1-2-5 time step."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    hop = max(1, int(round(sr / px_per_s)))
    w = 1 + (len(m) - 1) // hop
    win = np.hanning(nfft)
    pad = np.concatenate([np.zeros(nfft // 2), m, np.zeros(nfft // 2 + hop)])
    frames = np.lib.stride_tricks.sliding_window_view(pad, nfft)[::hop][:w]
    spec = np.abs(np.fft.rfft(frames * win, axis=1)) * (2.0 / win.sum())   # a full-scale sine -> 1

    h = int(np.ceil(np.log2(fmax / fmin) * px_per_oct)) + 1
    f = fmax * 2.0 ** (-np.arange(h) / px_per_oct)
    b = np.clip(f / (sr / nfft), 0, spec.shape[1] - 1.001)
    lo = np.floor(b).astype(int)
    u = b - lo
    mag = spec[:, lo] * (1.0 - u) + spec[:, lo + 1] * u                    # (w, h)
    db = 20.0 * np.log10(mag.T + 1e-12)
    img = _colour((db - (db.max() - range_db)) / range_db)

    for dec in (10.0, 100.0, 1000.0, 10000.0):
        for k, a in ((1.0, 0.45), (2.0, 0.15), (5.0, 0.15)):
            hz = dec * k
            r = int(round(np.log2(fmax / hz) * px_per_oct))
            if fmin <= hz <= fmax and 0 <= r < h:
                img[r] = _blend(img[r], a)
                if k == 1.0:
                    s = f"{hz / 1000:g}K" if hz >= 1000 else f"{hz:g}"
                    text(img, w - len(s) * 8 - 3, r - 12, s)
    tick = _tick(sr / hop)
    for k in range(1, int(len(m) / sr / tick) + 1):
        c = int(round(k * tick * sr / hop))
        if c < w:
            img[:, c] = _blend(img[:, c], 0.3)
            s = _label(k * tick)
            if c + 3 + len(s) * 8 <= w:                # a label cut off is a wrong label
                text(img, c + 3, h - 13, s)
    return img


def ends(x, w, ms=50.0, height=32, sr=A.SR):
    """The last `ms` and the first `ms` of the mono downmix butted together, `w` pixels wide,
    with the junction marked. On a loop this is the seam — the number the strip carries is
    `loop.seam_db`. On a one-shot it is whether the sound starts and stops at zero."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    k = min(A.seconds(ms / 1000.0, sr), len(m) // 2)
    seg = np.concatenate([m[-k:], m[:k]])
    peak = max(float(np.abs(seg).max()), 1e-9)
    img = np.zeros((height, w, 3), np.uint8)
    img[:] = (10, 8, 20)
    mid = height // 2
    img[mid] = (60, 60, 70)
    edges = np.linspace(0, len(seg), w + 1).astype(int)
    for c in range(w):
        s = seg[edges[c]:max(edges[c + 1], edges[c] + 1)]
        if len(s):
            hi = mid - int(round(s.max() / peak * (mid - 2)))
            lo = mid - int(round(s.min() / peak * (mid - 2)))
            img[hi:lo + 1, c] = _TRACE
    img[:, w // 2] = _INK
    text(img, 3, 3, f"ENDS {ms:g}MS  SEAM {L.seam_db(x):+.1f}DB  PEAK {A.peak_db(seg):+.1f}DBFS")
    return img


def sheet(tracks, path, gap=4, **kw):
    """Stack `[(name, x), ...]` — x a signal or a WAV path — into one PNG at `path`, each track
    a spectrogram over its ends strip. Keyword arguments go to `spectrogram`."""
    sr = kw.get("sr", A.SR)
    tracks = [(name, A.read_wav(x)[0] if isinstance(x, str) else x) for name, x in tracks]
    specs = [spectrogram(x, **kw) for _, x in tracks]
    w = max(sp.shape[1] for sp in specs)          # one time scale; a short track is a short panel
    rows = []
    for (name, x), sp in zip(tracks, specs):
        sp = np.pad(sp, ((0, 0), (0, w - sp.shape[1]), (0, 0)))
        text(sp, 3, 3, f"{name}  {len(x) / sr:.2f}S  PEAK {A.peak_db(x):+.1f}DBFS")
        rows += [sp, ends(x, w, sr=sr), np.zeros((gap, w, 3), np.uint8)]
    return write_png(path, np.concatenate(rows[:-1], axis=0))


if __name__ == "__main__":
    paths = sys.argv[1:]
    if not paths:
        sys.exit("usage: view.py <wav>...")
    tracks = [(os.path.splitext(os.path.basename(p))[0], A.read_wav(p)[0]) for p in paths]
    longest = max(len(x) for _, x in tracks) / A.SR
    # ~960 px for the longest track; a shorter window once the material is short
    px_per_s = float(np.clip(960.0 / longest, 10.0, 2000.0))
    out = sheet(tracks, os.path.join(A.out_dir("view"), "sheet.png"),
                px_per_s=px_per_s, nfft=4096 if longest > 4.0 else 1024)
    print("->", out)
