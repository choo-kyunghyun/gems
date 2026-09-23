/**
 * Item component marking an item as a module of the one upgradeable workbench. Identity is its
 * item id. `kind` selects the bench mode: "recipes" unlocks the recipes requiring this module,
 * "weaponmod" switches the bench to weapon modding.
 */
globalThis.WorkbenchModule = class WorkbenchModule {
  constructor(d = {}) {
    this.kind = d.kind ?? "recipes";
  }
};
