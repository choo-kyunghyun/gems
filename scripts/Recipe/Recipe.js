// Crafting-recipe registry. `requires` = WorkbenchModule itemId that must be slotted; omit for a base recipe.
// { id, station, requires?, inputs: [{itemId,qty}], output: {itemId,qty} }
globalThis.Recipe = class Recipe {
  constructor(def) {
    this.id = def.id;
    this.station = def.station;
    this.requires = def.requires; // undefined = base recipe (no module needed)
    this.inputs = def.inputs ?? [];
    this.output = def.output;
  }

  // ── Registry facade (Registry owns the store's contract) ──
  static _defs = new Map();
  static _order = [];

  static register(defs) {
    Registry.register(Recipe, defs, (def) => new Recipe(def));
    return Recipe;
  }

  static get(id) {
    return Registry.get(Recipe, id);
  }

  static has(id) {
    return Registry.has(Recipe, id);
  }

  static all() {
    return Registry.all(Recipe);
  }

  /** recipes for a station kind, registration order. */
  static forStation(kind) {
    const all = Recipe.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].station === kind) out.push(all[i]);
    }
    return out;
  }
};
