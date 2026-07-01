// ECS component store — the entity→component data half of the ECS, split out of `World` so World is a
// thin subsystem coordinator (World owns an `ids` IdPool + this `storage` + the sim clock). Pure data;
// no id allocation, no tick. One instance per World (per level), not a singleton: queries scan only
// this level's slots, and a whole store is dropped as a unit on evict (see Universe / RpgMap pool).
//
// Storage is SoA: one dense Array per component token, indexed by IdPool.getIndex(id). The `_keys`/
// `_storages` parallel arrays mirror the `components` Map in registration order — iterate THOSE, never
// a Map iterator (`for...of` over .values()/.keys() hangs in the GMRT runtime; the Map is kept only for
// O(1) token lookup). Holds a back-ref to the World's IdPool for query bounds (`ids.next`/generations).
globalThis.ECSStorage = class ECSStorage {
  /** @param {number} maxEntities slot capacity @param {IdPool} ids the owning World's id allocator */
  constructor(maxEntities, ids) {
    this.maxEntities = maxEntities;
    this.ids = ids; // for query bounds (ids.next) + generations, to rebuild ids from indices
    this.components = new Map();
    this._keys = [];
    this._storages = [];
  }

  /** Drop all storage (World.destroy). Ids are the World's concern. */
  destroy() {
    this.components.clear();
    this._keys = [];
    this._storages = [];
  }

  /** Allocate a dense storage array for a component token (auto-called by add). @returns {this} */
  register(ComponentClass) {
    if (!this.components.has(ComponentClass)) {
      const storage = new Array(this.maxEntities).fill(undefined);
      this.components.set(ComponentClass, storage);
      this._keys.push(ComponentClass);
      this._storages.push(storage);
    }
    return this;
  }

  /** Set component data at an entity's slot; auto-registers the token. @param {number} id @param {string} ComponentClass @param {Object} data */
  add(id, ComponentClass, data) {
    if (!this.components.has(ComponentClass)) this.register(ComponentClass);
    this.components.get(ComponentClass)[IdPool.getIndex(id)] = data;
  }

  /** @param {string} ComponentClass @param {number} id @returns {Object|undefined} */
  get(ComponentClass, id) {
    const storage = this.components.get(ComponentClass);
    if (storage === undefined) return undefined;
    return storage[IdPool.getIndex(id)];
  }

  /** @param {number} id @param {string} ComponentClass */
  detach(id, ComponentClass) {
    const storage = this.components.get(ComponentClass);
    if (storage !== undefined) storage[IdPool.getIndex(id)] = undefined;
  }

  /** Null every component slot at an entity index (World.flush, after removal). @param {number} index */
  clear(index) {
    for (let s = 0; s < this._storages.length; s++)
      this._storages[s][index] = undefined;
  }

  /** All components this entity has, keyed by token. Used by EntitySnapshot. @param {number} id @returns {Object<string,Object>} */
  componentsOf(id) {
    const out = {};
    const i = IdPool.getIndex(id);
    for (let s = 0; s < this._keys.length; s++) {
      const data = this._storages[s][i];
      if (data !== undefined) out[this._keys[s]] = data;
    }
    return out;
  }

  /**
   * Ids of every entity with ALL listed components. Closure-free: `c === n` stands in for
   * `.every()` to avoid GMRT boolean-local clobber. @param {string[]} ComponentClasses @returns {number[]}
   */
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
      if (c === n) result.push(IdPool.makeId(i, gens[i]));
    }
    return result;
  }

  /** Allocation-free query(): calls fn(id) per matching entity without materializing an array. @param {string[]} ComponentClasses @param {(id:number) => void} fn */
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
      if (c === n) fn(IdPool.makeId(i, gens[i]));
    }
  }

  /** @returns {Object<string,Array>} sparse [index, data] entries per component (World.export wraps this with ids) */
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

  /** Restore from export(); unknown component keys are ignored. @param {Object<string,Array>} components */
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
