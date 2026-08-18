/**
 * A def may carry a signature `ops` layer (same operator shape as WeaponMod.ops); EquipmentSystem
 * folds it into every weapon the company makes, so brand identity is mechanical, not just cosmetic.
 */
globalThis.Manufacturer = class Manufacturer {
  /**
   * Manufacturer def, keyed by `id`: name/lore (i18n keys), color (colour int or "#rrggbb" hex), ops
   * (signature weapon ops layer — see the class contract above).
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

  // ── Registry facade (Registry owns the store's contract) ──
  // each genre registers its own companies (the colony's via content.register).
  static _defs = new Map();
  static _order = [];

  static register(defs) {
    Registry.register(Manufacturer, defs, (def) => new Manufacturer(def));
    return Manufacturer;
  }

  static get(id) {
    return Registry.get(Manufacturer, id);
  }

  static has(id) {
    return Registry.has(Manufacturer, id);
  }

  static all() {
    return Registry.all(Manufacturer);
  }

  /**
   * registration index, -1 when unknown — the inventory sort key.
   */
  static rank(id) {
    return Registry.rank(Manufacturer, id);
  }
};
