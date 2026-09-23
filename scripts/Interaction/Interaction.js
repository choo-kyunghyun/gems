/**
 * Marks an entity as interactable: walk near and press E to run the registered action `kind`.
 * The extra flat fields are per-instance params the action reads, each with its own default, so
 * one component drives everything from opening a window to feeding the player.
 * @typedef {Object} Interaction
 * @property {string} kind      registered action id: "storage" | "workbench" | "corpse" |
 *   "pickup" | "door" | "rehire" | "claim" | "bed" | "hydrate" | "feed" | "buff" | "harvest" |
 *   "chop" | "talk" | "trade" | "companion"
 * @property {string} [module]  workbench only: slotted module itemId ("" / absent = empty)
 * @property {boolean} [open]   door only: current leaf state
 * @property {number} [yaw] door facing
 * @property {string} [status]  buff only: Status id to apply
 * @property {number} [amount]  hydrate/feed only: restore magnitude
 */
globalThis.Interaction = "Interaction";
