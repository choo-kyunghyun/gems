# Roadmap

## Features

- Save and Load
- Sound

## UI

- Killfeed UI

## Items

- Explosive and Mine
- Weapon modification system
  - Needs the **definition-vs-instance split**: modifiable gear becomes unstackable (`stack: 1`)
    _instances_ carrying per-instance mutable state (installed mods, durability, rolled stats);
    fungibles (potions / materials / currency) stay shared `Item` definitions, no instance.
  - Give each instance a **uid**. The moment two items share an `itemId` but differ by mods,
    `itemId` no longer identifies "which one" — and `Equipment.slots` / `Hotbar` / `Favorites` /
    Store-All keep / the `equip` already-equipped check are all itemId-keyed today.
  - Keep instance state **inline on the inventory slot** (`{ itemId, qty: 1, uid, mods, dur }`) so
    it rides transfer / drop (`ItemDrop`) / `EntitySnapshot` / map-travel for free; `Item` stays the
    immutable template. (Alternative: a uid→instance registry, but that adds a parallel lifetime.)
  - `EquipmentSystem.weaponProfile` composes base def + folded instance mods — the one place
    combat reads the modded weapon.
  - GMRT: instance `mods` is nested → self-serialize flat (`k=v;…`) like `SaveData`/`Profile`;
    `world.export` / `EntitySnapshot` keep it by reference, so map-to-map travel needs no serialize.
  - Re-point only the "which specific one" refs to the uid (`equip`/`unequip`, equip-keep,
    equipped-check). `Hotbar`/`Favorites` can stay itemId unless per-instance favorites are wanted.
  - Introduce the uid + instance layer **with** the mod feature, not before — no premature uids on
    stateless items. `wood_sword`/`blaster`/armor are already `stack: 1`, so the seam mostly exists.

## Level

- Inter-level interaction
- Wandering traders

## Gameplay

- Companion benefits like increasing inventory
- Settlement and outpost
- Farming and fishing

## Build Mode

- Blueprint
- Drag to select

## Editor

- Prefabs
