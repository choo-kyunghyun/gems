/**
 * Component: makes an entity's movement slow down as its Inventory fills up by
 * weight. Tuning only — EncumbranceSystem.scale reads this alongside the entity's
 * Inventory to produce a speed multiplier the mover applies (see
 * RpgController.update). An entity without this component is never slowed.
 *
 * @typedef {Object} Encumbrance
 * @property {number} threshold  load fraction (carried/maxWeight) below which there
 *                               is no penalty (0..1, default 0.5)
 * @property {number} minScale   speed multiplier at/above full load (0..1, default 0.4)
 */
globalThis.Encumbrance = "Encumbrance";
