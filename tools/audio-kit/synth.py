#!/usr/bin/env python3
"""synth — the generators and shapers a sound is built from.

  tone()        the workhorse oscillator (sine/square/pulse/saw/triangle) with pitch sweep
                and vibrato. Not band-limited: this is the kit's chiptune voice.
  bl_saw() / bl_square()   band-limited via additive synthesis — reach for these only when a
                fast sweep through the high register aliases audibly.
  unison()      a detuned stack of band-limited saws across the stereo field — the pad voice.
  noise()       white / pink / brown, spectrally shaped through the FFT.
  crackle()     vinyl clicks.
  adsr() perc() ar() breakpoints() lfo() pump()   envelopes and modulation curves.
  lowpass() highpass() bandpass() sweep() resonate()   Butterworth filters, fixed or moving.
  lowpass_q()   the resonant two-pole — the filter sound Butterworth cannot make.
  chorus() saturate() bitcrush()   movement, warmth, grit.
  modal()       decaying-sine partials — bells, glass, struck metal.
  harmonics()   a harmonic recipe for `modal`: an instrument written as its spectrum.
  fm()          two-operator FM — e-piano, bells, basses, from two numbers.
  drum()        kick / snare / hat one-shots.
  note_freq() / note_midi()   parse "C4" / "A#3" / "Bb2".
  PATCHES / voice()   named instrument presets, and one note rendered from one.

Frequency arguments accept a scalar or a per-sample array, so any envelope this module
returns can be handed straight to `tone` as a pitch track.
"""
import math
import numpy as np
import scipy.signal as sps

import audiolib as A

_TWO_PI = 2.0 * math.pi


# ---- oscillators ------------------------------------------------------------

def _freq_track(n, f0, f1, glide, vib_rate, vib_depth, sr):
    """Resolve the frequency arguments into a per-sample track in Hz."""
    f = np.asarray(f0, dtype=float)
    if f.ndim == 0:
        if f1 is None:
            f = np.full(n, float(f))
        else:
            u = np.arange(n) / n if n else np.zeros(0)
            if glide == "exp" and f0 > 0.0 and f1 > 0.0:
                f = f0 * (f1 / f0) ** u
            else:
                f = f0 + (f1 - f0) * u
    elif len(f) != n:
        raise ValueError(f"frequency track is {len(f)} samples, expected {n}")
    if vib_depth:
        f = f * 2.0 ** ((vib_depth / 12.0) * np.sin(_TWO_PI * vib_rate * A.taxis(n, sr)))
    return f


def _radians(n, f, sr):
    """Integrate a frequency track into accumulated phase (radians), so a sweep or vibrato
    stays click-free across the whole note."""
    return np.cumsum(_TWO_PI * f / sr)


def tone(n, wave="square", f0=440.0, f1=None, duty=0.5,
         vib_rate=0.0, vib_depth=0.0, glide="lin", sr=A.SR):
    """`n` samples of `wave` at f0 Hz. f1 sweeps the pitch f0 -> f1 across the note ('lin' or
    'exp' glide); vib_depth is in semitones at vib_rate Hz. A frequency of zero throughout
    yields silence — without that guard a square wave at 0 Hz is a constant, i.e. pure DC."""
    f = _freq_track(n, f0, f1, glide, vib_rate, vib_depth, sr)
    if not np.any(f):
        return np.zeros(n)
    ph = np.mod(_radians(n, f, sr) / _TWO_PI, 1.0)      # fractional phase [0, 1)
    if wave == "sine":
        return np.sin(_TWO_PI * ph)
    if wave in ("square", "pulse"):
        return np.where(ph < duty, 1.0, -1.0)
    if wave == "saw":
        return 2.0 * ph - 1.0
    if wave == "triangle":
        return 4.0 * np.abs(ph - 0.5) - 1.0
    raise ValueError(f"unknown wave {wave!r}")


def bl_saw(n, f, nharm=24, tilt=1.0, sr=A.SR):
    """Band-limited sawtooth by additive synthesis. tilt > 1 rolls the upper harmonics off
    faster, which reads as a softer, darker saw."""
    ph = _radians(n, _freq_track(n, f, None, "lin", 0.0, 0.0, sr), sr)
    fmax = float(np.max(np.abs(np.asarray(f, dtype=float))))
    out = np.zeros(n)
    for k in range(1, nharm + 1):
        if k * fmax > sr * 0.45:
            break
        out += np.sin(k * ph) / (k ** tilt)
    return out * (2.0 / math.pi)


