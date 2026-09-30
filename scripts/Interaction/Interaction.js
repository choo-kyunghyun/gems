/**
 * Marks an entity as interactable: walk near and press E to run the registered action `kind`.
 * The extra flat fields are per-instance params the action reads, each with its own default, so
 * one component drives everything from opening a window to feeding the player.
 * @typedef {Object} Interaction
 * @property {string} kind      registered action id: "storage" | "workbench" | "modbench" |
 *   "corpse" | "turret" | "pickup" | "door" | "rehire" | "claim" | "settlement" | "bed" |
 *   "hydrate" | "feed" | "buff" | "harvest" | "talk" | "trade" | "companion" | "mount"
 * @property {string[]} [tags]  workbench only: the recipe tags it offers (absent = none)
 * @property {string} [title]   workbench only: its page title's I18n key
 * @property {boolean} [open]   door only: current leaf state
 * @property {number} [yaw] door facing
 * @property {string} [status]  buff only: Status id to apply
 * @property {number} [amount]  hydrate/feed only: restore magnitude
 */
globalThis.Interaction = "Interaction";
