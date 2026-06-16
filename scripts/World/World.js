// Instance-based ECS core: owns all component storage + the generational id allocator + the
// fixed-rate tick accumulator. Each scene holds its own `world` (there is no global). Components
// are string tokens; storage is a plain array per component, indexed by the id's slot index.
/** @typedef {Object} WorldOpts @property {number} [gravity] override GravitySystem.strength for this world */
globalThis.World = class World {
  /** @param {number} maxEntities slot capacity @param {number} [tickrate=60] sim ticks/sec @param {WorldOpts} [opts] */
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
    this.maxTicks = 5; // spiral-of-death guard — see update()
    this._pending = [];
    this.gravity = opts.gravity ?? null;
  }

  /** Drop all storage + ids (scene teardown). */
  destroy() {
    this.components.clear();
    this._keys = [];
    this._storages = [];
    this.ids.reset();
  }

  /** Allocate a new entity. @returns {number} the entity id */
  create() {
    return this.ids.alloc();
  }

  /** @param {number} id @returns {boolean} whether the id is still live */
  isValid(id) {
    return this.ids.isValid(id);
  }

  /** Queue an entity for removal; committed by flush(). @param {number} id */
  remove(id) {
    this._pending.push(id);
  }

  /** Commit all queued removals: clear their component slots and free their ids. */
  flush() {
    for (const id of this._pending) {
      const i = IdPool.getIndex(id);
      for (let s = 0; s < this._storages.length; s++)
        this._storages[s][i] = undefined;
      this.ids.free(id);
    }
    this._pending = [];
  }

  /** Allocate storage for a component token (auto-called by add). @param {string} ComponentClass @returns {this} */
  register(ComponentClass) {
    if (!this.components.has(ComponentClass)) {
      const storage = new Array(this.maxEntities).fill(undefined);
      this.components.set(ComponentClass, storage);
      this._keys.push(ComponentClass);
      this._storages.push(storage);
    }
    return this;
  }

  /** Set entity `id`'s data for a component (auto-registers the token). @param {number} id @param {string} ComponentClass @param {Object} data */
  add(id, ComponentClass, data) {
    if (!this.components.has(ComponentClass)) this.register(ComponentClass);
    this.components.get(ComponentClass)[IdPool.getIndex(id)] = data;
  }

  /** @param {string} ComponentClass @param {number} id @returns {Object|undefined} the entity's data for that component */
  get(ComponentClass, id) {
    const storage = this.components.get(ComponentClass);
    if (storage === undefined) return undefined;
    return storage[IdPool.getIndex(id)];
  }

  /** Remove one component from an entity. @param {number} id @param {string} ComponentClass */
  detach(id, ComponentClass) {
    const storage = this.components.get(ComponentClass);
    if (storage !== undefined) storage[IdPool.getIndex(id)] = undefined;
  }

  /**
   * Every component this entity has, keyed by token (the inverse of a series of add() calls).
   * Used by EntitySnapshot to serialize/migrate a whole entity.
   * @param {number} id @returns {Object<string,Object>}
   */
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
   * Ids of every entity that has ALL listed components. Bounded by the allocator high-water
   * mark (ids.next), and closure-free — a numeric `c === n` test stands in for `.every()`
   * (avoids per-slot closure allocation and the GMRT boolean-local clobber).
   * @param {...string} ComponentClasses @returns {number[]}
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

  /**
   * Allocation-free query() for hot systems: invokes fn(id) for each entity that has ALL
   * listed components, without materializing an id array.
   * @param {string[]} ComponentClasses @param {(id:number) => void} fn
   */
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

  /** @returns {{ids:Object, components:Object<string,Array>}} a plain snapshot (components as sparse [index, data] entries). */
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

  /** Restore from an export() snapshot; unknown component keys are ignored. @param {{ids:Object, components:Object<string,Array>}} snapshot */
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

  /**
   * Advance the fixed-step accumulator by Time.delta and report how many ticks to run this
   * frame; also sets `alpha` (the [0,1) render-interpolation factor). @returns {number} ticks
   */
  update() {
    this.accumulator += Time.delta;
    let ticks = Math.floor(this.accumulator / this.tickDuration);
    this.accumulator -= ticks * this.tickDuration;
    // Spiral-of-death guard: if the sim fell far behind on a slow frame, drop the backlog
    // instead of running every owed tick — catching up would slow the next frame further and
    // feed back until the runtime dies. Sim time slows under overload rather than freezing;
    // alpha still uses the drained accumulator, so rendering stays smooth.
    if (ticks > this.maxTicks) ticks = this.maxTicks;
    this.alpha = this.accumulator / this.tickDuration;
    return ticks;
  }
};
