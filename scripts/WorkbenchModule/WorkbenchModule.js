// Item-component: marks an Item as a WORKBENCH MODULE — a unique upgrade slotted into a
// workbench's single module slot (Station.module) to change what the bench can do. Instead of a
// separate station per category, one workbench is upgraded by swapping modules (removable freely).
//
// `kind` selects the mode the slotted module drives in the workbench window (CraftingUI):
//   • "recipes" (default) — unlocks the recipes that declare `requires: <this module's itemId>`
//     (base recipes, with no `requires`, are always available regardless of the slot).
//   • "weaponmod"          — the Tinker's Toolkit: switches the window into the weapon-mod panel
//     (install/remove WeaponMods on owned weapons; see WeaponModUI), folding the old standalone
//     Anvil into the bench.
//
// A flat, standalone class queried by `instanceof` (Item.getComponent) — no inheritance (GMRT
// can't). The module's identity is its itemId; Recipe.requires references that.
globalThis.WorkbenchModule = class WorkbenchModule {
  /**
   * @param {Object} [d]
   * @param {string} [d.kind] "recipes" (default) | "weaponmod"
   */
  constructor(d = {}) {
    this.kind = d.kind ?? "recipes";
  }
};
