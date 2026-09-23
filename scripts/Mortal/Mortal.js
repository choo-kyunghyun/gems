/**
 * Opt-in death behavior; an entity without it is left alone.
 * @typedef {Object} Mortal
 * @property {"despawn"|"corpse"|"respawn"|"down"} kind
 * @property {number} [recoverSecs]  "down": sim-seconds incapacitated before recovery
 * @property {number} [reviveHp]     "down"/"respawn": health restored on recovery
 */
globalThis.Mortal = "Mortal";
