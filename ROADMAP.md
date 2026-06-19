# Roadmap

## Features

- Save and Load
- Sound

## UI

- Killfeed UI

## Items

- Explosive and Mine
- Weapon mods: durability + rolled stats — the definition-vs-instance split, the named/typed
  attachment slots, and the ammo-driven **gun** overhaul (ammo base → gun/attachment operators →
  kinetic power + penetration) shipped (ARCHITECTURE → Items / _Genre UI managers → WeaponModUI_).
  The instance slot already carries `uid`/`mods` (a slot→attachment map) + a gun's `ammo`/`rounds`;
  durability is a `dur` field + decay/repair, rolled stats a roll step on loot — both slot in without
  re-touching the equip-by-uid plumbing.
- Ammo economy + sourcing — ammo is crafted at the Forge for now; loot-table/vendor sourcing and a
  gamepad reload binding (keyboard `R` only today) are open. Second caliber / more gun frames too.

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
