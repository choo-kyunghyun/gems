globalThis.World = class World {
  constructor(maxEntities, tickrate = 60, opts = {}) {
    this.maxEntities = maxEntities;
    this.ids = new IdPool(maxEntities);
    this.components = new Map();
    this.tickDuration = 1 / tickrate;
    this.accumulator = 0;
    this.alpha = 0;
    this._pending = [];
    this.gravity = opts.gravity ?? null;
  }

  destroy() {
    this.components.clear();
    this.ids.reset();
  }

  create() {
    return this.ids.alloc();
  }

  isValid(id) {
    return this.ids.isValid(id);
  }

  remove(id) {
    this._pending.push(id);
  }

  flush() {
    for (const id of this._pending) {
      const i = IdPool.getIndex(id);
      for (const storage of this.components.values()) {
        storage[i] = undefined;
      }
      this.ids.free(id);
    }
    this._pending = [];
  }

  register(ComponentClass) {
    if (!this.components.has(ComponentClass)) {
      this.components.set(
        ComponentClass,
        new Array(this.maxEntities).fill(undefined),
      );
    }
    return this;
  }

  add(id, ComponentClass, data) {
    if (!this.components.has(ComponentClass)) this.register(ComponentClass);
    this.components.get(ComponentClass)[IdPool.getIndex(id)] = data;
  }

  get(ComponentClass, id) {
    const storage = this.components.get(ComponentClass);
    if (storage === undefined) return undefined;
    return storage[IdPool.getIndex(id)];
  }

  detach(id, ComponentClass) {
    const storage = this.components.get(ComponentClass);
    if (storage !== undefined) storage[IdPool.getIndex(id)] = undefined;
  }

  query(...ComponentClasses) {
    const storages = ComponentClasses.map((C) => this.components.get(C));
    if (storages.some((s) => s === undefined)) return [];

    const result = [];
    for (let i = 0; i < this.maxEntities; i++) {
      if (storages.every((s) => s[i] !== undefined)) {
        result.push(IdPool.makeId(i, this.ids.generations[i]));
      }
    }
    return result;
  }

  export() {
    const components = {};
    for (const C of this.components.keys()) {
      const storage = this.components.get(C);
      const entries = [];
      for (let i = 0; i < storage.length; i++) {
        if (storage[i] !== undefined) entries.push([i, storage[i]]);
      }
      components[C] = entries;
    }
    return { ids: this.ids.export(), components };
  }

  import(snapshot) {
    this.ids.import(snapshot.ids);
    for (const C of this.components.keys()) {
      const storage = this.components.get(C);
      storage.fill(undefined);
      const entries = snapshot.components[C];
      if (entries === undefined) continue;
      for (let j = 0; j < entries.length; j++) {
        storage[entries[j][0]] = entries[j][1];
      }
    }
  }

  update() {
    this.accumulator += Time.delta;
    const ticks = Math.floor(this.accumulator / this.tickDuration);
    this.accumulator -= ticks * this.tickDuration;
    this.alpha = this.accumulator / this.tickDuration;
    return ticks;
  }
};
