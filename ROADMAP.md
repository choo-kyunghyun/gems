# Roadmap

## Features

- Save and Load

## 2.5D Rendering (adopt billboards)

Prototype landed **dormant** behind `RPG_BB_PITCH` in `RpgMap.build` (0 = off / normal top-down;
~35 = preview) — `RenderBillboard` (currently in `RenderEntity.js`) + `cameraFollow2d` `pitch`.
Confirmed viable; remaining work to ship it:

- Adapt the world-space overlays to the pitched view (they still draw flat on the ground)
    - `RpgWorldOverlay` bullets + item-drop rarity squares
    - `RadarArrows`, reach-quest zone, `FloatingText`, the `BuildMode` cursor
- Adapt `RenderLighting` + `RenderWeather` (disabled in the spike — they assume a flat view rect)
- Fix framing: the pitch stretches the view N–S past the chunk-load radius → dead space
  (tighter zoom or a larger N–S load radius)
- Verify depth-sorting with overlapping bodies; commit to hard-alpha sprites (soft edges break z-order)
- Front-view hard-alpha art (the AI hero pipeline) — the payoff that makes billboards shine
- Promote `RenderBillboard` to its own script asset (lives in `RenderEntity.js` as a spike)

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
