# Roadmap

## Features

- Save and Load

## 2.5D Rendering

**ADOPTED** (default `RPG_BB_PITCH = 35` in `RpgMap.build`): the follow camera pitches +
`RenderBillboard` stands sprites up, `RenderLighting`/`RenderWeather` draw screen-space (survive
the pitch via `camera.project`), and AI front-view hard-alpha art is imported for all 13 entities
(pipeline in `tools/pixel-art-kit/local/comfyui`).

Done: terrain z-fighting fixed (only billboards write depth — flat ground is painter order);
`FloatingText` damage numbers stand up facing the camera; `RpgWorldOverlay` bullets lift to body
height; `RenderBillboard` promoted to its own `Core/Render` asset; framing — the follow camera
edge-clamps to the world bounds (`cameraFollow2d` `clamp`, pitch-aware N–S reach) so the pitched
view no longer shows past a map edge (the hub-spawn dead space). Remaining polish:

- `RadarArrows` (off by default) draws flat too — billboard/lift it if re-enabled
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
