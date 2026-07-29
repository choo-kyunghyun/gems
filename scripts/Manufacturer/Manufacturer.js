// Manufacturer registry — the in-world companies items are made by, mirroring Rarity (a parallel
// metadata registry items reference by id via `Item.maker`). Signature `ops` contract below.
/**
 * A def may carry a signature `ops` layer (same operator shape as WeaponMod.ops); EquipmentSystem
 * folds it into every weapon the company makes, so brand identity is mechanical, not just cosmetic.
 */
globalThis.Manufacturer = class Manufacturer {
  /**
   * Manufacturer def, keyed by `id`: name/lore (i18n keys), color (colour int or "#rrggbb" hex), ops
   * (signature weapon ops layer — see the class contract above).
   * @param {Object} def
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
  // each genre registers its own companies (the RPG's via RpgContent.register).
  static _defs = new Map();
  static _order = [];

  /**
   * @param {Object[]} defs
   * @returns {typeof Manufacturer}
   */
  static register(defs) {
    Registry.register(Manufacturer, defs, (def) => new Manufacturer(def));
    return Manufacturer;
  }

  /**
   * @param {string} id
   * @returns {Manufacturer|undefined}
   */
  static get(id) {
    return Registry.get(Manufacturer, id);
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  static has(id) {
    return Registry.has(Manufacturer, id);
  }

  /**
   * @returns {Manufacturer[]}
   */
  static all() {
    return Registry.all(Manufacturer);
  }

  /**
   * registration index, -1 when unknown — the inventory sort key.
   * @param {string} id
   * @returns {number}
   */
  static rank(id) {
    return Registry.rank(Manufacturer, id);
  }
};
