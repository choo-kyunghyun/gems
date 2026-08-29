# Audio Kit

A toolkit for making game audio for quick prototypes — synthesize in a throwaway script and render
a WAV you import into GameMaker by hand. Numpy and scipy do the arithmetic; everything above them,
including the WAV encoder, is the kit's own.

It is not an asset pipeline. It does not regenerate the project's committed sounds and does not try
to. It is a box of primitives you import from a script you write for the sound in front of you, and
then usually delete.

## Layout

```
audio-kit/
├── audiolib.py  signals, levels, 16-bit PCM WAV encode/decode, paths
├── synth.py     oscillators + unison + noise + envelopes + filters + modal/FM bodies + drums
├── space.py     synthetic impulse responses, convolution reverb, delay, pan
├── loop.py      the three rules that make a buffer repeat, and the seam metric
├── meter.py     A-weighted loudness, and levelling to it
├── view.py      spectrogram sheets as PNG, for reading a track instead of hearing it
└── out/         everything generated (gitignored)
```

Flat on purpose — one `sys.path` entry imports the whole kit. A signal is a float64 array: `(n,)`
mono, `(n, 2)` stereo. Lengths are sample counts, and `A.seconds(0.2)` converts. Frequency arguments
take a scalar or a per-sample array, so any envelope can be fed straight in as a pitch track.

## Workflow

```python
import sys, os; sys.path.insert(0, "tools/audio-kit")
import audiolib as A, synth as S, space as X

blip = S.adsr(S.tone(A.seconds(0.2), wave="square", f0=880.0, f1=220.0), r=0.08)
blip = X.trim_tail(X.mono_reverb(blip, X.space("tight"), 0.22))
A.write_wav(os.path.join(A.out_dir("sfx"), "sndBlip.wav"), A.normalize(blip))
```

Build a buffer, hand it to `write_wav`. The WAV lands under `out/`, and nothing else happens — the
kit has no engine binding. Importing the file as a `GMSound` is a manual step in the IDE, which is
also where the audio group, the channel format, and the compression setting are chosen.

## Synthesis

`tone(n, wave=, f0=, f1=, duty=, vib_rate=, vib_depth=, glide=)` is the workhorse: `f1` sweeps the
pitch, `vib_*` adds vibrato. Shape it with `adsr`, or `perc` for hits, `ar` for swells, `breakpoints`
for arbitrary curves (`log=True` for frequency). Filter with `lowpass` / `highpass` / `bandpass`, or
`sweep` for a cutoff that moves.

`modal(n, partials)` builds a body out of decaying sines, and the ratios decide the material:
integer ratios give an instrument, non-integer ratios (1 : 1.83 : 2.71 : 3.94) give a bell, a shard,
a struck hull. `drum` gives percussion, `noise(n, "white"|"pink"|"brown")` gives beds, and `PATCHES`
with `voice()` renders a note from a named preset. Note names parse with `note_freq("C4")`.

`tone` is not band-limited, so a fast sweep through the high register aliases audibly in the
opposite direction. `bl_saw` and `bl_square` are band-limited alternatives for when that shows up.

The electronic voice is `unison`: band-limited saws detuned across a few cents and spread across
the field, which is what a pad or a lead is made of, and what `PATCHES["pad"]` and `"supersaw"`
render. Shape it with `lowpass_q` — the resonant two-pole, the filter sound a Butterworth cannot
make — or sweep that with `sweep(..., q=)`. `pump` is the sidechain envelope, a dip on every beat
with no drum in it; `chorus` widens and moves; `saturate` warms a sub; `bitcrush` and `crackle`
are the lo-fi grit and the vinyl.

An instrument can also be written as its spectrum. `harmonics(f, amps, decay=, damp=, stretch=)`
turns a table of harmonic levels into partials for `modal` — the upper ones dying first, the series
stretched sharp for a stiff string — and `fm(n, f, ratio, index)` is two-operator FM, where a
decaying index is the electric piano and a non-integer ratio a bell. `PATCHES["organ"]`,
`"epiano"` and `"bell"` are those two in preset form. A hand-written harmonic table sounds like an
organ, which is what it is; these are colours for keys, pads and bells, not a piano.

## Space

Reverb is not a finishing touch — it is what tells the ear how big the room is, so it changes what a
sound is more than another waveform would. `space("tight"|"room"|"plate"|"hall"|"cavern"|"wash")`
synthesizes an impulse response, `reverb(x, ir, wet=)` convolves it, and `delay`, `pingpong` and
`pan` sit next to it. The rooms darken as they decay; `plate` and `wash` are surfaces, not rooms —
no early reflections, the top end kept — which is the bright, wide tail of electronic ambient.
`pingpong` is that idiom's delay: repeats that alternate sides and darken.

`reverb` always returns stereo. An SFX the engine positions in the world has to stay mono, so use
`mono_reverb` on those.

Finish before writing: `normalize(buf, peak_db=)` sets the peak — there is no limiter and none is
needed — `fade` kills clicks at the ends, and `trim_tail` cuts the silence convolution leaves on the
end of a one-shot.

## Levels

