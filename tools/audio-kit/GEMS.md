# G.E.M.S. — audio conventions

The project's half of the kit. The conventions below are settled — they decide whether a sound loads,
positions, and mixes correctly. The style is not; see the last section. The kit itself is
style-agnostic (see [README](README.md)).

> The sounds already committed are hand-authored and frozen — this kit does not regenerate them, and
> `write_sound` overwrites without asking. Author under a fresh name.

## Core convention

| | |
|---|---|
| Sample rate | 44 100 Hz, 16-bit PCM — one rate for every asset (`audiolib.SR`). |
| SFX | Mono, uncompressed (`compression: 0` — instant, low-latency). Mono because the engine positions SFX in the world; a stereo source can't be placed. |
| BGM | Stereo, looping, uncompressed (sample-perfect loop seam). |
| Format | WAV — hand-encoded by the kit, with no audio-file library in the way. GameMaker re-compresses at build; switch a long track to Compressed/Streamed in the IDE. |
| GM naming | SFX → `snd_<subject>[_<event>]` (`snd_coin`, `snd_gun_fire`), size/style qualifier last (`snd_explosion_small`, not `snd_small_explosion`); BGM → `mus_<track>`. Full rule in `docs/NAMING.md`. |
| IDE folder | `Game/Media/Audio/SFX` and `Game/Media/Audio/BGM` — `gm_sound.SFX_FOLDER` is the default; pass `folder=` for BGM. |
| Mixing | Render at full level. Category volume is folded by hand at playback, never baked into the asset — `scripts/Audio` owns the mixing contract (every sound sits in `audiogroup_default`). |
| Space | Keep baked-in reverb small: the engine positions SFX itself, so a wet asset fights the world it is placed in. |
| Loop seam | A BGM loop takes no fade — the fade becomes the seam. Build it with the three rules in `loop.py` and gate it on `loop.seam_db(x) <= 0`. |

## Style

Not set. The committed sounds are chiptune, cut to match the pixel art, and they are due to be
replaced rather than extended. Per `docs/CONCEPT.md` the project is a near-future space opera on a
failed terraform — modern effects and hollow, empty ambience, which is close to the opposite voice.

Nothing here describes that yet. Until it does, the conventions above are the only constraints on a
new sound, and the old set is not the reference to match.
