# Audio Kit

A small, **portable, zero-dependency** toolkit for generating game audio with deterministic
Python (stdlib only — no numpy, no SoundFont, no external services, no installs). It produces
**sound effects** (procedural synthesis) and **MIDI-based BGM** (a sequenced score) as plain
**16-bit PCM WAV** — the bus every engine reads. The audio sibling of [`pixel-art-kit`](../pixel-art-kit):
art (sound) lives in **data files**, never inlined in the code.

---

## No built-in style — scan, then ask

Like the pixel kit, this carries **no audio style, palette of sounds, sample rate, or project data
of its own.** Before generating for a project:

1. **Scan the target project** for its audio conventions — sample rate, mono/stereo, file format,
   asset naming (`snd_*` / `mus_*`?), the import path, any existing audio.
2. **Report what you found and ask the user to confirm or specify** — sample rate, the SFX set, the
   music mood/tempo, looping. If the project has no audio yet, ask.
3. **Only then generate**, matching the confirmed conventions.

> In **this** repo the answers are already settled — see **[GEMS.md](GEMS.md)** (44.1 kHz / 16-bit,
> chiptune, mono SFX `snd_*` + stereo BGM `mus_*`). Follow it for G.E.M.S.; the scan-then-ask flow is
> for reusing the kit elsewhere.

---

## Layout

```
audio-kit/
├── GEMS.md     THIS project's confirmed conventions (44.1k/16-bit, chiptune) — the "scan/ask" answer
├── common/     engine-agnostic core (pure Python stdlib, no external deps)
│   ├── audiolib.py   shared lib: 16-bit PCM WAV encode, buffer mix/gain/normalize/fade, paths
│   ├── synth.py      oscillators (sine/square/pulse/saw/triangle/noise) + ADSR + filters + drums
│   ├── midilib.py    minimal Standard MIDI File (Type 1) writer
│   ├── sfx.py        render templates/sfx/*.json (layered synth) -> mono WAV
│   └── music.py      render templates/bgm/*.json (note/tracker score) -> looping stereo WAV + .mid
├── templates/  audio INPUT data
│   ├── sfx/    one .json per effect (a stack of synth layers)
│   └── bgm/    one .json per song (tracks of notes / tracker patterns)
├── gm-import/  GameMaker adapter (engine-specific; imports common/)
│   ├── gm_sound.py    shared: write a float buffer as a GMSound (.wav + templated .yy)
│   ├── sfx_sounds.py  render the SFX set  -> sounds/snd_<name>/
│   └── bgm_sounds.py  render the BGM set  -> sounds/mus_<name>/  (+ .mid into out/)
├── local/      GITIGNORED: machine/style-specific data + scratch experiments
└── out/        all generated artifacts (gitignored): out/sfx/*.wav, out/bgm/*.wav + *.mid
```

The `common/` core runs with no install and is **data-free** — the sounds, tempos, and song notes are
supplied per project in `templates/`, not baked into the code.

---

## Method — programmatic, zero-dependency