def bl_square(n, f, nharm=24, sr=A.SR):
    """Band-limited square — odd harmonics only."""
    ph = _radians(n, _freq_track(n, f, None, "lin", 0.0, 0.0, sr), sr)
    fmax = float(np.max(np.abs(np.asarray(f, dtype=float))))
    out = np.zeros(n)
    for k in range(1, nharm * 2, 2):
        if k * fmax > sr * 0.45:
            break
        out += np.sin(k * ph) / k
    return out * (4.0 / math.pi)


def unison(n, f, voices=7, cents=12.0, nharm=24, tilt=1.0, width=1.0, grid=False, seed=0,
           sr=A.SR):
    """A stack of band-limited saws detuned across `cents` and spread across the stereo field
    by `width` — the pad and lead voice of electronic music. Returns (n, 2). Each voice starts
    at its own phase, so the stack never adds up to one loud saw.

    `grid=True` snaps every voice to the n-sample loop's frequency grid (scalar `f` only), so
    the beating between voices repeats with the loop instead of stepping at the seam."""
    f = np.asarray(f, dtype=float)
    rng = np.random.default_rng(seed)
    out = np.zeros((n, 2))
    for i in range(voices):
        u = (i / (voices - 1) - 0.5) if voices > 1 else 0.0
        fi = f * 2.0 ** (u * cents / 1200.0)
        if grid and fi.ndim == 0:
            fi = np.round(fi * n / sr) * sr / n
        s = int(rng.integers(0, 2048))                  # a phase offset, by rendering early
        track = np.concatenate([np.repeat(fi[:1], s), fi]) if fi.ndim else fi
        v = bl_saw(n + s, track, nharm, tilt, sr)[s:]
        a = (u * width + 1.0) * math.pi / 4.0
        out[:, 0] += v * math.cos(a)
        out[:, 1] += v * math.sin(a)
    return out / math.sqrt(voices)


def noise(n, kind="white", seed=0):
    """white / pink (-3 dB per octave) / brown (-6 dB), shaped in the frequency domain.

    Because pink and brown come back through an inverse FFT they are inherently periodic,
    which makes them safe as loop material — and makes np.roll a valid way to decorrelate
    the two channels of a stereo bed."""
    rng = np.random.default_rng(seed)
    w = rng.standard_normal(n)
    if kind == "white":
        return w / np.max(np.abs(w))
    spec = np.fft.rfft(w)
    f = np.fft.rfftfreq(n, 1.0)
    shape = np.ones_like(f)
    shape[1:] = 1.0 / (f[1:] ** (0.5 if kind == "pink" else 1.0))
    shape[0] = 0.0
    out = np.fft.irfft(spec * shape, n)
    return out / np.max(np.abs(out))


def crackle(n, density=6.0, decay=0.003, seed=0, sr=A.SR):
    """Vinyl: `density` clicks per second, each a few milliseconds of decaying noise at a
    random level. Peak-normalized; sit it far down with `audiolib.normalize`."""
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    m = max(2, int(decay * 5 * sr))
    kernel = np.exp(-np.arange(m) / (decay * sr))
    for at in rng.uniform(0, n, int(density * n / sr)).astype(int):
        seg = min(m, n - at)
        out[at:at + seg] += rng.uniform(0.05, 1.0) ** 2 * kernel[:seg] * rng.standard_normal(seg)
    out = highpass(out, 1200.0, 2, sr=sr)
    return out / (np.max(np.abs(out)) + 1e-12)


# ---- envelopes --------------------------------------------------------------

def adsr(buf, a=0.005, d=0.05, s=0.7, r=0.05, sr=A.SR):
    """Attack/decay/sustain/release over a fixed-length note. Release is carved from the tail,
    so a short note is mostly attack + release (a natural pluck) and a long note holds."""
    n = len(buf)
    na, nd, nr = int(a * sr), int(d * sr), int(r * sr)
    i = np.arange(n)
    rel = max(0, n - nr)
    env = np.select(
        [i < na, i < na + nd, i < rel],
        [i / na if na else np.ones(n),
         1.0 - (1.0 - s) * ((i - na) / nd if nd else 1.0),
         np.full(n, s)],
        default=s * (1.0 - (i - rel) / nr) if nr else 0.0)
    return buf * (env[:, None] if buf.ndim == 2 else env)


