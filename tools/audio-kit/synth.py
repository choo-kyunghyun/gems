#!/usr/bin/env python3
"""synth — retro/chiptune synthesis primitives (pure Python stdlib).

The audio analogue of pixlib's raster API: small, composable building blocks the
SFX + music renderers draw with. Everything works on float buffers (see audiolib):

  tone()    band-unlimited oscillator (sine/square/pulse/saw/triangle/noise) with
            optional pitch sweep + vibrato — the one workhorse generator.
  adsr()    attack/decay/sustain/release envelope applied over a fixed-length note.
  lowpass() / highpass()  one-pole filters (soften noise, brighten hats).
  drum()    kick / snare / hat one-shots built from the above.
  note_freq() / note_midi()  parse "C4" / "A#3" / "Bb2" (rest -> 0 / None).
  PATCHES   named instrument presets (lead/bass/pluck/pad/... + drum patches).

Determinism: noise takes an explicit `seed` (random.Random), so a re-render of the
same template is bit-identical — the audio counterpart to the kit's uuid5 sprites.
"""
import math, random
import audiolib as A

_TWO_PI = 2.0 * math.pi


def tone(n, sr=A.SR, wave="square", f0=440.0, f1=None, duty=0.5,
         vib_rate=0.0, vib_depth=0.0, glide="lin", seed=0):
    """Generate `n` samples of `wave` at frequency f0 (Hz). Optional features:
      f1        sweep the pitch f0 -> f1 across the note ('lin' or 'exp' glide).
      vib_*     vibrato: depth in semitones at vib_rate Hz.
      seed      PRNG seed for wave == 'noise' (deterministic re-renders).
    Phase is accumulated per-sample so a sweep/vibrato stays click-free."""
    out = [0.0] * n
    rng = random.Random(seed)
    phase = 0.0
    inv = 1.0 / n if n else 0.0
    for i in range(n):
        t = i * inv
        if f1 is None:
            f = f0
        elif glide == "exp" and f0 > 0.0:
            f = f0 * (f1 / f0) ** t
        else:
            f = f0 + (f1 - f0) * t
        if vib_depth:
            f *= 2.0 ** ((vib_depth / 12.0) * math.sin(_TWO_PI * vib_rate * (i / sr)))
        phase += f / sr
        ph = phase - int(phase)                     # fractional phase [0,1)
        if wave == "sine":
            v = math.sin(_TWO_PI * ph)
        elif wave in ("square", "pulse"):
            v = 1.0 if ph < duty else -1.0
        elif wave == "saw":
            v = 2.0 * ph - 1.0
        elif wave == "triangle":
            v = 4.0 * abs(ph - 0.5) - 1.0
        elif wave == "noise":
            v = rng.uniform(-1.0, 1.0)
        else:
            v = 0.0
        out[i] = v
    return out


def adsr(buf, sr=A.SR, a=0.005, d=0.05, s=0.7, r=0.05):
    """Apply an ADSR envelope in place: attack/decay/release in seconds, s = sustain
    level [0,1]. Release is carved from the tail, so a short note is mostly attack +
    release (a natural pluck) and a long note holds the sustain."""
    n = len(buf)
    A_, D_, R_ = int(a * sr), int(d * sr), int(r * sr)
    rel = max(0, n - R_)
    for i in range(n):
        if i < A_:
            e = i / A_ if A_ else 1.0
        elif i < A_ + D_:
            e = 1.0 - (1.0 - s) * ((i - A_) / D_ if D_ else 1.0)
        elif i < rel:
            e = s
        else:
            e = s * (1.0 - (i - rel) / R_) if R_ else 0.0
        buf[i] *= e
    return buf


def lowpass(buf, cutoff, sr=A.SR):
    """One-pole low-pass (rounds off noise/explosions)."""
    if cutoff <= 0.0:
        return buf[:]
    dt = 1.0 / sr
    rc = 1.0 / (_TWO_PI * cutoff)
    al = dt / (rc + dt)
    out = [0.0] * len(buf)
    y = 0.0
    for i, x in enumerate(buf):
        y += al * (x - y)
        out[i] = y
    return out


def highpass(buf, cutoff, sr=A.SR):
    """One-pole high-pass = signal - lowpass(signal) (brightens hats / ticks)."""
    lp = lowpass(buf, cutoff, sr)
    return [buf[i] - lp[i] for i in range(len(buf))]


def drum(kind, sr=A.SR, seed=0):
    """A percussion one-shot — natural length, ignores pitch:
      kick  sine thump sweeping 160->45 Hz; snare  tone + filtered noise burst;
      hat   short high-passed noise tick."""
    if kind == "kick":
        b = tone(int(0.18 * sr), sr, "sine", f0=160.0, f1=45.0, glide="exp")
        return adsr(b, sr, a=0.001, d=0.05, s=0.4, r=0.10)
    if kind == "snare":
        n = int(0.16 * sr)
        body = tone(n, sr, "triangle", f0=190.0, f1=120.0)
        nz = tone(n, sr, "noise", seed=seed)
        mix = [0.45 * body[i] + 0.7 * nz[i] for i in range(n)]
        mix = lowpass(mix, 6500.0, sr)
        return adsr(mix, sr, a=0.001, d=0.04, s=0.2, r=0.09)
    if kind == "hat":
        nz = tone(int(0.06 * sr), sr, "noise", seed=seed)
        nz = highpass(nz, 7000.0, sr)
        return adsr(nz, sr, a=0.001, d=0.01, s=0.1, r=0.04)
    return A.silence(int(0.05 * sr))


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
    """Note name -> frequency in Hz (rest -> 0.0)."""
    m = note_midi(name)
    return 0.0 if m is None else 440.0 * 2.0 ** ((m - 69) / 12.0)


# ---- instrument patches (named presets the music renderer draws with) -------
# A patch is a flat dict: wave + duty + ADSR (a/d/s/r) + optional vibrato, OR a
# `drum` one-shot. `program` is the General MIDI voice used in the .mid export.
PATCHES = {
    "lead":   {"wave": "pulse", "duty": 0.50, "a": 0.005, "d": 0.06, "s": 0.60, "r": 0.06,
               "vib_rate": 5.5, "vib_depth": 0.12, "program": 80},
    "lead2":  {"wave": "pulse", "duty": 0.25, "a": 0.005, "d": 0.05, "s": 0.55, "r": 0.06, "program": 81},
    "bass":   {"wave": "triangle", "a": 0.004, "d": 0.04, "s": 0.85, "r": 0.05, "program": 38},
    "pluck":  {"wave": "saw", "a": 0.002, "d": 0.10, "s": 0.00, "r": 0.04, "program": 81},
    "pad":    {"wave": "square", "duty": 0.5, "a": 0.04, "d": 0.20, "s": 0.60, "r": 0.16, "program": 89},
    "sine":   {"wave": "sine", "a": 0.005, "d": 0.05, "s": 0.80, "r": 0.06, "program": 80},
    "kick":   {"drum": "kick", "program": 36},
    "snare":  {"drum": "snare", "program": 38},
    "hat":    {"drum": "hat", "program": 42},
}
