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

  static registry = new Map();
  static order = []; // registration order of ids

  /** later defs with the same id overwrite. */
  static register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const r = new Recipe(defs[i]);
      if (!this.registry.has(r.id)) this.order.push(r.id);
      this.registry.set(r.id, r);
    }
    return this;
  }

  static get(id) {
    return this.registry.get(id);
  }

  /** recipes for a station kind, registration order. index-loop `order` (no Map-iterator for-of on GMRT). */
  static forStation(kind) {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      const r = this.registry.get(this.order[i]);
      if (r.station === kind) out.push(r);
    }
    return out;
  }
};
