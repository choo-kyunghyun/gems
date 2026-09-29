// Crafting-recipe registry. `tag` = the workbench tag the recipe is made under; a bench carrying
// it offers the recipe.
// { id, tag, inputs: [{itemId,qty}], output: {itemId,qty} }
globalThis.Recipe = {
  register(defs) {
    Registry.register(Recipe, defs, Recipe.make);
  },

  make(def) {
    return {
      id: def.id,
      tag: def.tag,
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

  /** Recipes whose tag is among `tags`, in registration order. */
  forTags(tags) {
    const all = Recipe.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (tags.indexOf(all[i].tag) !== -1) out.push(all[i]);
    }
    return out;
  },
};
