/**
 * Marker component: this entity is a Raider (human bandit enemy species). Presence — not a value —
 * is the identity, queried via `world.query(Raider)` / `world.get(Raider, id) !== undefined`. Feeds
 * the radar blip color + the kill-quest type (raider vs Rat); allegiance is separate (`Faction`).
 * Attached with an empty payload `world.add(id, Raider, {})`. Replaces the old Tag "raider".
 * @typedef {Object} Raider
 */
globalThis.Raider = "Raider";
