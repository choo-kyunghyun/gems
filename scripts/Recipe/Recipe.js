// Crafting-recipe registry (modeled on Item). The shared RpgContent registers the recipe
// set at create() time (see RpgContent.register). A recipe turns
// a set of input items into one output item at a station of a given `kind`.
//
// {
//   id,                              // unique recipe id
//   station: "workbench",            // Station.kind this recipe shows up at
//   requires: "forge",               // OPTIONAL: a WorkbenchModule itemId that must be slotted in
//                                    //   the bench (Station.module) for this recipe to show/craft.
//                                    //   Omit for a BASE recipe (always available at the bench).
//   inputs: [{ itemId, qty }],       // consumed from the crafter's Inventory
//   output: { itemId, qty },         // produced into the crafter's Inventory
// }
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

  /** Register an array of recipe defs (later defs with the same id overwrite). */
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

  /** Recipes for a station kind, in registration order. Index-loops `order`
   *  (no Map-iterator for-of on GMRT). */
  static forStation(kind) {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      const r = this.registry.get(this.order[i]);
      if (r.station === kind) out.push(r);
    }
    return out;
  }
};