def perc(n, attack=0.002, decay=0.25, curve=1.0, sr=A.SR):
    """Percussive envelope. `decay` is the time to reach -60 dB."""
    t = A.taxis(n, sr)
    return np.clip(t / max(attack, 1e-6), 0.0, 1.0) ** curve * np.exp(-t / (decay / 6.908))


def ar(n, attack, release, sr=A.SR):
    """Linear attack, cosine release. For swells and pads, where ADSR's corners show."""
    e = np.ones(n)
    na = max(int(attack * sr), 1)
    e[:na] = np.linspace(0.0, 1.0, min(na, n))
    nr = max(int(release * sr), 1)
    if nr < n:
        e[n - nr:] = 0.5 * (1.0 + np.cos(np.linspace(0.0, math.pi, nr)))
    return e


def breakpoints(n, points, log=False, sr=A.SR):
    """[(seconds, value), ...] -> an interpolated curve. log=True interpolates exponentially,
    which is what a frequency track wants — a linear glide sounds like it slows down."""
    t = A.taxis(n, sr)
    xs = np.array([p[0] for p in points], dtype=float)
    ys = np.array([p[1] for p in points], dtype=float)
    if log:
        return np.exp(np.interp(t, xs, np.log(np.maximum(ys, 1e-6))))
    return np.interp(t, xs, ys)


def lfo(n, rate, lo=0.0, hi=1.0, phase=0.0, sr=A.SR):
    """Slow sine, mapped to [lo, hi]. For a loop, take `rate` from `loop.cyc` so the modulation
    completes a whole number of cycles."""
    return lo + (hi - lo) * 0.5 * (1.0 + np.sin(_TWO_PI * rate * A.taxis(n, sr) + phase))


def pump(n, bpm=80.0, depth=0.6, attack=0.012, recover=0.55, sr=A.SR):
    """Sidechain envelope: on every beat the level drops by `depth` over `attack` seconds and
    climbs back (raised cosine) over `recover` of the beat — the pulse of electronic music
    with no drum in it. For a loop, snap the tempo to the grid first:
    `bpm = loop.qf(bpm / 60, n) * 60`."""
    beat = 60.0 / bpm
    t = A.taxis(n, sr) % beat
    r = np.clip((t - attack) / (recover * beat), 0.0, 1.0)
    dip = np.where(t < attack, t / attack, 0.5 * (1.0 + np.cos(math.pi * r)))
    return 1.0 - depth * dip


# ---- filters ----------------------------------------------------------------

def _wn(cutoff, btype, sr):
    ny = sr / 2.0
    if btype == "band":
        return [float(np.clip(cutoff[0] / ny, 1e-5, 0.99)),
                float(np.clip(cutoff[1] / ny, 1e-5, 0.999))]
    return float(np.clip(cutoff / ny, 1e-5, 0.99))


def _filt(x, cutoff, btype, order, zero_phase, sr):
    b, a = sps.butter(order, _wn(cutoff, btype, sr), btype=btype)
    if zero_phase and len(x) > 3 * max(len(a), len(b)):
        return sps.filtfilt(b, a, x, axis=0)
    return sps.lfilter(b, a, x, axis=0)


def lowpass(x, cutoff, order=2, zero_phase=False, sr=A.SR):
    """Butterworth low-pass. The default is causal (`lfilter`): it shifts phase but preserves
    transients, which is what a hit or a click needs. `zero_phase` runs it forwards and
    backwards instead — no phase error, but it smears a pre-ring ahead of every attack, so
    keep it to steady-state material like pads and drones."""
    return _filt(x, cutoff, "low", order, zero_phase, sr)


def highpass(x, cutoff, order=2, zero_phase=False, sr=A.SR):
    return _filt(x, cutoff, "high", order, zero_phase, sr)


def bandpass(x, lo, hi, order=2, zero_phase=False, sr=A.SR):
    return _filt(x, (lo, hi), "band", order, zero_phase, sr)


