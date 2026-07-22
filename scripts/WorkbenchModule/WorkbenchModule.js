// Item-component: marks an Item as a workbench module — slotted into a bench's single module slot
// (Interaction.module) to change what it can do. Flat class queried by `instanceof`. Modes below.
/**
 * One upgradeable bench instead of a station per category. `kind` selects the window mode (CraftingUI):
 *   • "recipes" (default) — unlocks recipes whose `requires` matches this module's itemId (base
 *     recipes, with no `requires`, always available).
 *   • "weaponmod"          — the Toolkit: switches the window to the weapon-mod panel (WeaponModUI).
 * Identity is its itemId (Recipe.requires references that).
 */
globalThis.WorkbenchModule = class WorkbenchModule {
  /** @param {Object} [d] kind: "recipes" (default) | "weaponmod" (modes documented above) */
  constructor(d = {}) {
    this.kind = d.kind ?? "recipes";
  }
};
