// Crafting-recipe registry. `requires` = the workbench module's itemId that must be slotted; omit
// for a base recipe.
// { id, station, requires?, inputs: [{itemId,qty}], output: {itemId,qty} }
globalThis.Recipe = {
  register(defs) {
    Registry.register(Recipe, defs, Recipe.make);
  },

  make(def) {
    return {
      id: def.id,
      station: def.station,
      requires: def.requires,
      inputs: def.inputs ?? [],
      output: def.output,
    };
  },

  get(id) {
    return Registry.get(Recipe, id);
  },

  all() {
    return Registry.all(Recipe);
  },

  /** Recipes for a station kind, in registration order. */
  forStation(kind) {
    const all = Recipe.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].station === kind) out.push(all[i]);
    }
    return out;
  },
};
