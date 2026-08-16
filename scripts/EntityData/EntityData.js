globalThis.EntityData = class EntityData {
  constructor(maxEntities, ids) {
    this.maxEntities = maxEntities;
    this.ids = ids;
    this.components = new Map();
    // #15095: iterate _keys/_storages (Map mirror, registration order), never a Map iterator;
    // the Map is only O(1) token lookup.
    this._keys = [];
    this._storages = [];
  }

  destroy() {
    this.components.clear();
    this._keys = [];
    this._storages = [];
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
    this.components.get(ComponentClass)[EntityID.getIndex(id)] = data;
  }

  get(ComponentClass, id) {
    const storage = this.components.get(ComponentClass);
    if (storage === undefined) return undefined;
    return storage[EntityID.getIndex(id)];
  }

  detach(id, ComponentClass) {
    const storage = this.components.get(ComponentClass);
    if (storage !== undefined) storage[EntityID.getIndex(id)] = undefined;
  }

  clear(index) {
    for (let s = 0; s < this._storages.length; s++)
      this._storages[s][index] = undefined;
  }

  componentsOf(id) {
    const out = {};
    const i = EntityID.getIndex(id);
    for (let s = 0; s < this._keys.length; s++) {
      const data = this._storages[s][i];
      if (data !== undefined) out[this._keys[s]] = data;
    }
    return out;
  }

  /** Closure-free: `c === n` stands in for `.every()` to avoid the GMRT boolean-local clobber. */
  query(ComponentClasses) {
    const n = ComponentClasses.length;
    const storages = new Array(n);
    for (let c = 0; c < n; c++) {
      const s = this.components.get(ComponentClasses[c]);
      if (s === undefined) return [];
      storages[c] = s;
    }

    const result = [];
    const hi = this.ids.next;
    const gens = this.ids.generations;
    for (let i = 0; i < hi; i++) {
      let c = 0;
      while (c < n && storages[c][i] !== undefined) c++;
      if (c === n) result.push(EntityID.makeId(i, gens[i]));
    }
    return result;
  }

  forEach(ComponentClasses, fn) {
    const n = ComponentClasses.length;
    const storages = new Array(n);
    for (let c = 0; c < n; c++) {
      const s = this.components.get(ComponentClasses[c]);
      if (s === undefined) return;
      storages[c] = s;
    }

    const hi = this.ids.next;
    const gens = this.ids.generations;
    for (let i = 0; i < hi; i++) {
      let c = 0;
      while (c < n && storages[c][i] !== undefined) c++;
      if (c === n) fn(EntityID.makeId(i, gens[i]));
    }
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
    return components;
  }

  /** Unknown component keys are ignored. */
  import(components) {
    for (let k = 0; k < this._keys.length; k++) {
      const storage = this._storages[k];
      storage.fill(undefined);
      const entries = components[this._keys[k]];
      if (entries === undefined) continue;
      for (let j = 0; j < entries.length; j++) {
        storage[entries[j][0]] = entries[j][1];
      }
    }
  }
};
