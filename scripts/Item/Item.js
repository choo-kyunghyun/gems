// Item-definition registry (modeled on Rarity). Genre templates register their
// item set at create() time (see TopDownContent.register). Definitions are data;
// runtime quantities live in Inventory components.
//
// Behavior/markers compose via data-only `components` (like UIElement): the base
// holds identity + the near-universal scalars (value, stack), and capability or
// marker classes (Equippable, Weapon, and later QuestItem, Factional, ...) are
// attached and queried by `instanceof` (see getComponent). This is composition,
// not inheritance — GMRT can't do inheritance/super, but `instanceof` against a
// flat class works (the same pattern UIElement.getComponent relies on).
globalThis.Item = class Item {
  /**
   * @param {Object} def
   * @param {string} def.id
   * @param {string} [def.name]            i18n key for the display name
   * @param {Asset.GMSprite} [def.sprite]  icon sprite (-1 = none)
   * @param {number} [def.stack]           max stack size (default 99)
   * @param {number} [def.weight]          per-unit weight, for Inventory.maxWeight (default 1)
   * @param {number} [def.value]           base value (scaled by rarity)
   * @param {string} [def.rarity]          Rarity id (default "common")
   * @param {Object[]} [def.components]    capability/marker instances (Equippable,
   *                                       Weapon, ...) — queried via getComponent
   */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.sprite = def.sprite ?? -1;
    this.stack = def.stack ?? 99;
    this.weight = def.weight ?? 1;
    this.value = def.value ?? 0;
    this.rarity = def.rarity ?? "common";
    this.components = def.components ?? [];
  }

  /** Attach a component instance. */
  addComponent(component) {
    this.components.push(component);
    return this;
  }

  /** First component that is an instance of Class, or undefined. */
  getComponent(Class) {
    return this.components.find((c) => c instanceof Class);
  }

  /** All components that are instances of Class. */
  getComponents(Class) {
    return this.components.filter((c) => c instanceof Class);
  }

  /** Whether the item has a component of Class (marker/capability test). */
  hasComponent(Class) {
    return this.getComponent(Class) !== undefined;
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
