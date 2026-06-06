globalThis.World = class World {
  constructor(maxEntities, tickrate = 60, opts = {}) {
    this.maxEntities = maxEntities;
    this.ids = new IdPool(maxEntities);
    this.components = new Map();
    // Parallel arrays mirroring `components`, in registration order. Iterate these
    // instead of the Map: `for...of` over a Map iterator (.values()/.keys()) hangs
    // in the GMRT runtime. Map is kept only for O(1) get/has/set by component token.
    this._keys = [];
    this._storages = [];
    this.tickDuration = 1 / tickrate;
    this.accumulator = 0;
    this.alpha = 0;
    this._pending = [];
    this.gravity = opts.gravity ?? null;
  }

  destroy() {
    this.components.clear();
    this._keys = [];
    this._storages = [];
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
      for (let s = 0; s < this._storages.length; s++) this._storages[s][i] = undefined;
      this.ids.free(id);
    }
    this._pending = [];
  }

  register(ComponentClass) {
    if (!this.components.has(ComponentClass)) {
      const storage = new Array(this.maxEntities).fill(undefined);
      this.components.set(ComponentClass, storage);
      this._keys.push(ComponentClass);
      this._storages.push(storage);
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
    for (let k = 0; k < this._keys.length; k++) {
      const storage = this._storages[k];
      const entries = [];
      for (let i = 0; i < storage.length; i++) {
        if (storage[i] !== undefined) entries.push([i, storage[i]]);
      }
      components[this._keys[k]] = entries;
    }
    return { ids: this.ids.export(), components };
  }

  import(snapshot) {
    this.ids.import(snapshot.ids);
    for (let k = 0; k < this._keys.length; k++) {
      const storage = this._storages[k];
      storage.fill(undefined);
      const entries = snapshot.components[this._keys[k]];
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
