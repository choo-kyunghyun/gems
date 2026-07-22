globalThis.Rarity = class Rarity {
  /**
   * Rarity def, keyed by `id`: name (i18n key), color (colour int or "#rrggbb" hex), valueMod
   * (item-value multiplier).
   * @param {Object} def
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

  // each genre registers its own tiers (the RPG's via RpgContent.register).
  static registry = new Map();
  static order = []; // insertion order of ids (low → high tier)

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

  // index-loops `order` — no Map-iterator for-of (GMRT crashes on Map/Set iterators).
  static all() {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      out.push(this.registry.get(this.order[i]));
    }
    return out;
  }

  // scale a value by a rarity's modifier; unknown id returns value as-is.
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
