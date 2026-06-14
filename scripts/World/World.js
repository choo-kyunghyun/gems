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
    this.maxTicks = 5; // spiral-of-death guard — see update()
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
      for (let s = 0; s < this._storages.length; s++)
        this._storages[s][i] = undefined;
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

  // Every component this entity has, keyed by component token (the inverse of a series of
  // add() calls). Iterates the registration-order parallel arrays (Map iteration is banned
  // on GMRT). Used by EntitySnapshot to serialize/migrate a whole entity.
  componentsOf(id) {
    const out = {};
    const i = IdPool.getIndex(id);
    for (let s = 0; s < this._keys.length; s++) {
      const data = this._storages[s][i];
      if (data !== undefined) out[this._keys[s]] = data;
    }
    return out;
  }

  // Returns ids of every entity that has ALL listed components. Hot path: bounded
  // by the allocator high-water mark (this.ids.next) rather than maxEntities, and
  // closure-free — a numeric `c === n` test stands in for `.every()` (avoids both
  // per-slot closure allocation and the GMRT boolean-local clobber).
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

  // Allocation-free alternative to query() for hot systems: invokes fn(id) for
  // each entity that has ALL listed components, without materializing an id array.
  // `ComponentClasses` is an array of component tokens.
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
    let ticks = Math.floor(this.accumulator / this.tickDuration);
    this.accumulator -= ticks * this.tickDuration;
    // Spiral-of-death guard: if the sim fell far behind on a slow frame, drop the
    // backlog instead of running every owed tick — catching up would make the next
    // frame slower still and feed back until the runtime dies (seen in the
    // benchmark scene). Simulation time slows down under overload rather than
    // freezing; alpha still uses the drained accumulator, so rendering stays smooth.
    if (ticks > this.maxTicks) ticks = this.maxTicks;
    this.alpha = this.accumulator / this.tickDuration;
    return ticks;
  }
};
