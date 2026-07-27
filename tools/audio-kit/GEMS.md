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
| **GM naming** | SFX → `snd_<subject>[_<event>]` (`snd_coin` / `snd_gun_fire`), size/style qualifier **last** (`snd_explosion_small`, not `snd_small_explosion`); BGM → `mus_<track>` (`mus_overworld`). Full rule in CLAUDE.md → Media Asset Naming. |
| **IDE folder** | `Media/Audio/SFX` and `Media/Audio/BGM`. |
| **Mixing** | Category volume is folded by hand at playback, never baked into the asset — render at full level. `scripts/Audio` owns the mixing contract (every sound sits in `audiogroup_default`). |

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

**The kit-generated set is RETIRED** — the committed `sounds/` are now hand-authored media, not
this kit's output: **14 SFX** (`snd_coin` / `snd_jump` /
`snd_gun_fire` / `snd_gun_uncocked` / `snd_hitsound_flesh` / `snd_hitsound_armor` /
`snd_hitsound_metal` / `snd_explosion_small` / `snd_explosion_large` / `snd_bandage` / `snd_drink` /
`snd_magic` / `snd_button_click` / `snd_button_muted`) and **4 BGM ambient loops**
(`mus_ambient_cozy` / `mus_ambient_tense` / `mus_ambient_danger` / `mus_ambient_emergency`). The old
kit templates in `templates/` still describe the retired chiptune set — **do NOT re-run the importers
over the live names** (`sfx_sounds.py` would overwrite the hand-made `snd_coin`/`snd_jump` and
recreate deregistered assets). The kit remains valid machinery for FUTURE generated sounds (author a
template under a fresh name, register, import).

Playback goes through the **`Audio`** Core family (`scripts/Audio/`): SFX is the single
`Audio.play(params)` — spatial when `params.position` is set (a player-following listener set each
frame from the RPG camera), 2D otherwise — and BGM is `Music.play` (cross-faded loop). **Wired into
the Demo**: the RPG plays `mus_ambient_tense` with spatial `snd_gun_fire`/`snd_hitsound_flesh`
(enemy hit)/`snd_hitsound_armor` (ally hit)/`snd_explosion_small` (kill)/`snd_coin`, plus
`snd_gun_uncocked` (dry-fire) and the per-consumable `snd_drink`/`snd_bandage`/`snd_magic`; the
Platformer plays `mus_ambient_danger` with `snd_jump`/`snd_hitsound_flesh` (stomp)/`snd_hitsound_armor`
(respawn); the `snd_button_*` cues are wired into the Core UI (`UIButton`/`UINav` — click on activate,
muted on focus change). Unwired spares: `snd_hitsound_metal`, `snd_explosion_large`,
`mus_ambient_cozy`/`mus_ambient_emergency`.