def _rbj_low(cutoff, q, sr):
    """Two-pole resonant low-pass coefficients (the audio-EQ cookbook form)."""
    w0 = _TWO_PI * float(np.clip(cutoff, 10.0, sr * 0.45)) / sr
    alpha = math.sin(w0) / (2.0 * q)
    c = math.cos(w0)
    b = np.array([(1.0 - c) / 2.0, 1.0 - c, (1.0 - c) / 2.0])
    a = np.array([1.0 + alpha, -2.0 * c, 1.0 - alpha])
    return b / a[0], a / a[0]


def lowpass_q(x, cutoff, q=0.707, sr=A.SR):
    """Resonant two-pole low-pass. q = 0.707 is flat; 2-8 rings the cutoff, which is the
    filter sound of electronic music and the one thing `lowpass` (Butterworth: flat by
    definition) cannot make. Cascade twice for a ladder-like 24 dB/oct."""
    b, a = _rbj_low(cutoff, q, sr)
    return sps.lfilter(b, a, x, axis=0)


def sweep(x, cutoff_env, btype="low", order=4, blk=192, sr=A.SR, q=None):
    """Low/high-pass with a moving cutoff (a per-sample Hz array, e.g. from `breakpoints`).
    With `q`, the resonant low-pass (`lowpass_q`) sweeps instead of the Butterworth.

    Redesigning the filter every sample is far too slow, so coefficients are refreshed per
    block — but the filter state `zi` carries across block boundaries. Without that carry
    every boundary is a discontinuity, i.e. a click every `blk` samples. Smaller blocks track
    a fast sweep more closely at the cost of more design calls; 192 suits an SFX sweep, ~2048
    a slow ambient one."""
    out = np.zeros_like(x)
    nch = x.shape[1] if x.ndim == 2 else 0
    zi = None
    for i in range(0, len(x), blk):
        hz = float(np.mean(cutoff_env[i:i + blk]))
        if q is not None and btype == "low":
            b, a = _rbj_low(hz, q, sr)
        else:
            b, a = sps.butter(order, _wn(hz, btype, sr), btype=btype)
        if zi is None:
            nz = max(len(a), len(b)) - 1
            zi = np.zeros((nz, nch)) if nch else np.zeros(nz)
        out[i:i + blk], zi = sps.lfilter(b, a, x[i:i + blk], axis=0, zi=zi)
    return out


def resonate(x, freq, q=12.0, gain=1.0):
    """Narrow peaking filter — rings a single frequency out of whatever it is fed. High q on
    noise is how metal groans and wind whistles are made."""
    b, a = sps.iirpeak(float(np.clip(freq / (A.SR / 2.0), 1e-5, 0.99)), q)
    return sps.lfilter(b, a, x, axis=0) * gain


def chorus(x, rate=0.3, depth=0.003, base=0.012, mix=0.5, sr=A.SR):
    """Two modulated delays on a mono signal, in opposite phase left and right: the width and
    slow movement of an ensemble. Returns (n, 2). The delay line is read modulo n, so with
    `rate` from `loop.cyc` a loop stays a loop."""
    n = len(x)
    t = A.taxis(n, sr)
    idx = np.arange(n)
    out = np.zeros((n, 2))
    for ch, ph in enumerate((0.0, math.pi)):
        d = (base + depth * 0.5 * (1.0 + np.sin(_TWO_PI * rate * t + ph))) * sr
        pos = (idx - d) % n
        i0 = np.floor(pos).astype(int)
        fr = pos - i0
        wet = x[i0] * (1.0 - fr) + x[(i0 + 1) % n] * fr
        out[:, ch] = x * (1.0 - mix) + wet * mix
    return out


def saturate(x, drive=2.0):
    """tanh soft clip, scaled so full scale stays full scale. Warmth on a sub, edge on a
    pad; past drive 4 it is distortion."""
    return np.tanh(x * drive) / math.tanh(drive)


def bitcrush(x, bits=8, hold=1):
    """Quantize to `bits` and hold each sample `hold` times (a sample-rate divider). Lo-fi
    grit; `hold` above 4 starts to alias on purpose."""
    q = 2.0 ** (bits - 1)
    y = np.round(x * q) / q
    if hold > 1:
        y = np.repeat(y[::hold], hold, axis=0)[:len(x)]
    return y


