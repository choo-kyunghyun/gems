// Item-definition registry. Definitions are data; runtime quantities live in Inventory. Capabilities
// (Equippable, Weapon, …) compose via `components[]` queried by `instanceof` — composition over inheritance.
globalThis.Item = class Item {
  /**
   * Item def, keyed by `id`: name/description (i18n keys), sprite (icon, -1 = none), stack, weight,
   * value (base — scaled by rarity), rarity (Rarity id), maker (Manufacturer id, "" = unbranded),
   * components (capability/marker instances — queried via getComponent). Defaults in the body.
   * @param {Object} def
   */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.description = def.description ?? "";
    this.sprite = def.sprite ?? -1;
    this.stack = def.stack ?? 99;
    this.weight = def.weight ?? 1;
    this.value = def.value ?? 0;
    this.rarity = def.rarity ?? "common";
    this.maker = def.maker ?? "";
    this.components = def.components ?? [];
  }

  addComponent(component) {
    this.components.push(component);
    return this;
  }

  getComponent(Class) {
    return this.components.find((c) => c instanceof Class);
  }

  getComponents(Class) {
    return this.components.filter((c) => c instanceof Class);
  }

  hasComponent(Class) {
    return this.getComponent(Class) !== undefined;
  }

  // unique gear (uid + mods inline on slot) vs fungible stacks — equippable = always instanced.
  // Equipment keys by uid, not itemId, because two of one itemId can differ by mods.
  isInstanced() {
    return this.hasComponent(Equippable);
  }

  // ── Registry facade (Registry owns the store's contract) ──
  static _defs = new Map();
  static _order = [];

  static register(defs) {
    Registry.register(Item, defs, (def) => new Item(def));
    return Item;
  }

  static get(id) {
    return Registry.get(Item, id);
  }

  static has(id) {
    return Registry.has(Item, id);
  }

  static all() {
    return Registry.all(Item);
  }
};
