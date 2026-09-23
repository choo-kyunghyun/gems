// Item-definition registry. Definitions are data; runtime quantities live elsewhere. Capabilities
// compose via `components[]`, queried by `instanceof`.
globalThis.Item = class Item {
  /**
   * name/description are i18n keys; sprite is the bag icon (-1 = none); value is the base, before
   * rarity scaling; maker "" = unbranded.
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

  /**
   * Unique gear (uid + mods on its slot) vs fungible stacks; equippable is always instanced,
   * since two of one itemId can differ by mods.
   */
  isInstanced() {
    return this.hasComponent(Equippable);
  }

  // statics, since a def is itself an Item instance
  static register(defs) {
    Registry.register(Item, defs, Item.make);
  }

  static make(def) {
    return new Item(def);
  }

  static get(id) {
    return Registry.get(Item, id);
  }

  static all() {
    return Registry.all(Item);
  }
};
