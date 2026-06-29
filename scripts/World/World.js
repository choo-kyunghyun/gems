// ECS core: component storage + generational id allocator + fixed-rate tick accumulator. Each scene owns its own `world` — no global.
/** @typedef {Object} WorldOpts @property {number} [gravity] override GravitySystem.strength for this world */
globalThis.World = class World {
  /** @param {number} maxEntities slot capacity @param {number} [tickrate=60] sim ticks/sec @param {WorldOpts} [opts] */
  constructor(maxEntities, tickrate = 60, opts = {}) {
    this.maxEntities = maxEntities;
    this.ids = new IdPool(maxEntities);
    this.components = new Map();
    // Parallel arrays mirroring `components`, in registration order. Iterate these instead of the
    // Map: `for...of` over a Map iterator (.values()/.keys()) hangs in the GMRT runtime. Map kept only for O(1) lookup.
    this._keys = [];
    this._storages = [];
    this.tickDuration = 1 / tickrate;
    this.accumulator = 0;
    this.alpha = 0;
    this.maxTicks = 5; // spiral-of-death guard: drop backlog instead of freezing the frame
    this._pending = [];
    this.gravity = opts.gravity ?? null;
  }

  /** Scene teardown: drop all storage + ids. */
  destroy() {
    this.components.clear();
    this._keys = [];
    this._storages = [];
    this.ids.reset();
  }

  /** @returns {number} new entity id */
  create() {
    return this.ids.alloc();
  }

  /** @param {number} id @returns {boolean} */
  isValid(id) {
    return this.ids.isValid(id);
  }

  /** Queue removal; committed by flush(). @param {number} id */
  remove(id) {
    this._pending.push(id);
  }

  /** Commit all queued removals. */
  flush() {
    for (const id of this._pending) {
      const i = IdPool.getIndex(id);
      for (let s = 0; s < this._storages.length; s++)
        this._storages[s][i] = undefined;
      this.ids.free(id);
    }
    this._pending = [];
  }

  /** Allocate storage for a component token (auto-called by add). @returns {this} */
  register(ComponentClass) {
    if (!this.components.has(ComponentClass)) {
      const storage = new Array(this.maxEntities).fill(undefined);
      this.components.set(ComponentClass, storage);
      this._keys.push(ComponentClass);
      this._storages.push(storage);
    }
    return this;
  }

  /** Set component data; auto-registers the token. @param {number} id @param {string} ComponentClass @param {Object} data */
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
   * `.every()` to avoid GMRT boolean-local clobber. @param {...string} ComponentClasses @returns {number[]}
   */
  query(...ComponentClasses) {
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

  /** @returns {{ids:Object, components:Object<string,Array>}} sparse [index, data] entries per component */
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

  /** Restore from export(); unknown component keys are ignored. @param {{ids:Object, components:Object<string,Array>}} snapshot */
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

  /** Advance the fixed-step accumulator; sets `alpha` (render-interpolation factor). @returns {number} ticks to run */
  update() {
    this.accumulator += Time.delta;
    let ticks = Math.floor(this.accumulator / this.tickDuration);
    this.accumulator -= ticks * this.tickDuration;
    // Spiral-of-death guard: cap ticks so a slow frame doesn't owe an ever-growing backlog —
    // sim time slows under overload rather than freezing; alpha uses the drained accumulator.
    if (ticks > this.maxTicks) ticks = this.maxTicks;
    this.alpha = this.accumulator / this.tickDuration;
    return ticks;
  }
};
