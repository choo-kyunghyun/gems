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
├── audiolib.py  signals, levels, 16-bit PCM WAV encode, paths
├── synth.py     oscillators + noise + envelopes + filters + modal bodies + drums
├── space.py     synthetic impulse responses, convolution reverb, delay, pan
├── loop.py      the three rules that make a buffer repeat, and the seam metric
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

## Space

Reverb is not a finishing touch — it is what tells the ear how big the room is, so it changes what a
sound is more than another waveform would. `space("tight"|"room"|"hall"|"cavern")` synthesizes an
impulse response, `reverb(x, ir, wet=)` convolves it, and `delay` and `pan` sit next to it.

`reverb` always returns stereo. An SFX the engine positions in the world has to stay mono, so use
`mono_reverb` on those.

Finish before writing: `normalize(buf, peak_db=)` sets the peak — there is no limiter and none is
needed — `fade` kills clicks at the ends, and `trim_tail` cuts the silence convolution leaves on the
end of a one-shot.

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
