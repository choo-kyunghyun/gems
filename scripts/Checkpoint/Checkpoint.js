/**
 * Marks a mid-level respawn flag sensor. First overlap activates it and updates
 * the player's spawn point; subsequent overlaps are ignored (used: true).
 * CollectibleSystem.reachedCheckpoint reads this via TriggerSystem hits.
 * @typedef {Object} Checkpoint
 * @property {boolean} used  true after the player first touches this checkpoint
 */
globalThis.Checkpoint = "Checkpoint";
