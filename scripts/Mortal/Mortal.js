/**
 * Opt-in death behavior; an entity without it is left alone.
 * @typedef {Object} Mortal
 * @property {"despawn"|"corpse"|"respawn"|"down"|"break"} kind  "break": a prop that spills its
 *   Inventory and goes, counted as no kill
 * @property {number} [recoverSecs]  "down": sim-seconds incapacitated before recovery
 * @property {number} [reviveHp]     "down"/"respawn": health restored on recovery
 * @property {GMSound} [sound]      "break": the sound of each hit and of the break
 */
globalThis.Mortal = "Mortal";
