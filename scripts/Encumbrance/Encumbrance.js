/**
 * Component: tuning for weight-based slowdown (EncumbranceSystem.scale reads it + Inventory).
 * Opt-in — an entity without it is never slowed.
 *
 * @typedef {Object} Encumbrance
 * @property {number} threshold  load fraction below which there's no penalty (0..1, default 0.5)
 * @property {number} minScale   speed multiplier at/above full load (0..1, default 0.4)
 */
globalThis.Encumbrance = "Encumbrance";
