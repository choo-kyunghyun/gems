globalThis.Rarity = class Rarity {
  /**
   * @param {Object} def
   * @param {string} def.id
   * @param {string} [def.name]      i18n key for the display name
   * @param {number|string} [def.color]  GameMaker colour int, or "#rrggbb" hex
   * @param {number} [def.valueMod]  item-value multiplier (default 1)
   */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? ""; // i18n key
    this.color =
      typeof def.color === "string"
        ? Color.parse(def.color)
        : (def.color ?? c_white);
    this.valueMod = def.valueMod ?? 1;
  }

  // Rarities are not defined here — each genre template configures its own set
  // in its initializer (e.g. RpgController.create → Rarity.register([...])).
  static registry = new Map();
  static order = []; // insertion order of ids (low → high tier)

  /** Register an array of rarity defs (later defs with the same id overwrite). */
  static register(defs) {
    for (const def of defs) {
      const r = new Rarity(def);
      if (!this.registry.has(r.id)) this.order.push(r.id);
      this.registry.set(r.id, r);
    }
    return this;
  }

  static get(id) {
    return this.registry.get(id);
  }

  static has(id) {
    return this.registry.has(id);
  }

  /** All rarities in tier order. Index-loops `order` (no Map-iterator for-of). */
  static all() {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      out.push(this.registry.get(this.order[i]));
    }
    return out;
  }

  /** Scale a base value by a rarity's modifier; unknown id returns value as-is. */
  static modify(id, value) {
    const r = this.get(id);
    return r === undefined ? value : value * r.valueMod;
  }

  static import(data) {
    return new Rarity(data);
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      valueMod: this.valueMod,
    };
  }
};
