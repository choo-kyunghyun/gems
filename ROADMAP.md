# Roadmap

## Art

### Art follow-ups

(The 2026-07-12 pass closed the rest: wall/floor materials + floor variants, terrain regenerated at 32, the spare vox/sprite/audio media wired — incl. the openable door — and greedy meshing + the manifest-driven `BBox`.)

- Redraw the 16 px fence sheet at 32 (hand-drawn, no generator; `SpriteMeta density: 0.5` carries it meanwhile). `spr_fenceRound`, `stand`, `wooden_bed_simple` remain unwired spares.
- A dedicated plan-view TOP pattern per wall material if the shared face texture ever reads wrong.
- Parked mesh niceties (speculative until a consumer exists): `.obj` frontend, box-path side sprites.

## Features

- Save and Load

## UI

- Killfeed UI

## Gameplay

- Modular turret
  - Auto turrets fire mounted weapons
  - Mountable turrets
- Explosive like grenade and mine (`snd_explosion_large` is its reserved SFX)
- Minify furnitures
- Settlement and outpost
- Farming and fishing
- Gamepad reloading
- More role-playing optional components
  - Biological sex(Display as XX and XY)
  - Entity age
- Gacha capsule with new UI
- Raid event: Defend the settlement (`mus_ambient_emergency` is its reserved BGM)
- Radio
- UI Concept: Smart HUD
- Darkmode and lightmode theme

### Build Mode

- Blueprint
- Drag to select

## Editor

- Prefabs
