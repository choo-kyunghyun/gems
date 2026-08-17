#!/usr/bin/env python3
"""loop — making a buffer repeat with no audible seam.

A loop clicks unless three separate things are all true. Getting two of them right sounds
exactly like getting none of them right, which is why they are collected here:

  1. Every oscillator completes a whole number of cycles per loop, or the last sample and the
     first do not meet in phase.                                    -> `qf`, `cyc`, `drift`
  2. Every filter is run cyclically, or `lfilter` starting from a zero state leaves a
     settling transient at the head that has no counterpart at the tail.  -> `cyclic`, `cyc_sweep`
  3. Anything that overhangs the end — a reverb tail, a late event — is folded back onto the
     head, which is what turns a linear convolution into a circular one.  -> `wrap_tail`, `place`

Rules 1 and 2 make the source periodic; rule 3 makes everything applied to it periodic too.

Never fade a loop. On a one-shot a fade hides the discontinuity at the end; on a loop the
fade becomes the discontinuity. `seam_db` measures what is left.
"""
import numpy as np

import audiolib as A
import synth as S


# ---- rule 1: land on the loop's frequency grid ------------------------------

def qf(f, n, sr=A.SR):
    """Snap a frequency to the nearest one that completes whole cycles in an n-sample loop.

    73.42 Hz over 8 s is 587.36 cycles — the loop ends mid-cycle and clicks. The correction is
    at most half a cycle per loop (here well under 0.1 Hz), far below anything audible."""
    return round(f * n / sr) * sr / n


def cyc(k, n, sr=A.SR):
    """The frequency that completes exactly k cycles per loop — for `synth.lfo` rates. Every
    modulator in a loop should get its rate from here."""
    return k * sr / n


def drift(n, depth=0.0015, ks=(1, 3, 7), seed=0, sr=A.SR):
    """A multiplier that wobbles the pitch slightly without breaking the loop: each component
    completes a whole number of cycles, so the accumulated phase returns to where it started.
    Perfectly steady tones read as machinery; this is how a drone sounds alive."""
    rng = np.random.default_rng(seed)
    t = A.taxis(n, sr)
    m = np.ones(n)
    for k in ks:
        m += depth * np.sin(2.0 * np.pi * cyc(k, n, sr) * t + rng.uniform(0, 2.0 * np.pi))
    return m


# ---- rule 2: filter cyclically ----------------------------------------------

def cyclic(x, fn):
    """Apply `fn` to the signal laid end-to-end with itself and keep the second half. The
    filter enters the kept region already settled, and its output is periodic.

        bed = loop.cyclic(bed, lambda z: synth.lowpass(z, 800))
    """
    return fn(np.concatenate([x, x], axis=0))[len(x):]


def cyc_sweep(x, cutoff_env, btype="low", order=2, blk=2048, sr=A.SR):
    """`synth.sweep` done cyclically. The cutoff track has to be tiled alongside the signal,
    which is the one case `cyclic` cannot express on its own."""
    tiled = np.concatenate([x, x], axis=0)
    env = np.concatenate([cutoff_env, cutoff_env], axis=0)
    return S.sweep(tiled, env, btype, order, blk, sr)[len(x):]


# ---- rule 3: fold the overhang back onto the head ---------------------------

def wrap_tail(x, n):
    """Truncate to n samples, adding whatever ran past the end back onto the start. This is
    what keeps a reverb tail alive across the loop point instead of cutting it off."""
    head = x[:n].copy()
    tail = x[n:]
    m = min(len(tail), n)
    if m > 0:
        head[:m] += tail[:m]
    return head


def place(buf, x, at, sr=A.SR):
    """Add x into buf at `at` seconds, in place, wrapping around the end. An event dropped near
    the loop point keeps its tail — it reappears at the head, where the loop puts it anyway."""
    n = len(buf)
    if buf.ndim == 2 and x.ndim == 1:
        x = A.as_stereo(x)
    i = A.seconds(at, sr) % n
    for off in range(0, len(x), n):
        seg = x[off:off + n]
        j = (i + off) % n
        m = min(len(seg), n - j)
        buf[j:j + m] += seg[:m]
        if m < len(seg):
            buf[:len(seg) - m] += seg[m:]
    return buf


# ---- the check --------------------------------------------------------------

def seam_db(x):
    """How much the loop point stands out, in dB.

    Compares the sample-to-sample jump across the seam against the 99th-percentile jump found
    inside the material. At or below 0 dB the seam is indistinguishable from any other moment
    in the track — that is what "no click" means, measurably. Read this number after touching
    anything above; it is the only part of a loop an ear is guaranteed to catch and a
    spectrogram is guaranteed to miss."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    jump = abs(m[0] - m[-1])
    inner = np.percentile(np.abs(np.diff(m)), 99)
    return 20 * np.log10((jump + 1e-12) / (inner + 1e-12))
