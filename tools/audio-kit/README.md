# Audio Kit

A small, **zero-dependency** toolkit for making game audio for **quick prototypes** — synthesize in a
throwaway script, push the result straight into GameMaker. Pure Python stdlib: no numpy, no
SoundFont, no installs. The audio sibling of [`pixel-art-kit`](../pixel-art-kit).

This kit is **not an asset pipeline.** It does not regenerate the project's committed sounds and does
not try to. It is a box of primitives you import from a script you write for the sound in front of
you, and then usually delete.

---

## Layout

```
audio-kit/
├── synth.py     oscillators (sine/square/pulse/saw/triangle/noise) + ADSR + filters + drums
├── audiolib.py  buffers: mix/gain/normalize/fade, 16-bit PCM WAV encode, paths
├── gm_sound.py  the one engine binding: a buffer -> a GameMaker sound asset
└── out/         everything generated (gitignored)
```

Flat on purpose — one `sys.path` entry and a scratch script can import the whole kit.

---

## The loop

```python
import sys; sys.path.insert(0, "tools/audio-kit")
import audiolib as A, synth as S, gm_sound as G

blip = S.adsr(S.tone(A.seconds(0.2), wave="square", f0=880.0, f1=220.0), r=0.08)
G.write_sound("snd_blip", [A.normalize(blip)], folder="Media/Audio/SFX")
```

That is the whole workflow: build a buffer, hand it to `gm_sound.write_sound`. The sound appears in
`sounds/snd_blip/` filed under its IDE folder.

### Synthesis

`tone(n, wave=, f0=, f1=, duty=, vib_rate=, vib_depth=, glide=, seed=)` is the one workhorse
generator — `f1` sweeps the pitch (`lin`/`exp`), `vib_*` adds vibrato, `seed` makes noise repeatable.
Shape it with `adsr(buf, a=, d=, s=, r=)`, round it off with `lowpass`/`highpass`, and layer with
`audiolib.add_into(dst, src, at=, g=)`.

`drum("kick"|"snare"|"hat")` gives percussion one-shots, and `PATCHES` holds named instrument presets
(`lead`/`bass`/`pluck`/`pad`/…) if you want a consistent voice across several cues. Note names parse
with `note_freq("C4")` / `note_midi("A#3")`.

**Mono for SFX, stereo for BGM** — `[buf]` vs `[left, right]`. The engine's spatial audio needs a mono
source to position; a stereo SFX can't be placed in the world.

**Finish before writing**: `normalize(buf, target=)` sets the peak, `fade(buf, fin=, fout=)` kills
clicks at the ends. A looping track wants no fade at all — the fade *is* the seam.

### The voice is chiptune, by design

Oscillators + noise + envelopes, not sampled instruments — the natural match for pixel art. The
waveforms are not band-limited, which is authentic for the style (real chips alias too) but does mean
a fast pitch sweep through the high register can produce audible aliasing sweeping the other way. For
sampled or orchestral audio, use external assets, not this kit.

---

## Registration

`gm_sound.write_sound` registers the resource in `gems.yyp` through `gm-cli` when it isn't there yet,
so a new sound is one call. It never hand-edits the yyp's Resources list — that corrupts the project
(see `docs/GMCLI.md`). If `gm-cli` isn't on PATH it says so and tells you the command to run.

A `GMSound` `.yy` carries no uuids, so re-running is inherently churn-free.

---

## Gotchas

- **WAV only.** It's the only format encodable stdlib-only. GameMaker imports it fine and
  re-compresses at build per the asset's setting; switch a long track to *Compressed*/*Streamed* in
  the IDE if size matters.
- **Keep `compression: 0` for loops.** Lossy re-encoding can add a click at the loop point. Author the
  last beat to resolve cleanly and let the loop flag do the rest.

---

## Requirements

**Python 3, stdlib only.** The WAV encoder is hand-rolled in `audiolib`. Nothing to install;
`requirements.txt` is empty and says so deliberately. All output goes under `out/` (gitignored).