Inside one sound, layers are balanced by measured level, not by guessed coefficients: `at_rms`
sets a continuous layer's RMS, `normalize` sets a sparse layer's peak (RMS on mostly-silence
measures the silence). Pink and brown noise are 1/f and 1/f² in power, so a bed mixed by eye puts
nearly all of its energy under 20 Hz — inaudible, and it eats the headroom the audible band needed.

Across sounds, the number that makes a set sit on one ladder is A-weighted. `meter.dba` reads a
whole buffer — a bed, a loop — and `meter.loudness` the loudest 200 ms, which is what a one-shot
needs: whole-buffer energy makes a 300 ms cue read ten dB under a 100 ms one at the same loudness.
`meter.level(x, peak, loud)` applies a peak ceiling and a loudness ceiling and lets whichever
binds first win, so under one rule an impulse ends up governed by peak and a sustain by loudness.

`read_wav` reads a 16-bit WAV back as a signal, so a rendered file — or one the project already
ships — can be put on the same meter.

## Loops

A loop clicks unless all three of these hold. Each number is what that rule is worth on its own,
over 8 s of the material it governs:

| | | seam |
|---|---|---|
| 1 | Oscillators land on the loop's frequency grid — `qf`, `cyc`, `drift` | +37.2 → +0.0 dB |
| 2 | Filters run cyclically, leaving no start-up transient at the head — `cyclic`, `cyc_sweep` | +19.8 → −10.6 dB |
| 3 | Overhanging tails fold back onto the head — `wrap_tail`, `place` | +11.0 → −2.4 dB |

`seam_db(x)` measures the jump across the loop point against the jumps inside the material. At or
below 0 dB the seam is indistinguishable from any other sample step, and a perfectly periodic sine
measures exactly 0.0. Check it after touching anything above; it is the one loop defect an ear
always catches and a spectrogram never shows.

The rest of the module keeps material periodic while it is shaped. `drift` wobbles a pitch — by
default a tape's wow and flutter — and `wander` a level, a curve that never repeats inside the loop
yet lands on its own start (whole-cycle LFOs multiplied; slow and shallow by default, gusts by
argument). `widen` makes a stereo track out of a mono loop by rolling it against itself — a Haas
spread for tonal material, a third of the loop for a noise bed. `smooth` rounds a gate's edges
across the seam, and `desub` takes the sub out with two cyclic passes — a brown bed keeps most of
its energy under 30 Hz, where it owns the peak and buys no loudness.

```python
import loop as L
n = A.seconds(8.0)
bed = S.bl_saw(n, L.qf(55.0, n) * L.drift(n, seed=A.seed_of("drone")), 9, tilt=1.6)
bed = L.cyclic(bed, lambda z: S.lowpass(z, 700.0))
bed = L.wrap_tail(X.reverb(X.pan(bed, 0.0), X.space("cavern"), 0.45), n)
print(f"{L.seam_db(bed):+.1f} dB")
A.write_wav(os.path.join(A.out_dir("bgm"), "musDrone.wav"), A.normalize(bed, -6.0))
```

Never fade a loop. On a one-shot a fade hides the discontinuity; on a loop the fade is one.

## Viewing

The meters say how loud a buffer is and whether its seam clicks; they say nothing about what
happens across it. `view.sheet([(name, x), ...], path)` writes a PNG of log-frequency
spectrograms, one track over the next, each with its ends butted together under it — whether
events clump or spread, whether a tail dies before the next event or is cut, whether a bed
breathes or stalls, whether a fast sweep aliases (a line reflected off the top). Pixels are the
axes: `px_per_s` and `px_per_oct` are fixed by the caller, so a position is a time and a
frequency. `python view.py out/bgm/*.wav` renders a sheet of files.

It is a diagnostic, not a meter. Colour is dB below the picture's own peak, so read a level from
`meter` and never from a shade; and the seam is invisible in a spectrogram — the ends strip
carries `seam_db` for that. The PNG encoder is hand-rolled like the WAV one, so the dependency
list below stays where it is.

## Gotchas

- WAV only. GameMaker re-compresses at build per the asset's setting, so switch a long track to
  Compressed/Streamed in the IDE if size matters. Keep `compression: 0` on loops — lossy re-encoding
  can add a click at the seam.
- `normalize` goes last. Fading after it drops the peak of any sound whose attack falls inside the
  fade, so the asset ships quieter than the target it was written for.
- Seed from a name, not from `hash()`. `A.seed_of("coin")` is stable, while Python's built-in `hash`
  is randomized per process. Numpy does not freeze `default_rng`'s distribution streams across
  releases either, so an upgrade may shift a noise seed — harmless here, since the kit re-renders
  nothing it has already shipped.

## Requirements

Python 3, numpy >= 2.0, scipy >= 1.13 — `pip install -r requirements.txt`. Wheels everywhere, no
compiler, no ffmpeg. Numpy carries the sample arithmetic and scipy contributes filter design,
stateful filtering, and FFT convolution. That is the whole list, and the WAV encoder stays
hand-rolled in `audiolib` to keep it there. Output goes under `out/` (gitignored).
