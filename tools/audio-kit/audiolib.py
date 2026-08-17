#!/usr/bin/env python3
"""audiolib — signal representation, levels, and the 16-bit PCM WAV encoder.

A signal is a float64 numpy array, shaped by its channel count:

    mono    (n,)
    stereo  (n, 2)

Amplitude is nominally [-1, 1]. Intermediate stages may run past it — `normalize` pulls the
peak back to the target before the file is written, which is why the kit needs no limiter.

Sample rate is 44 100 Hz throughout (`SR`), the project convention stamped into every GMSound.
Lengths are sample counts, not seconds: `seconds(0.2)` converts.
"""
import hashlib, os, struct
import numpy as np

KIT = os.path.dirname(os.path.abspath(__file__))    # toolkit root
OUT = os.path.join(KIT, "out")                       # shared output root (gitignored)
SR = 44100                                           # sample rate (Hz) — the GEMS audio convention


def out_dir(*parts):
    """Path under the shared out/, creating it. e.g. out_dir('sfx') -> .../out/sfx."""
    d = os.path.join(OUT, *parts)
    os.makedirs(d, exist_ok=True)
    return d


def seed_of(name):
    """Name -> a stable PRNG seed. Python's built-in hash() is randomized per process, so it
    cannot be used for anything that should re-render the same way tomorrow."""
    return int.from_bytes(hashlib.md5(name.encode()).digest()[:4], "little")


# ---- buffers ----------------------------------------------------------------

def seconds(t, sr=SR):
    """Seconds -> whole sample count."""
    return int(round(t * sr))


def taxis(n, sr=SR):
    """Time axis in seconds, for hand-written modulation."""
    return np.arange(n) / sr


def silence(n, stereo=False):
    return np.zeros((n, 2)) if stereo else np.zeros(n)


def as_stereo(x):
    """Mono -> (n, 2) by duplication; stereo passes through."""
    return np.column_stack([x, x]) if x.ndim == 1 else x


def pad_to(x, n):
    """Trim or zero-extend to exactly n samples — room for a reverb tail to decay into."""
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros((n - len(x),) + x.shape[1:])])


def mix(*layers):
    """Sum layers of differing length, aligned at the head. Stereo wins: if any layer is
    stereo the result is. Adding raw arrays with `+` raises instead — use this."""
    n = max(len(l) for l in layers)
    out = silence(n, stereo=any(l.ndim == 2 for l in layers))
    for l in layers:
        if out.ndim == 2 and l.ndim == 1:
            l = as_stereo(l)
        out[:len(l)] += l
    return out


def place(buf, x, at, sr=SR):
    """Add x into buf at `at` seconds, in place, clipped to buf. A negative `at` drops the
    front of x rather than wrapping — `loop.place` is the wrapping version."""
    i = seconds(at, sr)
    if i < 0:
        x, i = x[-i:], 0
    if buf.ndim == 2 and x.ndim == 1:
        x = as_stereo(x)
    m = min(len(x), len(buf) - i)
    if m > 0:
        buf[i:i + m] += x[:m]
    return buf


# ---- levels -----------------------------------------------------------------

def db2lin(d):
    return 10.0 ** (d / 20.0)


def peak_db(x):
    return 20 * np.log10(np.max(np.abs(x)) + 1e-12)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


def normalize(x, peak_db=-0.5):
    """Scale so the loudest sample lands on `peak_db` dBFS. No-op on silence.

    This step goes last. Fading after it drops the peak of any sound whose attack falls inside
    the fade, so the asset comes out quieter than the target it was written for."""
    p = np.max(np.abs(x))
    return x if p < 1e-9 else x * (db2lin(peak_db) / p)


def fade(x, fin=0.0, fout=0.0, sr=SR):
    """Linear fade in/out (seconds). A tiny out-fade kills the click an abrupt cut leaves on a
    non-zero last sample. Never fade a loop — there the fade becomes the seam."""
    y = x.copy()
    ni, no = seconds(fin, sr), seconds(fout, sr)
    if ni > 1:
        ramp = np.linspace(0.0, 1.0, min(ni, len(y)))
        y[:len(ramp)] *= ramp[:, None] if y.ndim == 2 else ramp
    if no > 1:
        ramp = np.linspace(1.0, 0.0, min(no, len(y)))
        y[len(y) - len(ramp):] *= ramp[:, None] if y.ndim == 2 else ramp
    return y


# ---- WAV encode (16-bit PCM, little-endian; mono or interleaved stereo) -----

def write_wav(path, x, sr=SR):
    """Write one signal as a 16-bit PCM WAV. Returns the duration in seconds.

    Hand-rolled: the header is 44 bytes of struct and the payload is one numpy cast, so the
    kit needs no audio-file library. Samples are clamped, then rounded (not truncated —
    truncation biases every sample toward zero and leaves a faint DC offset)."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    n, nch = x.shape
    pcm = np.rint(np.clip(x, -1.0, 1.0) * 32767.0).astype("<i2")
    data = np.ascontiguousarray(pcm).reshape(-1).tobytes()
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE")
        f.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, nch, sr, sr * nch * 2, nch * 2, 16))
        f.write(b"data" + struct.pack("<I", len(data)) + data)
    return n / sr if sr else 0.0
