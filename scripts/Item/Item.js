// Item-definition registry (modeled on Rarity). Genre templates register their
// item set at create() time (see TopDownContent.register). Definitions are data;
// runtime quantities live in Inventory components.
globalThis.Item = class Item {
  /**
   * @param {Object} def
   * @param {string} def.id
   * @param {string} [def.name]            i18n key for the display name
   * @param {Asset.GMSprite} [def.sprite]  icon sprite (-1 = none)
   * @param {string} [def.type]            "material" | "consumable" | "key" ...
   * @param {number} [def.stack]           max stack size (default 99)
   * @param {number} [def.value]           base value (scaled by rarity)
   * @param {string} [def.rarity]          Rarity id (default "common")
   */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.sprite = def.sprite ?? -1;
    this.type = def.type ?? "material";
    this.stack = def.stack ?? 99;
    this.value = def.value ?? 0;
    this.rarity = def.rarity ?? "common";
  }

  static registry = new Map();
  static order = []; // registration order of ids

  /** Register an array of item defs (later defs with the same id overwrite). */
  static register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const it = new Item(defs[i]);
      if (!this.registry.has(it.id)) this.order.push(it.id);
      this.registry.set(it.id, it);
    }
    return this;
  }

  static get(id) {
    return this.registry.get(id);
  }

  static has(id) {
    return this.registry.has(id);
  }

  /** All items in registration order. Index-loops `order` (no Map-iterator for-of). */
  static all() {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      out.push(this.registry.get(this.order[i]));
    }
    return out;
  }
};
