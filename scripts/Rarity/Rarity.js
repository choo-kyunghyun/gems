// Rarity-tier registry — the item quality ladder, in ascending tier order (see `rank`).
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

  // ── Registry facade (Registry owns the store's contract) ──
  // each genre registers its own tiers (the RPG's via RpgContent.register), low tier first.
  static _defs = new Map();
  static _order = [];

  /**
   * @param {Object[]} defs
   * @returns {typeof Rarity}
   */
  static register(defs) {
    Registry.register(Rarity, defs, (def) => new Rarity(def));
    return Rarity;
  }

  /**
   * @param {string} id
   * @returns {Rarity|undefined}
   */
  static get(id) {
    return Registry.get(Rarity, id);
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  static has(id) {
    return Registry.has(Rarity, id);
  }

  /**
   * @returns {Rarity[]}
   */
  static all() {
    return Registry.all(Rarity);
  }

  /**
   * tier index (registration order), -1 when unknown — the inventory sort key.
   * @param {string} id
   * @returns {number}
   */
  static rank(id) {
    return Registry.rank(Rarity, id);
  }

  /**
   * scale a value by a rarity's modifier; unknown id returns value as-is.
   * @param {string} id
   * @param {number} value
   * @returns {number}
   */
  static modify(id, value) {
    const r = Rarity.get(id);
    return r === undefined ? value : value * r.valueMod;
  }
};
