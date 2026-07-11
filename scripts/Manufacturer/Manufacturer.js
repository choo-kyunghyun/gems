// Manufacturer registry — the in-world companies items are made by, mirroring Rarity (a parallel
// metadata registry items reference by id via `Item.maker`). A def may carry a signature `ops`
// layer (same operator shape as WeaponMod.ops); EquipmentSystem folds it into every weapon the
// company makes, so brand identity is mechanical, not just cosmetic.
globalThis.Manufacturer = class Manufacturer {
  /**
   * @param {Object} def
   * @param {string} def.id
   * @param {string} [def.name]      i18n key
   * @param {string} [def.lore]      i18n key (default "")
   * @param {number|string} [def.color]  colour int, or "#rrggbb" hex
   * @param {Object} [def.ops]       weapon ops layer { field: { add?, mul? } } — folded by
   *                                 EquipmentSystem.composeWeapon for this maker's weapons
   */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? ""; // i18n key
    this.lore = def.lore ?? ""; // i18n key
    this.color =
      typeof def.color === "string"
        ? Color.parse(def.color)
        : (def.color ?? c_white);
    this.ops = def.ops;
  }

  // each genre registers its own companies (the RPG's via RpgContent.register).
  static registry = new Map();
  static order = []; // insertion order of ids

  static register(defs) {
    for (const def of defs) {
      const m = new Manufacturer(def);
      if (!this.registry.has(m.id)) this.order.push(m.id);
      this.registry.set(m.id, m);
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
};
