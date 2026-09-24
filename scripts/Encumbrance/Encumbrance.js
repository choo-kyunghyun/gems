/**
 * Component: tuning for weight-based slowdown. Opt-in — an entity without it is never slowed.
 *
 * @typedef {Object} Encumbrance
 * @property {number} threshold  load fraction below which there's no penalty (0..1)
 * @property {number} minScale   speed multiplier at/above full load (0..1)
 */
globalThis.Encumbrance = "Encumbrance";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Encumbrance] = { threshold: 0.5, minScale: 0.4 };
