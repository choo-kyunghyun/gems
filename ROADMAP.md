# Roadmap

## Features

- Save and Load
- Sound

## UI

- Killfeed UI

## Items

- Explosive and Mine
- Weapon mods: durability + rolled stats — the definition-vs-instance split + the Anvil mod
  install/remove shipped (ARCHITECTURE → Items / _Genre UI managers → WeaponModUI_). The instance
  slot already carries `uid`/`mods`; durability is a `dur` field + decay/repair, rolled stats a
  roll step on loot — both slot in without re-touching the equip-by-uid plumbing.

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
