#!/usr/bin/env python3
"""meter — measuring a buffer the way the ear does, and levelling to what it measures.

`audiolib.peak_db` and `rms_db` read the numbers; this module reads the loudness. The gap
between the two is the A-curve: a pink or brown bed carries most of its energy where the ear
has least gain, so two buffers at equal RMS can sit ten dB apart, and matching peaks puts a
chirp above a gunshot. Level by the meter here, and the whole set lands on one ladder.

  a_weight()   IEC 61672 A-curve as a linear gain
  dba()        A-weighted level of a whole buffer — beds and loops
  loudness()   loudest A-weighted window — one-shots
  level()      a peak ceiling and a loudness ceiling; whichever binds first wins
"""
import numpy as np

import audiolib as A


def a_weight(f):
    """IEC 61672 A-curve as a linear gain at each frequency in `f` (Hz)."""
    f = np.maximum(f, 1e-6)
    num = 12194.0 ** 2 * f ** 4
    den = ((f ** 2 + 20.6 ** 2) * (f ** 2 + 12194.0 ** 2)
           * np.sqrt((f ** 2 + 107.7 ** 2) * (f ** 2 + 737.9 ** 2)))
    return 10 ** 0.1 * num / den


def _mono(x):
    return x.mean(axis=1) if x.ndim == 2 else x


def dba(x, sr=A.SR):
    """A-weighted level of the whole buffer, dB relative to full scale. The right match for
    continuous material — a bed, a loop — where every second counts the same."""
    m = _mono(x)
    spec = np.abs(np.fft.rfft(m)) ** 2
    p = 2.0 * np.sum(spec * a_weight(np.fft.rfftfreq(len(m), 1.0 / sr)) ** 2) / len(m) ** 2
    return 10 * np.log10(p + 1e-30)


def loudness(x, win=0.2, sr=A.SR):
    """Loudest A-weighted `win` seconds in the buffer, dB relative to full scale.

    Whole-buffer energy is the wrong match for one-shots: it makes a 300 ms cue read ten dB
    under a 100 ms one at the same loudness. A sliding window is what the ear does — and it
    still counts a 45 ms tick as quiet, because 45 ms of energy is all it has."""
    m = _mono(x)
    aw = np.fft.irfft(np.fft.rfft(m) * a_weight(np.fft.rfftfreq(len(m), 1.0 / sr)), len(m))
    w = A.seconds(win, sr)
    if len(aw) <= w:
        return 10 * np.log10(np.sum(aw ** 2) / w + 1e-30)
    c = np.concatenate([[0.0], np.cumsum(aw ** 2)])
    return 10 * np.log10(((c[w:] - c[:-w]) / w).max() + 1e-30)


def level(x, peak, loud, win=0.2, sr=A.SR):
    """Scale to a peak ceiling (dBFS) and a loudness ceiling (dBA over `win`), whichever
    binds first.

    Neither alone works across a set of any width. Loudness alone is unreachable for an
    impulse — a gunshot at full scale makes about -24 dBA/200 ms, because impact lives in
    the peak and not in the energy. Peak alone puts a coin chirp six dB above that same
    gunshot, because a sustained sound at equal peak carries far more energy. Under one
    rule, impulses end up governed by peak and sustains by loudness."""
    return x * min(A.db2lin(peak - A.peak_db(x)), A.db2lin(loud - loudness(x, win, sr)))
