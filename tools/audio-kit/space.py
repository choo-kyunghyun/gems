#!/usr/bin/env python3
"""space — putting a sound somewhere: impulse responses, convolution reverb, delay, pan.

Reverb does more than add tail. It is what tells the ear how big the room is and what it is
made of, so a dry oscillator and the same oscillator in `cavern` read as two different objects
rather than one object mixed two ways. Reach here before reaching for a new waveform.

`make_ir` synthesizes an impulse response rather than loading one: bands of decaying noise
plus a scatter of early reflections. Each band decays at its own rate (`hf_damp`), so the tail
darkens as it falls — a uniformly-decaying tail sounds like a hall no matter how long it is.
A plate has no early reflections and keeps its top end (`early=0`, `hf_damp` near 0.9): that
is the bright, wide tail of electronic ambient, which is a surface and not a room.

`pingpong` is the delay of the same idiom: repeats that alternate sides and darken.
"""
import numpy as np
import scipy.signal as sps

import audiolib as A
import synth as S

_IR_CACHE = {}

# Named spaces — the name is the character, the numbers are the implementation. tight, room
# and cavern are rooms; plate and wash are surfaces; hall sits between.
SPACES = {
    "tight":  dict(dur=0.45, decay=0.35, hf_damp=0.62, predelay=0.004, width=0.50),
    "room":   dict(dur=1.20, decay=0.90, hf_damp=0.68, predelay=0.008, width=0.70),
    "plate":  dict(dur=2.60, decay=2.20, hf_damp=0.86, predelay=0.020, width=0.95, early=0),
    "hall":   dict(dur=3.60, decay=3.00, hf_damp=0.80, predelay=0.025, width=0.95),
    "cavern": dict(dur=6.00, decay=5.00, hf_damp=0.66, predelay=0.030, width=0.92),
    "wash":   dict(dur=9.00, decay=7.50, hf_damp=0.90, predelay=0.040, width=1.00, early=0),
}

_BANDS = [(40, 140), (140, 400), (400, 1100), (1100, 3000), (3000, 8000), (8000, 15000)]


def make_ir(dur=2.5, decay=2.0, hf_damp=0.72, predelay=0.012, width=0.85, early=14, seed=0,
            sr=A.SR):
    """Synthesize a stereo impulse response, (n, 2). Cached: building one costs six band-pass
    passes per channel, and a scratch script tends to ask for the same space repeatedly."""
    key = (dur, decay, hf_damp, predelay, width, early, seed, sr)
    if key in _IR_CACHE:
        return _IR_CACHE[key]

    rng = np.random.default_rng(seed)
    n = A.seconds(dur, sr)
    t = A.taxis(n, sr)
    chans = []
    for _ in range(2):
        ir = np.zeros(n)
        for k, (lo, hi) in enumerate(_BANDS):
            if lo >= sr / 2:
                break
            band_decay = decay * (hf_damp ** k)
            nz = S.bandpass(rng.standard_normal(n), lo, min(hi, sr / 2 * 0.98), sr=sr)
            ir += nz * np.exp(-t / (band_decay / 6.908))
        # Early reflections. The diffuse tail says "large"; these say what shape and how far.
        for _ in range(early):
            pos = int(rng.uniform(0.004, 0.075) * sr)
            if pos < n:
                ir[pos] += rng.choice([-1.0, 1.0]) * rng.uniform(0.2, 0.7) * np.exp(-pos / sr / 0.03)
        ir[-int(n * 0.08):] *= np.linspace(1.0, 0.0, int(n * 0.08))   # no click off the end
        chans.append(ir)

    l, r = chans
    m = (l + r) * 0.5
    ir = np.column_stack([m + (l - m) * width, m + (r - m) * width])
    ir = np.concatenate([np.zeros((A.seconds(predelay, sr), 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2, axis=0)).max()      # equal energy, so wet= means one thing

    _IR_CACHE[key] = ir
    return ir


def space(name, seed=7, sr=A.SR):
    """An IR by preset name — see SPACES."""
    return make_ir(seed=seed, sr=sr, **SPACES[name])


def reverb(x, ir, wet=0.35):
    """Convolve against an IR. Always returns stereo, and always longer than the input by the
    IR's length — trim it (`trim_tail`) for a one-shot, fold it back (`loop.wrap_tail`) for a
    loop. Mono in gives a stereo image, which is how a positioned SFX loses its mono-ness:
    convolve before deciding the asset is mono, or not at all."""
    if x.ndim == 1:
        w = np.column_stack([sps.fftconvolve(x, ir[:, 0]), sps.fftconvolve(x, ir[:, 1])])
        d = A.as_stereo(x)
    else:
        w = np.column_stack([sps.fftconvolve(x[:, 0], ir[:, 0]), sps.fftconvolve(x[:, 1], ir[:, 1])])
        d = x
    out = w * wet
    out[:len(d)] += d * (1.0 - wet)
    return out


def mono_reverb(x, ir, wet=0.35):
    """Reverb that stays mono — the IR is folded down first. SFX the engine will position in
    the world must stay mono, so this is the one to use on them."""
    m = ir.mean(axis=1) if ir.ndim == 2 else ir
    out = sps.fftconvolve(x, m) * wet
    out[:len(x)] += x * (1.0 - wet)
    return out


def delay(x, time, fb=0.35, wet=0.3, taps=12, sr=A.SR):
    """Feedback delay. Repeats at a fixed interval say "this space is wide" where reverb says
    "this space is enclosed"."""
    d = A.seconds(time, sr)
    out = x.astype(float).copy()
    for i in range(1, taps + 1):
        g = wet * (fb ** i)
        off = d * i
        if g < 1e-4 or off >= len(out):
            break
        out[off:] += x[:len(x) - off] * g
    return out


def pingpong(x, time, fb=0.45, wet=0.35, damp=3500.0, taps=12, sr=A.SR):
    """Feedback delay whose repeats alternate sides, each one darker than the last (`damp`
    is a one-pole low-pass in the feedback path). Always returns stereo. For a loop, run it
    through `loop.cyclic` with `time` a division of the beat."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    d = A.seconds(time, sr)
    out = A.as_stereo(x).astype(float).copy()
    tap = m
    for i in range(1, taps + 1):
        g = wet * (fb ** (i - 1))
        off = d * i
        if g < 1e-4 or off >= len(m):
            break
        tap = S.lowpass(tap, damp, 1, sr=sr)
        out[off:, i % 2] += tap[:len(m) - off] * g
    return out


def pan(x, p):
    """Equal-power pan of a mono signal: p = -1 left, 0 centre, +1 right. Equal-power rather
    than linear, so a source swept across the field holds a constant loudness."""
    a = (p + 1.0) * np.pi / 4.0
    return np.column_stack([x * np.cos(a), x * np.sin(a)])


def trim_tail(x, floor_db=-65.0):
    """Cut the inaudible end off a convolved one-shot. Reverb extends every buffer by the full
    IR length, so without this every SFX ships with seconds of near-silence attached."""
    m = np.abs(x).max(axis=1) if x.ndim == 2 else np.abs(x)
    idx = np.nonzero(m > m.max() * A.db2lin(floor_db))[0]
    if len(idx) == 0:
        return x
    return x[:min(len(x), idx[-1] + A.seconds(0.02))]
