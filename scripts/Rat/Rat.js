/**
 * Marker component: this entity is a Rat (wildlife enemy species). Presence — not a value — is the
 * identity, queried via `entities.query(Rat)` / `entities.get(Rat, id) !== undefined`. Feeds the radar
 * blip color + the kill-quest type (rat vs Raider); allegiance is separate (`Faction`). Attached
 * with an empty payload `entities.add(id, Rat, {})`. Replaces the old Tag "rat".
 * @typedef {Object} Rat
 */
globalThis.Rat = "Rat";