Sound is **synthesized from parameters**, kept as **data files** in `templates/` (input) and rendered
to WAV by the generators (output) — audio is never a binary blob in the repo. **Strengths:** no deps,
deterministic (a re-render is bit-identical — the audio counterpart to the kit's uuid5 sprites),
version-controllable (the *recipe* is text), exact and tunable. **Weakness:** it's a retro/chiptune
voice (oscillators + noise + envelopes), not sampled/orchestral audio — which pairs naturally with
pixel art.

### Sound effects (input)

`templates/sfx/<name>.json` — a stack of synth **layers** mixed together:

```json
{ "gain": 0.85, "layers": [
  { "wave": "square", "f0": "B5", "dur": 0.07, "a": 0.001, "d": 0.02, "s": 0.9, "r": 0.03 },
  { "wave": "square", "f0": "E6", "dur": 0.22, "start": 0.07, "r": 0.14 }
] }
```

- `wave` = `sine` / `square` / `pulse` (with `duty`) / `saw` / `triangle` / `noise`.
- `f0` / `f1` = a note name (`"C5"`) **or** raw Hz (number); `f1` present ⇒ a pitch sweep
  (`glide` `lin`/`exp`). `vib_rate`/`vib_depth` add vibrato; `lowpass`/`highpass` filter the layer.
- `a`/`d`/`s`/`r` = the ADSR envelope (seconds; `s` is the 0–1 sustain level). `start` offsets the
  layer in time so layers stack into a sequence (arpeggios, two-tone blips).

Drop a `.json` in `templates/sfx/` and it renders — no code change. `python common/sfx.py` renders all.

### Music (input)

`templates/bgm/<name>.json` — `bpm`, a loop length in `beats`, and `tracks`. A track is either
**explicit notes** or a compact **tracker pattern**:

```json
{ "bpm": 120, "beats": 16, "tracks": [
  { "instrument": "lead", "gain": 0.32, "step": 0.5,
    "seq": ["E4","G4","C5","G4","E4","G4","E4","-"] },
  { "instrument": "kick", "gain": 0.9, "step": 0.5, "tile": true,
    "seq": ["x","","","","x","","",""] }
] }
```

- `instrument` names a **patch** in `synth.PATCHES` (`lead`/`lead2`/`bass`/`pluck`/`pad`/`sine` +
  drum patches `kick`/`snare`/`hat`). `pan` is −1 (L) … +1 (R); `gain` is the track level.
- **Tracker `seq`**: one token per `step` beats — `""`/`"."`/`"r"` = rest, `"-"` = tie (extend the
  previous note), anything else = a note (`"x"` triggers a drum). `tile: true` repeats the pattern to
  fill `beats` (author a 1-bar drum loop once).
- **Explicit `notes`**: `[["C4", startBeat, durBeat, vel], …]` — for sustained chords / pads.

`python common/music.py` renders every song to a looping stereo WAV **and** a real `.mid`.

### Why both WAV *and* `.mid`?

The score is **MIDI-based**: each song renders to a playable **WAV** (the engine asset — GameMaker
can't play `.mid` directly) **and** exports the identical note data as a Standard **`.mid`** in
`out/bgm/` — the editable "MIDI base" you can open in any DAW/tracker to tweak, then re-render or
re-import.

---

## Requirements

- **Python 3, stdlib only** — no numpy/scipy/PIL, no SoundFont. WAV + MIDI encoders are hand-rolled in
  `audiolib.py` / `midilib.py`. Nothing to install. All output goes under **`out/`** (gitignored).

---

## Usage

```sh
python common/sfx.py            # render templates/sfx/*.json -> out/sfx/<name>.wav
python common/music.py          # render templates/bgm/*.json -> out/bgm/<name>.wav (+ .mid)

# GameMaker import (the resources must already be registered — see below)
python gm-import/sfx_sounds.py  # SFX -> sounds/snd_<name>/   (mono, uncompressed)
python gm-import/bgm_sounds.py  # BGM -> sounds/mus_<name>/   (stereo, uncompressed) + .mid in out/
```

> The `templates/` sounds are demo placeholders (data, not code) — replace them with your project's;
> the generators render whatever templates are present.

---

## Project bindings — the `gm-import/` adapter

Engine- and project-specific code lives in **`gm-import/`** — it imports the core (via a `sys.path`
shim to the sibling `common/`) and writes finished GameMaker `GMSound` assets straight into the
project's `sounds/`. Kept separate so `common/` stays engine-agnostic.

The target `GMSound` resources must already be **registered** (IDE → Add Sound, or
`gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sound NAME=<name>"`); the importer only fills the WAV
+ overwrites the `.yy` (which files the asset under its `parent` IDE folder and points `soundFile` at
the WAV). A `GMSound` `.yy` carries **no uuids**, so re-running is inherently churn-free. After import,
set the BGM assets to **loop** in the IDE (or via `audio_play_sound(mus, prio, true)` at runtime).

---

## Gotchas

- **No external codecs** — only **WAV** can be written stdlib-only (OGG/MP3 need a real encoder).
  GameMaker imports WAV fine and re-compresses at build per the asset's compression setting; for a
  long track, switch the imported asset to *Compressed* / *Streamed* in the IDE.
- **Seamless loops**: the music renderer truncates each song to exactly `beats`, so the sound's loop
  flag repeats it gaplessly. Keep `compression: 0` (uncompressed) for a sample-perfect seam — lossy
  re-encoding can add a tiny click at the loop point. Author the last beat to resolve cleanly.
- **It's chiptune, by design** — oscillators + noise + envelopes, not sampled instruments. That's the
  match for pixel art; for sampled/orchestral audio, use external assets, not this kit.
