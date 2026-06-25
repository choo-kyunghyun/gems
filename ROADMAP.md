# Roadmap

## Features

- Save and Load

## 2.5D Rendering

**ADOPTED** (default `RPG_BB_PITCH = 35` in `RpgMap.build`): the follow camera pitches +
`RenderBillboard` stands sprites up, `RenderLighting`/`RenderWeather` draw screen-space (survive
the pitch via `camera.project`), and AI front-view hard-alpha art is imported for all 13 entities
(pipeline in `tools/pixel-art-kit/local/comfyui`). Remaining polish:

- `FloatingText` damage numbers + `RpgWorldOverlay` bullets still draw flat on the ground —
  billboard them to face the camera (the ground markers — reach zone, build cursor, drop squares —
  are correct flat at z=0). `RadarArrows` (off by default) too if re-enabled.
- Promote `RenderBillboard` to its own script asset (currently in `RenderEntity.js`)
- Framing: the pitch shows further N–S, so near a map edge (e.g. the hub spawn) there's dead space —
  tune zoom / the N–S chunk-load radius
- AI art follow-ups: re-roll the weak `doorway`; per-entity animation frames (idle bob / attack swing)

## UI

- Killfeed UI

## Gameplay

- Modular turret
    - Auto turrets fire mounted weapons
    - Mountable turrets
- Explosive like grenade and mine
- Minify furnitures
- Merchants and wandering traders
    - Inter-level interaction
- Settlement and outpost
- Farming and fishing
- Gamepad reloading
- More role-playing infos
    - Biological sex(Display as XX and XY)
    - Optional age
- Gacha capsule with new UI
- Raid event: Defend the settlement

## Build Mode

- Blueprint
- Drag to select

## Editor

- Prefabs
