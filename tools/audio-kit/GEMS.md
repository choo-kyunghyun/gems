# G.E.M.S. — audio conventions

The project-specific **answer** to the kit's "scan, then ask" (see [README](README.md)). When making
audio for **G.E.M.S.**, follow these confirmed conventions instead of re-deriving them. The reusable
kit stays style-agnostic; this file is G.E.M.S.'s filled-in style — the audio sibling of
`pixel-art-kit/GEMS.md`.

## Core convention

| | |
|---|---|
| **Sample rate** | **44 100 Hz, 16-bit PCM** — the one rate for every asset. |
| **SFX** | **Mono**, short, **uncompressed** (`compression: 0` — instant, low-latency). Retro/chiptune voice: square/pulse/saw/triangle + noise, ADSR-shaped, often a pitch sweep. |
| **BGM** | **Stereo**, looping, **uncompressed** (sample-perfect loop seam). A sequenced chiptune score (lead + bass + drums), rendered to WAV **and** an editable `.mid` (the "MIDI base"). |
| **Format** | **WAV** (the only stdlib-encodable format). GameMaker re-compresses at build per the asset's setting; switch a long track to Compressed/Streamed in the IDE if size matters. |
| **GM naming** | SFX → `snd_<thing>` (`snd_coin` / `snd_jump` / …); BGM → `mus_<thing>` (`mus_overworld` / `mus_battle`). |
| **IDE folder** | `Media/Audio/SFX` and `Media/Audio/BGM`. |

Audio pairs with the **DB32 16px pixel art** — keep it deliberately **chiptune**, not sampled.

## Authoring (input data)

- **SFX** → `templates/sfx/<name>.json` (a stack of synth layers). Render: `python common/sfx.py`.
- **BGM** → `templates/bgm/<name>.json` (`bpm` + `beats` + tracks; tracker `seq` or explicit `notes`).
  Render: `python common/music.py`.
- Keep SFX **short and punchy** (≤ ~0.6 s); keep BGM a **short loop** (the demos are 16 beats / 1 phrase)
  that resolves cleanly on the last beat so the loop seam is silent.

## Pipeline

1. **Author** the template(s) — SFX layers / BGM tracks (this doc *is* the scan/ask answer).
2. **Render** — `sfx.py` / `music.py` → `out/sfx/*.wav`, `out/bgm/*.wav` (+ `*.mid`); audition in `out/`.
3. **Import** — `gm-import/` writes the GameMaker `GMSound` into `sounds/snd_*` / `sounds/mus_*`.
   Register the resource first (IDE or `gm-cli resourcetool eval "RESOURCE CREATE TYPE=Sound NAME=<n>"`);
   GMSound `.yy`s carry no uuids, so re-running is churn-free. Set BGM assets to **loop** in the IDE.

## Status

The committed `sounds/` set: **9 SFX** (`snd_coin` / `snd_jump` / `snd_hit` / `snd_shoot` /
`snd_explosion` / `snd_powerup` / `snd_hurt` / `snd_ui_confirm` / `snd_ui_move`) and **2 BGM loops**
(`mus_overworld`, `mus_battle`). Runtime playback is verified on **GMRT 0.20** (`audio_play_sound` /
`audio_is_playing` on the generated WAV). Regenerate any time by editing a template and re-running the
generators.

Playback goes through the **`Audio`** Core wrapper (`scripts/Audio/`): `Audio.play` (2D),
`Audio.playAt` (spatial, via `audio_play_sound_at` + a player-following listener set each frame from
the RPG camera), `Audio.bgm` (cross-faded loop). **Wired into the Demo**: the RPG plays `mus_overworld`
with spatial `snd_shoot`/`snd_hit`/`snd_hurt`/`snd_explosion`/`snd_coin` + `snd_powerup`; the Platformer
plays `mus_battle` with `snd_jump`/`snd_hit`/`snd_hurt` (see ARCHITECTURE → _Utility Modules → Audio_).
The `snd_ui_*` cues are not yet hooked into the Core UI widgets. Add SFX/songs by dropping a `.json` in
`templates/sfx/` or `templates/bgm/`, registering the `snd_*`/`mus_*` resource, and re-running the
importer.