# ---- modal + percussion -----------------------------------------------------

def modal(n, partials, seed=0, sr=A.SR):
    """Sum of decaying sines: [(freq, time to -60 dB, amplitude), ...].

    Integer frequency ratios (1:2:3) give a pitched instrument. Non-integer ratios
    (1 : 1.83 : 2.71 : 3.94) give an inharmonic body — a bell, a glass shard, a struck hull.
    That ratio choice, not the envelope, is what makes something read as metal."""
    rng = np.random.default_rng(seed)
    t = A.taxis(n, sr)
    out = np.zeros(n)
    for f, decay, amp in partials:
        if f > sr * 0.45:
            continue
        out += amp * np.sin(_TWO_PI * f * t + rng.uniform(0, _TWO_PI)) * np.exp(-t / (decay / 6.908))
    return out


def harmonics(f, amps, decay=1.0, damp=0.5, stretch=0.0):
    """Partials for `modal` from a harmonic recipe: `amps[k-1]` is the level of harmonic k at
    k·f, decaying to -60 dB in `decay / k**damp` seconds — the upper harmonics of anything
    struck or plucked die first, and `damp` says how much first. `stretch` bends the series
    sharp the way a stiff string does (0.0005-0.002 for a piano; 0 is an organ pipe).

    A hand-written table sounds like an organ; that is what a hand-written table is. The
    recipe is for organ, pad and bell colours, not for a piano."""
    return [(k * f * math.sqrt(1.0 + stretch * k * k), decay / k ** damp, a)
            for k, a in enumerate(amps, 1) if a]


def fm(n, f, ratio=1.0, index=2.0, sr=A.SR):
    """Two-operator FM: a sine carrier at f, phase-modulated by a sine at `ratio`·f with depth
    `index` (a scalar, or a per-sample track). Integer ratios give a harmonic timbre, others
    a bell; an index that decays over the note is the electric piano — bright under the
    hammer, nearly a sine in the sustain."""
    ph = _radians(n, _freq_track(n, f, None, "lin", 0.0, 0.0, sr), sr)
    return np.sin(ph + index * np.sin(ratio * ph))


def drum(kind, seed=0, sr=A.SR):
    """A percussion one-shot at its natural length — kick, snare, or hat."""
    if kind == "kick":
        b = tone(A.seconds(0.18, sr), "sine", f0=160.0, f1=45.0, glide="exp", sr=sr)
        return adsr(b, a=0.001, d=0.05, s=0.4, r=0.10, sr=sr)
    if kind == "snare":
        n = A.seconds(0.16, sr)
        body = tone(n, "triangle", f0=190.0, f1=120.0, sr=sr)
        mixed = lowpass(0.45 * body + 0.7 * noise(n, "white", seed), 6500.0, sr=sr)
        return adsr(mixed, a=0.001, d=0.04, s=0.2, r=0.09, sr=sr)
    if kind == "hat":
        nz = highpass(noise(A.seconds(0.06, sr), "white", seed), 7000.0, sr=sr)
        return adsr(nz, a=0.001, d=0.01, s=0.1, r=0.04, sr=sr)
    raise ValueError(f"unknown drum {kind!r}")


# ---- note names -> pitch ----------------------------------------------------

_STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_REST = ("", ".", "r", "rest", "-", "x", "X", None)


def note_midi(name):
    """'C4'/'A#3'/'Bb2' -> MIDI number (C4 = 60, A4 = 69). Rest/trigger token -> None."""
    if name in _REST:
        return None
    s = str(name).strip()
    if not s or s[0].upper() not in _STEP:
        return None
    semi = _STEP[s[0].upper()]
    i = 1
    while i < len(s) and s[i] in "#b♯♭":
        semi += 1 if s[i] in "#♯" else -1
        i += 1
    octave = int(s[i:]) if i < len(s) and s[i:].lstrip("-").isdigit() else 4
    return (octave + 1) * 12 + semi


def note_freq(name):
    """Note name -> frequency in Hz. A rest gives 0.0, which `tone` renders as silence."""
    m = note_midi(name)
    return 0.0 if m is None else 440.0 * 2.0 ** ((m - 69) / 12.0)


