// The ECS entity store — a Level sub-module (a level owns one as `level.ecs`). A thin SUBSYSTEM
// COORDINATOR over pure entity/component data: it owns `ids` (IdPool, id lifecycle) and `storage`
// (ECSStorage, component data), plus the deferred-removal queue and a per-store `gravity` override.
// The component-store methods below are one-line delegates to `storage`, so the store's public API is
// unchanged (every system / Query / EntitySnapshot still calls .add/get/query/... exactly as before).
//
// The fixed-step SIM CLOCK is NOT here — it moved to SimClock (World.sim), ONE global clock, since
// only the active level steps. Systems read the tick dt via World.sim.tickDuration and renderers the
// interpolation factor via World.sim.alpha, not off the store.
//
// NOTE: this was the old `World` class, renamed. The `World` name is now the static world-manager
// singleton (SimClock/WorldClock/WorldEvents/LevelManager coordinator). Callers still hold an instance
// as `this.world` for now — that variable rename is deferred; only the class + `new` sites moved to ECS.
/** @typedef {Object} ECSOpts @property {number} [gravity] override GravitySystem.strength for this store */
globalThis.ECS = class ECS {
  /** @param {number} maxEntities slot capacity @param {ECSOpts} [opts] */
  constructor(maxEntities, opts = {}) {
    this.maxEntities = maxEntities;
    // subsystems
    this.ids = new IdPool(maxEntities); // entity id allocation (generational)
    this.storage = new ECSStorage(maxEntities, this.ids); // component data (SoA)
    this._pending = []; // deferred-removal queue (committed by flush)
    this.gravity = opts.gravity ?? null;
  }

  /** Level teardown: drop all storage + ids. */
  destroy() {
    this.storage.destroy();
    this.ids.reset();
  }

  // ── entity lifecycle (id subsystem) ──

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

  /** Commit all queued removals: clear each entity's component slots, then free its id. */
  flush() {
    for (const id of this._pending) {
      this.storage.clear(IdPool.getIndex(id));
      this.ids.free(id);
    }
    this._pending = [];
  }

  // ── component data (delegated to the storage subsystem; API kept identical) ──

  /** Allocate storage for a component token (auto-called by add). @returns {this} */
  register(ComponentClass) {
    this.storage.register(ComponentClass);
    return this;
  }

  /** Set component data; auto-registers the token. @param {number} id @param {string} ComponentClass @param {Object} data */
  add(id, ComponentClass, data) {
    this.storage.add(id, ComponentClass, data);
  }

  /** @param {string} ComponentClass @param {number} id @returns {Object|undefined} */
  get(ComponentClass, id) {
    return this.storage.get(ComponentClass, id);
  }

  /** @param {number} id @param {string} ComponentClass */
  detach(id, ComponentClass) {
    this.storage.detach(id, ComponentClass);
  }

  /** All components this entity has, keyed by token. Used by EntitySnapshot. @param {number} id @returns {Object<string,Object>} */
  componentsOf(id) {
    return this.storage.componentsOf(id);
  }

  /** Ids of every entity with ALL listed components. @param {...string} ComponentClasses @returns {number[]} */
  query(...ComponentClasses) {
    return this.storage.query(ComponentClasses);
  }

  /** Allocation-free query(): calls fn(id) per matching entity without materializing an array. @param {string[]} ComponentClasses @param {(id:number) => void} fn */
  forEach(ComponentClasses, fn) {
    this.storage.forEach(ComponentClasses, fn);
  }

  /** @returns {{ids:Object, components:Object<string,Array>}} sparse [index, data] entries per component */
  export() {
    return { ids: this.ids.export(), components: this.storage.export() };
  }

  /** Restore from export(); unknown component keys are ignored. @param {{ids:Object, components:Object<string,Array>}} snapshot */
  import(snapshot) {
    this.ids.import(snapshot.ids);
    this.storage.import(snapshot.components);
  }
};
