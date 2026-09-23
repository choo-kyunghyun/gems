/**
 * Item component marking an item as a workbench module.
 *
 * One upgradeable bench instead of a station per category. `kind` selects the window mode (CraftingUI):
 *   • "recipes" (default) — unlocks recipes whose `requires` matches this module's itemId (base
 *     recipes, with no `requires`, always available).
 *   • "weaponmod"          — the Toolkit: switches the window to the weapon-mod panel (WeaponModUI).
 * Identity is its itemId (Recipe.requires references that).
 */
globalThis.WorkbenchModule = class WorkbenchModule {
  constructor(d = {}) {
    this.kind = d.kind ?? "recipes";
  }
};
