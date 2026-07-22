/**
 * Marker component: this entity is a Raider (human bandit enemy species). Presence — not a value —
 * is the identity, queried via `entities.query(Raider)` / `entities.get(Raider, id) !== undefined`. Feeds
 * the radar blip color + the kill-quest type (raider vs Rat); allegiance is separate (`Faction`).
 * Attached with an empty payload `entities.add(id, Raider, {})`. Replaces the old Tag "raider".
 * @typedef {Object} Raider
 */
globalThis.Raider = "Raider";
