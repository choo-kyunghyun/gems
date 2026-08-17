# G.E.M.S. — audio conventions

What a new sound has to match to sit next to the committed set. The kit itself is style-agnostic
(see [README](README.md)); this is the project's filled-in style.

## Core convention

| | |
|---|---|
| **Sample rate** | **44 100 Hz, 16-bit PCM** — one rate for every asset (`audiolib.SR`). |
| **SFX** | **Mono**, short, **uncompressed** (`compression: 0` — instant, low-latency). Mono because the engine positions SFX in the world; a stereo source can't be placed. |
| **BGM** | **Stereo**, looping, **uncompressed** (sample-perfect loop seam). |
| **Format** | **WAV** — the only format encodable stdlib-only. GameMaker re-compresses at build; switch a long track to Compressed/Streamed in the IDE. |
| **GM naming** | SFX → `snd_<subject>[_<event>]` (`snd_coin`, `snd_gun_fire`), size/style qualifier **last** (`snd_explosion_small`, not `snd_small_explosion`); BGM → `mus_<track>`. Full rule in `docs/NAMING.md`. |
| **IDE folder** | `Game/Media/Audio/SFX` and `Game/Media/Audio/BGM` — `gm_sound.SFX_FOLDER` is the default; pass `folder=` for BGM. |
| **Mixing** | Render at full level. Category volume is folded by hand at playback, never baked into the asset — `scripts/Audio` owns the mixing contract (every sound sits in `audiogroup_default`). |

## The committed set

**18 sounds, hand-authored and frozen.** This kit does not regenerate them; it is here for the *next*
sound, under a fresh name.

**14 SFX** — `snd_coin` / `snd_jump` / `snd_gun_fire` / `snd_gun_uncocked` / `snd_hitsound_flesh` /
`snd_hitsound_armor` / `snd_hitsound_metal` / `snd_explosion_small` / `snd_explosion_large` /
`snd_bandage` / `snd_drink` / `snd_magic` / `snd_button_click` / `snd_button_muted`.

**4 BGM ambient loops** — `mus_ambient_cozy` / `mus_ambient_tense` / `mus_ambient_danger` /
`mus_ambient_emergency`.

> Never point an importer at a live name — `write_sound("snd_coin", …)` overwrites hand-made audio.
> Author under a new name.

## Playback

Everything goes through the **`Audio`** Core family (`scripts/Audio/`): SFX is the single
`Audio.play(params)` — spatial when `params.position` is set (a player-following listener updated each
frame from the RPG camera), 2D otherwise — and BGM is `Music.play` (cross-faded loop).

Wired into the Demo: the RPG plays `mus_ambient_tense` with spatial `snd_gun_fire` /
`snd_hitsound_flesh` (enemy hit) / `snd_hitsound_armor` (ally hit) / `snd_explosion_small` (kill) /
`snd_coin`, plus `snd_gun_uncocked` (dry-fire) and the per-consumable `snd_drink` / `snd_bandage` /
`snd_magic`; the Platformer plays `mus_ambient_danger` with `snd_jump` / `snd_hitsound_flesh` (stomp) /
`snd_hitsound_armor` (respawn); `snd_button_*` are wired into the Core UI (`UIButton` / `UINav`).

Unwired spares: `snd_hitsound_metal`, `snd_explosion_large`, `mus_ambient_cozy`,
`mus_ambient_emergency`.

## Style

The kit's voice is **chiptune** — oscillators, noise, envelopes — which pairs with the DB32 pixel art.
Keep new SFX **short and punchy** (≤ ~0.6 s). A loop wants **no fade**: the fade is the seam. Author
the last beat to resolve cleanly and let the loop flag do the rest.
