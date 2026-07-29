// Crafting-recipe registry. `requires` = WorkbenchModule itemId that must be slotted; omit for a base recipe.
// { id, station, requires?, inputs: [{itemId,qty}], output: {itemId,qty} }
globalThis.Recipe = class Recipe {
  /**
   * @param {Object} def
   */
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

  /**
   * @param {Object[]} defs
   * @returns {typeof Recipe}
   */
  static register(defs) {
    Registry.register(Recipe, defs, (def) => new Recipe(def));
    return Recipe;
  }

  /**
   * @param {string} id
   * @returns {Recipe|undefined}
   */
  static get(id) {
    return Registry.get(Recipe, id);
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  static has(id) {
    return Registry.has(Recipe, id);
  }

  /**
   * @returns {Recipe[]}
   */
  static all() {
    return Registry.all(Recipe);
  }

  /**
   * recipes for a station kind, registration order.
   * @param {string} kind
   * @returns {Recipe[]}
   */
  static forStation(kind) {
    const all = Recipe.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].station === kind) out.push(all[i]);
    }
    return out;
  }
};
