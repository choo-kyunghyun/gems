/**
 * Marker component: this entity is a Rat (wildlife enemy species). Presence — not a value — is the
 * identity, queried via `world.query(Rat)` / `world.get(Rat, id) !== undefined`. Feeds the radar
 * blip color + the kill-quest type (rat vs Raider); allegiance is separate (`Faction`). Attached
 * with an empty payload `world.add(id, Rat, {})`. Replaces the old Tag "rat".
 * @typedef {Object} Rat
 */
globalThis.Rat = "Rat";
