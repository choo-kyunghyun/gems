/**
 * Marks an entity as interactable: walk near + press E to run a registered InteractAction. `kind`
 * names the action (looked up in the InteractAction registry — the RPG registers its set in
 * RpgInteractions); the extra flat fields are per-instance params the action's run() reads (each
 * with its own default), so one component drives everything from opening a UI window to feeding /
 * hydrating / buffing the player. The generic pick/prompt/dispatch engine is the Demo/UI
 * `Interactable` module. Replaces the old Core `Station` component.
 * @typedef {Object} Interaction
 * @property {string} kind      registered InteractAction id ("storage" | "workbench" | "claim" | "arcade" | "bed" | "hydrate" | "feed" | "buff")
 * @property {string} [module]  workbench only: slotted WorkbenchModule itemId ("" / absent = empty)
 * @property {string} [status]  buff only: Status id to apply (default set by the action def)
 * @property {number} [amount]  hydrate/feed only: restore magnitude (default set by the action def)
 */
globalThis.Interaction = "Interaction";