# ---- instrument patches -----------------------------------------------------
# A patch is a flat dict with ADSR (a/d/s/r) and one voice: a `wave` (+ duty, vibrato), a
# `unison` voice count (+ cents; renders stereo), a `partials` recipe for `harmonics` (+ decay,
# damp, stretch), an `fm_ratio` (+ fm_index, and fm_decay for an index that falls over the
# note), or a `drum` one-shot.
PATCHES = {
    "pad":      {"unison": 5, "cents": 10.0, "a": 0.60, "d": 0.40, "s": 0.80, "r": 1.00},
    "supersaw": {"unison": 7, "cents": 18.0, "a": 0.02, "d": 0.20, "s": 0.70, "r": 0.40},
    "sub":      {"wave": "sine", "a": 0.020, "d": 0.05, "s": 0.90, "r": 0.25},
    "keys":     {"wave": "triangle", "a": 0.004, "d": 0.35, "s": 0.25, "r": 0.30,
                 "vib_rate": 4.5, "vib_depth": 0.05},
    "epiano":   {"fm_ratio": 1.0, "fm_index": 1.6, "fm_decay": 0.9,
                 "a": 0.003, "d": 0.50, "s": 0.35, "r": 0.35},
    "bell":     {"fm_ratio": 3.5, "fm_index": 3.0, "fm_decay": 1.8,
                 "a": 0.002, "d": 1.60, "s": 0.00, "r": 0.30},
    "organ":    {"partials": [1.0, 0.7, 0.45, 0.5, 0.25, 0.2, 0.1, 0.15], "decay": 30.0,
                 "damp": 0.0, "a": 0.012, "d": 0.05, "s": 0.95, "r": 0.06},
    "pluck":    {"wave": "saw", "a": 0.002, "d": 0.10, "s": 0.00, "r": 0.04},
    "lead":     {"wave": "pulse", "duty": 0.50, "a": 0.005, "d": 0.06, "s": 0.60, "r": 0.06,
                 "vib_rate": 5.5, "vib_depth": 0.12},
    "lead2":    {"wave": "pulse", "duty": 0.25, "a": 0.005, "d": 0.05, "s": 0.55, "r": 0.06},
    "bass":     {"wave": "triangle", "a": 0.004, "d": 0.04, "s": 0.85, "r": 0.05},
    "sine":     {"wave": "sine", "a": 0.005, "d": 0.05, "s": 0.80, "r": 0.06},
    "kick":     {"drum": "kick"},
    "snare":    {"drum": "snare"},
    "hat":      {"drum": "hat"},
}


def voice(patch, n, f0=440.0, seed=0, sr=A.SR, **over):
    """Render one note from a patch (a PATCHES name or a dict); `over` replaces any field. A
    drum patch ignores n and f0 — a one-shot has its own length and pitch."""
    p = dict(PATCHES[patch] if isinstance(patch, str) else patch, **over)
    if "drum" in p:
        return drum(p["drum"], seed=seed, sr=sr)
    if "partials" in p:
        parts = harmonics(f0, p["partials"], p.get("decay", 1.0), p.get("damp", 0.5),
                          p.get("stretch", 0.0))
        buf = modal(n, parts, seed, sr) / sum(abs(a) for _, _, a in parts)   # a note, not a sum
    elif "fm_ratio" in p:
        index = p.get("fm_index", 2.0)
        if p.get("fm_decay"):
            index = index * np.exp(-A.taxis(n, sr) / (p["fm_decay"] / 6.908))
        buf = fm(n, f0, p["fm_ratio"], index, sr)
    elif "unison" in p:
        buf = unison(n, f0, p["unison"], p.get("cents", 12.0), grid=p.get("grid", False),
                     seed=seed, sr=sr)
    else:
        buf = tone(n, wave=p.get("wave", "square"), f0=f0, duty=p.get("duty", 0.5),
                   vib_rate=p.get("vib_rate", 0.0), vib_depth=p.get("vib_depth", 0.0), sr=sr)
    return adsr(buf, a=p.get("a", 0.005), d=p.get("d", 0.05),
                s=p.get("s", 0.7), r=p.get("r", 0.05), sr=sr)
